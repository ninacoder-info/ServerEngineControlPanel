import os
import pwd
from pathlib import Path

SERVICE_PACKAGES = {"nginx": "nginx", "apache": "apache2", "php": "php-fpm", "nodejs": "nodejs", "python": "python3", "ruby": "ruby", "mariadb": "mariadb-server", "mysql": "mysql-server", "postgresql": "postgresql", "redis": "redis-server", "valkey": "valkey-server", "memcached": "memcached", "certbot": "certbot", "vsftpd": "vsftpd", "fail2ban": "fail2ban"}
SERVICE_BINARIES = {"nginx": "usr/sbin/nginx", "apache": "usr/sbin/apache2", "php": "usr/sbin/php-fpm8.2", "nodejs": "usr/bin/node", "python": "usr/bin/python3", "ruby": "usr/bin/ruby", "mariadb": "usr/sbin/mariadbd", "mysql": "bin/mysqld", "postgresql": "usr/lib/postgresql/15/bin/postgres", "redis": "usr/bin/redis-server", "valkey": "usr/bin/valkey-server", "memcached": "usr/bin/memcached", "certbot": "usr/bin/certbot", "vsftpd": "usr/sbin/vsftpd", "fail2ban": "usr/bin/fail2ban-server"}


def service_root(service_id: str, version: str | None = None) -> Path:
    if service_id == "php" and version:
        safe_version = version.replace("/", "-").replace("\\", "-")
        return Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "php" / "versions" / safe_version
    return Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / service_id


def package_for(service_id: str) -> str | None:
    return SERVICE_PACKAGES.get(service_id)


def binary_path(service_id: str, version: str | None = None) -> Path:
    root = service_root(service_id, version)
    if service_id == "certbot":
        return root / "venv/bin/certbot"
    if service_id == "php" and version:
        candidates = sorted(root.glob("usr/sbin/php-fpm*")) + sorted(root.glob("usr/bin/php-fpm*"))
        return candidates[0] if candidates else root / "usr/sbin/php-fpm"
    return root / SERVICE_BINARIES.get(service_id, f"usr/bin/{service_id}")


def php_cli_path(version: str) -> Path:
    root = service_root("php", version)
    candidates = [root / f"usr/bin/php{version}", root / "usr/bin/php"]
    candidates.extend(sorted(root.glob("usr/bin/php8.*")))
    return next((candidate for candidate in candidates if candidate.exists()), root / f"usr/bin/php{version}")


def php_fpm_paths(version: str) -> dict[str, Path]:
    root = service_root("php", version)
    return {"root": root, "binary": binary_path("php", version), "config": root / "conf/php-fpm.conf", "ini": root / "conf/php.ini", "pool": root / "conf/pool.d/www.conf", "pid": root / "run/php-fpm.pid", "socket": root / "run/php-fpm.sock", "error_log": root / "logs/error.log", "www": root / "www"}


PHP_BASELINE_MODULES = {
    "curl": ("curl",),
    "gd": ("gd",),
    "intl": ("intl",),
    "mbstring": ("mbstring",),
    "mysql": ("mysqli", "pdo_mysql"),
    "opcache": ("opcache",),
    "pgsql": ("pgsql", "pdo_pgsql"),
    "redis": ("redis",),
    "xml": ("dom", "simplexml", "xml", "xmlreader", "xmlwriter", "xsl"),
    "zip": ("zip",),
    "bcmath": ("bcmath",),
    "fileinfo": ("fileinfo",),
}


def php_default_ini(version: str, error_log: Path, root: Path | None = None) -> str:
    production_file = next(root.rglob("php.ini-production"), None) if root and root.exists() else None
    if production_file:
        base = production_file.read_text(errors="replace").rstrip()
    else:
        base = "[PHP]"
    return base + f'''\n\n; Server Engine Laravel and WordPress production defaults for PHP {version}
engine = On
short_open_tag = Off
output_buffering = 4096
implicit_flush = Off
max_execution_time = 120
max_input_time = 120
max_input_vars = 5000
memory_limit = 256M
error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT
display_errors = Off
display_startup_errors = Off
log_errors = On
error_log = {error_log}
expose_php = Off
variables_order = "GPCS"
request_order = "GP"
cgi.fix_pathinfo = 0
post_max_size = 64M
upload_max_filesize = 64M
max_file_uploads = 50
default_socket_timeout = 60
date.timezone = UTC

session.use_strict_mode = 1
session.cookie_httponly = 1
session.cookie_samesite = Lax

realpath_cache_size = 4096K
realpath_cache_ttl = 600

opcache.enable = 1
opcache.enable_cli = 0
opcache.memory_consumption = 128
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 20000
opcache.validate_timestamps = 1
opcache.revalidate_freq = 2
opcache.save_comments = 1
'''


def enable_php_baseline_extensions(version: str) -> list[str]:
    paths = php_fpm_paths(version)
    ini = paths["ini"]
    content = ini.read_text(errors="replace") if ini.exists() else ""
    enabled = []
    for feature, modules in PHP_BASELINE_MODULES.items():
        for module in modules:
            shared_object = next(paths["root"].glob(f"usr/lib/php/*/{module}.so"), None)
            if not shared_object:
                continue
            directive = "zend_extension" if module == "opcache" else "extension"
            line = f"{directive}={shared_object}"
            if line not in content:
                content = content.rstrip() + "\n" + line + "\n"
            enabled.append(feature)
    ini.write_text(content)
    return sorted(set(enabled))


def ensure_php_fpm_layout(version: str) -> dict[str, Path]:
    paths = php_fpm_paths(version)
    for key in ("config", "ini", "pool", "pid", "socket", "error_log"):
        paths[key].parent.mkdir(parents=True, exist_ok=True)
    paths["www"].mkdir(parents=True, exist_ok=True)
    if not paths["ini"].exists():
        paths["ini"].write_text(php_default_ini(version, paths["error_log"], paths["root"]))
    else:
        current_ini = paths["ini"].read_text(errors="replace")
        if "Server Engine Laravel and WordPress production defaults" in current_ini:
            official_ini = next(paths["root"].rglob("php.ini-production"), None)
            if official_ini:
                paths["ini"].write_text(php_default_ini(version, paths["error_log"], paths["root"]))
        legacy_ini = "[PHP]\nexpose_php=Off\nmemory_limit=256M\nlog_errors=On\nerror_log="
        if current_ini.startswith(legacy_ini):
            paths["ini"].write_text(php_default_ini(version, paths["error_log"], paths["root"]))
    if not paths["pool"].exists():
        paths["pool"].write_text("[www]\nuser = serverengine\ngroup = serverengine\nlisten = " + str(paths["socket"]) + "\nlisten.owner = serverengine\nlisten.group = serverengine\npm = dynamic\npm.max_children = 20\npm.start_servers = 2\npm.min_spare_servers = 1\npm.max_spare_servers = 5\npm.max_requests = 500\nrequest_terminate_timeout = 300s\ncatch_workers_output = yes\nclear_env = no\nphp_admin_flag[log_errors] = on\nphp_admin_value[error_log] = " + str(paths["error_log"]) + "\n")
    if not paths["config"].exists():
        paths["config"].write_text("[global]\npid = " + str(paths["pid"]) + "\nerror_log = " + str(paths["error_log"]) + "\ninclude = " + str(paths["pool"]) + "\n")
    return paths


def nginx_paths() -> dict[str, Path]:
    root = service_root("nginx")
    return {"root": root, "binary": root / "usr/sbin/nginx", "config": root / "conf/nginx.conf", "pid": root / "run/nginx.pid", "access_log": root / "logs/access.log", "error_log": root / "logs/error.log", "www": Path(os.getenv("SE_WEB_ROOT", "/server-engine/www"))}


def nginx_default_configuration(paths: dict[str, Path] | None = None) -> str:
    paths = paths or nginx_paths()
    try:
        pwd.getpwnam("serverengine")
        user_line = "user serverengine;\n"
    except KeyError:
        user_line = ""
    return f'''# Server Engine Nginx baseline
# Website files are loaded from conf/sites/*.conf.
{user_line}worker_processes auto;
error_log {paths["error_log"]} warn;
pid {paths["pid"]};
worker_rlimit_nofile 65535;

events {{
    worker_connections 4096;
    multi_accept on;
}}

http {{
    include {paths["root"] / "conf/mime.types"};
    default_type application/octet-stream;

    server_names_hash_bucket_size 128;
    client_header_buffer_size 4k;
    large_client_header_buffers 4 16k;
    client_max_body_size 64m;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;

    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    fastcgi_connect_timeout 60s;
    fastcgi_send_timeout 60s;
    fastcgi_read_timeout 60s;
    fastcgi_buffer_size 32k;
    fastcgi_buffers 4 32k;
    fastcgi_busy_buffers_size 64k;

    gzip on;
    gzip_min_length 1k;
    gzip_comp_level 4;
    gzip_vary on;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript application/xml image/svg+xml;

    server_tokens off;
    access_log {paths["access_log"]};
    include {paths["root"] / "conf/sites/*.conf"};
}}
'''


def ensure_nginx_layout() -> dict[str, Path]:
    paths = nginx_paths()
    for key in ("config", "pid", "access_log", "error_log", "www"):
        paths[key].parent.mkdir(parents=True, exist_ok=True)
    paths["www"].mkdir(parents=True, exist_ok=True)
    if not paths["config"].exists():
        paths["config"].write_text(nginx_default_configuration(paths))
    (paths["root"] / "conf/sites").mkdir(parents=True, exist_ok=True)
    mime_types = paths["root"] / "conf/mime.types"
    if not mime_types.exists():
        mime_types.write_text('''types {\n    text/html html htm;\n    text/css css;\n    application/javascript js;\n    application/json json;\n    image/png png;\n    image/jpeg jpg jpeg;\n    image/svg+xml svg;\n    image/x-icon ico;\n    font/woff woff;\n    font/woff2 woff2;\n}\n''')
    if paths["config"].exists():
        config = paths["config"].read_text().replace(str(paths["root"] / "etc/nginx/mime.types"), str(mime_types))
        try:
            pwd.getpwnam("serverengine")
            user_line = "user serverengine;\n"
        except KeyError:
            user_line = ""
        config = config.replace("user serverengine;\n", user_line)
        legacy_signature = f"worker_processes auto;\nerror_log {paths['error_log']} warn;\npid {paths['pid']};\n\nevents {{ worker_connections 4096; }}"
        if legacy_signature in config and "gzip on;" not in config and "client_max_body_size" not in config:
            config = nginx_default_configuration(paths)
        paths["config"].write_text(config)
    return paths
