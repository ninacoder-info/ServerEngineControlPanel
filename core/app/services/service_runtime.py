import os
from pathlib import Path

SERVICE_PACKAGES = {"nginx": "nginx", "apache": "apache2", "php": "php-fpm", "nodejs": "nodejs", "python": "python3", "ruby": "ruby", "mariadb": "mariadb-server", "mysql": "mysql-server", "postgresql": "postgresql", "redis": "redis-server", "valkey": "valkey-server", "memcached": "memcached", "certbot": "certbot", "vsftpd": "vsftpd", "fail2ban": "fail2ban"}
SERVICE_BINARIES = {"nginx": "usr/sbin/nginx", "apache": "usr/sbin/apache2", "php": "usr/sbin/php-fpm8.2", "nodejs": "usr/bin/node", "python": "usr/bin/python3", "ruby": "usr/bin/ruby", "mariadb": "usr/sbin/mariadbd", "mysql": "usr/sbin/mysqld", "postgresql": "usr/lib/postgresql/15/bin/postgres", "redis": "usr/bin/redis-server", "valkey": "usr/bin/valkey-server", "memcached": "usr/bin/memcached", "certbot": "usr/bin/certbot", "vsftpd": "usr/sbin/vsftpd", "fail2ban": "usr/bin/fail2ban-server"}


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


def php_fpm_paths(version: str) -> dict[str, Path]:
    root = service_root("php", version)
    return {"root": root, "binary": binary_path("php", version), "config": root / "conf/php-fpm.conf", "ini": root / "conf/php.ini", "pool": root / "conf/pool.d/www.conf", "pid": root / "run/php-fpm.pid", "socket": root / "run/php-fpm.sock", "error_log": root / "logs/error.log", "www": root / "www"}


def ensure_php_fpm_layout(version: str) -> dict[str, Path]:
    paths = php_fpm_paths(version)
    for key in ("config", "ini", "pool", "pid", "socket", "error_log"):
        paths[key].parent.mkdir(parents=True, exist_ok=True)
    paths["www"].mkdir(parents=True, exist_ok=True)
    if not paths["ini"].exists():
        paths["ini"].write_text("[PHP]\nexpose_php=Off\nmemory_limit=256M\nlog_errors=On\nerror_log=" + str(paths["error_log"]) + "\n")
    if not paths["pool"].exists():
        paths["pool"].write_text("[www]\nuser = serverengine\ngroup = serverengine\nlisten = " + str(paths["socket"]) + "\nlisten.owner = serverengine\nlisten.group = serverengine\npm = dynamic\npm.max_children = 20\npm.start_servers = 2\npm.min_spare_servers = 1\npm.max_spare_servers = 5\nclear_env = no\n")
    if not paths["config"].exists():
        paths["config"].write_text("[global]\npid = " + str(paths["pid"]) + "\nerror_log = " + str(paths["error_log"]) + "\ninclude = " + str(paths["pool"]) + "\n")
    return paths


def nginx_paths() -> dict[str, Path]:
    root = service_root("nginx")
    return {"root": root, "binary": root / "usr/sbin/nginx", "config": root / "conf/nginx.conf", "pid": root / "run/nginx.pid", "access_log": root / "logs/access.log", "error_log": root / "logs/error.log", "www": Path(os.getenv("SE_WEB_ROOT", "/server-engine/www"))}


def ensure_nginx_layout() -> dict[str, Path]:
    paths = nginx_paths()
    for key in ("config", "pid", "access_log", "error_log", "www"):
        paths[key].parent.mkdir(parents=True, exist_ok=True)
    paths["www"].mkdir(parents=True, exist_ok=True)
    if not paths["config"].exists():
        paths["config"].write_text(f'''user serverengine;\nworker_processes auto;\nerror_log {paths["error_log"]} warn;\npid {paths["pid"]};\n\nevents {{ worker_connections 4096; }}\n\nhttp {{\n    include {paths["root"] / "etc/nginx/mime.types"};\n    default_type application/octet-stream;\n    access_log {paths["access_log"]};\n    sendfile on;\n    keepalive_timeout 65;\n    include {paths["root"] / "conf/sites/*.conf"};\n}}\n''')
    (paths["root"] / "conf/sites").mkdir(parents=True, exist_ok=True)
    mime_types = paths["root"] / "conf/mime.types"
    if not mime_types.exists():
        mime_types.write_text('''types {\n    text/html html htm;\n    text/css css;\n    application/javascript js;\n    application/json json;\n    image/png png;\n    image/jpeg jpg jpeg;\n    image/svg+xml svg;\n    image/x-icon ico;\n    font/woff woff;\n    font/woff2 woff2;\n}\n''')
    if paths["config"].exists():
        config = paths["config"].read_text().replace(str(paths["root"] / "etc/nginx/mime.types"), str(mime_types))
        paths["config"].write_text(config)
    return paths
