import os
import pwd
import re
import shutil
import subprocess
import tempfile
import json
from pathlib import Path

SERVICE_PACKAGES = {
    "nginx": "nginx",
    "apache": "apache2",
    "openlitespeed": "openlitespeed",
    "caddy": "caddy",
    "haproxy": "haproxy",
    "php": "php-fpm",
    "nodejs": "nodejs",
    "python": "python3",
    "mariadb": "mariadb-server",
    "mysql": "mysql-server",
    "postgresql": "postgresql",
    "redis": "redis-server",
    "valkey": "valkey-server",
    "memcached": "memcached",
    "certbot": "certbot",
    "vsftpd": "vsftpd",
    "fail2ban": "fail2ban",
    "powerdns": "pdns-server",
    "rabbitmq": "rabbitmq-server",
    "mongodb": "mongodb-org",
    "pm2": "pm2",
    "docker": "docker.io",
    "postfix": "postfix",
    "dovecot": "dovecot-imapd",
    "rspamd": "rspamd",
    "stalwart": "stalwart",
    "bind9": "bind9",
    "unbound": "unbound",
    "clamav": "clamav",
    "auditd": "auditd",
    "logrotate": "logrotate",
    "modsecurity": "libmodsecurity3",
    "git": "git",
    "imagemagick": "imagemagick",
    "ffmpeg": "ffmpeg",
    "ruby": "ruby",
    "supervisor": "supervisor",
    "lynis": "lynis",
}

SERVICE_BINARIES = {"nginx": "usr/sbin/nginx", "apache": "usr/sbin/apache2", "openlitespeed": "usr/local/lsws/bin/lshttpd", "caddy": "usr/bin/caddy", "haproxy": "usr/sbin/haproxy", "php": "usr/sbin/php-fpm8.2", "nodejs": "usr/bin/node", "python": "usr/bin/python3", "ruby": "usr/bin/ruby", "mariadb": "usr/sbin/mariadbd", "mysql": "bin/mysqld", "postgresql": "usr/lib/postgresql/15/bin/postgres", "redis": "usr/bin/redis-server", "valkey": "usr/bin/valkey-server", "memcached": "usr/bin/memcached", "certbot": "usr/bin/certbot", "vsftpd": "usr/sbin/vsftpd", "fail2ban": "usr/bin/fail2ban-server", "powerdns": "usr/sbin/pdns_server", "rabbitmq": "sbin/rabbitmq-server", "stalwart": "bin/stalwart", "mongodb": "bin/mongod", "opensearch": "bin/opensearch", "wp-cli": "bin/wp", "postfix": "bin/postfix", "dovecot": "sbin/dovecot", "rspamd": "bin/rspamd", "bind9": "sbin/named", "unbound": "bin/unbound", "clamav": "bin/clamscan", "supervisor": "venv/bin/supervisord", "lynis": "bin/lynis", "openssl": "bin/openssl"}

STARTUP_DEFAULT_SERVICES = {"nginx", "mysql", "php"}


def _startup_policy_path() -> Path:
    return Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine")) / "service-startup.json"


def _startup_policy_key(service_id: str, version: str | None = None) -> str:
    return f"{service_id}:{version}" if service_id == "php" and version else service_id


def default_startup_enabled(service_id: str) -> bool:
    return service_id in STARTUP_DEFAULT_SERVICES


def read_startup_policy() -> dict[str, bool]:
    try:
        value = json.loads(_startup_policy_path().read_text())
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def startup_enabled(service_id: str, version: str | None = None) -> bool:
    values = read_startup_policy()
    key = _startup_policy_key(service_id, version)
    return bool(values[key]) if key in values else default_startup_enabled(service_id)


def set_startup_enabled(service_id: str, enabled: bool, version: str | None = None) -> bool:
    path = _startup_policy_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    values = read_startup_policy()
    values[_startup_policy_key(service_id, version)] = bool(enabled)
    with tempfile.NamedTemporaryFile("w", dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        json.dump(values, handle, indent=2, sort_keys=True)
        handle.write("\n")
        temporary = Path(handle.name)
    os.replace(temporary, path)
    return bool(enabled)


def version_sort_key(value: str) -> tuple:
    return tuple((0, int(part)) if part.isdigit() else (1, part) for part in re.split(r"[._+~-]", value))


def service_root(service_id: str, version: str | None = None) -> Path:
    root = None
    if service_id in {"nginx", "apache", "openlitespeed", "caddy", "redis", "mysql"}:
        base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / service_id
        if version:
            safe_version = version.replace("/", "-").replace("\\", "-")
            root = base / "versions" / safe_version
        else:
            active_marker = base / ".serverengine-active-version"
            if active_marker.exists():
                active = active_marker.read_text(errors="replace").strip()
                if active:
                    candidate = base / "versions" / active
                    if candidate.exists():
                        root = candidate
            root = root or base
    elif service_id in {"php", "nodejs", "python", "openssl"} and version:
        safe_version = version.replace("/", "-").replace("\\", "-")
        versions_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / service_id / "versions"
        requested = versions_root / safe_version
        if service_id != "php" or requested.exists():
            root = requested
        else:
            # Package providers may install a minor-version directory (for
            # example 8.5) while metadata records the exact patch release.
            for candidate in versions_root.iterdir() if versions_root.exists() else ():
                if not candidate.is_dir():
                    continue
                marker = candidate / ".serverengine-version"
                if marker.exists() and marker.read_text(errors="replace").strip() == version:
                    root = candidate
                    break
            root = root or requested
    else:
        root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / service_id
    _ensure_service_log_link(service_id, root)
    return root


def _ensure_service_log_link(service_id: str, root: Path) -> None:
    """Store service logs in the shared Server Engine log directory.

    Service configurations continue to use ``<service>/logs``; the directory
    is a compatibility symlink so existing providers and configuration files
    keep working while the actual files live under /server-engine/logs.
    """
    if root.name == "versions" or not root:
        return
    if not root.exists():
        return
    log_root = Path(os.getenv("SE_LOG_ROOT", "/server-engine/logs")) / service_id
    if "versions" in root.parts:
        version_index = root.parts.index("versions")
        if version_index + 1 < len(root.parts):
            log_root = log_root / "versions" / root.parts[version_index + 1]
    try:
        log_root.mkdir(parents=True, exist_ok=True)
        legacy = root / "logs"
        if legacy.is_symlink():
            target = log_root
        else:
            target = log_root
        if legacy.exists() and not legacy.is_symlink():
            for item in legacy.iterdir():
                destination = log_root / item.name
                if not destination.exists():
                    shutil.move(str(item), str(destination))
            legacy.rmdir()
        root.mkdir(parents=True, exist_ok=True)
        if not legacy.is_symlink():
            legacy.symlink_to(log_root, target_is_directory=True)
        try:
            owner = pwd.getpwnam("serverengine")
            if os.geteuid() == 0:
                subprocess.run(
                    ["chown", "-R", f"serverengine:serverengine", str(target)],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                os.chown(target, owner.pw_uid, owner.pw_gid)
        except (KeyError, OSError):
            pass
    except OSError:
        # A service operation should not fail solely because log relocation
        # cannot run on a read-only or partially installed service root.
        return


def package_for(service_id: str) -> str | None:
    return SERVICE_PACKAGES.get(service_id)


def prepare_mysql_runtime(root: Path) -> dict[str, str]:
    """Stage MySQL's shared libraries inside its managed service root."""
    library_dir = root / ".runtime-libraries"
    library_dir.mkdir(parents=True, exist_ok=True)
    required_libraries = (
        "libaio.so*",
        "libnuma.so*",
        "libncurses.so*",
        "libtinfo.so*",
        "libicuuc.so*",
        "libicui18n.so*",
        "libicudata.so*",
        "libevent_core-2.1.so*",
        "libevent_pthreads-2.1.so*",
        "libprotobuf-lite.so.32*",
    )
    if any(not any(library_dir.rglob(pattern)) for pattern in required_libraries):
        apt = shutil.which("apt")
        dpkg_deb = shutil.which("dpkg-deb")
        if not apt or not dpkg_deb:
            raise RuntimeError("MySQL needs its runtime libraries, but the isolated package tools are unavailable")
        apt_cache = shutil.which("apt-cache")
        icu_package = next(
            (
                candidate
                for candidate in ("libicu76", "libicu75", "libicu74", "libicu73", "libicu72")
                if not apt_cache
                or subprocess.run(
                    [apt_cache, "show", candidate],
                    capture_output=True,
                    text=True,
                    check=False,
                ).returncode == 0
            ),
            "libicu74",
        )
        event_package = next(
            (
                candidate
                for candidate in (
                    "libevent-core-2.1-7t64",
                    "libevent-core-2.1-7",
                    "libevent-2.1-7t64",
                    "libevent-2.1-7",
                )
                if not apt_cache
                or subprocess.run(
                    [apt_cache, "show", candidate],
                    capture_output=True,
                    text=True,
                    check=False,
                ).returncode == 0
            ),
            "libevent-core-2.1-7t64",
        )
        event_pthreads_package = next(
            (
                candidate
                for candidate in (
                    "libevent-pthreads-2.1-7t64",
                    "libevent-pthreads-2.1-7",
                )
                if not apt_cache
                or subprocess.run(
                    [apt_cache, "show", candidate],
                    capture_output=True,
                    text=True,
                    check=False,
                ).returncode == 0
            ),
            "libevent-pthreads-2.1-7t64",
        )
        def has_apt_candidate(package: str) -> bool:
            if not apt_cache:
                return True
            policy = subprocess.run(
                [apt_cache, "policy", package],
                capture_output=True,
                text=True,
                check=False,
            ).stdout
            return any(
                line.strip().startswith("Candidate:")
                and line.split(":", 1)[1].strip() not in {"", "(none)"}
                for line in policy.splitlines()
            )

        protobuf_package = next(
            (
                candidate
                for candidate in (
                    "libprotobuf-lite32t64",
                    "libprotobuf-lite32",
                    "libprotobuf-lite23",
                )
                if has_apt_candidate(candidate)
            ),
            "libprotobuf-lite32t64",
        )
        for archive in library_dir.glob("*.deb"):
            archive.unlink(missing_ok=True)
        runtime_packages = [
            "libaio1t64",
            "libnuma1",
            "libncurses6",
            "libtinfo6",
            icu_package,
            event_package,
            event_pthreads_package,
            protobuf_package,
        ]
        download = subprocess.run([apt, "download", *runtime_packages], cwd=library_dir, capture_output=True, text=True, check=False)
        if download.returncode != 0:
            raise RuntimeError("Unable to stage MySQL runtime libraries: " + (download.stderr or download.stdout).strip())
        archives = sorted(library_dir.glob("*.deb"))
        if len(archives) < len(runtime_packages):
            raise RuntimeError("MySQL runtime library packages were not downloaded")
        for archive in archives:
            subprocess.run([dpkg_deb, "-x", str(archive), str(library_dir)], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            archive.unlink(missing_ok=True)
        if any(not any(library_dir.rglob(pattern)) for pattern in required_libraries):
            missing = ", ".join(pattern for pattern in required_libraries if not any(library_dir.rglob(pattern)))
            raise RuntimeError(f"MySQL runtime libraries are incomplete; missing {missing}")
    aio_candidates = list(library_dir.rglob("libaio.so.1t64"))
    aio_link = next((path.parent / "libaio.so.1" for path in aio_candidates), None)
    if aio_link and not aio_link.exists():
        aio_link.symlink_to(aio_candidates[0].name)
    library_paths = [library_dir, *[path for path in library_dir.rglob("*") if path.is_dir()]]
    environment = os.environ.copy()
    environment["LD_LIBRARY_PATH"] = ":".join(str(path) for path in library_paths)
    # Fail once with the complete unresolved dependency list instead of
    # making the user discover one missing .so file per restart attempt.
    ldd = shutil.which("ldd")
    mysql_binary = root / "bin/mysqld"
    if ldd and mysql_binary.exists():
        dependency_check = subprocess.run(
            [ldd, str(mysql_binary)],
            capture_output=True,
            text=True,
            check=False,
            env=environment,
        )
        missing = []
        for line in dependency_check.stdout.splitlines():
            if "=> not found" in line:
                missing.append(line.split("=>", 1)[0].strip())
            elif line.strip().endswith("not found"):
                missing.append(line.strip())
        if missing:
            raise RuntimeError("MySQL runtime libraries unresolved: " + ", ".join(dict.fromkeys(missing)))
    return environment


def prepare_postgresql_runtime(root: Path) -> dict[str, str]:
    """Stage PostgreSQL's shared ICU libraries inside its managed root."""
    library_dir = root / ".runtime-libraries"
    library_dir.mkdir(parents=True, exist_ok=True)
    required_libraries = ("libicuuc.so*", "libicui18n.so*", "libicudata.so*")
    if any(not any(library_dir.rglob(pattern)) for pattern in required_libraries):
        apt = shutil.which("apt")
        dpkg_deb = shutil.which("dpkg-deb")
        if not apt or not dpkg_deb:
            raise RuntimeError("PostgreSQL needs ICU runtime libraries, but the isolated package tools are unavailable")
        for archive in library_dir.glob("*.deb"):
            archive.unlink(missing_ok=True)
        download = subprocess.run([apt, "download", "libicu74"], cwd=library_dir, capture_output=True, text=True, check=False)
        if download.returncode != 0:
            raise RuntimeError("Unable to stage PostgreSQL ICU runtime libraries: " + (download.stderr or download.stdout).strip())
        archives = sorted(library_dir.glob("*.deb"))
        if not archives:
            raise RuntimeError("PostgreSQL ICU runtime package was not downloaded")
        for archive in archives:
            subprocess.run([dpkg_deb, "-x", str(archive), str(library_dir)], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            archive.unlink(missing_ok=True)
    library_paths = [library_dir, *[path for path in library_dir.rglob("*") if path.is_dir()]]
    environment = os.environ.copy()
    environment["LD_LIBRARY_PATH"] = ":".join(str(path) for path in library_paths)
    return environment


def prepare_powerdns_runtime(root: Path) -> dict[str, str]:
    """Stage PowerDNS shared libraries inside its managed service root."""
    capability_helper = Path("/usr/local/sbin/server-engine-powerdns-bind-cap")
    if capability_helper.exists() and shutil.which("sudo"):
        granted = subprocess.run(["sudo", "-n", str(capability_helper)], capture_output=True, text=True, check=False)
        if granted.returncode != 0:
            raise RuntimeError("Unable to grant isolated PowerDNS permission to bind port 53: " + (granted.stderr or granted.stdout).strip())
    library_dir = root / ".runtime-libraries"
    library_dir.mkdir(parents=True, exist_ok=True)
    apt = shutil.which("apt")
    dpkg_deb = shutil.which("dpkg-deb")
    apt_cache = shutil.which("apt-cache")
    if not apt or not dpkg_deb:
        raise RuntimeError("PowerDNS needs isolated runtime libraries, but apt and dpkg-deb are unavailable")

    # Ubuntu ships the BIND backend separately from pdns-server. Recover an
    # older Server Engine installation that extracted only the main package.
    if not any(root.rglob("libbindbackend.so")):
        policy = subprocess.run([apt_cache, "policy", "pdns-backend-bind"], capture_output=True, text=True, check=False).stdout if apt_cache else ""
        if any(line.strip().startswith("Candidate:") and line.split(":", 1)[1].strip() not in {"", "(none)"} for line in policy.splitlines()):
            backend_dir = root / ".runtime-backend"
            backend_dir.mkdir(parents=True, exist_ok=True)
            download = subprocess.run([apt, "download", "pdns-backend-bind"], cwd=backend_dir, capture_output=True, text=True, check=False)
            if download.returncode != 0:
                raise RuntimeError("Unable to stage the PowerDNS BIND backend: " + (download.stderr or download.stdout).strip())
            backend_archives = sorted(backend_dir.glob("*.deb"))
            if not backend_archives:
                raise RuntimeError("The PowerDNS BIND backend package was not downloaded")
            for archive in backend_archives:
                subprocess.run([dpkg_deb, "-x", str(archive), str(root)], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                archive.unlink(missing_ok=True)
            shutil.rmtree(backend_dir, ignore_errors=True)

    if not any(library_dir.rglob("libcurl.so*")):
        package_groups = [
            ("libcurl4t64", "libcurl4"),
            ("libssl3t64", "libssl3"),
            ("libnghttp2-14",),
            ("libidn2-0",),
            ("libpsl5t64", "libpsl5"),
            ("libssh-4",),
            ("libbrotli1",),
            ("zlib1g",),
            ("libzstd1",),
        ]
        packages = []
        for candidates in package_groups:
            selected = next(
                (
                    candidate
                    for candidate in candidates
                    if not apt_cache
                    or subprocess.run([apt_cache, "show", candidate], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode == 0
                ),
                None,
            )
            if selected:
                packages.append(selected)
        if not packages:
            raise RuntimeError("No compatible PowerDNS runtime library packages were found")
        for archive in library_dir.glob("*.deb"):
            archive.unlink(missing_ok=True)
        download = subprocess.run([apt, "download", *packages], cwd=library_dir, capture_output=True, text=True, check=False)
        if download.returncode != 0:
            raise RuntimeError("Unable to stage PowerDNS runtime libraries: " + (download.stderr or download.stdout).strip())
        archives = sorted(library_dir.glob("*.deb"))
        if not archives:
            raise RuntimeError("PowerDNS libcurl package was not downloaded")
        for archive in archives:
            subprocess.run([dpkg_deb, "-x", str(archive), str(library_dir)], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            archive.unlink(missing_ok=True)
    library_paths = [library_dir, *[path for path in library_dir.rglob("*") if path.is_dir()]]
    environment = os.environ.copy()
    environment["LD_LIBRARY_PATH"] = ":".join(str(path) for path in library_paths)
    return environment


def prepare_mongodb_runtime(root: Path) -> dict[str, str]:
    """Stage MongoDB's shared client and TLS libraries inside its root."""
    library_dir = root / ".runtime-libraries"
    library_dir.mkdir(parents=True, exist_ok=True)
    required_libraries = ("libcurl.so*", "libssl.so*", "libcrypto.so*")
    if any(not any(library_dir.rglob(pattern)) for pattern in required_libraries):
        apt = shutil.which("apt")
        dpkg_deb = shutil.which("dpkg-deb")
        if not apt or not dpkg_deb:
            raise RuntimeError("MongoDB needs runtime libraries, but the isolated package tools are unavailable")
        for archive in library_dir.glob("*.deb"):
            archive.unlink(missing_ok=True)
        packages = ["libcurl4t64", "libssl3t64", "liblzma5", "libsnappy1v5", "libzstd1", "libnghttp2-14", "libidn2-0", "libpsl5t64", "libssh-4", "libldap2", "libsasl2-2", "libgssapi-krb5-2", "libkrb5-3", "libcom-err2", "libk5crypto3", "libkrb5support0", "libbrotli1"]
        download = subprocess.run([apt, "download", *packages], cwd=library_dir, capture_output=True, text=True, check=False)
        if download.returncode != 0:
            raise RuntimeError("Unable to stage MongoDB runtime libraries: " + (download.stderr or download.stdout).strip())
        archives = sorted(library_dir.glob("*.deb"))
        if not archives:
            raise RuntimeError("MongoDB runtime packages were not downloaded")
        for archive in archives:
            subprocess.run([dpkg_deb, "-x", str(archive), str(library_dir)], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            archive.unlink(missing_ok=True)
    library_paths = [library_dir, *[path for path in library_dir.rglob("*") if path.is_dir()]]
    environment = os.environ.copy()
    environment["LD_LIBRARY_PATH"] = ":".join(str(path) for path in library_paths)
    return environment


def supervisor_paths(root: Path) -> tuple[Path, Path]:
    """Resolve Supervisor launchers across source and package layouts."""
    directories = (root / "venv/bin", root / "bin", root / "usr/bin", root / "usr/local/bin")
    supervisord = next((directory / "supervisord" for directory in directories if (directory / "supervisord").exists()), None)
    if supervisord is None and root.exists():
        supervisord = next((candidate for candidate in root.rglob("supervisord") if candidate.is_file()), None)
    supervisord = supervisord or directories[0] / "supervisord"
    supervisorctl = next((directory / "supervisorctl" for directory in directories if (directory / "supervisorctl").exists()), None)
    if supervisorctl is None and root.exists():
        supervisorctl = next((candidate for candidate in root.rglob("supervisorctl") if candidate.is_file()), None)
    supervisorctl = supervisorctl or supervisord.parent / "supervisorctl"
    return supervisord, supervisorctl


def binary_path(service_id: str, version: str | None = None) -> Path:
    root = service_root(service_id, version)
    if service_id == "nginx":
        candidates = [root / "bin/nginx", root / "usr/sbin/nginx"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "apache":
        candidates = [root / "bin/httpd", root / "usr/sbin/apache2"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "postgresql":
        candidates = [root / "bin/postgres", *sorted(root.glob("usr/lib/postgresql/*/bin/postgres"), reverse=True)]
        return next((candidate for candidate in candidates if candidate.exists()), root / "bin/postgres")
    if service_id == "nodejs":
        current = root / "bin/node"
        legacy = root / "usr/bin/node"
        return current if current.exists() or not legacy.exists() else legacy
    if service_id == "python" and version:
        candidates = [
            root / "bin/python",
            root / "bin/python3",
            *sorted(root.glob("bin/python3.*"), reverse=True),
            root / "usr/bin/python",
            root / "usr/bin/python3",
            *sorted(root.glob("usr/bin/python3.*"), reverse=True),
            root / "python/bin/python",
            root / "python/bin/python3",
        ]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "redis":
        candidates = [root / "bin/redis-server", root / "usr/bin/redis-server"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "mysql":
        candidates = [root / "bin/mysqld", root / "usr/sbin/mysqld", root / "usr/libexec/mysqld", root / "usr/lib/mysql/mysqld"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "certbot":
        candidates = [root / "venv/bin/certbot", root / "usr/bin/certbot", root / "bin/certbot"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "rabbitmq":
        candidates = [root / "sbin/rabbitmq-server", root / "bin/rabbitmq-server", root / "usr/sbin/rabbitmq-server"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "openlitespeed":
        candidates = [root / "bin/openlitespeed", root / "bin/lshttpd", root / "usr/local/lsws/bin/lshttpd"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "git":
        candidates = [root / "bin/git", root / "usr/bin/git"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "imagemagick":
        candidates = [root / "bin/magick", root / "bin/convert", root / "usr/bin/magick"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "ruby":
        candidates = [root / "bin/ruby", root / "usr/bin/ruby"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "ffmpeg":
        candidates = [root / "bin/ffmpeg", root / "usr/bin/ffmpeg"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "caddy":
        candidates = [root / "bin/caddy", root / "usr/bin/caddy"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "mariadb":
        candidates = [root / "bin/mariadbd", root / "sbin/mariadbd", root / "usr/sbin/mariadbd"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "powerdns":
        candidates = [root / "bin/pdns_server", root / "sbin/pdns_server", root / "usr/sbin/pdns_server"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "haproxy":
        candidates = [root / "bin/haproxy", root / "usr/sbin/haproxy"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "memcached":
        candidates = [root / "bin/memcached", root / "usr/bin/memcached"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "valkey":
        candidates = [root / "bin/valkey-server", root / "usr/bin/valkey-server"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "vsftpd":
        candidates = [root / "bin/vsftpd", root / "usr/sbin/vsftpd"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "stalwart":
        candidates = [root / "bin/stalwart", root / "usr/bin/stalwart"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "mongodb":
        candidates = [root / "bin/mongod", root / "usr/bin/mongod"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "opensearch":
        candidates = [root / "bin/opensearch", root / "bin/opensearch-keystore"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "wp-cli":
        candidates = [root / "versions" / "current" / "bin/wp", root / "bin/wp"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "pm2":
        candidates = [root / "bin/pm2", root / "node_modules/.bin/pm2"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "postfix":
        candidates = [root / "bin/postfix", root / "usr/sbin/postfix"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "dovecot":
        candidates = [root / "sbin/dovecot", root / "usr/sbin/dovecot"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "rspamd":
        candidates = [root / "bin/rspamd", root / "usr/bin/rspamd"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "bind9":
        candidates = [root / "sbin/named", root / "usr/sbin/named", root / "bin/named"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "unbound":
        candidates = [root / "sbin/unbound", root / "usr/sbin/unbound", root / "bin/unbound"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "clamav":
        candidates = [root / "bin/clamscan", root / "usr/bin/clamscan"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "supervisor":
        return supervisor_paths(root)[0]
    if service_id == "lynis":
        candidates = [root / "bin/lynis", root / "lynis"]
        return next((candidate for candidate in candidates if candidate.exists()), candidates[0])
    if service_id == "php" and version:
        candidates = sorted(root.glob("usr/sbin/php-fpm*")) + sorted(root.glob("usr/bin/php-fpm*")) + sorted(root.glob("sbin/php-fpm*"))
        return candidates[0] if candidates else root / "usr/sbin/php-fpm"
    return root / SERVICE_BINARIES.get(service_id, f"usr/bin/{service_id}")


def managed_library_environment(*roots: Path) -> dict[str, str]:
    """Expose shared libraries from managed service roots only."""
    directories: set[str] = set()
    for root in roots:
        if not root.exists():
            continue
        for candidate in root.rglob("*"):
            if candidate.is_dir() and any(item.is_file() for item in candidate.glob("*.so*")):
                directories.add(str(candidate))
    environment = os.environ.copy()
    existing = environment.get("LD_LIBRARY_PATH", "")
    paths = sorted(directories)
    if existing:
        paths.append(existing)
    if paths:
        environment["LD_LIBRARY_PATH"] = ":".join(paths)
    return environment


def ensure_node_runtime(root: Path) -> None:
    node = root / "bin/node"
    real_node = root / "bin/node.bin"
    if not node.exists() or node.is_symlink():
        return
    if not real_node.exists() and node.is_file():
        node.rename(real_node)
    library_paths = [root / "lib", root / "usr/lib", root / ".runtime-libraries/lib", root / ".runtime-libraries/usr/lib", root / ".runtime-libraries/usr/lib/aarch64-linux-gnu", root / ".runtime-libraries/usr/lib/x86_64-linux-gnu", root / "lib/aarch64-linux-gnu", root / "usr/lib/aarch64-linux-gnu", root / "lib/x86_64-linux-gnu", root / "usr/lib/x86_64-linux-gnu"]
    paths = ":".join(str(item) for item in library_paths if item.exists())
    node.write_text(f"#!/bin/sh\nexport LD_LIBRARY_PATH=\"{paths}:$LD_LIBRARY_PATH\"\nexec \"{real_node}\" \"$@\"\n")
    node.chmod(0o755)
    npm_root = root / "lib/node_modules/npm/bin"
    for command, script in (("npm", "npm-cli.js"), ("npx", "npx-cli.js")):
        launcher = root / f"bin/{command}"
        target = npm_root / script
        if target.exists():
            launcher.write_text(f"#!/bin/sh\nexec \"{node}\" \"{target}\" \"$@\"\n")
            launcher.chmod(0o755)


def php_cli_path(version: str) -> Path:
    root = service_root("php", version)
    candidates = [
        root / f"usr/bin/php{version}",
        root / "usr/bin/php",
        root / f"bin/php{version}",
        root / "bin/php",
    ]
    candidates.extend(sorted(root.glob("usr/bin/php8.*")))
    candidates.extend(sorted(root.glob("bin/php8.*")))
    return next((candidate for candidate in candidates if candidate.exists()), root / f"usr/bin/php{version}")


def php_runtime_library_path(root: Path) -> str:
    # Keep this list deliberately bounded. Recursively exporting every parent
    # directory containing a shared object can make LD_LIBRARY_PATH larger
    # than ARG_MAX on PHP packages with many bundled libraries. The dynamic
    # loader only needs the runtime library roots and their architecture
    # directories here.
    paths = {
        root / "lib",
        root / "lib64",
        root / "usr/lib",
        root / "usr/lib64",
        root / ".runtime-libraries/lib",
        root / ".runtime-libraries/usr/lib",
    }
    for parent in (
        root / "lib",
        root / "lib64",
        root / "usr/lib",
        root / "usr/lib64",
        root / ".runtime-libraries/lib",
        root / ".runtime-libraries/usr/lib",
    ):
        if parent.is_dir():
            paths.update(child for child in parent.iterdir() if child.is_dir())
    return ":".join(str(path) for path in sorted(paths) if path.exists())


def detect_php_runtime_version(root: Path) -> str | None:
    candidates = [
        root / "usr/bin/php",
        *sorted(root.glob("usr/bin/php8.*")),
        root / "bin/php",
        *sorted(root.glob("bin/php8.*")),
    ]
    environment = {**os.environ, "LD_LIBRARY_PATH": php_runtime_library_path(root)}
    for candidate in candidates:
        if not candidate.exists():
            continue
        try:
            result = subprocess.run(
                [str(candidate), "-n", "-r", "echo PHP_VERSION;"],
                capture_output=True,
                text=True,
                check=False,
                timeout=5,
                env=environment,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        match = re.search(r"\b(\d+\.\d+\.\d+)\b", result.stdout or "")
        if match:
            return match.group(1)
    return None


def normalize_php_runtime_layout(root: Path) -> tuple[Path, str | None]:
    """Use the real PHP patch version as the runtime directory and CLI name."""
    detected = detect_php_runtime_version(root)
    if not detected:
        return root, None
    target = root.parent / detected
    if target != root and not target.exists():
        root.rename(target)
        root = target
    cli = root / "usr/bin/php"
    if not cli.exists():
        candidates = [root / "bin/php"] + sorted(root.glob("usr/bin/php8.*")) + sorted(root.glob("bin/php8.*"))
        candidates = [candidate for candidate in candidates if candidate.exists()]
        if candidates:
            cli.parent.mkdir(parents=True, exist_ok=True)
            candidates[0].rename(cli)
    (root / ".serverengine-version").write_text(detected + "\n")
    return root, detected


def ensure_php_runtime_launcher(version: str) -> Path:
    """Make the copied PHP executable carry its isolated library search path."""
    root = service_root("php", version)
    cli = php_cli_path(version)
    if not cli.exists():
        return cli
    def is_php_binary(candidate: Path) -> bool:
        try:
            return candidate.exists() and candidate.is_file() and candidate.read_bytes()[:4] == b"\x7fELF"
        except OSError:
            return False

    if is_php_binary(cli):
        real_cli = cli.with_name(f"{cli.name}.real")
        if not real_cli.exists():
            cli.rename(real_cli)
    else:
        # Older launchers could be left behind with a missing or recursive
        # companion. Find an actual ELF PHP binary, never another shell script.
        candidates = [
            cli.with_name(f"{cli.name}.real"),
            cli.with_name(f"{cli.name}.bin"),
            *sorted(root.glob("usr/bin/php8.*")),
            *sorted(root.glob("bin/php8.*")),
            root / "bin/php",
        ]
        real_cli = next(
            (candidate for candidate in candidates if candidate != cli and is_php_binary(candidate)),
            None,
        )
        if real_cli is None:
            return cli
    libraries = php_runtime_library_path(root)
    cli.write_text(
        "#!/bin/sh\n"
        f"export LD_LIBRARY_PATH=\"{libraries}:$LD_LIBRARY_PATH\"\n"
        f"export PHP_INI_SCAN_DIR=\"{root / 'conf/conf.d'}\"\n"
        f"exec \"{real_cli}\" -c \"{root / 'conf/php.ini'}\" \"$@\"\n"
    )
    cli.chmod(0o755)
    return cli


def ensure_php_terminal_launcher(version: str) -> Path:
    """Create the isolated version's `php` command without touching the host PATH."""
    # The runtime launcher already provides the isolated library and ini
    # environment. Do not wrap it a second time: a second wrapper can select
    # /usr/bin/php as its own target and recurse until exec reports ARG_MAX.
    return ensure_php_runtime_launcher(version)


def composer_path() -> Path:
    direct = service_root("composer") / "bin/composer"
    if direct.exists():
        return direct
    root = service_root("composer") / "versions"
    candidates = sorted(root.glob("*/bin/composer"), key=lambda path: version_sort_key(path.parent.parent.name), reverse=True)
    return candidates[0] if candidates else root / "current/bin/composer"


def ensure_composer_cache() -> Path:
    cache = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine")) / "composer"
    cache.mkdir(parents=True, exist_ok=True)
    try:
        owner = pwd.getpwnam("serverengine")
        for current, directories, files in os.walk(cache):
            os.chown(current, owner.pw_uid, owner.pw_gid)
            for name in [*directories, *files]:
                with_path = Path(current) / name
                try:
                    os.chown(with_path, owner.pw_uid, owner.pw_gid)
                except OSError:
                    pass
    except (KeyError, OSError):
        pass
    return cache


def ensure_composer_launcher() -> Path:
    """Refresh the Composer launcher so it always loads the managed PHP config."""
    versions_root = service_root("php") / "versions"
    php_versions = sorted((item for item in versions_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True) if versions_root.exists() else []
    composer_root = service_root("composer")
    selected_marker = composer_root / ".serverengine-php-version"
    selected = selected_marker.read_text(errors="replace").strip() if selected_marker.exists() else ""
    php_version = selected if selected and php_cli_path(selected).exists() else next((item.name for item in php_versions if php_cli_path(item.name).exists()), None)
    if php_version and php_version != selected:
        selected_marker.parent.mkdir(parents=True, exist_ok=True)
        selected_marker.write_text(php_version + "\n")
    launcher = composer_path()
    if not php_version or not launcher.exists():
        return launcher
    php_root = service_root("php", php_version)
    php = php_cli_path(php_version)
    ensure_php_fpm_layout(php_version)
    libraries = php_runtime_library_path(php_root)
    extension_dir = next(
        (
            candidate
            for base in (php_root / "usr/lib/php", php_root / "lib/php", php_root / "lib64/php")
            if base.exists()
            for candidate in sorted(base.iterdir())
            if candidate.is_dir()
        ),
        None,
    )
    extensions = [module for module in ("phar.so", "iconv.so") if extension_dir and (extension_dir / module).exists()]
    extension_flags = " ".join(f'-d extension="{extension_dir / module}"' for module in extensions)
    extension_options = f' -d extension_dir="{extension_dir}" {extension_flags}' if extension_dir else ""
    archive = launcher.parent.parent / "composer.phar"
    php_ini = php_root / "conf/php.ini"
    composer_home = ensure_composer_cache()
    launcher.write_text(f'#!/bin/sh\nexport LD_LIBRARY_PATH="{libraries}:$LD_LIBRARY_PATH"\nexport PHPRC="{php_ini}"\nexport PHP_INI_SCAN_DIR="{php_root / "conf/conf.d"}"\nexport COMPOSER_HOME="{composer_home}"\nexec "{php}" -c "{php_ini}"{extension_options} "{archive}" "$@"\n')
    launcher.chmod(0o755)
    return launcher


def composer_php_version() -> str | None:
    ensure_composer_launcher()
    marker = service_root("composer") / ".serverengine-php-version"
    return marker.read_text(errors="replace").strip() if marker.exists() else None


def php_fpm_paths(version: str) -> dict[str, Path]:
    root = service_root("php", version)
    return {"root": root, "binary": binary_path("php", version), "config": root / "conf/php-fpm.conf", "ini": root / "conf/php.ini", "pool": root / "conf/pool.d/www.conf", "pid": root / "run/php-fpm.pid", "socket": root / "run/php-fpm.sock", "error_log": root / "logs/error.log", "www": root / "www"}


def php_runtime_state_root(version: str) -> Path:
    """Return writable PHP state outside the immutable isolated runtime."""
    safe_version = version.replace("/", "-").replace("\\", "-")
    return Path(os.getenv("SE_PHP_STATE_ROOT", "/server-engine/php")) / safe_version


PHP_BASELINE_MODULES = {
    "curl": ("curl",),
    "gd": ("gd",),
    "intl": ("intl",),
    "mbstring": ("mbstring",),
    "pdo": ("pdo",),
    "mysql": ("mysqlnd", "mysqli", "pdo_mysql"),
    "opcache": ("opcache",),
    "pgsql": ("pgsql", "pdo_pgsql"),
    "igbinary": ("igbinary",),
    "redis": ("redis",),
    "xml": ("dom", "simplexml", "xml", "xmlreader", "xmlwriter", "xsl"),
    "zip": ("zip",),
    "bcmath": ("bcmath",),
    "fileinfo": ("fileinfo",),
    "phar": ("phar",),
    "tokenizer": ("tokenizer",),
}

PHP_REQUIRED_EXTENSIONS = ("fileinfo", "mysql", "pgsql", "zip", "curl", "mbstring", "tokenizer")


def php_default_ini(version: str, error_log: Path, root: Path | None = None) -> str:
    production_file = next(root.rglob("php.ini-production"), None) if root and root.exists() else None
    if production_file:
        base = production_file.read_text(errors="replace").rstrip()
    else:
        base = "[PHP]"
    runtime_root = root or error_log.parents[1]
    extension_dir = php_extension_dir(runtime_root)
    local_include_path = runtime_root / "usr/share/php"
    session_path = php_runtime_state_root(version) / "sessions"
    temp_path = runtime_root / "tmp"
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

; Keep this runtime independent from host PHP configuration.
extension_dir = "{extension_dir}"
include_path = ".:{local_include_path}"
session.save_path = "{session_path}"
sys_temp_dir = "{temp_path}"
upload_tmp_dir = "{temp_path}"

; Do not consume .user.ini files copied from another control panel.
user_ini.filename =
open_basedir =

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


def php_extension_dir(root: Path) -> Path:
    """Find the extension directory inside one managed PHP prefix."""
    candidates = []
    for base in (root / "usr/lib/php", root / "lib/php", root / "lib64/php"):
        if base.exists():
            candidates.extend(path for path in base.rglob("*") if path.is_dir() and any(path.glob("*.so")))
    return sorted(candidates, key=lambda path: len(path.parts))[0] if candidates else root / "usr/lib/php"


def ensure_php_runtime_configuration(version: str) -> None:
    """Repair host-derived PHP defaults after package extraction or upgrades."""
    paths = php_fpm_paths(version)
    root = paths["root"]
    extension_dir = php_extension_dir(root)
    local_include_path = root / "usr/share/php"
    session_path = php_runtime_state_root(version) / "sessions"
    opcache_path = php_runtime_state_root(version) / "opcache"
    temp_path = root / "tmp"
    for directory in (root / "conf/conf.d", local_include_path, session_path, opcache_path, temp_path):
        directory.mkdir(parents=True, exist_ok=True)
    content = paths["ini"].read_text(errors="replace") if paths["ini"].exists() else "[PHP]\n"
    directives = {
        "extension_dir": f'"{extension_dir}"',
        "include_path": f'".:{local_include_path}"',
        "session.save_path": f'"{session_path}"',
        "sys_temp_dir": f'"{temp_path}"',
        "upload_tmp_dir": f'"{temp_path}"',
        "date.timezone": "UTC",
        "user_ini.filename": "",
        "open_basedir": "",
        "opcache.file_cache": f'"{opcache_path}"',
    }
    lines = content.splitlines()
    for key, value in directives.items():
        lines = [line for line in lines if not re.match(rf"^\s*;?\s*{re.escape(key)}\s*=", line)]
        lines.append(f"{key} = {value}")
    paths["ini"].write_text("\n".join(lines).rstrip() + "\n")
    # Package extraction does not install Debian's /etc/php conf.d links.
    # Enable the modules from this prefix directly in the managed ini.
    enable_php_baseline_extensions(version)


def enable_php_baseline_extensions(version: str) -> list[str]:
    paths = php_fpm_paths(version)
    ini = paths["ini"]
    content = ini.read_text(errors="replace") if ini.exists() else ""
    module_files = []
    for module_root in (
        paths["root"] / "usr/lib/php",
        paths["root"] / "lib/php",
        paths["root"] / "lib64/php",
    ):
        if module_root.exists():
            module_files.extend(module_root.rglob("*.so"))
    enabled = []
    for feature, modules in PHP_BASELINE_MODULES.items():
        for module in modules:
            shared_object = next(
                (candidate for candidate in module_files if candidate.name == f"{module}.so"),
                None,
            )
            if not shared_object:
                continue
            directive = "zend_extension" if module == "opcache" else "extension"
            line = f"{directive}={shared_object}"
            if line not in content:
                content = content.rstrip() + "\n" + line + "\n"
            if feature == "pdo":
                lines = [item for item in content.splitlines() if item.strip() != line]
                content = line + "\n" + "\n".join(lines).rstrip() + "\n"
            enabled.append(feature)
    ini.write_text(content)
    return sorted(set(enabled))


def ensure_php_runtime_permissions(version: str) -> None:
    """Give the managed PHP worker account ownership of its writable paths."""
    root = service_root("php", version)
    try:
        account = pwd.getpwnam("serverengine")
    except KeyError as error:
        raise RuntimeError("The serverengine service account is required for PHP-FPM") from error

    writable = (
        root / "conf",
        root / "logs",
        root / "run",
        root / "www",
        root / "data",
        root / "tmp",
        # Keep mutable PHP state outside the extracted runtime. Package
        # extraction commonly creates the runtime tree as root.
        php_runtime_state_root(version) / "sessions",
        php_runtime_state_root(version) / "opcache",
    )
    for path in writable:
        path.mkdir(parents=True, exist_ok=True)
        try:
            os.chown(path, account.pw_uid, account.pw_gid)
        except OSError:
            # A non-root development process may not be able to change an
            # existing owner. The service will still use the account when the
            # installer runs with the required privileges.
            pass
        for current, directories, files in os.walk(path):
            for name in (*directories, *files):
                item = Path(current) / name
                try:
                    os.chown(item, account.pw_uid, account.pw_gid)
                except OSError:
                    pass


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
    runtime_user = None
    for account in ("serverengine", "www-data", "nobody"):
        try:
            runtime_user = pwd.getpwnam(account).pw_name
            break
        except KeyError:
            continue
    if runtime_user is None:
        current_user = pwd.getpwuid(os.geteuid()).pw_name
        if current_user != "root":
            runtime_user = current_user
        else:
            raise RuntimeError("PHP-FPM requires a non-root pool account; serverengine, www-data, or nobody is missing")
    if not paths["pool"].exists():
        paths["pool"].write_text("[www]\nuser = " + runtime_user + "\ngroup = " + runtime_user + "\nlisten = " + str(paths["socket"]) + "\nlisten.owner = " + runtime_user + "\nlisten.group = " + runtime_user + "\npm = dynamic\npm.max_children = 20\npm.start_servers = 2\npm.min_spare_servers = 1\npm.max_spare_servers = 5\npm.max_requests = 500\nrequest_terminate_timeout = 300s\ncatch_workers_output = yes\nclear_env = yes\nphp_admin_flag[log_errors] = on\nphp_admin_value[error_log] = " + str(paths["error_log"]) + "\n")
    else:
        pool = paths["pool"].read_text(errors="replace")
        updated_pool = re.sub(r"^(user|group|listen\.owner|listen\.group)\s*=\s*(?:serverengine|www-data|nobody|root)\s*$", lambda match: f"{match.group(1)} = {runtime_user}", pool, flags=re.MULTILINE)
        updated_pool = re.sub(r"^clear_env\s*=\s*no\s*$", "clear_env = yes", updated_pool, flags=re.MULTILINE)
        if updated_pool != pool:
            paths["pool"].write_text(updated_pool)
    if not paths["config"].exists():
        paths["config"].write_text("[global]\npid = " + str(paths["pid"]) + "\nerror_log = " + str(paths["error_log"]) + "\ninclude = " + str(paths["pool"]) + "\n")
    ensure_php_runtime_configuration(version)
    ensure_php_runtime_permissions(version)
    return paths


def nginx_paths(version: str | None = None) -> dict[str, Path]:
    root = service_root("nginx", version)
    shared_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "nginx"
    log_root = Path(os.getenv("SE_LOG_ROOT", "/server-engine/logs")) / "nginx"
    binary = root / "bin/nginx" if (root / "bin/nginx").exists() else root / "usr/sbin/nginx"
    return {
        "root": root,
        "shared_root": shared_root,
        "binary": binary,
        "config": shared_root / "conf/nginx.conf",
        "pid": shared_root / "run/nginx.pid",
        "access_log": log_root / "access.log",
        "error_log": log_root / "error.log",
        "site_log_root": log_root / "sites",
        "www": Path(os.getenv("SE_WEB_ROOT", "/server-engine/www")),
    }


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
    include {paths["shared_root"] / "conf/mime.types"};
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

    client_body_temp_path {paths["root"] / "data/client_temp"};
    proxy_temp_path {paths["root"] / "data/proxy_temp"};
    fastcgi_temp_path {paths["root"] / "data/fastcgi_temp"};
    uwsgi_temp_path {paths["root"] / "data/uwsgi_temp"};
    scgi_temp_path {paths["root"] / "data/scgi_temp"};

    gzip on;
    gzip_min_length 1k;
    gzip_comp_level 4;
    gzip_vary on;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript application/xml image/svg+xml;

    server_tokens off;
    access_log {paths["access_log"]};
    include {paths["shared_root"] / "conf/sites/*.conf"};
}}
'''


def ensure_nginx_layout(paths: dict[str, Path] | None = None) -> dict[str, Path]:
    paths = paths or nginx_paths()
    for key in ("config", "pid", "access_log", "error_log", "site_log_root", "www"):
        paths[key].parent.mkdir(parents=True, exist_ok=True)
    paths["www"].mkdir(parents=True, exist_ok=True)
    for directory in (
        paths["root"] / "data/client_temp",
        paths["root"] / "data/proxy_temp",
        paths["root"] / "data/fastcgi_temp",
        paths["root"] / "data/uwsgi_temp",
        paths["root"] / "data/scgi_temp",
        paths["shared_root"] / "run",
        paths["shared_root"] / "logs",
        paths["site_log_root"],
    ):
        directory.mkdir(parents=True, exist_ok=True)
    if not paths["config"].exists():
        legacy_config = paths["root"] / "conf/nginx.conf"
        if legacy_config.exists() and legacy_config != paths["config"]:
            migrated = legacy_config.read_text(errors="replace")
            migrated = migrated.replace(str(paths["root"] / "conf"), str(paths["shared_root"] / "conf"))
            migrated = migrated.replace(str(paths["root"] / "logs"), str(paths["shared_root"] / "logs"))
            migrated = migrated.replace(str(paths["root"] / "run"), str(paths["shared_root"] / "run"))
            paths["config"].write_text(migrated)
        else:
            paths["config"].write_text(nginx_default_configuration(paths))
    (paths["shared_root"] / "conf/sites").mkdir(parents=True, exist_ok=True)
    # Site files are included by the main config and can therefore make
    # `nginx -t` fail even after the global access/error log directives were
    # migrated. Rewrite only the paths generated by Server Engine; never
    # replace arbitrary operator-authored log paths.
    site_config_dir = paths["shared_root"] / "conf/sites"
    legacy_site_log_roots = {
        str(paths["shared_root"] / "logs/sites"),
        str(paths["root"] / "logs/sites"),
    }
    for site_config in site_config_dir.glob("*.conf"):
        try:
            content = site_config.read_text(errors="replace")
        except OSError:
            continue
        migrated = content
        for legacy_root in legacy_site_log_roots:
            migrated = migrated.replace(legacy_root, str(paths["site_log_root"]))
        if migrated != content:
            site_config.write_text(migrated)
    mime_types = paths["shared_root"] / "conf/mime.types"
    if not mime_types.exists():
        mime_types.write_text('''types {\n    text/html html htm;\n    text/css css;\n    application/javascript js;\n    application/json json;\n    image/png png;\n    image/jpeg jpg jpeg;\n    image/svg+xml svg;\n    image/x-icon ico;\n    font/woff woff;\n    font/woff2 woff2;\n}\n''')
    if paths["config"].exists():
        config = paths["config"].read_text().replace(str(paths["root"] / "etc/nginx/mime.types"), str(mime_types))
        # Normalize configurations generated by older releases.  The service
        # root remains the home for binaries/configuration, while all runtime
        # logs belong to the shared Server Engine log tree.
        config = config.replace(str(paths["shared_root"] / "logs/access.log"), str(paths["access_log"]))
        config = config.replace(str(paths["shared_root"] / "logs/error.log"), str(paths["error_log"]))
        config = config.replace(str(paths["shared_root"] / "logs/sites"), str(paths["site_log_root"]))
        # Older modal saves incorrectly inserted `listen` into the global
        # nginx.conf. It is valid only inside a server block, so remove those
        # legacy top-level lines; website configs now own the HTTP port.
        config = re.sub(r"(?m)^listen\s+[^;\s]+\s*;?\s*\n?", "", config)
        shield_attached = any(
            (candidate / ".serverengine-application-shield-attached").exists()
            for candidate in (paths["shared_root"], paths["root"])
        )
        # During an attach transaction the managed include is written before
        # the attached marker. Preserve the module load in that window, or
        # nginx will parse `modsecurity on;` without the module and report
        # "unknown directive \"modsecurity\"". Detach removes this managed
        # include before validation, so stale module loads are still cleaned
        # up when Shield is actually detached.
        shield_include_active = bool(re.search(
            r"(?mi)^\s*include\s+[^;]*modsecurity\.conf\s*;.*server-engine-application-shield",
            config,
        ))
        shield_attached = shield_attached or shield_include_active
        # A failed connector install can leave a managed include and a
        # load_module line behind. Never let a missing, version-incompatible
        # module prevent the whole Nginx service from starting.
        missing_shield_module = False
        for module_match in re.finditer(
            r"(?mi)^\s*load_module\s+([^;]*modsecurity[^;]*)\s*;",
            config,
        ):
            module_path = module_match.group(1).strip().strip('"')
            if not Path(module_path).expanduser().exists():
                missing_shield_module = True
                break
        if missing_shield_module:
            config = re.sub(
                r"(?mi)^\s*include\s+[^;]*modsecurity\.conf\s*;[^\n]*\n?",
                "",
                config,
            )
            shield_attached = False
        if not shield_attached:
            # A connector is compiled against one exact Nginx ABI. Never let
            # a stale module from a previous version prevent the selected
            # runtime from starting when Shield is not attached.
            config = re.sub(r"(?mi)^\s*load_module\s+[^;]*modsecurity[^;]*;\s*\n?", "", config)
        try:
            pwd.getpwnam("serverengine")
            user_line = "user serverengine;\n"
        except KeyError:
            user_line = ""
        config = config.replace("user serverengine;\n", user_line)
        temp_directives = {
            "client_body_temp_path": paths["root"] / "data/client_temp",
            "proxy_temp_path": paths["root"] / "data/proxy_temp",
            "fastcgi_temp_path": paths["root"] / "data/fastcgi_temp",
            "uwsgi_temp_path": paths["root"] / "data/uwsgi_temp",
            "scgi_temp_path": paths["root"] / "data/scgi_temp",
        }
        missing_temp_directives = [
            f"    {directive} {path};"
            for directive, path in temp_directives.items()
            if not re.search(rf"(?m)^\s*{re.escape(directive)}\s+", config)
        ]
        if missing_temp_directives and re.search(r"(?m)^\s*http\s*\{", config):
            config = re.sub(r"(?m)^(\s*http\s*\{)", r"\1\n" + "\n".join(missing_temp_directives), config, count=1)
        if not re.search(r"(?m)^\s*(?!#)error_log\s+", config):
            config = f"error_log {paths['error_log']} warn;\n" + config
        if not re.search(r"(?m)^\s*(?!#)pid\s+", config):
            config = f"pid {paths['pid']};\n" + config
        if not re.search(r"(?m)^\s*(?!#)access_log\s+", config) and re.search(r"(?m)^\s*http\s*\{", config):
            config = re.sub(
                r"(?m)^(\s*http\s*\{)",
                r"\1\n    access_log " + str(paths["access_log"]) + ";",
                config,
                count=1,
            )
        legacy_signature = f"worker_processes auto;\nerror_log {paths['error_log']} warn;\npid {paths['pid']};\n\nevents {{ worker_connections 4096; }}"
        if legacy_signature in config and "gzip on;" not in config and "client_max_body_size" not in config:
            config = nginx_default_configuration(paths)
        paths["config"].write_text(config)
    try:
        owner = pwd.getpwnam("serverengine")
        for directory in (
            paths["root"] / "data",
            paths["shared_root"] / "run",
            paths["shared_root"] / "logs",
            paths["site_log_root"],
            paths["shared_root"] / "conf/sites",
            paths["www"],
        ):
            for current, directories, files in os.walk(directory):
                for name in (current, *directories, *files):
                    try:
                        os.chown(Path(current) / name if name != current else Path(current), owner.pw_uid, owner.pw_gid)
                    except OSError:
                        pass
    except KeyError:
        pass
    return paths
