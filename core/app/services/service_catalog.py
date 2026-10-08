import json
import gzip
import os
import platform
import re
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

from app.models.service import ServiceDefinition, ServiceVersion


def v(version: str, channel: str):
    return ServiceVersion(version=version, channel=channel)


_PYTHON_ASSETS: dict[str, str] = {}
_PYTHON_SOURCES: dict[str, str] = {}
_PHP_SOURCES: dict[str, str] = {}
_REDIS_SOURCES: dict[str, str] = {}
_POSTGRES_SOURCES: dict[str, str] = {}
_MYSQL_RELEASES: dict[str, str] = {}
_POWERDNS_RELEASES: list[str] = []
_POWERDNS_SOURCES: dict[str, str] = {}
_SQLSERVER_RELEASES: list[str] = []
_APT_RELEASES: dict[str, list[str]] = {}
_APT_VERSION_REFRESHED_AT: dict[str, float] = {}
_SELECTED_PREBUILT_PACKAGES: dict[str, str] = {}
_VERSION_METHODS: dict[str, str] = {}
_PREBUILT_PACKAGES = {
    "mysql": "mysql-server",
    "redis": "redis-server",
    "postgresql": "postgresql",
    "mariadb": "mariadb-server",
    "nginx": "nginx",
    "apache": "apache2",
    "caddy": "caddy",
    "haproxy": "haproxy",
    "memcached": "memcached",
    "valkey": "valkey-server",
    "vsftpd": "vsftpd",
    "certbot": "certbot",
    "rabbitmq": "rabbitmq-server",
    "fail2ban": "fail2ban",
    "modsecurity": "libmodsecurity3",
    "git": "git",
    "imagemagick": "imagemagick",
    "ffmpeg": "ffmpeg",
    "ruby": "ruby",
    "powerdns": "pdns-server",
    "bind9": "bind9",
    "unbound": "unbound",
    "clamav": "clamav",
    "auditd": "auditd",
    "logrotate": "logrotate",
    "postfix": "postfix",
    "dovecot": "dovecot-imapd",
    "supervisor": "supervisor",
    "lynis": "lynis",
    "rspamd": "rspamd",
}
_PREBUILT_PACKAGE_CHOICES = {
    "modsecurity": [
        "libmodsecurity3",
        "libapache2-mod-security2",
        "libnginx-mod-http-modsecurity",
    ],
}
_CADDY_SOURCES: dict[str, str] = {}
_MARIADB_SOURCES: dict[str, str] = {}
_MARIADB_PREBUILTS: list[str] = []
_HAPROXY_SOURCES: dict[str, str] = {}
_MEMCACHED_SOURCES: dict[str, str] = {}
_VALKEY_SOURCES: dict[str, str] = {}
_VSFTPD_SOURCES: dict[str, str] = {}
_CERTBOT_SOURCES: dict[str, str] = {}
_RABBITMQ_SOURCES: dict[str, str] = {}
_GIT_SOURCES: dict[str, str] = {}
_IMAGEMAGICK_SOURCES: dict[str, str] = {}
_RUBY_SOURCES: dict[str, str] = {}
_FFMPEG_SOURCES: dict[str, str] = {}
_OPENLITESPEED_SOURCES: dict[str, str] = {}
_OPENLITESPEED_PREBUILTS: dict[str, str] = {}
_NGINX_SOURCES: dict[str, str] = {}
_APACHE_SOURCES: dict[str, str] = {}
_STALWART_SOURCES: dict[str, str] = {}
_STALWART_PREBUILTS: dict[str, str] = {}
_MONGODB_SOURCES: dict[str, str] = {}
_MONGODB_PREBUILTS: dict[str, str] = {}
_OPENSEARCH_SOURCES: dict[str, str] = {}
_WPCLI_SOURCES: dict[str, str] = {}
_POSTFIX_SOURCES: dict[str, str] = {}
_DOVECOT_SOURCES: dict[str, str] = {}
_RSPAMD_SOURCES: dict[str, str] = {}
_OPENSSL_SOURCES: dict[str, str] = {}
_BIND9_SOURCES: dict[str, str] = {}
_UNBOUND_SOURCES: dict[str, str] = {}
_CLAMAV_SOURCES: dict[str, str] = {}
_SUPERVISOR_SOURCES: dict[str, str] = {}
_LYNIS_SOURCES: dict[str, str] = {}
_VERSION_REFRESHED_AT: dict[str, float] = {}


def _refresh_python_versions(definition: ServiceDefinition):
    """Fetch portable CPython builds instead of the host's one apt package."""
    architecture = {"x86_64": "x86_64", "amd64": "x86_64", "aarch64": "aarch64", "arm64": "aarch64"}.get(platform.machine().lower())
    if not architecture:
        return None
    # Use GitHub's rendered asset page instead of its API. The API is rate
    # limited on public servers, while this page exposes the same official
    # release assets without requiring a token.
    latest_request = urllib.request.Request(
        "https://github.com/astral-sh/python-build-standalone/releases/latest",
        headers={"User-Agent": "Server-Engine-Control-Panel"},
    )
    with urllib.request.urlopen(latest_request, timeout=12) as response:
        expanded_url = response.geturl().replace("/releases/tag/", "/releases/expanded_assets/")
    assets_request = urllib.request.Request(expanded_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(assets_request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    found: dict[str, str] = {}
    pattern = re.compile(r"^cpython-(\d+\.\d+\.\d+)\+.*-" + re.escape(architecture) + r"-unknown-linux-gnu-install_only\.tar\.gz$")
    for href in re.findall(r'href="(/[^" ]+/releases/download/[^" ]+\.tar\.gz)"', html):
        name = href.rsplit("/", 1)[-1]
        match = pattern.match(name)
        if not match or any(token in name for token in ("debug", "freethreaded", "pgo")):
            continue
        version = match.group(1)
        found.setdefault(version, "https://github.com" + href)
    if not found:
        return None
    _PYTHON_ASSETS.clear()
    _PYTHON_ASSETS.update(found)
    ordered = sorted(found, key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    latest_minor = ordered[0].rsplit(".", 1)[0]
    versions = [v(item, "stable" if item.rsplit(".", 1)[0] == latest_minor else "security") for item in ordered[:30]]
    definition.versions = versions
    return len(versions)


def python_asset_for(version: str) -> str | None:
    return _PYTHON_ASSETS.get(version)


def _refresh_python_source_versions(definition: ServiceDefinition):
    """Fetch one official CPython source archive for each supported minor line."""
    cached_at = _VERSION_REFRESHED_AT.get("python-source", 0)
    if _PYTHON_SOURCES and cached_at and time.monotonic() - cached_at < 300:
        return len(_PYTHON_SOURCES)
    request = urllib.request.Request(
        "https://www.python.org/ftp/python/",
        headers={"User-Agent": "Server-Engine-Control-Panel"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    releases = sorted(
        set(re.findall(r'href="(3\.\d+\.\d+)/"', html)),
        key=lambda item: tuple(int(part) for part in item.split(".")),
        reverse=True,
    )
    selected = []
    seen_minor = set()
    for release in releases:
        minor = ".".join(release.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(release)
        if len(selected) == 20:
            break
    if not selected:
        return None
    _PYTHON_SOURCES.clear()
    _PYTHON_SOURCES.update({
        release: f"https://www.python.org/ftp/python/{release}/Python-{release}.tgz"
        for release in selected
    })
    _VERSION_REFRESHED_AT["python-source"] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [
        v(release, "stable" if release.rsplit(".", 1)[0] == latest_minor else "security")
        for release in selected
    ]
    return len(selected)


def python_source_for(version: str) -> str | None:
    return _PYTHON_SOURCES.get(version)


def _refresh_openssl_source_versions(definition: ServiceDefinition):
    """Fetch legacy OpenSSL source archives from the official archive."""
    cached_at = _VERSION_REFRESHED_AT.get("openssl-source", 0)
    if _OPENSSL_SOURCES and cached_at and time.monotonic() - cached_at < 300:
        definition.versions = [v(version, "legacy") for version in sorted(_OPENSSL_SOURCES, reverse=True)]
        return len(_OPENSSL_SOURCES)
    found: dict[str, str] = {}
    for branch in ("1.1.1", "1.0.2"):
        try:
            request = urllib.request.Request(
                f"https://www.openssl.org/source/old/{branch}/",
                headers={"User-Agent": "Server-Engine-Control-Panel"},
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                html = response.read().decode("utf-8", "replace")
            for filename in re.findall(r'href=["\'](openssl-(1\.(?:1\.1|0\.2)[a-z]\d*)\.tar\.gz)["\']', html, re.I):
                version = filename.removeprefix("openssl-").removesuffix(".tar.gz")
                found[version] = f"https://www.openssl.org/source/old/{branch}/{filename}"
        except Exception:
            continue
    if not found:
        found = {
            "1.1.1w": "https://www.openssl.org/source/old/1.1.1/openssl-1.1.1w.tar.gz",
            "1.0.2u": "https://www.openssl.org/source/old/1.0.2/openssl-1.0.2u.tar.gz",
        }
    _OPENSSL_SOURCES.clear()
    _OPENSSL_SOURCES.update(found)
    _VERSION_REFRESHED_AT["openssl-source"] = time.monotonic()
    definition.versions = [v(version, "legacy") for version in sorted(found, reverse=True)]
    return len(found)


def openssl_source_for(version: str) -> str | None:
    return _OPENSSL_SOURCES.get(version)


def _refresh_php_versions(definition: ServiceDefinition):
    """Fetch versioned PHP-FPM package lines for the current Debian family."""
    cached_at = _VERSION_REFRESHED_AT.get("php", 0)
    if definition.versions and cached_at and time.monotonic() - cached_at < 300:
        return len(definition.versions)
    release = {}
    try:
        for line in Path("/etc/os-release").read_text(errors="replace").splitlines():
            key, _, value = line.partition("=")
            release[key] = value.strip().strip('"')
    except OSError:
        release = {}
    codename = release.get("VERSION_CODENAME")
    architecture = {"x86_64": "amd64", "aarch64": "arm64", "arm64": "arm64", "armv7l": "armhf"}.get(platform.machine().lower())
    if not codename or not architecture:
        found = set()
    else:
        index_url = f"https://packages.sury.org/php/dists/{codename}/main/binary-{architecture}/Packages.gz"
        request = urllib.request.Request(index_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                content = gzip.decompress(response.read()).decode("utf-8", "replace")
            found = {}
            for paragraph in content.split("\n\n"):
                package = re.search(r"^Package:\s+php(\d+\.\d+)-fpm$", paragraph, re.MULTILINE)
                release_version = re.search(r"^Version:\s+([^\s]+)", paragraph, re.MULTILINE)
                if not package or not release_version:
                    continue
                match = re.match(r"(?:\d+:)?(\d+\.\d+\.\d+)", release_version.group(1))
                if match:
                    minor = package.group(1)
                    candidate = match.group(1)
                    if minor not in found or tuple(map(int, candidate.split("."))) > tuple(map(int, found[minor].split("."))):
                        found[minor] = candidate
        except Exception:
            found = {}
    if not found:
        apt_cache = shutil.which("apt-cache")
        if apt_cache:
            def native_packages():
                result = subprocess.run(
                    [apt_cache, "pkgnames", "php"],
                    capture_output=True,
                    text=True,
                    check=False,
                    timeout=8,
                )
                return re.findall(r"^php(\d+\.\d+)-fpm$", result.stdout, re.MULTILINE)

            found = native_packages()
            if not found and os.geteuid() == 0:
                apt = shutil.which("apt-get")
                if apt:
                    subprocess.run([apt, "update"], capture_output=True, text=True, check=False, timeout=90)
                    found = native_packages()
            exact = {}
            for minor in found:
                versions = subprocess.run(
                    [apt_cache, "madison", f"php{minor}-fpm"],
                    capture_output=True,
                    text=True,
                    check=False,
                    timeout=8,
                ).stdout.splitlines()
                for line in versions:
                    parts = [part.strip() for part in line.split("|")]
                    if len(parts) < 2:
                        continue
                    match = re.match(r"(?:\d+:)?(\d+\.\d+\.\d+)", parts[1])
                    if match:
                        candidate = match.group(1)
                        if minor not in exact or tuple(map(int, candidate.split("."))) > tuple(map(int, exact[minor].split("."))):
                            exact[minor] = candidate
            found = exact
            if not found:
                native = subprocess.run([apt_cache, "policy", "php-fpm"], capture_output=True, text=True, check=False, timeout=8)
                version = re.search(r"^\s*Candidate:\s+((?:\d+:)?\d+\.\d+\.\d+)", native.stdout, re.MULTILINE)
                if version:
                    normalized = version.group(1).split(":", 1)[-1]
                    found[normalized.rsplit(".", 1)[0]] = normalized
    if not found:
        return None
    ordered = sorted(found.values(), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    definition.versions = [v(item, "stable" if index == 0 else "security") for index, item in enumerate(ordered)]
    _VERSION_REFRESHED_AT["php"] = time.monotonic()
    return len(definition.versions)


def _refresh_node_versions(definition: ServiceDefinition):
    """Fetch one current binary release for every supported Node major line."""
    cached_at = _VERSION_REFRESHED_AT.get("nodejs", 0)
    if definition.versions and cached_at and time.monotonic() - cached_at < 300:
        return len(definition.versions)
    request = urllib.request.Request("https://nodejs.org/dist/index.json", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        releases = json.loads(response.read().decode("utf-8", "replace"))
    selected = []
    seen_major = set()
    for release in releases:
        match = re.match(r"^v(\d+)\.", release.get("version", ""))
        if not match or match.group(1) in seen_major:
            continue
        seen_major.add(match.group(1))
        selected.append(v(match.group(1), "lts" if release.get("lts") else "mainline"))
        if len(selected) >= 30:
            break
    if not selected:
        return None
    definition.versions = selected
    _VERSION_REFRESHED_AT["nodejs"] = time.monotonic()
    return len(selected)


def _refresh_php_source_versions(definition: ServiceDefinition):
    """Fetch the newest stable source release for each PHP minor line."""
    cached_at = _VERSION_REFRESHED_AT.get("php-source", 0)
    if _PHP_SOURCES and cached_at and time.monotonic() - cached_at < 300:
        definition.versions = [v(version, "stable") for version in _PHP_SOURCES]
        return len(definition.versions)
    tags = []
    try:
        official_request = urllib.request.Request(
            "https://www.php.net/releases/index.php",
            headers={"User-Agent": "Server-Engine-Control-Panel"},
        )
        with urllib.request.urlopen(official_request, timeout=20) as response:
            html = response.read().decode("utf-8", "replace")
        tags = [{"name": f"php-{version}"} for version in re.findall(r"php-([0-9]+\.[0-9]+\.[0-9]+)\.tar\.gz", html)]
    except Exception:
        tags = []
    if not tags:
        try:
            for page in range(1, 9):
                request = urllib.request.Request(
                    f"https://api.github.com/repos/php/php-src/tags?per_page=100&page={page}",
                    headers={"Accept": "application/vnd.github+json", "User-Agent": "Server-Engine-Control-Panel"},
                )
                with urllib.request.urlopen(request, timeout=20) as response:
                    page_tags = json.loads(response.read().decode("utf-8", "replace"))
                if not page_tags:
                    break
                tags.extend(page_tags)
        except Exception:
            tags = []
    if not tags:
        manifest_request = urllib.request.Request(
            "https://www.php.net/releases/index.php?json=1",
            headers={"Accept": "application/json", "User-Agent": "Server-Engine-Control-Panel"},
        )
        try:
            with urllib.request.urlopen(manifest_request, timeout=20) as response:
                manifest = json.loads(response.read().decode("utf-8", "replace"))
            tags = [
                {"name": f"php-{release.get('version')}"}
                for release in manifest.values()
                if isinstance(release, dict) and re.fullmatch(r"\d+\.\d+\.\d+", str(release.get("version", "")))
            ]
        except Exception:
            tags = []
    selected = {}
    for tag in tags:
        tag_name = str(tag.get("name", "")) if isinstance(tag, dict) else ""
        match = re.fullmatch(r"php-(\d+\.\d+\.\d+)", tag_name)
        if not match:
            continue
        version = match.group(1)
        minor = ".".join(version.split(".")[:2])
        if minor not in selected or tuple(int(part) for part in version.split(".")) > tuple(int(part) for part in selected[minor].split(".")):
            selected[minor] = version
    versions = sorted(selected.values(), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    if not versions:
        return None
    # The PHP release page can expose a release before its source archive is
    # published. Do not show a release that the installer cannot actually
    # download. Keep this probe on the same authoritative provider used by
    # php_source_for(); probing another project's tags here would make
    # unrelated versions appear in the PHP selector.
    downloadable = []
    for version in versions:
        source_url = f"https://www.php.net/distributions/php-{version}.tar.gz"
        try:
            # Use a ranged GET instead of HEAD so the provider must return a
            # real archive response before the version is shown.
            probe = urllib.request.Request(
                source_url,
                headers={"Range": "bytes=0-0", "User-Agent": "Server-Engine-Control-Panel"},
            )
            with urllib.request.urlopen(probe, timeout=5) as response:
                response.read(1)
                downloadable.append(version)
        except Exception:
            continue
    versions = downloadable
    if not versions:
        return None
    _PHP_SOURCES.clear()
    _PHP_SOURCES.update({version: f"https://www.php.net/distributions/php-{version}.tar.gz" for version in versions})
    _VERSION_REFRESHED_AT["php-source"] = time.monotonic()
    definition.versions = [
        v(
            version,
            "stable" if index == 0 else "security" if version.startswith(("8.1.", "8.0.", "7.")) else "legacy",
        )
        for index, version in enumerate(versions)
    ]
    return len(versions)


def php_source_for(version: str) -> str | None:
    return _PHP_SOURCES.get(version)


def _refresh_composer_versions(definition: ServiceDefinition):
    """Fetch one stable Composer release for each current minor line."""
    cached_at = _VERSION_REFRESHED_AT.get("composer", 0)
    if definition.versions and cached_at and time.monotonic() - cached_at < 300:
        return len(definition.versions)

    releases = []
    official_request = urllib.request.Request(
        "https://getcomposer.org/versions",
        headers={"Accept": "application/json", "User-Agent": "Server-Engine-Control-Panel"},
    )
    try:
        with urllib.request.urlopen(official_request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8", "replace"))
        releases = payload.get("stable", []) if isinstance(payload, dict) else []
    except Exception:
        # Composer's manifest is preferred because it is the authoritative
        # download catalog. GitHub remains a compatibility fallback for older
        # Composer mirrors and restricted environments.
        releases = []

    if not releases:
        github_request = urllib.request.Request(
            "https://api.github.com/repos/composer/composer/releases?per_page=50",
            headers={"Accept": "application/vnd.github+json", "User-Agent": "Server-Engine-Control-Panel"},
        )
        with urllib.request.urlopen(github_request, timeout=20) as response:
            releases = json.loads(response.read().decode("utf-8", "replace"))

    selected = []
    seen_minor = set()
    for release in releases:
        version = str(release.get("version") or release.get("tag_name", "")).removeprefix("v")
        if not re.fullmatch(r"2\.\d+\.\d+", version):
            continue
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(v(version, "stable" if not selected else "security"))
        if len(selected) >= 12:
            break
    if not selected:
        return None
    definition.versions = selected
    _VERSION_REFRESHED_AT["composer"] = time.monotonic()
    return len(selected)


def _refresh_redis_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("redis", 0)
    if _REDIS_SOURCES and time.monotonic() - cached_at < 300:
        return len(_REDIS_SOURCES)
    request = urllib.request.Request("https://github.com/redis/redis/tags", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=15) as response:
        html = response.read().decode("utf-8", "replace")
    tags = re.findall(r"/redis/redis/releases/tag/([0-9]+\.[0-9]+\.[0-9]+)", html)
    ordered = []
    for tag in tags:
        if tag not in ordered:
            ordered.append(tag)
    # Keep the newest patch release for each minor line. This makes the list
    # useful instead of filling it with every patch release of Redis 8.
    selected = []
    seen_minor = set()
    for tag in ordered:
        minor = ".".join(tag.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(tag)
        if len(selected) == 20:
            break
    if not selected:
        return None
    _REDIS_SOURCES.clear()
    _REDIS_SOURCES.update({tag: f"https://github.com/redis/redis/archive/refs/tags/{tag}.tar.gz" for tag in selected})
    _VERSION_REFRESHED_AT["redis"] = time.monotonic()
    latest_major = selected[0].split(".", 1)[0]
    definition.versions = [v(tag, "stable" if tag.split(".", 1)[0] == latest_major else "security") for tag in selected]
    return len(selected)


def redis_source_for(version: str) -> str | None:
    return _REDIS_SOURCES.get(version)


def _refresh_postgresql_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("postgresql", 0)
    if _POSTGRES_SOURCES and time.monotonic() - cached_at < 300:
        return len(_POSTGRES_SOURCES)
    request = urllib.request.Request("https://www.postgresql.org/ftp/source/", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=15) as response:
        html = response.read().decode("utf-8", "replace")
    versions = []
    for version in re.findall(r"href=[\"'](v(\d+\.\d+(?:\.\d+)?)/)[\"']", html):
        value = version[1]
        if value not in versions:
            versions.append(value)
    if not versions:
        return None
    versions.sort(key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    selected = []
    seen_major = set()
    for item in versions:
        major = item.split(".", 1)[0]
        if major in seen_major:
            continue
        seen_major.add(major)
        selected.append(item)
        if len(selected) == 12:
            break
    _POSTGRES_SOURCES.clear()
    _POSTGRES_SOURCES.update({item: f"https://ftp.postgresql.org/pub/source/v{item}/postgresql-{item}.tar.gz" for item in selected})
    _VERSION_REFRESHED_AT["postgresql"] = time.monotonic()
    latest_major = selected[0].split(".", 1)[0]
    definition.versions = [v(item, "stable" if item.split(".", 1)[0] == latest_major else "security") for item in selected]
    return len(selected)


def postgresql_source_for(version: str) -> str | None:
    return _POSTGRES_SOURCES.get(version)


def _refresh_mysql_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("mysql", 0)
    if _MYSQL_RELEASES and time.monotonic() - cached_at < 300:
        return len(_MYSQL_RELEASES)

    # Docker Hub's official `library/mysql` repository exposes current and
    # archived Community Server tags without the anti-bot behavior of the
    # MySQL download pages. Discover every page instead of maintaining a
    # fixed list of release lines.
    releases = []
    next_url = "https://registry.hub.docker.com/v2/repositories/library/mysql/tags?page_size=100"
    for _ in range(10):
        request = urllib.request.Request(next_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8", "replace"))
        releases.extend(
            tag["name"]
            for tag in payload.get("results", [])
            if re.fullmatch(r"\d+\.\d+\.\d+", tag.get("name", ""))
        )
        next_url = payload.get("next")
        if not next_url:
            break

    selected = []
    seen_minor = set()
    for release in sorted(set(releases), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True):
        minor = ".".join(release.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(release)
        if len(selected) == 20:
            break
    releases = selected

    if not releases:
        return None
    _MYSQL_RELEASES.clear()
    _MYSQL_RELEASES.update({release: release for release in releases})
    _VERSION_REFRESHED_AT["mysql"] = time.monotonic()
    latest_major = releases[0].split(".", 1)[0]
    definition.versions = [
        v(version, "lts" if version.startswith(("8.4.", "9.7.")) else "security" if version.startswith("5.7.") else "stable")
        for version in releases
    ]
    return len(releases)


def mysql_release_for(version: str) -> str | None:
    return _MYSQL_RELEASES.get(version, version if version.count(".") == 2 else None)


def _refresh_powerdns_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("powerdns", 0)
    if _POWERDNS_SOURCES and time.monotonic() - cached_at < 300:
        return len(_POWERDNS_SOURCES)
    request = urllib.request.Request("https://downloads.powerdns.com/releases/", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    candidates = sorted(set(re.findall(r"pdns-(\d+\.\d+\.\d+)\.tar\.bz2", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    selected = []
    seen_minor = set()
    for item in candidates:
        minor = ".".join(item.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(item)
        if len(selected) == 12:
            break
    if not selected:
        return None
    _POWERDNS_SOURCES.clear()
    _POWERDNS_SOURCES.update({item: f"https://downloads.powerdns.com/releases/pdns-{item}.tar.bz2" for item in selected})
    _VERSION_REFRESHED_AT["powerdns"] = time.monotonic()
    definition.versions = [v(item, "stable" if index == 0 else "security") for index, item in enumerate(selected)]
    return len(selected)


def powerdns_source_for(version: str) -> str | None:
    return _POWERDNS_SOURCES.get(version)


def prebuilt_package_for(service_id: str) -> str | None:
    return _SELECTED_PREBUILT_PACKAGES.get(service_id) or _PREBUILT_PACKAGES.get(service_id)


def _refresh_sqlserver_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("sqlserver", 0)
    if _SQLSERVER_RELEASES and time.monotonic() - cached_at < 300:
        return len(_SQLSERVER_RELEASES)
    request = urllib.request.Request(
        "https://mcr.microsoft.com/v2/mssql/server/tags/list",
        headers={"User-Agent": "Server-Engine-Control-Panel"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        tags = json.loads(response.read().decode("utf-8", "replace")).get("tags", [])
    latest_by_year = {}
    for tag in tags:
        match = re.match(r"^(20\d{2})(?:-latest|-CU(\d+)(?:-GDR\d*)?)?$", tag)
        if not match:
            continue
        year, cu = match.groups()
        rank = (1 if tag == f"{year}-latest" else 0, int(cu or 0))
        if year not in latest_by_year or rank > latest_by_year[year][0]:
            latest_by_year[year] = (rank, tag)
    selected = [item[1] for item in sorted(latest_by_year.values(), key=lambda item: item[1], reverse=True)]
    if not selected:
        return None
    _SQLSERVER_RELEASES.clear()
    _SQLSERVER_RELEASES.extend(selected)
    _VERSION_REFRESHED_AT["sqlserver"] = time.monotonic()
    definition.versions = [v(item, "stable" if index == 0 else "security") for index, item in enumerate(selected)]
    return len(selected)


def _refresh_apt_versions(definition: ServiceDefinition, package: str):
    cached_at = _APT_VERSION_REFRESHED_AT.get(package, 0)
    if package in _APT_RELEASES and time.monotonic() - cached_at < 300:
        definition.versions = [v(item, "stable" if index == 0 else "security") for index, item in enumerate(_APT_RELEASES[package])]
        return len(_APT_RELEASES[package])
    apt_cache = shutil.which("apt-cache")
    if not apt_cache:
        return None
    result = subprocess.run([apt_cache, "madison", package], capture_output=True, text=True, check=False, timeout=8)
    candidates = []
    for line in result.stdout.splitlines():
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 2 or not parts[1]:
            continue
        full_version = parts[1]
        normalized = full_version.split(":", 1)[-1]
        if normalized not in candidates:
            candidates.append(normalized)
    candidates.sort(key=lambda item: tuple(int(part) for part in re.findall(r"\d+", item)), reverse=True)
    selected = []
    seen_minor = set()
    for item in candidates:
        match = re.match(r"(\d+\.\d+)", item)
        if not match or match.group(1) in seen_minor:
            continue
        seen_minor.add(match.group(1))
        selected.append(item)
        if len(selected) == 12:
            break
    if not selected:
        return None
    _APT_RELEASES[package] = selected
    _APT_VERSION_REFRESHED_AT[package] = time.monotonic()
    definition.versions = [v(item, "stable" if index == 0 else "security") for index, item in enumerate(selected)]
    return len(selected)


def _refresh_caddy_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("caddy", 0)
    if _CADDY_SOURCES and time.monotonic() - cached_at < 300:
        return len(_CADDY_SOURCES)
    request = urllib.request.Request("https://github.com/caddyserver/caddy/releases", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(
        {item for item in re.findall(r"\bv(\d+\.\d+\.\d+)\b", html) if item.startswith("2.")},
        key=lambda item: tuple(int(part) for part in item.split(".")),
        reverse=True,
    )
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    if not selected:
        return None
    _CADDY_SOURCES.clear()
    _CADDY_SOURCES.update({version: f"https://github.com/caddyserver/caddy/archive/refs/tags/v{version}.tar.gz" for version in selected})
    _VERSION_REFRESHED_AT["caddy"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(selected)]
    return len(selected)


def caddy_source_for(version: str) -> str | None:
    return _CADDY_SOURCES.get(version)


def _refresh_mariadb_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("mariadb", 0)
    if _MARIADB_SOURCES and time.monotonic() - cached_at < 300:
        return len(_MARIADB_SOURCES)
    request = urllib.request.Request("https://downloads.mariadb.org/rest-api/mariadb/", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8", "replace"))
    releases = []
    for major in payload.get("major_releases", []):
        if str(major.get("release_status", "")).lower() == "preview":
            continue
        major_id = major.get("release_id")
        if not major_id:
            continue
        detail_request = urllib.request.Request(f"https://downloads.mariadb.org/rest-api/mariadb/{major_id}/", headers={"User-Agent": "Server-Engine-Control-Panel"})
        with urllib.request.urlopen(detail_request, timeout=20) as response:
            detail = json.loads(response.read().decode("utf-8", "replace"))
        release_data = detail.get("release_data", detail.get("releases", {}))
        for version, data in release_data.items():
            source_file = next((item for item in data.get("files", []) if item.get("os") == "Source" and item.get("file_name", "").endswith(".tar.gz")), None)
            if source_file:
                releases.append((version, f"https://downloads.mariadb.org/rest-api/mariadb/{version}/{source_file['file_name']}"))
    releases.sort(key=lambda item: tuple(int(part) for part in re.findall(r"\d+", item[0])), reverse=True)
    selected = []
    seen_minor = set()
    for version, source in releases:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append((version, source))
        if len(selected) == 12:
            break
    if not selected:
        return None
    _MARIADB_SOURCES.clear()
    _MARIADB_SOURCES.update(dict(selected))
    _VERSION_REFRESHED_AT["mariadb"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, (version, _) in enumerate(selected)]
    return len(selected)


def mariadb_source_for(version: str) -> str | None:
    return _MARIADB_SOURCES.get(version)


def _refresh_mariadb_prebuilt_versions(definition: ServiceDefinition):
    """Discover exact MariaDB packages from MariaDB's repository for this host."""
    cached_at = _VERSION_REFRESHED_AT.get("mariadb-prebuilt", 0)
    if _MARIADB_PREBUILTS and time.monotonic() - cached_at < 300:
        definition.versions = [
            v(version, "stable" if index == 0 else "security")
            for index, version in enumerate(_MARIADB_PREBUILTS)
        ]
        return len(_MARIADB_PREBUILTS)
    os_release = {}
    try:
        for line in Path("/etc/os-release").read_text(errors="replace").splitlines():
            key, _, value = line.partition("=")
            os_release[key] = value.strip().strip('"')
    except OSError:
        return 0
    distro = "ubuntu" if os_release.get("ID") in {"ubuntu", "linuxmint"} else "debian" if os_release.get("ID") == "debian" else None
    codename = os_release.get("VERSION_CODENAME")
    architecture = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine().lower())
    if not distro or not codename or not architecture:
        return 0
    request = urllib.request.Request(
        "https://downloads.mariadb.org/rest-api/mariadb/",
        headers={"User-Agent": "Server-Engine-Control-Panel"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8", "replace"))
    release_lines = [
        str(item.get("release_id"))
        for item in payload.get("major_releases", [])
        if item.get("release_id")
        and str(item.get("release_status", "")).lower() not in {"preview", "rc", "alpha", "beta"}
    ]
    found = {}
    for release in release_lines:
        packages_url = (
            f"https://mirror.mariadb.org/repo/{release}/{distro}/dists/"
            f"{codename}/main/binary-{architecture}/Packages.gz"
        )
        try:
            package_request = urllib.request.Request(
                packages_url,
                headers={"User-Agent": "Server-Engine-Control-Panel"},
            )
            with urllib.request.urlopen(package_request, timeout=12) as response:
                package_data = gzip.decompress(response.read()).decode("utf-8", "replace")
        except (urllib.error.HTTPError, urllib.error.URLError, OSError):
            continue
        package_name = None
        for line in package_data.splitlines():
            if line.startswith("Package: "):
                package_name = line[9:].strip()
            elif line.startswith("Version: ") and package_name == "mariadb-server":
                full_version = line[9:].strip()
                normalized = full_version.split(":", 1)[-1]
                upstream = re.search(r"(\d+\.\d+\.\d+)", normalized)
                if upstream:
                    version = upstream.group(1)
                    current = found.get(version.split(".", 2)[0] + "." + version.split(".", 2)[1])
                    if current is None or tuple(int(part) for part in upstream.group(1).split(".")) > tuple(int(part) for part in re.search(r"(\d+\.\d+\.\d+)", current).group(1).split(".")):
                        found[version.split(".", 2)[0] + "." + version.split(".", 2)[1]] = normalized
                package_name = None
    selected = sorted(
        found.values(),
        key=lambda item: tuple(int(part) for part in re.search(r"(\d+\.\d+\.\d+)", item).group(1).split(".")),
        reverse=True,
    )
    if not selected:
        return 0
    _MARIADB_PREBUILTS.clear()
    _MARIADB_PREBUILTS.extend(selected)
    _VERSION_REFRESHED_AT["mariadb-prebuilt"] = time.monotonic()
    definition.versions = [
        v(version, "stable" if index == 0 else "security")
        for index, version in enumerate(selected)
    ]
    return len(selected)


def _refresh_haproxy_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("haproxy", 0)
    if _HAPROXY_SOURCES and time.monotonic() - cached_at < 300:
        return len(_HAPROXY_SOURCES)
    request = urllib.request.Request("https://www.haproxy.org/download/", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    minors = sorted(set(re.findall(r'href="(\d+\.\d+)/"', html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)[:12]
    selected = {}
    for minor in minors:
        source_request = urllib.request.Request(f"https://www.haproxy.org/download/{minor}/src/", headers={"User-Agent": "Server-Engine-Control-Panel"})
        with urllib.request.urlopen(source_request, timeout=20) as response:
            source_html = response.read().decode("utf-8", "replace")
        versions = re.findall(rf"haproxy-({re.escape(minor)}\.\d+)\.tar\.gz", source_html)
        if versions:
            selected[minor] = max(versions, key=lambda item: int(item.rsplit(".", 1)[1]))
    if not selected:
        return None
    selected = dict(list(selected.items())[:12])
    _HAPROXY_SOURCES.clear()
    _HAPROXY_SOURCES.update({version: f"https://www.haproxy.org/download/{minor}/src/haproxy-{version}.tar.gz" for minor, version in selected.items()})
    _VERSION_REFRESHED_AT["haproxy"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(selected.values())]
    return len(selected)


def haproxy_source_for(version: str) -> str | None:
    return _HAPROXY_SOURCES.get(version)


def _refresh_memcached_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("memcached", 0)
    if _MEMCACHED_SOURCES and time.monotonic() - cached_at < 300:
        return len(_MEMCACHED_SOURCES)
    request = urllib.request.Request("https://www.memcached.org/downloads", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"memcached-(\d+\.\d+\.\d+)\.tar\.gz", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    if not selected:
        return None
    _MEMCACHED_SOURCES.clear()
    _MEMCACHED_SOURCES.update({version: f"https://www.memcached.org/files/memcached-{version}.tar.gz" for version in selected})
    _VERSION_REFRESHED_AT["memcached"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(selected)]
    return len(selected)


def memcached_source_for(version: str) -> str | None:
    return _MEMCACHED_SOURCES.get(version)


def _refresh_valkey_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("valkey", 0)
    if _VALKEY_SOURCES and time.monotonic() - cached_at < 300:
        return len(_VALKEY_SOURCES)
    request = urllib.request.Request("https://github.com/valkey-io/valkey/releases", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"/valkey-io/valkey/releases/tag/(\d+\.\d+\.\d+)(?:[\"/])", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    if not selected:
        return None
    _VALKEY_SOURCES.clear()
    _VALKEY_SOURCES.update({version: f"https://github.com/valkey-io/valkey/archive/refs/tags/{version}.tar.gz" for version in selected})
    _VERSION_REFRESHED_AT["valkey"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(selected)]
    return len(selected)


def valkey_source_for(version: str) -> str | None:
    return _VALKEY_SOURCES.get(version)


def _refresh_vsftpd_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("vsftpd", 0)
    if _VSFTPD_SOURCES and time.monotonic() - cached_at < 300:
        return len(_VSFTPD_SOURCES)
    request = urllib.request.Request("https://security.appspot.com/vsftpd.html", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"vsftpd-(\d+\.\d+\.\d+)", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    if not versions:
        return None
    _VSFTPD_SOURCES.clear()
    _VSFTPD_SOURCES.update({version: f"https://security.appspot.com/downloads/vsftpd-{version}.tar.gz" for version in versions})
    _VERSION_REFRESHED_AT["vsftpd"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(versions)]
    return len(versions)


def vsftpd_source_for(version: str) -> str | None:
    return _VSFTPD_SOURCES.get(version)


def _refresh_certbot_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("certbot", 0)
    if _CERTBOT_SOURCES and time.monotonic() - cached_at < 300:
        return len(_CERTBOT_SOURCES)
    request = urllib.request.Request("https://pypi.org/pypi/certbot/json", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8", "replace"))
    releases = []
    for version, files in payload.get("releases", {}).items():
        if not re.fullmatch(r"\d+\.\d+\.\d+", version):
            continue
        source = next((item["url"] for item in files if item.get("packagetype") == "sdist" and item.get("url")), None)
        if source:
            releases.append((version, source))
    releases.sort(key=lambda item: tuple(int(part) for part in item[0].split(".")), reverse=True)
    selected = []
    seen_minor = set()
    for version, source in releases:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append((version, source))
        if len(selected) == 12:
            break
    if not selected:
        return None
    _CERTBOT_SOURCES.clear()
    _CERTBOT_SOURCES.update(dict(selected))
    _VERSION_REFRESHED_AT["certbot"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, (version, _) in enumerate(selected)]
    return len(selected)


def certbot_source_for(version: str) -> str | None:
    return _CERTBOT_SOURCES.get(version)


def _refresh_rabbitmq_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("rabbitmq", 0)
    if _RABBITMQ_SOURCES and time.monotonic() - cached_at < 300:
        return len(_RABBITMQ_SOURCES)
    request = urllib.request.Request("https://github.com/rabbitmq/rabbitmq-server/releases", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"/rabbitmq/rabbitmq-server/releases/tag/v(\d+\.\d+\.\d+)(?:[\"/])", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    if not selected:
        return None
    _RABBITMQ_SOURCES.clear()
    _RABBITMQ_SOURCES.update({version: f"https://github.com/rabbitmq/rabbitmq-server/archive/refs/tags/v{version}.tar.gz" for version in selected})
    _VERSION_REFRESHED_AT["rabbitmq"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(selected)]
    return len(selected)


def rabbitmq_source_for(version: str) -> str | None:
    return _RABBITMQ_SOURCES.get(version)


def _refresh_git_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("git", 0)
    if _GIT_SOURCES and time.monotonic() - cached_at < 300:
        return len(_GIT_SOURCES)
    request = urllib.request.Request("https://github.com/git/git/tags", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"/git/git/releases/tag/v(\d+\.\d+\.\d+)(?:[\"/])", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    if not selected:
        return None
    _GIT_SOURCES.clear()
    _GIT_SOURCES.update({version: f"https://www.kernel.org/pub/software/scm/git/git/v{version.rsplit('.', 1)[0]}/git-{version}.tar.xz" for version in selected})
    _VERSION_REFRESHED_AT["git"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(selected)]
    return len(selected)


def git_source_for(version: str) -> str | None:
    return _GIT_SOURCES.get(version)


def _refresh_imagemagick_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("imagemagick", 0)
    if _IMAGEMAGICK_SOURCES and time.monotonic() - cached_at < 300:
        return len(_IMAGEMAGICK_SOURCES)
    request = urllib.request.Request("https://download.imagemagick.org/archive/releases/", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"ImageMagick-(\d+\.\d+\.\d+-\d+)\.tar\.xz", html)), key=lambda item: tuple(int(part) for part in re.split(r"[.-]", item)), reverse=True)
    selected = []
    seen_minor = set()
    for version in versions:
        parts = version.split("-")[0].split(".")
        minor = ".".join(parts[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    if not selected:
        return None
    _IMAGEMAGICK_SOURCES.clear()
    _IMAGEMAGICK_SOURCES.update({version: f"https://download.imagemagick.org/archive/releases/ImageMagick-{version}.tar.xz" for version in selected})
    _VERSION_REFRESHED_AT["imagemagick"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(selected)]
    return len(selected)


def imagemagick_source_for(version: str) -> str | None:
    return _IMAGEMAGICK_SOURCES.get(version)


def _refresh_ruby_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("ruby", 0)
    if _RUBY_SOURCES and time.monotonic() - cached_at < 300:
        return len(_RUBY_SOURCES)
    request = urllib.request.Request("https://www.ruby-lang.org/en/downloads/releases/", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"ruby-(\d+\.\d+\.\d+)\.tar\.gz", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    if not selected:
        return None
    _RUBY_SOURCES.clear()
    _RUBY_SOURCES.update({version: f"https://cache.ruby-lang.org/pub/ruby/{version.rsplit('.', 1)[0]}/ruby-{version}.tar.gz" for version in selected})
    _VERSION_REFRESHED_AT["ruby"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(selected)]
    return len(selected)


def ruby_source_for(version: str) -> str | None:
    return _RUBY_SOURCES.get(version)


def _refresh_ffmpeg_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("ffmpeg", 0)
    if _FFMPEG_SOURCES and time.monotonic() - cached_at < 300:
        return len(_FFMPEG_SOURCES)
    request = urllib.request.Request("https://ffmpeg.org/releases/", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"ffmpeg-(\d+\.\d+(?:\.\d+)?)\.tar\.xz", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    if not selected:
        return None
    _FFMPEG_SOURCES.clear()
    _FFMPEG_SOURCES.update({version: f"https://ffmpeg.org/releases/ffmpeg-{version}.tar.xz" for version in selected})
    _VERSION_REFRESHED_AT["ffmpeg"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(selected)]
    return len(selected)


def ffmpeg_source_for(version: str) -> str | None:
    return _FFMPEG_SOURCES.get(version)


def _refresh_openlitespeed_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("openlitespeed", 0)
    if _OPENLITESPEED_SOURCES and time.monotonic() - cached_at < 300:
        return len(_OPENLITESPEED_SOURCES)
    request = urllib.request.Request("https://github.com/litespeedtech/openlitespeed/releases", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"/litespeedtech/openlitespeed/releases/tag/v(\d+\.\d+\.\d+)(?:[\"/])", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    if not versions:
        return None
    selected = versions[:12]
    _OPENLITESPEED_SOURCES.clear()
    _OPENLITESPEED_SOURCES.update({version: f"https://github.com/litespeedtech/openlitespeed/archive/refs/tags/v{version}.tar.gz" for version in selected})
    _VERSION_REFRESHED_AT["openlitespeed"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(selected)]
    return len(selected)


def openlitespeed_source_for(version: str) -> str | None:
    return _OPENLITESPEED_SOURCES.get(version)


def _refresh_openlitespeed_prebuilt_versions(definition: ServiceDefinition):
    """Fetch the official OpenLiteSpeed binary archives for this architecture."""
    cached_at = _VERSION_REFRESHED_AT.get("openlitespeed-prebuilt", 0)
    if _OPENLITESPEED_PREBUILTS and time.monotonic() - cached_at < 300:
        definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(_OPENLITESPEED_PREBUILTS)]
        return len(_OPENLITESPEED_PREBUILTS)
    architecture = {"x86_64": "x86_64", "amd64": "x86_64", "aarch64": "aarch64", "arm64": "aarch64"}.get(platform.machine().lower())
    if not architecture:
        return 0
    request = urllib.request.Request("https://openlitespeed.org/downloads/", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    pattern = re.compile(r"(https?://(?:www\.)?openlitespeed\.org/packages/openlitespeed-(\d+\.\d+\.\d+)-" + re.escape(architecture) + r"-linux\.tgz)")
    found = {}
    for url, version in pattern.findall(html):
        found.setdefault(version, url)
    if not found:
        return 0
    selected = sorted(found, key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    _OPENLITESPEED_PREBUILTS.clear()
    _OPENLITESPEED_PREBUILTS.update({version: found[version] for version in selected})
    _VERSION_REFRESHED_AT["openlitespeed-prebuilt"] = time.monotonic()
    definition.versions = [v(version, "stable" if index == 0 else "security") for index, version in enumerate(selected)]
    return len(selected)


def openlitespeed_prebuilt_for(version: str) -> str | None:
    return _OPENLITESPEED_PREBUILTS.get(version)


def _refresh_nginx_versions(definition: ServiceDefinition):
    request = urllib.request.Request("https://nginx.org/en/download.html", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=15) as response:
        html = response.read().decode("utf-8", "replace")
    versions = []
    for version in re.findall(r"/download/nginx-(\d+\.\d+\.\d+)\.tar\.gz", html):
        if version not in versions:
            versions.append(version)
    if not versions:
        return None
    versions.sort(key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    selected = versions[:12]
    _NGINX_SOURCES.clear()
    _NGINX_SOURCES.update({item: f"https://nginx.org/download/nginx-{item}.tar.gz" for item in selected})
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [v(item, "stable" if item.rsplit(".", 1)[0] == latest_minor else "security") for item in selected]
    return len(selected)


def nginx_source_for(version: str) -> str | None:
    return _NGINX_SOURCES.get(version)


def _refresh_apache_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("apache", 0)
    if _APACHE_SOURCES and time.monotonic() - cached_at < 300:
        return len(_APACHE_SOURCES)
    request = urllib.request.Request("https://archive.apache.org/dist/httpd/", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = []
    for version in re.findall(r"httpd-([0-9]+\.[0-9]+\.[0-9]+)\.tar\.gz", html):
        if version not in versions:
            versions.append(version)
    if not versions:
        return None
    versions.sort(key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    _APACHE_SOURCES.clear()
    _APACHE_SOURCES.update({item: f"https://archive.apache.org/dist/httpd/httpd-{item}.tar.gz" for item in selected})
    _VERSION_REFRESHED_AT["apache"] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [
        v(item, "stable" if item.rsplit(".", 1)[0] == latest_minor else "legacy")
        for item in selected
    ]
    return len(selected)


def apache_source_for(version: str) -> str | None:
    return _APACHE_SOURCES.get(version)


def _refresh_stalwart_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("stalwart", 0)
    if _STALWART_SOURCES and time.monotonic() - cached_at < 300:
        return len(_STALWART_SOURCES)
    request = urllib.request.Request(
        "https://github.com/stalwartlabs/stalwart/tags",
        headers={"User-Agent": "Server-Engine-Control-Panel"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(
        set(re.findall(r"/stalwartlabs/stalwart/releases/tag/v(\d+\.\d+(?:\.\d+)?)", html)),
        key=lambda item: tuple(int(part) for part in item.split(".")),
        reverse=True,
    )
    if not versions:
        return None
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    _STALWART_SOURCES.clear()
    _STALWART_SOURCES.update({version: f"https://github.com/stalwartlabs/stalwart/archive/refs/tags/v{version}.tar.gz" for version in selected})
    _VERSION_REFRESHED_AT["stalwart"] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [v(version, "stable" if version.rsplit(".", 1)[0] == latest_minor else "security") for version in selected]
    return len(selected)


def stalwart_source_for(version: str) -> str | None:
    return _STALWART_SOURCES.get(version)


def _refresh_stalwart_prebuilt_versions(definition: ServiceDefinition):
    """Fetch official Stalwart binaries compatible with this CPU architecture."""
    cached_at = _VERSION_REFRESHED_AT.get("stalwart-prebuilt", 0)
    if _STALWART_PREBUILTS and time.monotonic() - cached_at < 300:
        return len(_STALWART_PREBUILTS)
    target = {
        "x86_64": "x86_64-unknown-linux-gnu",
        "amd64": "x86_64-unknown-linux-gnu",
        "aarch64": "aarch64-unknown-linux-gnu",
        "arm64": "aarch64-unknown-linux-gnu",
    }.get(platform.machine().lower())
    if not target:
        return None
    request = urllib.request.Request(
        "https://api.github.com/repos/stalwartlabs/stalwart/releases?per_page=30",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "Server-Engine-Control-Panel"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        releases = json.loads(response.read().decode("utf-8", "replace"))
    available: dict[str, str] = {}
    for release in releases:
        if release.get("draft") or release.get("prerelease"):
            continue
        tag = str(release.get("tag_name", "")).removeprefix("v")
        if not re.fullmatch(r"\d+\.\d+(?:\.\d+)?", tag):
            continue
        asset = next(
            (
                item
                for item in release.get("assets", [])
                if item.get("name") == f"stalwart-{target}.tar.gz"
            ),
            None,
        )
        if asset and asset.get("browser_download_url"):
            available[tag] = asset["browser_download_url"]
    if not available:
        return None
    selected = sorted(available, key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    _STALWART_PREBUILTS.clear()
    _STALWART_PREBUILTS.update({version: available[version] for version in selected[:12]})
    _VERSION_REFRESHED_AT["stalwart-prebuilt"] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [
        v(version, "stable" if version.rsplit(".", 1)[0] == latest_minor else "security")
        for version in selected[:12]
    ]
    return len(_STALWART_PREBUILTS)


def stalwart_prebuilt_for(version: str) -> str | None:
    return _STALWART_PREBUILTS.get(version)


def _refresh_mongodb_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("mongodb", 0)
    if _MONGODB_SOURCES and time.monotonic() - cached_at < 300:
        return len(_MONGODB_SOURCES)
    request = urllib.request.Request(
        "https://api.github.com/repos/mongodb/mongo/tags?per_page=100",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "Server-Engine-Control-Panel"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            tags = json.loads(response.read().decode("utf-8", "replace"))
        versions = sorted(
            {match.group(1) for tag in tags if isinstance(tag, dict) and (match := re.fullmatch(r"r(\d+\.\d+(?:\.\d+)?)", str(tag.get("name", ""))))},
            key=lambda item: tuple(int(part) for part in item.split(".")),
            reverse=True,
        )
    except Exception:
        # Keep a small fallback for installations where GitHub's API is
        # blocked, but only accept real release-tag links from the repository.
        request = urllib.request.Request(
            "https://github.com/mongodb/mongo/tags",
            headers={"User-Agent": "Server-Engine-Control-Panel"},
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            html = response.read().decode("utf-8", "replace")
        versions = sorted(
            set(re.findall(r"/mongodb/mongo/releases/tag/r(\d+\.\d+(?:\.\d+)?)", html)),
            key=lambda item: tuple(int(part) for part in item.split(".")),
            reverse=True,
        )
    if not versions:
        return None
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    _MONGODB_SOURCES.clear()
    _MONGODB_SOURCES.update({version: f"https://codeload.github.com/mongodb/mongo/tar.gz/refs/tags/r{version}" for version in selected})
    _VERSION_REFRESHED_AT["mongodb"] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [v(version, "stable" if version.rsplit(".", 1)[0] == latest_minor else "security") for version in selected]
    return len(selected)


def mongodb_source_for(version: str) -> str | None:
    return _MONGODB_SOURCES.get(version)


def _refresh_mongodb_prebuilt_versions(definition: ServiceDefinition):
    """Fetch MongoDB Community tarballs for this Ubuntu architecture."""
    release = {}
    try:
        for line in Path("/etc/os-release").read_text(errors="replace").splitlines():
            key, _, value = line.partition("=")
            release[key] = value.strip().strip('"')
    except OSError:
        return None
    if release.get("ID") != "ubuntu":
        return None
    ubuntu_version = re.sub(r"[^0-9]", "", release.get("VERSION_ID", ""))
    architecture = {"x86_64": "x86_64", "amd64": "x86_64", "aarch64": "aarch64", "arm64": "aarch64"}.get(platform.machine().lower())
    if not ubuntu_version or not architecture:
        return None
    request = urllib.request.Request(
        "https://www.mongodb.com/try/download/community-edition/releases/archive",
        headers={"User-Agent": "Server-Engine-Control-Panel"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    pattern = re.compile(rf"mongodb-linux-{architecture}-ubuntu{re.escape(ubuntu_version)}-(\d+\.\d+\.\d+)\.tgz")
    versions = sorted(set(pattern.findall(html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    if not versions:
        return None
    selected = []
    seen_minor = set()
    sources = {}
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        filename = f"mongodb-linux-{architecture}-ubuntu{ubuntu_version}-{version}.tgz"
        url = f"https://fastdl.mongodb.org/linux/{filename}"
        try:
            probe = urllib.request.Request(url, headers={"Range": "bytes=0-0", "User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(probe, timeout=8) as response:
                response.read(1)
        except Exception:
            continue
        seen_minor.add(minor)
        selected.append(version)
        sources[version] = url
        if len(selected) == 12:
            break
    if not selected:
        return None
    _MONGODB_PREBUILTS.clear()
    _MONGODB_PREBUILTS.update(sources)
    _VERSION_REFRESHED_AT["mongodb-prebuilt"] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [v(version, "stable" if version.rsplit(".", 1)[0] == latest_minor else "security") for version in selected]
    return len(selected)


def mongodb_prebuilt_for(version: str) -> str | None:
    return _MONGODB_PREBUILTS.get(version)


def _refresh_github_source_versions(definition: ServiceDefinition, service_id: str, repository: str, tag_prefix: str, archive_prefix: str):
    sources = {
        "opensearch": _OPENSEARCH_SOURCES,
        "wp-cli": _WPCLI_SOURCES,
        "dovecot": _DOVECOT_SOURCES,
        "clamav": _CLAMAV_SOURCES,
    }[service_id]
    cached_at = _VERSION_REFRESHED_AT.get(service_id, 0)
    if sources and time.monotonic() - cached_at < 300:
        return len(sources)
    request = urllib.request.Request(f"https://github.com/{repository}/tags", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(
        set(re.findall(rf"/{re.escape(repository)}/releases/tag/{re.escape(tag_prefix)}(\d+\.\d+(?:\.\d+)?)", html)),
        key=lambda item: tuple(int(part) for part in item.split(".")),
        reverse=True,
    )
    if not versions:
        return None
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    sources.clear()
    sources.update({version: f"https://github.com/{repository}/archive/refs/tags/{tag_prefix}{version}.tar.gz" for version in selected})
    _VERSION_REFRESHED_AT[service_id] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [v(version, "stable" if version.rsplit(".", 1)[0] == latest_minor else "security") for version in selected]
    return len(selected)


def _refresh_postfix_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("postfix", 0)
    if _POSTFIX_SOURCES and time.monotonic() - cached_at < 300:
        return len(_POSTFIX_SOURCES)
    request = urllib.request.Request("https://www.postfix.org/announcements.html", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"postfix-(\d+\.\d+\.\d+)\.html", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    if not versions:
        return None
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    _POSTFIX_SOURCES.clear()
    _POSTFIX_SOURCES.update({version: f"https://postfix.cs.utah.edu/source/official/postfix-{version}.tar.gz" for version in selected})
    _VERSION_REFRESHED_AT["postfix"] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [v(version, "stable" if version.rsplit(".", 1)[0] == latest_minor else "security") for version in selected]
    return len(selected)


def opensearch_source_for(version: str) -> str | None:
    return _OPENSEARCH_SOURCES.get(version)


def wpcli_source_for(version: str) -> str | None:
    return _WPCLI_SOURCES.get(version)


def postfix_source_for(version: str) -> str | None:
    return _POSTFIX_SOURCES.get(version)


def dovecot_source_for(version: str) -> str | None:
    return _DOVECOT_SOURCES.get(version)


def _refresh_archive_source_versions(definition: ServiceDefinition, service_id: str, url: str, pattern: str, suffix: str):
    sources = {"bind9": _BIND9_SOURCES, "unbound": _UNBOUND_SOURCES, "clamav": _CLAMAV_SOURCES}[service_id]
    cached_at = _VERSION_REFRESHED_AT.get(service_id, 0)
    if sources and time.monotonic() - cached_at < 300:
        return len(sources)
    request = urllib.request.Request(url, headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(pattern, html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    if not versions:
        return None
    selected = []
    seen_minor = set()
    for version in versions:
        minor = ".".join(version.split(".")[:2])
        if minor in seen_minor:
            continue
        seen_minor.add(minor)
        selected.append(version)
        if len(selected) == 12:
            break
    sources.clear()
    sources.update({version: suffix.format(version=version) for version in selected})
    _VERSION_REFRESHED_AT[service_id] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [v(version, "stable" if version.rsplit(".", 1)[0] == latest_minor else "security") for version in selected]
    return len(selected)


def _refresh_rspamd_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("rspamd", 0)
    if _RSPAMD_SOURCES and time.monotonic() - cached_at < 300:
        return len(_RSPAMD_SOURCES)
    request = urllib.request.Request("https://github.com/rspamd/rspamd/tags", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"/rspamd/rspamd/releases/tag/(\d+\.\d+(?:\.\d+)?)", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    if not versions:
        return None
    selected = versions[:12]
    _RSPAMD_SOURCES.clear()
    _RSPAMD_SOURCES.update({version: f"https://github.com/rspamd/rspamd/archive/refs/tags/{version}.tar.gz" for version in selected})
    _VERSION_REFRESHED_AT["rspamd"] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [v(version, "stable" if version.rsplit(".", 1)[0] == latest_minor else "security") for version in selected]
    return len(selected)


def rspamd_source_for(version: str) -> str | None:
    return _RSPAMD_SOURCES.get(version)


def bind9_source_for(version: str) -> str | None:
    return _BIND9_SOURCES.get(version)


def unbound_source_for(version: str) -> str | None:
    return _UNBOUND_SOURCES.get(version)


def clamav_source_for(version: str) -> str | None:
    return _CLAMAV_SOURCES.get(version)


def _refresh_supervisor_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("supervisor", 0)
    if _SUPERVISOR_SOURCES and time.monotonic() - cached_at < 300:
        return len(_SUPERVISOR_SOURCES)
    request = urllib.request.Request("https://pypi.org/pypi/supervisor/json", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8", "replace"))
    versions = sorted(payload.get("releases", {}), key=lambda item: tuple(int(part) for part in re.findall(r"\d+", item)), reverse=True)
    selected = [version for version in versions if re.fullmatch(r"\d+\.\d+(?:\.\d+)?", version)][:12]
    for version in selected:
        files = payload["releases"].get(version, [])
        source = next((item.get("url") for item in files if item.get("packagetype") == "sdist"), None)
        if source:
            _SUPERVISOR_SOURCES[version] = source
    if not _SUPERVISOR_SOURCES:
        return None
    _VERSION_REFRESHED_AT["supervisor"] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [v(version, "stable" if version.rsplit(".", 1)[0] == latest_minor else "security") for version in selected if version in _SUPERVISOR_SOURCES]
    return len(definition.versions)


def _refresh_lynis_versions(definition: ServiceDefinition):
    cached_at = _VERSION_REFRESHED_AT.get("lynis", 0)
    if _LYNIS_SOURCES and time.monotonic() - cached_at < 300:
        return len(_LYNIS_SOURCES)
    request = urllib.request.Request("https://github.com/CISOfy/lynis/tags", headers={"User-Agent": "Server-Engine-Control-Panel"})
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", "replace")
    versions = sorted(set(re.findall(r"/CISOfy/lynis/releases/tag/(\d+\.\d+(?:\.\d+)?)", html)), key=lambda item: tuple(int(part) for part in item.split(".")), reverse=True)
    if not versions:
        return None
    selected = versions[:12]
    _LYNIS_SOURCES.clear()
    _LYNIS_SOURCES.update({version: f"https://github.com/CISOfy/lynis/archive/refs/tags/{version}.tar.gz" for version in selected})
    _VERSION_REFRESHED_AT["lynis"] = time.monotonic()
    latest_minor = selected[0].rsplit(".", 1)[0]
    definition.versions = [v(version, "stable" if version.rsplit(".", 1)[0] == latest_minor else "security") for version in selected]
    return len(selected)


def supervisor_source_for(version: str) -> str | None:
    return _SUPERVISOR_SOURCES.get(version)


def lynis_source_for(version: str) -> str | None:
    return _LYNIS_SOURCES.get(version)


PHP_EXTENSIONS = [
    {"id": "redis", "name": "Redis", "description": "Redis client for PHP applications."},
    {"id": "opcache", "name": "OPcache", "description": "Bytecode cache for faster PHP execution."},
    {"id": "curl", "name": "cURL", "description": "HTTP and HTTPS client support."},
    {"id": "mbstring", "name": "Multibyte string", "description": "UTF-8 and multibyte string handling."},
    {"id": "mysql", "name": "MySQL", "description": "PDO and MySQLi database drivers."},
    {"id": "pgsql", "name": "PostgreSQL", "description": "PostgreSQL database drivers."},
    {"id": "xml", "name": "XML", "description": "XML, DOM, SimpleXML, and XSL support."},
    {"id": "gd", "name": "GD", "description": "Raster image processing support."},
    {"id": "zip", "name": "Zip", "description": "ZIP archive support."},
    {"id": "intl", "name": "Internationalization", "description": "Locale and Unicode support."},
    {"id": "bcmath", "name": "BCMath", "description": "Arbitrary precision mathematics."},
    {"id": "fileinfo", "name": "Fileinfo", "description": "File type detection used by Composer, Laravel, and WordPress."},
    {"id": "soap", "name": "SOAP", "description": "SOAP web-service client support."},
]


CATALOG = [
    ServiceDefinition(id="nginx", name="Nginx", category="Web servers", description="High-performance HTTP reverse proxy and web server.", vendor="F5 / Nginx", license="BSD-2-Clause", default_port=80, versions=[]),
    ServiceDefinition(id="apache", name="Apache HTTP Server", category="Web servers", description="Extensible web server with virtual hosts, modules, and .htaccess support.", vendor="Apache Software Foundation", license="Apache-2.0", default_port=80, versions=[]),
    ServiceDefinition(id="openlitespeed", name="OpenLiteSpeed", category="Web servers", description="Event-driven web server with built-in caching and HTTP/3 support.", vendor="LiteSpeed Technologies", license="GPL-3.0", default_port=80, versions=[], mode="service", installable=True, management_path="/services", management_label="Open web server tools"),
    ServiceDefinition(id="caddy", name="Caddy", category="Web servers", description="Modern web server with automatic HTTPS and simple configuration.", vendor="Caddy", license="Apache-2.0", default_port=80, versions=[]),
    ServiceDefinition(id="haproxy", name="HAProxy", category="Web servers", description="Reliable TCP and HTTP load balancer and reverse proxy.", vendor="HAProxy Technologies", license="GPL-2.0", default_port=80, versions=[]),
    ServiceDefinition(id="php", name="PHP-FPM", category="Application runtimes", description="Isolated PHP runtimes and FastCGI process pools; multiple versions can run together.", vendor="PHP Foundation", license="PHP-3.01", default_port=9000, versions=[]),
    ServiceDefinition(id="nodejs", name="Node.js", category="Application runtimes", description="JavaScript runtime for server-side applications and tooling. Multiple major versions can coexist for separate projects.", vendor="OpenJS Foundation", license="MIT", versions=[]),
    ServiceDefinition(id="python", name="Python", category="Application runtimes", description="Python runtime for WSGI/ASGI applications and automation.", vendor="Python Software Foundation", license="PSF-2.0", versions=[]),
    ServiceDefinition(id="ruby", name="Ruby", category="Application runtimes", description="Ruby runtime for Rails and Rack applications.", vendor="Ruby Community", license="Ruby/BSD", versions=[]),
    ServiceDefinition(id="openssl", name="OpenSSL compatibility runtime", category="Application runtimes", description="Isolated legacy OpenSSL libraries for runtimes that cannot use the host OpenSSL 3 ABI.", requirements="OpenSSL 1.1.1 is end-of-life and should be used only for legacy runtimes.", vendor="OpenSSL Project", license="Apache-2.0", versions=[], mode="service", installable=True),
    ServiceDefinition(id="mariadb", name="MariaDB", category="Databases", description="MySQL-compatible relational database server.", vendor="MariaDB Foundation", license="GPL-2.0", default_port=3306, versions=[]),
    ServiceDefinition(id="mysql", name="MySQL", category="Databases", description="Relational database server for web applications.", vendor="Oracle", license="GPL-2.0 / Commercial", default_port=3306, versions=[]),
    ServiceDefinition(id="phpmyadmin", name="phpMyAdmin", category="Database tools", description="Web database administration for MySQL and MariaDB, served through the Server Engine Python panel.", requirements="Requires an installed PHP 8.x CLI runtime. Nginx is not required.", vendor="phpMyAdmin contributors", license="GPL-2.0", versions=[v("5.2.2", "stable")], mode="service", installable=True, install_methods=["prebuilt"]),
    ServiceDefinition(id="postgresql", name="PostgreSQL", category="Databases", description="Advanced open-source relational database server.", vendor="PostgreSQL Global Development Group", license="PostgreSQL License", default_port=5432, versions=[]),
    ServiceDefinition(id="redis", name="Redis", category="Databases & cache", description="In-memory data store for cache, queues, and realtime features.", vendor="Redis", license="RSALv2/SSPLv1", default_port=6379, versions=[]),
    ServiceDefinition(id="valkey", name="Valkey", category="Databases & cache", description="Linux Foundation-backed Redis-compatible in-memory data store.", vendor="Linux Foundation", license="BSD-3-Clause", default_port=6379, versions=[]),
    ServiceDefinition(id="memcached", name="Memcached", category="Databases & cache", description="Simple distributed memory caching system.", vendor="Memcached", license="BSD-3-Clause", default_port=11211, versions=[]),
    ServiceDefinition(id="certbot", name="Certbot", category="Security & operations", description="Automatic TLS certificate issuance and renewal client.", vendor="EFF", license="Apache-2.0", versions=[]),
    ServiceDefinition(id="vsftpd", name="vsftpd", category="Security & operations", description="Lightweight FTP/FTPS server for legacy deployment workflows.", vendor="vsftpd", license="GPL-2.0", default_port=21, versions=[]),
    ServiceDefinition(id="fail2ban", name="Fail2ban", category="Security & operations", description="Log-based intrusion prevention that can protect the host firewall after installation.", vendor="Fail2ban", license="GPL-2.0", versions=[], mode="service", installable=True, management_path="/firewall", management_label="Open firewall controls"),
]


# These capabilities belong in the Services catalog, but are managed through
# a feature page or an external provider rather than extracted as an isolated
# Debian package by the generic installer.
CATALOG.extend([
    ServiceDefinition(id="modsecurity", name="ModSecurity WAF", category="Security & traffic", description="Web application firewall engine installed before it is attached to Nginx or Apache websites.", vendor="OWASP / SpiderLabs", license="Apache-2.0", versions=[], mode="service", installable=True, management_path="/firewall", management_label="Open WAF controls"),
    ServiceDefinition(id="supervisor", name="Supervisor", category="Process managers", description="Keep Laravel workers, queue consumers, Python processes, and custom daemons running.", vendor="Supervisor", license="BSD-3-Clause", versions=[], mode="service", installable=True, management_path="/services", management_label="Open process managers"),
    ServiceDefinition(id="pm2", name="PM2", category="Process managers", description="Production Node.js process management, clustering, startup, and log handling.", vendor="PM2", license="AGPL-3.0", versions=[], mode="service", installable=True, management_path="/services", management_label="Open process managers"),
    ServiceDefinition(id="postfix", name="Postfix", category="Mail services", description="Outbound and inbound SMTP transport for managed domains and application mail.", vendor="Postfix", license="IPL-1.0", versions=[], mode="service", installable=True, management_path="/email", management_label="Open mail controls"),
    ServiceDefinition(id="dovecot", name="Dovecot", category="Mail services", description="IMAP, POP3, LMTP, mailbox storage, and secure mail delivery sessions.", vendor="Dovecot", license="MIT/LGPL-2.1", versions=[], mode="service", installable=True, management_path="/email", management_label="Open mail controls"),
    ServiceDefinition(id="rspamd", name="Rspamd", category="Mail services", description="Spam filtering, DKIM signing, reputation checks, and mail policy automation.", requirements="Requires Postfix for mail transport; pair with Dovecot for mailbox delivery and filtering.", vendor="Rspamd", license="Apache-2.0", versions=[], mode="service", installable=True, management_path="/email", management_label="Open mail controls"),
    ServiceDefinition(id="stalwart", name="Stalwart Mail Server", category="Mail services", description="Modern all-in-one mail and collaboration server with SMTP, IMAP, JMAP, spam filtering, calendars, contacts, and API-managed domains.", vendor="Stalwart Labs", license="AGPL-3.0 / Enterprise", default_port=25, versions=[], mode="service", installable=True, management_path="/email", management_label="Open mail controls"),
    ServiceDefinition(id="powerdns", name="PowerDNS Authoritative", category="DNS services", description="Authoritative DNS for hosted zones with API-managed records, DNSSEC, nameserver templates, and automation.", vendor="PowerDNS", license="GPL-2.0", default_port=53, versions=[], mode="service", installable=True),
    ServiceDefinition(id="bind9", name="BIND 9", category="DNS services", description="Authoritative and recursive DNS service for self-hosted zones.", vendor="ISC", license="MPL-2.0", versions=[], mode="service", installable=True, management_path="/domains", management_label="Open DNS controls"),
    ServiceDefinition(id="unbound", name="Unbound", category="DNS services", description="Validating recursive DNS resolver with caching and DNSSEC support.", vendor="NLnet Labs", license="BSD-3-Clause", versions=[], mode="service", installable=True, management_path="/domains", management_label="Open DNS controls"),
    ServiceDefinition(id="clamav", name="ClamAV", category="Security & operations", description="Scheduled malware scanning for website files, uploads, mail, and backups.", requirements="Optional scanner: website and backup scans work standalone; mail scanning requires Postfix and Rspamd integration.", vendor="ClamAV", license="GPL-2.0", versions=[], mode="service", installable=True, management_path="/health", management_label="Open security scans"),
    ServiceDefinition(id="auditd", name="Linux audit", category="Security & operations", description="Kernel audit event collection for privileged actions, file changes, and authentication review.", vendor="Linux Audit", license="GPL-2.0", versions=[], mode="service", installable=True, management_path="/logs", management_label="Open audit logs"),
    ServiceDefinition(id="lynis", name="Lynis hardening audit", category="Security & operations", description="Security audit and hardening recommendations for the host and its services.", vendor="CISOfy", license="GPL-3.0", versions=[], mode="service", installable=True, management_path="/health", management_label="Open health checks"),
    ServiceDefinition(id="logrotate", name="Logrotate", category="Monitoring & operations", description="Host log retention, compression, and rotation policies.", vendor="Linux", license="GPL-2.0", versions=[], mode="service", installable=True, management_path="/logs", management_label="Open log controls"),
    ServiceDefinition(id="rabbitmq", name="RabbitMQ", category="Queues & messaging", description="Reliable queues and messaging for workers, event processing, and distributed applications.", vendor="Broadcom", license="MPL-2.0", versions=[], mode="service", installable=True, management_path="/services", management_label="Open queue managers"),
    ServiceDefinition(id="mongodb", name="MongoDB", category="Databases", description="Document database for flexible application data and event-oriented workloads.", vendor="MongoDB", license="SSPL-1.0", versions=[], mode="service", installable=True, management_path="/databases", management_label="Open database manager"),
    ServiceDefinition(id="sqlserver", name="Microsoft SQL Server", category="Databases", description="Microsoft relational database engine managed in a dedicated Docker container on supported x86_64 Linux hosts.", vendor="Microsoft", license="Commercial", versions=[], mode="service", installable=True, management_path="/databases", management_label="Open database manager"),
    ServiceDefinition(id="opensearch", name="OpenSearch", category="Databases & search", description="Search and analytics engine for application search, logs, and dashboards.", vendor="OpenSearch", license="Apache-2.0", versions=[], mode="service", installable=True, management_path="/services", management_label="Open search services"),
    ServiceDefinition(id="docker", name="Docker Engine", category="Deployment tools", description="Host container runtime used by optional Server Engine integrations.", vendor="Docker", license="Apache-2.0 / Commercial", versions=[v("latest", "stable")], mode="integration", installable=True, management_path="/services", management_label="Open container tools"),
    ServiceDefinition(id="git", name="Git", category="Deployment tools", description="Repository checkout, deployment hooks, rollback, and application source management.", vendor="Git", license="GPL-2.0", versions=[], mode="service", installable=True, management_path="/websites", management_label="Open deployment tools"),
    ServiceDefinition(id="composer", name="Composer", category="Deployment tools", description="PHP dependency manager for Laravel, WordPress, and modern PHP applications.", requirements="PHP CLI is needed to install and manage project dependencies.", vendor="Composer", license="MIT", versions=[]),
    ServiceDefinition(id="wp-cli", name="WP-CLI", category="Deployment tools", description="WordPress installation, updates, database tasks, cache control, and scripted maintenance.", requirements="PHP CLI and Composer enable full WordPress project automation.", vendor="WordPress", license="MIT", versions=[], mode="service", installable=True, management_path="/websites", management_label="Open website tools"),
    ServiceDefinition(id="imagemagick", name="ImageMagick", category="Deployment tools", description="Image conversion and optimization for WordPress, Laravel, and media workflows.", vendor="ImageMagick", license="Apache-2.0", versions=[], mode="service", installable=True, management_path="/services", management_label="Open runtime tools"),
    ServiceDefinition(id="ffmpeg", name="FFmpeg", category="Deployment tools", description="Audio and video processing for media applications and background jobs.", vendor="FFmpeg", license="LGPL-2.1/GPL-2.0", versions=[], mode="service", installable=True, management_path="/services", management_label="Open runtime tools"),
])

# Keep the installation-method contract in the catalog response instead of
# duplicating a growing service list in the React installer. Services without
# a real host-compatible package provider remain source-only.
for _service in CATALOG:
    if _service.id in {"fail2ban", "modsecurity", "auditd", "logrotate"}:
        _service.install_methods = ["prebuilt"]
    elif _service.id in _PREBUILT_PACKAGES or _service.id == "mongodb":
        _service.install_methods = ["prebuilt", "source"]
    elif _service.id in {"nodejs", "composer", "pm2", "sqlserver", "docker"}:
        # These adapters use versioned portable archives or package-manager
        # artifacts extracted under Server Engine; they do not expose a
        # generic source-build implementation.
        _service.install_methods = ["prebuilt"]
    elif _service.id == "php":
        _service.install_methods = ["prebuilt", "source"]
    elif _service.id == "python":
        _service.install_methods = ["prebuilt", "source"]
    elif _service.id in {"openlitespeed", "caddy", "stalwart"}:
        _service.install_methods = ["prebuilt", "source"]
    elif _service.id == "openssl":
        _service.install_methods = ["source"]


def get_service(service_id: str) -> ServiceDefinition | None:
    return next((service for service in CATALOG if service.id == service_id), None)


def refresh_service_versions(service_id: str, force: bool = False, install_method: str = "source") -> tuple[ServiceDefinition, str, str]:
    """Refresh a provider-backed version list while retaining a safe fallback."""
    definition = get_service(service_id)
    if definition is None:
        raise ValueError("Service is not in the provider catalog")
    if _VERSION_METHODS.get(service_id) != install_method:
        definition.versions = []
    _VERSION_METHODS[service_id] = install_method
    if force:
        # The explicit Fetch button must contact the provider again. Internal
        # installer lookups may still use the short-lived catalog cache.
        _VERSION_REFRESHED_AT.pop(service_id, None)
        if service_id == "php":
            _VERSION_REFRESHED_AT.pop("php-source", None)
        if service_id == "python":
            _VERSION_REFRESHED_AT.pop("python-source", None)
            _PYTHON_SOURCES.clear()
        if service_id == "openssl":
            _VERSION_REFRESHED_AT.pop("openssl-source", None)
            _OPENSSL_SOURCES.clear()
        packages = _PREBUILT_PACKAGE_CHOICES.get(
            service_id,
            [_PREBUILT_PACKAGES[service_id]] if service_id in _PREBUILT_PACKAGES else [],
        )
        for package in packages:
            _APT_VERSION_REFRESHED_AT.pop(package, None)
        _SELECTED_PREBUILT_PACKAGES.pop(service_id, None)
        if service_id == "openlitespeed":
            _VERSION_REFRESHED_AT.pop("openlitespeed-prebuilt", None)
            _OPENLITESPEED_PREBUILTS.clear()
        if service_id == "mariadb":
            _VERSION_REFRESHED_AT.pop("mariadb-prebuilt", None)
            _MARIADB_PREBUILTS.clear()
        if service_id == "stalwart":
            _VERSION_REFRESHED_AT.pop("stalwart-prebuilt", None)
            _STALWART_PREBUILTS.clear()
        definition.versions = []
    if install_method == "prebuilt" and service_id == "mariadb":
        count = _refresh_apt_versions(definition, "mariadb-server")
        if count:
            _SELECTED_PREBUILT_PACKAGES[service_id] = "mariadb-server"
            return definition, "apt", f"Fetched {count} MariaDB packages from the operating system repository."
        return definition, "apt", "No compatible MariaDB packages were found for this OS and architecture."
    if install_method == "prebuilt" and service_id == "docker":
        definition.versions = [v("latest", "stable")]
        return definition, "host-package", "Docker Engine will be installed as a host package."
    if install_method == "prebuilt" and service_id in _PREBUILT_PACKAGES:
        packages = _PREBUILT_PACKAGE_CHOICES.get(service_id, [_PREBUILT_PACKAGES[service_id]])
        for package in packages:
            definition.versions = []
            count = _refresh_apt_versions(definition, package)
            if count:
                _SELECTED_PREBUILT_PACKAGES[service_id] = package
                return definition, "apt", f"Fetched {count} {definition.name} packages compatible with this OS and architecture."
        return definition, "apt", f"No compatible prebuilt {definition.name} packages were found for this OS and architecture."
    if install_method == "prebuilt" and service_id == "mongodb":
        try:
            count = _refresh_mongodb_prebuilt_versions(definition)
            if count:
                return definition, "mongodb-downloads", f"Fetched {count} MongoDB archives compatible with this OS and architecture."
        except Exception:
            pass
        return definition, "mongodb-downloads", "No compatible prebuilt MongoDB archives were found for this OS and architecture. Choose source build instead."
    if service_id == "composer":
        try:
            count = _refresh_composer_versions(definition)
            if count:
                return definition, "github.com/composer", f"Fetched {count} Composer releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The Composer release catalog could not be reached. Refresh compatible versions and try again."
    if service_id == "pm2":
        cached_at = _VERSION_REFRESHED_AT.get("pm2", 0)
        if definition.versions and cached_at and time.monotonic() - cached_at < 300:
            return definition, "npm", f"Using {len(definition.versions)} cached PM2 releases from the official npm registry."
        try:
            request = urllib.request.Request(
                "https://registry.npmjs.org/pm2",
                headers={"Accept": "application/json", "User-Agent": "Server-Engine-Control-Panel"},
            )
            with urllib.request.urlopen(request, timeout=8) as response:
                metadata = json.loads(response.read().decode("utf-8"))
            versions = metadata.get("versions", {})
            latest = metadata.get("dist-tags", {}).get("latest")
            ordered = []
            if latest in versions:
                ordered.append(latest)
            ordered.extend(version for version in reversed(list(versions)) if version != latest)
            selected = []
            seen_minor = set()
            for version in ordered:
                if version.startswith("0.") or "-" in version:
                    continue
                minor = ".".join(version.split(".")[:2])
                if minor in seen_minor:
                    continue
                seen_minor.add(minor)
                channel = "stable" if version == latest else "security"
                selected.append(v(version, channel))
                if len(selected) == 12:
                    break
            if selected:
                definition.versions = selected
                _VERSION_REFRESHED_AT["pm2"] = time.monotonic()
                return definition, "npm", f"Fetched {len(selected)} PM2 releases from the official npm registry."
        except Exception:
            pass
        return definition, "catalog", "The PM2 registry could not be reached. The saved compatibility list is still available."

    if service_id == "python":
        try:
            count = (
                _refresh_python_source_versions(definition)
                if install_method == "source"
                else _refresh_python_versions(definition)
            )
            if count:
                provider = "python.org" if install_method == "source" else "python-build-standalone"
                return definition, provider, f"Fetched {count} CPython releases compatible with this host architecture."
        except Exception:
            pass
        return definition, "catalog", "The Python release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "openssl":
        count = _refresh_openssl_source_versions(definition)
        return definition, "openssl.org/source", f"Fetched {count} OpenSSL source archives from the official source archive."

    if service_id == "nodejs":
        try:
            count = _refresh_node_versions(definition)
            if count:
                return definition, "nodejs.org", f"Fetched {count} Node.js binary release lines for this host architecture."
        except Exception:
            pass
        return definition, "catalog", "The Node.js release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "php":
        try:
            count = _refresh_php_source_versions(definition) if install_method == "source" else _refresh_php_versions(definition)
            if count:
                provider = "php.net" if install_method == "source" else "packages.sury.org"
                return definition, provider, f"Fetched {count} PHP-FPM versions compatible with this host architecture."
        except Exception:
            pass
        return definition, "catalog", "The PHP package catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "certbot":
        try:
            count = _refresh_certbot_versions(definition)
            if count:
                return definition, "certbot-pypi", f"Fetched {count} Certbot source releases from the official Python package index."
        except Exception:
            pass
        return definition, "catalog", "The Certbot release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "rabbitmq":
        try:
            count = _refresh_rabbitmq_versions(definition)
            if count:
                return definition, "rabbitmq-source", f"Fetched {count} RabbitMQ source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The RabbitMQ release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "git":
        try:
            count = _refresh_git_versions(definition)
            if count:
                return definition, "git-source", f"Fetched {count} Git source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The Git release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "imagemagick":
        try:
            count = _refresh_imagemagick_versions(definition)
            if count:
                return definition, "imagemagick-source", f"Fetched {count} ImageMagick source releases from the official archive."
        except Exception:
            pass
        return definition, "catalog", "The ImageMagick release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "ruby":
        try:
            count = _refresh_ruby_versions(definition)
            if count:
                return definition, "ruby-source", f"Fetched {count} Ruby source releases from the official Ruby archive."
        except Exception:
            pass
        return definition, "catalog", "The Ruby release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "ffmpeg":
        try:
            count = _refresh_ffmpeg_versions(definition)
            if count:
                return definition, "ffmpeg-source", f"Fetched {count} FFmpeg source releases from the official release archive."
        except Exception:
            pass
        return definition, "catalog", "The FFmpeg release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "openlitespeed":
        if install_method == "prebuilt":
            try:
                count = _refresh_openlitespeed_prebuilt_versions(definition)
                if count:
                    return definition, "openlitespeed-downloads", f"Fetched {count} OpenLiteSpeed binaries compatible with this OS and architecture."
            except Exception:
                pass
            return definition, "openlitespeed-downloads", "No compatible prebuilt OpenLiteSpeed binaries were found for this OS and architecture. Choose source build instead."
        try:
            count = _refresh_openlitespeed_versions(definition)
            if count:
                return definition, "openlitespeed-source", f"Fetched {count} OpenLiteSpeed source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The OpenLiteSpeed release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "redis":
        try:
            count = _refresh_redis_versions(definition)
            if count:
                return definition, "redis-tags", f"Fetched {count} Redis releases from the official Redis repository."
        except Exception:
            pass
        return definition, "catalog", "The Redis release catalog could not be reached. The saved compatibility list is still available."

    if service_id == "postgresql":
        try:
            count = _refresh_postgresql_versions(definition)
            if count:
                return definition, "postgresql-source", f"Fetched {count} PostgreSQL source releases from the official PostgreSQL archive."
        except Exception:
            pass
        return definition, "catalog", "The PostgreSQL release catalog could not be reached. The saved compatibility list is still available."

    if service_id == "mysql":
        try:
            count = _refresh_mysql_versions(definition)
            if count:
                return definition, "mysql-downloads", f"Fetched {count} MySQL release lines from the official MySQL registry."
        except Exception:
            pass
        return definition, "catalog", "The MySQL release catalog could not be reached. The saved compatibility list is still available."

    if service_id == "powerdns":
        try:
            count = _refresh_powerdns_versions(definition)
            if count:
                return definition, "powerdns-source", f"Fetched {count} PowerDNS source releases from the official archive."
        except Exception:
            pass
        return definition, "catalog", "The PowerDNS release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "sqlserver":
        if platform.machine().lower() not in {"x86_64", "amd64"}:
            _SQLSERVER_RELEASES.clear()
            definition.versions = []
            return definition, "unsupported-architecture", "Microsoft SQL Server's official Linux container requires an x86_64 host; no compatible ARM64 versions are available."
        try:
            count = _refresh_sqlserver_versions(definition)
            if count:
                return definition, "mcr", f"Fetched {count} SQL Server release lines from Microsoft Container Registry."
        except Exception:
            pass
        return definition, "catalog", "The SQL Server release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "caddy":
        try:
            count = _refresh_caddy_versions(definition)
            if count:
                return definition, "caddy-source", f"Fetched {count} Caddy source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The Caddy source catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "mariadb":
        try:
            count = _refresh_mariadb_versions(definition)
            if count:
                return definition, "mariadb-source", f"Fetched {count} MariaDB source releases from the official MariaDB archive."
        except Exception:
            pass
        return definition, "catalog", "The MariaDB source catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "haproxy":
        try:
            count = _refresh_haproxy_versions(definition)
            if count:
                return definition, "haproxy-source", f"Fetched {count} HAProxy source releases from the official archive."
        except Exception:
            pass
        return definition, "catalog", "The HAProxy source catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "memcached":
        try:
            count = _refresh_memcached_versions(definition)
            if count:
                return definition, "memcached-source", f"Fetched {count} Memcached source releases from the official archive."
        except Exception:
            pass
        return definition, "catalog", "The Memcached source catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "valkey":
        try:
            count = _refresh_valkey_versions(definition)
            if count:
                return definition, "valkey-source", f"Fetched {count} Valkey source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The Valkey source catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "vsftpd":
        try:
            count = _refresh_vsftpd_versions(definition)
            if count:
                return definition, "vsftpd-source", f"Fetched {count} vsftpd source releases from the official archive."
        except Exception:
            pass
        return definition, "catalog", "The vsftpd source catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "nginx":
        try:
            count = _refresh_nginx_versions(definition)
            if count:
                return definition, "nginx-source", f"Fetched {count} Nginx source releases from the official Nginx archive."
        except Exception:
            pass
        return definition, "catalog", "The Nginx release catalog could not be reached. The saved compatibility list is still available."

    if service_id == "apache":
        try:
            count = _refresh_apache_versions(definition)
            if count:
                return definition, "apache-source", f"Fetched {count} Apache HTTP Server source releases from the official archive."
        except Exception:
            pass
        return definition, "catalog", "The Apache release catalog could not be reached. The saved compatibility list is still available."

    if service_id == "stalwart":
        if install_method == "prebuilt":
            try:
                count = _refresh_stalwart_prebuilt_versions(definition)
                if count:
                    return definition, "stalwart-releases", f"Fetched {count} official Stalwart binaries for this host architecture."
            except Exception:
                pass
            return definition, "stalwart-releases", "No compatible prebuilt Stalwart binaries were found for this OS and architecture. Choose source build instead."
        try:
            count = _refresh_stalwart_versions(definition)
            if count:
                return definition, "stalwart-source", f"Fetched {count} Stalwart source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The Stalwart release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "mongodb":
        try:
            count = _refresh_mongodb_versions(definition)
            if count:
                return definition, "mongodb-source", f"Fetched {count} MongoDB source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The MongoDB release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "opensearch":
        try:
            count = _refresh_github_source_versions(definition, "opensearch", "opensearch-project/OpenSearch", "", "")
            if count:
                return definition, "opensearch-source", f"Fetched {count} OpenSearch source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The OpenSearch release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "wp-cli":
        try:
            count = _refresh_github_source_versions(definition, "wp-cli", "wp-cli/wp-cli", "v", "")
            if count:
                return definition, "wp-cli-source", f"Fetched {count} WP-CLI source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The WP-CLI release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "postfix":
        try:
            count = _refresh_postfix_versions(definition)
            if count:
                return definition, "postfix-source", f"Fetched {count} Postfix source releases from the official archive."
        except Exception:
            pass
        return definition, "catalog", "The Postfix release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "dovecot":
        try:
            count = _refresh_github_source_versions(definition, "dovecot", "dovecot/core", "", "")
            if count:
                return definition, "dovecot-source", f"Fetched {count} Dovecot source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The Dovecot release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "rspamd":
        try:
            count = _refresh_rspamd_versions(definition)
            if count:
                return definition, "rspamd-source", f"Fetched {count} Rspamd source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The Rspamd release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "bind9":
        try:
            count = _refresh_archive_source_versions(definition, "bind9", "https://downloads.isc.org/isc/bind9/", r'href="(9\.\d+\.\d+)/"', "https://downloads.isc.org/isc/bind9/{version}/bind-{version}.tar.xz")
            if count:
                return definition, "bind9-source", f"Fetched {count} BIND 9 source releases from the official ISC archive."
        except Exception:
            pass
        return definition, "catalog", "The BIND 9 release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "unbound":
        try:
            count = _refresh_archive_source_versions(definition, "unbound", "https://nlnetlabs.nl/downloads/unbound/", r"unbound-(\d+\.\d+(?:\.\d+)?)\.tar\.gz", "https://nlnetlabs.nl/downloads/unbound/unbound-{version}.tar.gz")
            if count:
                return definition, "unbound-source", f"Fetched {count} Unbound source releases from the official archive."
        except Exception:
            pass
        return definition, "catalog", "The Unbound release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "clamav":
        try:
            count = _refresh_github_source_versions(definition, "clamav", "Cisco-Talos/clamav", "clamav-", "")
            if count:
                return definition, "clamav-source", f"Fetched {count} ClamAV source releases from the official archive."
        except Exception:
            pass
        return definition, "catalog", "The ClamAV release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "supervisor":
        try:
            count = _refresh_supervisor_versions(definition)
            if count:
                return definition, "supervisor-source", f"Fetched {count} Supervisor source releases from PyPI."
        except Exception:
            pass
        return definition, "catalog", "The Supervisor release catalog could not be reached. Refresh compatible versions and try again."

    if service_id == "lynis":
        try:
            count = _refresh_lynis_versions(definition)
            if count:
                return definition, "lynis-source", f"Fetched {count} Lynis source releases from the official repository."
        except Exception:
            pass
        return definition, "catalog", "The Lynis release catalog could not be reached. Refresh compatible versions and try again."

    # Debian/Ubuntu-backed services can use the host package metadata. This
    # gives the installer versions that are actually available for this OS and
    # architecture instead of pretending every upstream release is usable.
    package_services = {
        "fail2ban": "fail2ban",
        "auditd": "auditd",
        "logrotate": "logrotate",
        "docker": "docker.io",

        "supervisor": "supervisor", "postfix": "postfix", "dovecot": "dovecot-imapd",
        "rspamd": "rspamd", "bind9": "bind9", "unbound": "unbound",
        "clamav": "clamav", "auditd": "auditd", "lynis": "lynis",
        "logrotate": "logrotate",
        "modsecurity": "libmodsecurity3",
    }
    package = package_services.get(service_id)
    if package:
        try:
            count = _refresh_apt_versions(definition, package)
            if count:
                message = f"Fetched {count} {definition.name} release lines compatible with this APT host."
                return definition, "apt", message
        except Exception:
            pass
    return definition, "catalog", "This service uses the saved compatibility catalog because no live provider is available."
