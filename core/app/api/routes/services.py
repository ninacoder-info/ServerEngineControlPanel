import os
import json
import re
import shutil
import shlex
import subprocess
import math
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse

from app.api.dependencies import require_user
from app.models.service import ConfigurationSaveRequest, ExtensionInstallRequest, InstallServiceRequest, InstalledService, ServiceActionRequest, ServiceDefinition, StalwartStorageRequest, SwitchVersionRequest
from app.services.service_catalog import CATALOG, PHP_EXTENSIONS, get_service, refresh_service_versions
from app.services.job_service import job_store
from app.services.website_service import website_service
from app.services.service_runtime import PHP_BASELINE_MODULES, SERVICE_PACKAGES, binary_path, composer_path, composer_php_version, default_startup_enabled, enable_php_baseline_extensions, ensure_composer_launcher, ensure_nginx_layout, ensure_node_runtime, ensure_php_fpm_layout, ensure_php_runtime_launcher, ensure_php_terminal_launcher, managed_library_environment, normalize_php_runtime_layout, nginx_default_configuration, nginx_paths, php_cli_path, php_runtime_library_path, service_root, set_startup_enabled, startup_enabled, version_sort_key

router = APIRouter(prefix="/api/v1/services", tags=["services"])

NON_DAEMON_SERVICES = {"certbot", "git", "imagemagick", "ffmpeg", "ruby", "lynis"}
_inventory_cache_lock = RLock()
_installed_services_cache = None
_php_runtimes_cache = None
_php_runtime_options_cache = None


def invalidate_service_inventory_cache() -> None:
    """Invalidate expensive service inventories after a service job changes state."""
    global _installed_services_cache, _php_runtimes_cache, _php_runtime_options_cache
    with _inventory_cache_lock:
        _installed_services_cache = None
        _php_runtimes_cache = None
        _php_runtime_options_cache = None


@router.get("/phpmyadmin/status")
def phpmyadmin_status(user=Depends(require_user)):
    root = service_root("phpmyadmin")
    marker = root / ".serverengine-version"
    installed = marker.exists() and (root / "index.php").exists()
    running = _process_running("phpmyadmin") if installed else False
    return {
        "id": "phpmyadmin",
        "name": "phpMyAdmin",
        "installed": installed,
        "running": running,
        "status": "running" if running else "stopped" if installed else "not-installed",
        "version": marker.read_text(errors="replace").strip() if installed else None,
    }


def _phpmyadmin_php8_versions() -> list[str]:
    versions_root = service_root("php") / "versions"
    if not versions_root.exists():
        return []
    return sorted(
        (
            item.name
            for item in versions_root.iterdir()
            if item.is_dir() and re.fullmatch(r"8\.\d+(?:\.\d+)?", item.name) and php_cli_path(item.name).exists()
        ),
        key=version_sort_key,
        reverse=True,
    )


@router.get("/phpmyadmin/runtime")
def phpmyadmin_runtime(user=Depends(require_user)):
    versions = _phpmyadmin_php8_versions()
    marker = service_root("phpmyadmin") / ".serverengine-php-version"
    selected = marker.read_text(errors="replace").strip() if marker.exists() else ""
    if selected not in versions:
        selected = versions[0] if versions else ""
    return {"version": selected, "versions": versions}


@router.put("/phpmyadmin/runtime")
def update_phpmyadmin_runtime(payload: dict, user=Depends(require_user)):
    version = str(payload.get("php_version") or "").strip()
    if version not in _phpmyadmin_php8_versions():
        raise HTTPException(status_code=400, detail="Choose an installed PHP 8.x CLI runtime.")
    root = service_root("phpmyadmin")
    root.joinpath(".serverengine-php-version").write_text(version + "\n")
    running = _process_running("phpmyadmin")
    job_id = None
    if running:
        job_id = f"restart-phpmyadmin-php-{version}"
        job_store.enqueue_action(job_id, "phpmyadmin", "restart")
    return {"version": version, "restart_queued": bool(job_id), "job_id": job_id}


@router.put("/stalwart/storage")
def save_stalwart_storage(payload: StalwartStorageRequest, user=Depends(require_user)):
    root = service_root("stalwart").resolve()
    data_directory = Path(payload.data_directory).expanduser().resolve()
    if root not in data_directory.parents and data_directory != root:
        raise HTTPException(422, "Stalwart storage must remain inside its service directory")
    if not (root / "bin/stalwart").exists():
        raise HTTPException(409, "Install Stalwart before configuring mailbox storage")
    (root / "conf").mkdir(parents=True, exist_ok=True)
    data_directory.mkdir(parents=True, exist_ok=True)
    storage = {"data_store": payload.data_store, "data_directory": str(data_directory)}
    (root / "conf/storage.json").write_text(json.dumps(storage, indent=2) + "\n")
    datastore_type = {"RocksDB": "RocksDb", "SQLite": "Sqlite", "PostgreSQL": "PostgreSQL", "MySQL/MariaDB": "Mysql"}[payload.data_store]
    if payload.data_store == "RocksDB":
        config = {"@type": datastore_type, "path": str(data_directory)}
    else:
        raise HTTPException(422, f"{payload.data_store} storage provisioning is not implemented yet; use RocksDB for Phase 1.")
    (root / "conf/config.json").write_text(json.dumps(config, indent=2) + "\n")
    return {"saved": True, **storage, "message": f"{payload.data_store} storage is prepared for Stalwart."}


def _sanitize_apache_configuration(content: str) -> str:
    """Remove module directives for modules compiled into Apache itself."""
    return re.sub(r"(?mi)^\s*LoadModule\s+unixd_module\s+[^\n]*(?:\n|$)", "", content)


def _configured_service_port(service_id: str) -> int:
    defaults = {"mysql": 3306, "mariadb": 3306}
    path = service_root(service_id) / "conf/my.cnf"
    try:
        content = path.read_text(errors="replace")
    except OSError:
        return defaults.get(service_id, 0)
    match = re.search(r"(?mi)^\s*port\s*=\s*(\d+)\s*$", content)
    return int(match.group(1)) if match else defaults.get(service_id, 0)


def _docker_compose_preview(item: dict, config: dict, host_config: dict, ports: dict) -> str:
    """Render the inspected container as a safe, readable Compose preview."""
    name = str(item.get("Name", "container")).lstrip("/")
    lines = ["services:", f"  {name}:"]

    def add_scalar(key: str, value: str):
        if value:
            lines.append(f"    {key}: {json.dumps(value)}")

    add_scalar("image", str(config.get("Image") or ""))
    add_scalar("container_name", name)
    add_scalar("restart", str((host_config.get("RestartPolicy") or {}).get("Name") or "no"))

    port_lines = []
    for container_port, bindings in (ports or {}).items():
        for binding in bindings or []:
            host_ip = binding.get("HostIp") or "0.0.0.0"
            host_port = binding.get("HostPort")
            if host_port:
                port_lines.append(f"{host_ip}:{host_port}:{container_port.split('/')[0]}/{container_port.split('/')[-1]}")
    if port_lines:
        lines.append("    ports:")
        lines.extend(f"      - {json.dumps(value)}" for value in port_lines)

    mounts = item.get("Mounts") or []
    if mounts:
        lines.append("    volumes:")
        for mount in mounts:
            source = mount.get("Source") or mount.get("Name") or ""
            destination = mount.get("Destination") or ""
            mode = mount.get("Mode") or "rw"
            lines.append(f"      - {json.dumps(f'{source}:{destination}:{mode}')}" )

    environment = config.get("Env") or []
    if environment:
        lines.append("    environment:")
        for entry in environment:
            lines.append(f"      - {json.dumps(entry)}")

    command = config.get("Cmd") or []
    if command:
        lines.append("    command:")
        lines.extend(f"      - {json.dumps(str(value))}" for value in command)

    entrypoint = config.get("Entrypoint") or []
    if entrypoint:
        lines.append("    entrypoint:")
        lines.extend(f"      - {json.dumps(str(value))}" for value in entrypoint)
    return "\n".join(lines) + "\n"


@router.get("/{service_id}/startup")
def get_startup_policy(service_id: str, version: str | None = Query(default=None), user=Depends(require_user)):
    if not get_service(service_id):
        raise HTTPException(status_code=404, detail="Service not found")
    if service_id == "php" and not version:
        raise HTTPException(status_code=400, detail="A PHP version is required")
    return {"service": service_id, "version": version, "enabled": startup_enabled(service_id, version), "default": default_startup_enabled(service_id)}


@router.put("/{service_id}/startup")
def update_startup_policy(service_id: str, payload: dict, version: str | None = Query(default=None), user=Depends(require_user)):
    if not get_service(service_id):
        raise HTTPException(status_code=404, detail="Service not found")
    selected_version = str(payload.get("version") or version or "").strip() or None
    if service_id == "php" and not selected_version:
        raise HTTPException(status_code=400, detail="A PHP version is required")
    enabled = set_startup_enabled(service_id, bool(payload.get("enabled", False)), selected_version)
    warning = None
    web_servers = {"nginx", "apache", "openlitespeed", "caddy"}
    if enabled and service_id in web_servers:
        other = next(
            (
                candidate
                for candidate in web_servers
                if candidate != service_id and startup_enabled(candidate)
            ),
            None,
        )
        if other:
            warning = (
                f"{service_id.title()} and {other.title()} are both enabled for startup. "
                "Only one web server can own ports 80 and 443."
            )
    if enabled and service_id in {"mysql", "mariadb"}:
        other = "mariadb" if service_id == "mysql" else "mysql"
        if startup_enabled(other) and _configured_service_port(service_id) == _configured_service_port(other):
            port = _configured_service_port(service_id)
            warning = (
                f"{service_id.title()} and {other.title()} are both enabled for startup "
                f"and both use port {port}. Choose different database ports before enabling both."
            )
    return {"service": service_id, "version": selected_version, "enabled": enabled, "warning": warning}


@router.get("/composer/terminal")
def composer_terminal_access(user=Depends(require_user)):
    ensure_composer_launcher()
    marker = service_root("composer") / ".terminal-enabled"
    return {"enabled": marker.exists(), "path": str(composer_path()), "php_version": composer_php_version()}


@router.put("/composer/terminal")
def update_composer_terminal_access(payload: dict, user=Depends(require_user)):
    ensure_composer_launcher()
    marker = service_root("composer") / ".terminal-enabled"
    old_marker = service_root("composer") / ".terminal-disabled"
    enabled = bool(payload.get("enabled", False))
    php_version = str(payload.get("php_version") or "").strip()
    if php_version and not php_cli_path(php_version).exists():
        raise HTTPException(status_code=400, detail=f"PHP {php_version} is not installed or its CLI is unavailable.")
    marker.parent.mkdir(parents=True, exist_ok=True)
    if enabled:
        marker.write_text("enabled\n")
        old_marker.unlink(missing_ok=True)
    else:
        marker.unlink(missing_ok=True)
        old_marker.unlink(missing_ok=True)
    if php_version:
        selected_marker = service_root("composer") / ".serverengine-php-version"
        selected_marker.write_text(php_version + "\n")
        ensure_composer_launcher()
    return {"enabled": enabled, "path": str(composer_path()), "php_version": composer_php_version()}


@router.get("/composer/versions")
def composer_versions(user=Depends(require_user)):
    versions_root = service_root("composer") / "versions"
    versions = []
    for root in sorted(versions_root.iterdir(), key=lambda item: version_sort_key(item.name), reverse=True) if versions_root.exists() else []:
        launcher = root / "bin/composer"
        if not launcher.exists():
            continue
        marker = root / ".serverengine-version"
        versions.append({"version": marker.read_text(errors="replace").strip() if marker.exists() else root.name, "path": str(launcher)})
    return versions


def _php_extension_state(version: str) -> list[dict]:
    from app.services.service_runtime import php_fpm_paths

    ini = php_fpm_paths(version)["ini"]
    content = ini.read_text(errors="replace") if ini.exists() else ""
    root = service_root("php", version)
    module_files = []
    for module_root in (
        root / "usr/lib/php",
        root / "lib/php",
        root / "lib64/php",
    ):
        if module_root.exists():
            module_files.extend(module_root.rglob("*.so"))

    loaded = set()
    cli = php_cli_path(version)
    if cli.exists():
        try:
            result = subprocess.run(
                [str(cli), "-n", "-m"],
                capture_output=True,
                text=True,
                check=False,
                timeout=5,
                env={**os.environ, "LD_LIBRARY_PATH": ":".join(
                    str(path)
                    for path in (root / "lib", root / "lib64", root / "usr/lib")
                    if path.exists()
                )},
            )
            loaded = {
                line.strip().lower()
                for line in result.stdout.splitlines()
                if line.strip() and not line.startswith("[")
            }
        except (OSError, subprocess.SubprocessError):
            pass

    result = []
    root = service_root("php", version)
    for extension in PHP_EXTENSIONS:
        names = PHP_BASELINE_MODULES.get(extension["id"], (extension["id"],))
        module = next(
            (
                candidate
                for name in names
                for candidate in module_files
                if candidate.name == f"{name}.so"
            ),
            None,
        )
        loaded_name = next((name.lower() for name in names if name.lower() in loaded), None)
        result.append(
            {
                **extension,
                "installed": bool(module or loaded_name),
                "enabled": bool(loaded_name or (module and str(module) in content)),
                "module_path": str(module) if module else None,
            }
        )
    return result


def _php_install_method(version: str) -> str | None:
    root = service_root("php", version)
    marker = root / ".serverengine-install-method"
    if not marker.exists():
        # Older installs predate the marker. Debian packages place PHP under
        # usr/, while source builds install into the version prefix directly.
        if (root / "bin/php").exists() or (root / "sbin/php-fpm").exists():
            return "source"
        if list(root.glob("usr/bin/php*")) or list(root.glob("usr/sbin/php-fpm*")):
            return "prebuilt"
        return None
    value = marker.read_text(errors="replace").strip()
    return value if value in {"prebuilt", "source"} else None


@router.get("/php/runtime-options")
def php_runtime_options(user=Depends(require_user)):
    """Return only the fields needed by website PHP-FPM selectors.

    The full runtime endpoint inspects every extension and is intentionally
    reserved for the PHP runtimes page. Website forms should not trigger that
    expensive inspection just to render a version dropdown.
    """
    global _php_runtime_options_cache
    with _inventory_cache_lock:
        if _php_runtime_options_cache is not None:
            return _php_runtime_options_cache
    versions_root = service_root("php") / "versions"
    if not versions_root.is_dir():
        return []
    result = []
    for root in sorted((item for item in versions_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True):
        cli = next((candidate for candidate in (root / "usr/bin/php", root / "bin/php") if candidate.is_file()), None)
        fpm = next((candidate for directory in (root / "usr/sbin", root / "sbin") for candidate in directory.glob("php-fpm*") if candidate.is_file()), None)
        if cli is None and fpm is None:
            continue
        marker = root / ".serverengine-version"
        version = marker.read_text(errors="replace").strip() if marker.exists() else root.name
        result.append({
            "version": version,
            "installed": True,
            "status": "running" if _process_running("php", root.name) else "stopped",
            "socket_path": str(root / "run/php-fpm.sock"),
        })
    with _inventory_cache_lock:
        _php_runtime_options_cache = result
    return result


@router.get("/php/runtimes")
def php_runtimes(user=Depends(require_user)):
    global _php_runtimes_cache
    with _inventory_cache_lock:
        if _php_runtimes_cache is not None:
            return _php_runtimes_cache
    detected = {item.version: item for item in installed(user) if item.id.startswith("php@") and item.version}
    for installed_version in detected:
        ensure_php_fpm_layout(installed_version)
        enable_php_baseline_extensions(installed_version)
        ensure_php_runtime_launcher(installed_version)
    result = [
        {
            "version": version,
            "channel": "installed",
            "supported": True,
            "installed": True,
            "install_method": _php_install_method(version),
            "status": item.status,
            "config_path": str(service_root("php", version) / "conf/php-fpm.conf"),
            "socket_path": str(service_root("php", version) / "run/php-fpm.sock"),
            "binary_path": str(binary_path("php", version)),
            "fpm_path": str(binary_path("php", version)),
            "cli_path": str(php_cli_path(version)) if php_cli_path(version).exists() else None,
            "extensions": _php_extension_state(version),
        }
        for version, item in sorted(detected.items(), key=lambda entry: version_sort_key(entry[0]), reverse=True)
    ]
    with _inventory_cache_lock:
        _php_runtimes_cache = result
    return result


def render_php_runtime_info(version: str, user) -> HTMLResponse:
    """Render phpinfo() for one installed managed PHP runtime."""
    root = service_root("php", version)
    cli = php_cli_path(version)
    if not root.exists() or not cli.exists():
        raise HTTPException(status_code=404, detail=f"PHP {version} is not installed")
    ini = root / "conf/php.ini"
    environment = {
        "HOME": str(root / "home/serverengine"),
        "PATH": f"{root / 'usr/bin'}:{root / 'bin'}:/usr/bin:/bin",
        "PHP_INI_SCAN_DIR": str(root / "conf/conf.d"),
        "LD_LIBRARY_PATH": php_runtime_library_path(root),
        "TMPDIR": str(root / "tmp"),
    }
    command = [str(cli), "-c", str(ini), "-r", "phpinfo();"]
    runuser = shutil.which("runuser")
    if os.geteuid() == 0 and runuser:
        command = [runuser, "-u", "serverengine", "--", *command]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
            env=environment,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise HTTPException(status_code=500, detail=f"Unable to run PHP {version} info: {error}") from error
    output = result.stdout or result.stderr
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=output.strip() or f"PHP {version} info failed")
    if "<html" not in output.lower():
        from html import escape

        # PHP-FPM/CLI builds do not always include php-cgi, so phpinfo() can
        # only emit CLI text. Keep the full output, but present it with the
        # familiar phpinfo browser styling instead of an unformatted dump.
        output = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PHP {escape(version)} information</title>
<style>
html {{ background:#f1f5f9; }}
body {{ margin:0; padding:24px; color:#1e293b; background:#f1f5f9; font:14px/1.5 Arial,Helvetica,sans-serif; }}
main {{ max-width:1180px; margin:0 auto; overflow:hidden; border:1px solid #cbd5e1; border-radius:8px; background:#fff; box-shadow:0 8px 24px rgba(15,23,42,.08); }}
header {{ padding:18px 22px; color:#fff; background:#4f81bd; }}
h1 {{ margin:0; font-size:22px; font-weight:600; }}
.runtime {{ margin-top:4px; opacity:.9; font-size:13px; }}
pre {{ margin:0; padding:22px; overflow:auto; color:#334155; background:#fff; font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; white-space:pre-wrap; overflow-wrap:anywhere; }}
@media (max-width:640px) {{ body {{ padding:0; }} main {{ border:0; border-radius:0; }} }}
</style>
</head>
<body><main><header><h1>PHP {escape(version)} information</h1><div class="runtime">Server Engine managed PHP runtime</div></header><pre>{escape(output)}</pre></main></body>
</html>"""
    return HTMLResponse(output, headers={"X-Content-Type-Options": "nosniff"})


@router.get("/php/versions/info", response_class=HTMLResponse)
def php_runtime_info(version: str = Query(..., min_length=3, max_length=20, pattern=r"^\d+\.\d+(?:\.\d+)?$"), user=Depends(require_user)):
    return render_php_runtime_info(version, user)


@router.get("/php/{version}/terminal")
def php_terminal_access(version: str, user=Depends(require_user)):
    root = service_root("php", version)
    if not php_cli_path(version).exists():
        raise HTTPException(status_code=404, detail="That PHP CLI version is not installed")
    return {"version": version, "enabled": (root / ".terminal-enabled").exists(), "path": str(php_cli_path(version))}


@router.put("/php/{version}/terminal")
def update_php_terminal_access(version: str, payload: dict, user=Depends(require_user)):
    root = service_root("php", version)
    if not php_cli_path(version).exists():
        raise HTTPException(status_code=404, detail="That PHP CLI version is not installed")
    marker = root / ".terminal-enabled"
    enabled = bool(payload.get("enabled", False))
    if enabled:
        ensure_php_fpm_layout(version)
        ensure_php_terminal_launcher(version)
        marker.write_text("enabled\n")
    else:
        marker.unlink(missing_ok=True)
    return {"version": version, "enabled": enabled, "path": str(php_cli_path(version))}


@router.get("/php/{version}/extensions")
def php_extensions(version: str, user=Depends(require_user)):
    if not binary_path("php", version).exists():
        raise HTTPException(status_code=404, detail="That PHP-FPM version is not installed")
    return {"version": version, "extensions": _php_extension_state(version)}


@router.post("/php/{version}/extensions/install", status_code=status.HTTP_202_ACCEPTED)
def install_php_extension(version: str, payload: ExtensionInstallRequest, user=Depends(require_user)):
    if not binary_path("php", version).exists():
        raise HTTPException(status_code=404, detail="That PHP-FPM version is not installed")
    extension = next((item for item in PHP_EXTENSIONS if item["id"] == payload.extension), None)
    if not extension:
        raise HTTPException(status_code=400, detail="Extension is not supported by this provider")
    if not payload.confirmed:
        return {"status": "confirmation_required", "version": version, "extension": extension}
    job_id = f"extension-php-{version}-{payload.extension}"
    existing = next((job for job in job_store.list() if job.id == job_id), None)
    if existing and existing.status not in {"succeeded", "failed", "cancelled"}:
        return {"status": "queued", "job_id": job_id, "message": f"PHP {version} extension {payload.extension} is already queued."}
    job_store.enqueue_extension(job_id, version, payload.extension)
    return {"status": "queued", "job_id": job_id, "message": f"PHP {version} extension {payload.extension} queued."}


@router.delete("/php/{version}", status_code=status.HTTP_202_ACCEPTED)
def uninstall_php(version: str, user=Depends(require_user)):
    if not binary_path("php", version).exists():
        raise HTTPException(status_code=404, detail="That PHP-FPM version is not installed")
    job_id = f"uninstall-php-{version}"
    job_store.enqueue_action(job_id, "php", "uninstall", version)
    return {"status": "queued", "job_id": job_id, "message": f"PHP-FPM {version} uninstall queued."}


@router.delete("/nodejs/{version}", status_code=status.HTTP_202_ACCEPTED)
def uninstall_node(version: str, user=Depends(require_user)):
    if not binary_path("nodejs", version).exists():
        raise HTTPException(status_code=404, detail="That Node.js runtime is not installed")
    job_id = f"uninstall-nodejs-{version}"
    job_store.enqueue_action(job_id, "nodejs", "uninstall", version)
    return {"status": "queued", "job_id": job_id, "message": f"Node.js {version} uninstall queued."}


@router.get("/catalog", response_model=list[ServiceDefinition])
def catalog(user=Depends(require_user)):
    return CATALOG


@router.post("/{service_id}/versions/refresh")
def refresh_versions(service_id: str, install_method: str = Query(default="source", pattern="^(prebuilt|source)$"), user=Depends(require_user)):
    try:
        if service_id == "phpmyadmin":
            definition = get_service(service_id)
            return {
                "service": definition,
                "versions": definition.versions if definition else [],
                "source": "phpmyadmin-release-catalog",
                "message": "Fetched the pinned phpMyAdmin release catalog.",
            }
        definition, source, message = refresh_service_versions(service_id, force=True, install_method=install_method)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {
        "service": definition,
        "versions": definition.versions,
        "source": source,
        "message": message,
    }


@router.get("/apache/versions")
def apache_versions(user=Depends(require_user)):
    """List every managed Apache version and identify the active default."""
    base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "apache"
    active_marker = base / ".serverengine-active-version"
    active = active_marker.read_text(errors="replace").strip() if active_marker.exists() else None
    values = []
    versions_root = base / "versions"
    if versions_root.exists():
        for version_root in sorted((item for item in versions_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True):
            binary = version_root / "bin/httpd"
            if not binary.exists():
                continue
            marker = version_root / ".serverengine-version"
            version = marker.read_text(errors="replace").strip() if marker.exists() else version_root.name
            method_marker = version_root / ".serverengine-install-method"
            method = method_marker.read_text(errors="replace").strip() if method_marker.exists() else "source"
            values.append({"version": version, "path": str(version_root), "install_method": method, "active": active == version, "status": "running" if active == version and _process_running("apache") else "stopped"})
    legacy_binary = next(
        (candidate for candidate in (base / "bin/httpd", base / "usr/sbin/apache2") if candidate.exists()),
        base / "bin/httpd",
    )
    if legacy_binary.exists() and not values:
        marker = base / ".serverengine-version"
        version = marker.read_text(errors="replace").strip() if marker.exists() else "unknown"
        method_marker = base / ".serverengine-install-method"
        method = method_marker.read_text(errors="replace").strip() if method_marker.exists() else "source"
        values.append({"version": version, "path": str(base), "install_method": method, "active": True, "status": "running" if _process_running("apache") else "stopped"})
    return {"active_version": active or (values[0]["version"] if values else None), "versions": values}


@router.get("/nginx/versions")
def nginx_versions(user=Depends(require_user)):
    """List every managed Nginx version and identify the active default."""
    base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "nginx"
    active_marker = base / ".serverengine-active-version"
    active = active_marker.read_text(errors="replace").strip() if active_marker.exists() else None
    values = []
    versions_root = base / "versions"
    if versions_root.exists():
        for version_root in sorted((item for item in versions_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True):
            binary = next((candidate for candidate in (version_root / "bin/nginx", version_root / "usr/sbin/nginx") if candidate.exists()), None)
            if not binary:
                continue
            marker = version_root / ".serverengine-version"
            version = marker.read_text(errors="replace").strip() if marker.exists() else version_root.name
            method_marker = version_root / ".serverengine-install-method"
            method = method_marker.read_text(errors="replace").strip() if method_marker.exists() else "source"
            values.append({"version": version, "path": str(version_root), "install_method": method, "active": active == version, "status": "running" if active == version and _process_running("nginx") else "stopped"})
    legacy_binary = next((candidate for candidate in (base / "bin/nginx", base / "usr/sbin/nginx") if candidate.exists()), None)
    if legacy_binary and not values:
        marker = base / ".serverengine-version"
        version = marker.read_text(errors="replace").strip() if marker.exists() else "unknown"
        method_marker = base / ".serverengine-install-method"
        method = method_marker.read_text(errors="replace").strip() if method_marker.exists() else "source"
        values.append({"version": version, "path": str(base), "install_method": method, "active": True, "status": "running" if _process_running("nginx") else "stopped"})
    return {"active_version": active or (values[0]["version"] if values else None), "versions": values}


@router.put("/nginx/default")
def set_nginx_default(payload: dict, user=Depends(require_user)):
    version = str(payload.get("version") or "").strip()
    base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "nginx"
    target = base / "versions" / version
    if not any((target / candidate).exists() for candidate in ("bin/nginx", "usr/sbin/nginx")):
        raise HTTPException(status_code=404, detail="That Nginx version is not installed")
    current = service_root("nginx")
    if current != target and _process_running("nginx"):
        raise HTTPException(status_code=409, detail="Stop the running Nginx version before changing the default version.")
    (base / ".serverengine-active-version").write_text(version + "\n")
    return {"active_version": version, "message": f"Nginx {version} is now the default runtime."}


@router.get("/mysql/versions")
def mysql_versions(user=Depends(require_user)):
    """List every managed MySQL version and identify the active default."""
    base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "mysql"
    active_marker = base / ".serverengine-active-version"
    active = active_marker.read_text(errors="replace").strip() if active_marker.exists() else None
    values = []
    versions_root = base / "versions"
    if versions_root.exists():
        for version_root in sorted(
            (item for item in versions_root.iterdir() if item.is_dir()),
            key=lambda item: version_sort_key(item.name),
            reverse=True,
        ):
            binary = next(
                (candidate for candidate in (version_root / "bin/mysqld", version_root / "usr/sbin/mysqld") if candidate.exists()),
                None,
            )
            if not binary:
                continue
            marker = version_root / ".serverengine-version"
            version = marker.read_text(errors="replace").strip() if marker.exists() else version_root.name
            method_marker = version_root / ".serverengine-install-method"
            method = method_marker.read_text(errors="replace").strip() if method_marker.exists() else "source"
            values.append({
                "version": version,
                "path": str(version_root),
                "install_method": method,
                "active": active == version,
                "status": "running" if active == version and _process_running("mysql") else "stopped",
            })
    legacy_binary = next(
        (candidate for candidate in (base / "bin/mysqld", base / "usr/sbin/mysqld") if candidate.exists()),
        None,
    )
    if legacy_binary and not values:
        marker = base / ".serverengine-version"
        version = marker.read_text(errors="replace").strip() if marker.exists() else "unknown"
        method_marker = base / ".serverengine-install-method"
        method = method_marker.read_text(errors="replace").strip() if method_marker.exists() else "source"
        values.append({
            "version": version,
            "path": str(base),
            "install_method": method,
            "active": True,
            "status": "running" if _process_running("mysql") else "stopped",
        })
    return {"active_version": active or (values[0]["version"] if values else None), "versions": values}


@router.put("/mysql/default")
def set_mysql_default(payload: dict, user=Depends(require_user)):
    version = str(payload.get("version") or "").strip()
    base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "mysql"
    target = base / "versions" / version
    if not any((target / candidate).exists() for candidate in ("bin/mysqld", "usr/sbin/mysqld")):
        raise HTTPException(status_code=404, detail="That MySQL version is not installed")
    current = service_root("mysql")
    if current != target and _process_running("mysql"):
        raise HTTPException(status_code=409, detail="Stop the running MySQL version before changing the default version.")
    (base / ".serverengine-active-version").write_text(version + "\n")
    return {"active_version": version, "message": f"MySQL {version} is now the default runtime."}


@router.get("/nginx/settings")
def nginx_settings(user=Depends(require_user)):
    return {
        "http_port": website_service.nginx_http_port(),
        "default_website_id": website_service.nginx_default_website_id(),
        "websites": [{"id": site.id, "domain": site.domain} for site in website_service.list_without_nginx_guard()],
    }


@router.put("/nginx/settings")
def save_nginx_settings(payload: dict, user=Depends(require_user)):
    try:
        port = int(payload.get("http_port", 80))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Nginx HTTP port must be a number")
    default_website_id = str(payload.get("default_website_id") or "").strip()
    saved = website_service.set_nginx_http_port(port)
    website_service.set_nginx_default_website(default_website_id)
    return {
        "saved": True,
        "http_port": saved,
        "default_website_id": default_website_id,
        "message": "Nginx settings saved. Unknown hosts are rejected unless a default website is selected.",
    }


@router.put("/apache/default")
def set_apache_default(payload: dict, user=Depends(require_user)):
    version = str(payload.get("version") or "").strip()
    base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "apache"
    target = base / "versions" / version
    if not (target / "bin/httpd").exists():
        raise HTTPException(status_code=404, detail="That Apache version is not installed")
    current = service_root("apache")
    if current != target and _process_running("apache"):
        raise HTTPException(status_code=409, detail="Stop the running Apache version before changing the default version.")
    (base / ".serverengine-active-version").write_text(version + "\n")
    return {"active_version": version, "message": f"Apache {version} is now the default runtime."}


@router.get("/redis/versions")
def redis_versions(user=Depends(require_user)):
    """List managed Redis runtimes and identify the active default."""
    base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "redis"
    active_marker = base / ".serverengine-active-version"
    active = active_marker.read_text(errors="replace").strip() if active_marker.exists() else None
    values = []
    versions_root = base / "versions"
    if versions_root.exists():
        for version_root in sorted((item for item in versions_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True):
            binary = version_root / "usr/bin/redis-server"
            if not binary.exists():
                continue
            marker = version_root / ".serverengine-version"
            version = marker.read_text(errors="replace").strip() if marker.exists() else version_root.name
            method_marker = version_root / ".serverengine-install-method"
            method = method_marker.read_text(errors="replace").strip() if method_marker.exists() else "source"
            values.append({"version": version, "path": str(version_root), "install_method": method, "active": active == version, "status": "running" if active == version and _process_running("redis") else "stopped"})
    legacy_binary = binary_path("redis")
    if legacy_binary.exists() and not values:
        marker = base / ".serverengine-version"
        version = marker.read_text(errors="replace").strip() if marker.exists() else "unknown"
        method_marker = base / ".serverengine-install-method"
        method = method_marker.read_text(errors="replace").strip() if method_marker.exists() else "source"
        values.append({"version": version, "path": str(base), "install_method": method, "active": True, "status": "running" if _process_running("redis") else "stopped"})
    return {"active_version": active or (values[0]["version"] if values else None), "versions": values}


@router.put("/redis/default")
def set_redis_default(payload: dict, user=Depends(require_user)):
    version = str(payload.get("version") or "").strip()
    base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "redis"
    target = base / "versions" / version
    if not (target / "usr/bin/redis-server").exists():
        raise HTTPException(status_code=404, detail="That Redis version is not installed")
    if service_root("redis") != target and _process_running("redis"):
        raise HTTPException(status_code=409, detail="Stop the running Redis version before changing the default version.")
    (base / ".serverengine-active-version").write_text(version + "\n")
    return {"active_version": version, "message": f"Redis {version} is now the default runtime."}


@router.get("/caddy/versions")
def caddy_versions(user=Depends(require_user)):
    """List managed Caddy runtimes and identify the active default."""
    base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "caddy"
    active_marker = base / ".serverengine-active-version"
    active = active_marker.read_text(errors="replace").strip() if active_marker.exists() else None
    values = []
    versions_root = base / "versions"
    if versions_root.exists():
        for version_root in sorted((item for item in versions_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True):
            binary = next((candidate for candidate in (version_root / "bin/caddy", version_root / "usr/bin/caddy") if candidate.exists()), version_root / "bin/caddy")
            if not binary.exists():
                continue
            marker = version_root / ".serverengine-version"
            version = marker.read_text(errors="replace").strip() if marker.exists() else version_root.name
            method_marker = version_root / ".serverengine-install-method"
            method = method_marker.read_text(errors="replace").strip() if method_marker.exists() else "source"
            values.append({"version": version, "path": str(version_root), "install_method": method, "active": active == version, "status": "running" if active == version and _process_running("caddy") else "stopped"})
    legacy_binary = next((candidate for candidate in (base / "bin/caddy", base / "usr/bin/caddy") if candidate.exists()), base / "bin/caddy")
    if legacy_binary.exists() and not values:
        marker = base / ".serverengine-version"
        version = marker.read_text(errors="replace").strip() if marker.exists() else "unknown"
        method_marker = base / ".serverengine-install-method"
        method = method_marker.read_text(errors="replace").strip() if method_marker.exists() else "source"
        values.append({"version": version, "path": str(base), "install_method": method, "active": True, "status": "running" if _process_running("caddy") else "stopped"})
    return {"active_version": active or (values[0]["version"] if values else None), "versions": values}


@router.put("/caddy/default")
def set_caddy_default(payload: dict, user=Depends(require_user)):
    version = str(payload.get("version") or "").strip()
    base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "caddy"
    target = base / "versions" / version
    if not (target / "bin/caddy").exists():
        raise HTTPException(status_code=404, detail="That Caddy version is not installed")
    if service_root("caddy") != target and _process_running("caddy"):
        raise HTTPException(status_code=409, detail="Stop the running Caddy version before changing the default version.")
    (base / ".serverengine-active-version").write_text(version + "\n")
    return {"active_version": version, "message": f"Caddy {version} is now the default runtime."}


@router.get("/installed", response_model=list[InstalledService])
def installed(user=Depends(require_user)):
    global _installed_services_cache
    with _inventory_cache_lock:
        if _installed_services_cache is not None:
            return _installed_services_cache
    detected = [InstalledService(id="server-engine", name="Server Engine", version="0.1.0", status="running", managed=True)]
    phpmyadmin_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "phpmyadmin"
    phpmyadmin_marker = phpmyadmin_root / ".serverengine-version"
    if phpmyadmin_marker.exists() and (phpmyadmin_root / "index.php").exists():
        definition = get_service("phpmyadmin")
        detected.append(InstalledService(
            id="phpmyadmin",
            name=definition.name if definition else "phpMyAdmin",
            version=phpmyadmin_marker.read_text(errors="replace").strip() or "unknown",
            status="running" if _process_running("phpmyadmin") else "stopped",
            port=2525,
            managed=False,
        ))
    sqlserver_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "sqlserver"
    sqlserver_marker = sqlserver_root / ".serverengine-version"
    if sqlserver_marker.exists() and shutil.which("docker"):
        sqlserver_version = sqlserver_marker.read_text(errors="replace").strip() or "unknown"
        sqlserver_running = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Running}}", "server-engine-sqlserver"],
            capture_output=True,
            text=True,
            check=False,
        )
        definition = get_service("sqlserver")
        detected.append(InstalledService(
            id="sqlserver",
            name=definition.name if definition else "Microsoft SQL Server",
            version=sqlserver_version,
            status="running" if sqlserver_running.returncode == 0 and sqlserver_running.stdout.strip() == "true" else "stopped",
            port=1433,
            managed=False,
        ))
    openssl_versions = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "openssl" / "versions"
    if openssl_versions.exists():
        definition = get_service("openssl")
        for version_root in sorted((item for item in openssl_versions.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True):
            marker = version_root / ".serverengine-version"
            if marker.exists() and (version_root / "lib/libssl.a").exists():
                detected.append(InstalledService(id=f"openssl@{version_root.name}", name=f"{definition.name if definition else 'OpenSSL'} {version_root.name}", version=marker.read_text(errors="replace").strip(), status="installed", managed=False))
    packages = SERVICE_PACKAGES
    for service_id, package in packages.items():
        if service_id == "powerdns":
            powerdns_root = service_root("powerdns")
            marker = powerdns_root / ".serverengine-version"
            binary = binary_path("powerdns")
            version = marker.read_text(errors="replace").strip() if marker.exists() else None
            if not version or not binary.exists():
                version = _installed_package_version(package)
            if version is not None:
                definition = get_service(service_id)
                # Detect the managed binary path, matching the other isolated
                # services. The process name is not reliable when PowerDNS is
                # launched through a versioned or staged runtime path.
                running = _process_running("powerdns")
                detected.append(InstalledService(id=service_id, name=definition.name if definition else service_id, version=version, status="running" if running else "stopped", port=53, managed=False))
            continue
        if service_id == "docker":
            version_result = subprocess.run(["docker", "--version"], capture_output=True, text=True, check=False) if shutil.which("docker") else None
            if version_result and version_result.returncode == 0:
                match = re.search(r"Docker version\s+([^,\s]+)", version_result.stdout)
                version = match.group(1) if match else version_result.stdout.strip()
                running = subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode == 0
                definition = get_service(service_id)
                detected.append(InstalledService(id=service_id, name=definition.name if definition else "Docker Engine", version=version, status="running" if running else "installed", managed=False))
            continue
        if service_id == "php":
            php_root = service_root("php") / "versions"
            if php_root.exists():
                for version_root in sorted(item for item in php_root.iterdir() if item.is_dir()):
                    version_root, detected_version = normalize_php_runtime_layout(version_root)
                    version = detected_version or _installed_service_version("php", package, version_root.name)
                    if version is not None:
                        definition = get_service("php")
                        running = _process_running("php", version_root.name)
                        detected.append(InstalledService(id=f"php@{version_root.name}", name=f"{definition.name} {version_root.name}", version=version, status="running" if running else "stopped", managed=False))
            continue
        if service_id == "nodejs":
            versions_root = service_root("nodejs") / "versions"
            if versions_root.exists():
                for version_root in sorted(item for item in versions_root.iterdir() if item.is_dir()):
                    ensure_node_runtime(version_root)
                    version = _installed_service_version("nodejs", package, version_root.name)
                    if version is not None:
                        detected.append(InstalledService(id=f"nodejs@{version_root.name}", name=f"Node.js {version_root.name}", version=version, status="stopped", managed=False))
            ensure_node_runtime(service_root("nodejs"))
            continue
        if service_id == "pm2":
            versions_root = service_root("pm2") / "versions"
            if versions_root.exists():
                definition = get_service(service_id)
                for version_root in sorted((item for item in versions_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True):
                    marker = version_root / ".serverengine-version"
                    launcher = version_root / "bin/pm2"
                    if not launcher.exists():
                        launcher = version_root / "node_modules/.bin/pm2"
                    if launcher.exists():
                        version = marker.read_text(errors="replace").strip() if marker.exists() else version_root.name
                        detected.append(InstalledService(id="pm2", name=definition.name if definition else "PM2", version=version, status="installed", managed=False))
            continue
        if service_id == "python":
            versions_root = service_root("python") / "versions"
            if versions_root.exists():
                for version_root in sorted(item for item in versions_root.iterdir() if item.is_dir()):
                    version = _installed_service_version("python", package, version_root.name)
                    if version is not None:
                        detected.append(InstalledService(id=f"python@{version_root.name}", name=f"Python {version_root.name}", version=version_root.name, status="installed", managed=False))
            continue
        if service_id == "apache":
            apache_base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "apache"
            active_marker = apache_base / ".serverengine-active-version"
            active = active_marker.read_text(errors="replace").strip() if active_marker.exists() else None
            versions_root = apache_base / "versions"
            found = False
            if versions_root.exists():
                definition = get_service(service_id)
                for version_root in sorted((item for item in versions_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True):
                    binary = version_root / "bin/httpd"
                    if not binary.exists():
                        continue
                    found = True
                    marker = version_root / ".serverengine-version"
                    version = marker.read_text(errors="replace").strip() if marker.exists() else version_root.name
                    detected.append(InstalledService(id="apache", name=definition.name if definition else "Apache HTTP Server", version=version, status="running" if active == version and _process_running("apache") else "stopped", managed=False))
            if found:
                continue
        if service_id == "caddy":
            caddy_base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "caddy"
            active_marker = caddy_base / ".serverengine-active-version"
            active = active_marker.read_text(errors="replace").strip() if active_marker.exists() else None
            versions_root = caddy_base / "versions"
            found = False
            if versions_root.exists():
                definition = get_service(service_id)
                for version_root in sorted((item for item in versions_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True):
                    if not any((version_root / path).exists() for path in ("bin/caddy", "usr/bin/caddy")):
                        continue
                    found = True
                    marker = version_root / ".serverengine-version"
                    version = marker.read_text(errors="replace").strip() if marker.exists() else version_root.name
                    detected.append(InstalledService(id="caddy", name=definition.name if definition else "Caddy", version=version, status="running" if active == version and _process_running("caddy") else "stopped", managed=False))
            if found:
                continue
        if service_id == "redis":
            redis_base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "redis"
            active_marker = redis_base / ".serverengine-active-version"
            active = active_marker.read_text(errors="replace").strip() if active_marker.exists() else None
            versions_root = redis_base / "versions"
            found = False
            if versions_root.exists():
                definition = get_service(service_id)
                for version_root in sorted((item for item in versions_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True):
                    if not (version_root / "usr/bin/redis-server").exists():
                        continue
                    found = True
                    marker = version_root / ".serverengine-version"
                    version = marker.read_text(errors="replace").strip() if marker.exists() else version_root.name
                    detected.append(InstalledService(id="redis", name=definition.name if definition else "Redis", version=version, status="running" if active == version and _process_running("redis") else "stopped", managed=False))
            if found:
                continue
        version = _installed_service_version(service_id, package)
        if version is None:
            continue
        definition = get_service(service_id)
        process_name = service_id
        running = _process_running(process_name)
        status = "installed" if service_id in NON_DAEMON_SERVICES else "running" if running else "stopped"
        detected.append(InstalledService(id=service_id, name=definition.name if definition else service_id, version=version, status=status, managed=False))
    composer_root = service_root("composer") / "versions"
    if composer_root.exists() and composer_path().exists():
        version_root = composer_path().parents[1]
        marker = version_root / ".serverengine-version"
        version = marker.read_text().strip() if marker.exists() else version_root.name
        detected.append(InstalledService(id="composer", name="Composer", version=version, status="installed", managed=False))
    wp_cli_root = service_root("wp-cli") / "versions"
    if wp_cli_root.exists():
        definition = get_service("wp-cli")
        for version_root in sorted((item for item in wp_cli_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True):
            marker = version_root / ".serverengine-version"
            launcher = version_root / "bin/wp"
            if not launcher.exists():
                continue
            version = marker.read_text(errors="replace").strip() if marker.exists() else version_root.name
            detected.append(InstalledService(id="wp-cli", name=definition.name if definition else "WP-CLI", version=version, status="installed", managed=False))
    with _inventory_cache_lock:
        _installed_services_cache = detected
    return detected


@router.get("/docker/overview")
def docker_overview(user=Depends(require_user)):
    """Return live Docker Engine data without inventing local workloads."""
    docker = shutil.which("docker")
    if not docker:
        return {
            "installed": False,
            "running": False,
            "version": None,
            "containers": [],
            "images_list": [],
            "volumes_list": [],
            "networks_list": [],
            "compose_list": [],
            "images": 0,
            "volumes": 0,
            "networks": 0,
            "error": "Docker Engine is not installed or is not available to Server Engine.",
        }

    version_result = subprocess.run([docker, "--version"], capture_output=True, text=True, check=False)
    version_match = re.search(r"Docker version\s+([^,\s]+)", version_result.stdout or "")
    info_result = subprocess.run([docker, "info"], capture_output=True, text=True, check=False)
    if info_result.returncode != 0:
        return {
            "installed": True,
            "running": False,
            "version": version_match.group(1) if version_match else None,
            "containers": [],
            "images_list": [],
            "volumes_list": [],
            "networks_list": [],
            "compose_list": [],
            "images": 0,
            "volumes": 0,
            "networks": 0,
            "error": (info_result.stderr or "Docker Engine is installed but not running.").strip(),
        }

    def count(resource: str) -> int:
        result = subprocess.run([docker, resource, "ls", "-q"], capture_output=True, text=True, check=False)
        return len([line for line in result.stdout.splitlines() if line.strip()]) if result.returncode == 0 else 0

    container_result = subprocess.run(
        [docker, "ps", "-a", "--format", "{{json .}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    container_items = []
    for line in container_result.stdout.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        container_items.append(item)

    container_paths = {}
    container_ids = [item.get("ID", "") for item in container_items if item.get("ID")]
    if container_ids:
        inspect_result = subprocess.run(
            [docker, "inspect", "--format", "{{json .}}", *container_ids],
            capture_output=True,
            text=True,
            check=False,
        )
        for line in inspect_result.stdout.splitlines():
            try:
                inspected = json.loads(line)
            except json.JSONDecodeError:
                continue
            inspected_id = inspected.get("Id", "")
            bind_mounts = [
                mount.get("Source", "")
                for mount in inspected.get("Mounts", [])
                if mount.get("Type") == "bind" and mount.get("Source")
            ]
            container_path = bind_mounts[0] if bind_mounts else ""
            container_paths[inspected_id] = container_path
            container_paths[inspected_id[:12]] = container_path

    containers = []
    for item in container_items:
        status = item.get("Status", "")
        containers.append({
            "id": item.get("ID", ""),
            "name": item.get("Names", ""),
            "image": item.get("Image", ""),
            "path": container_paths.get(item.get("ID", ""), ""),
            "status": "Running" if status.lower().startswith("up") else "Stopped",
            "status_detail": status,
            "ports": item.get("Ports", "—") or "—",
        })
    containers.sort(key=lambda item: (item["name"].lower(), item["id"]))
    def parse_size(value: str) -> int:
        match = re.match(r"\s*([0-9.]+)\s*([kmgtpe]?i?b)?", value or "", re.IGNORECASE)
        if not match:
            return 0
        units = {"b": 1, "kb": 1000, "kib": 1024, "mb": 1000**2, "mib": 1024**2, "gb": 1000**3, "gib": 1024**3, "tb": 1000**4, "tib": 1024**4}
        return int(float(match.group(1)) * units.get((match.group(2) or "b").lower(), 1))

    stats_result = subprocess.run(
        [docker, "stats", "--no-stream", "--format", "{{json .}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    cpu_percent = 0.0
    memory_used = 0
    memory_limit = 0
    for line in stats_result.stdout.splitlines():
        try:
            stat = json.loads(line)
        except json.JSONDecodeError:
            continue
        try:
            cpu_percent += float(str(stat.get("CPUPerc", "0")).strip().rstrip("%"))
        except ValueError:
            pass
        memory_parts = str(stat.get("MemUsage", "")).split("/")
        if len(memory_parts) == 2:
            memory_used += parse_size(memory_parts[0])
            memory_limit += parse_size(memory_parts[1])
    image_result = subprocess.run(
        [docker, "image", "ls", "--format", "{{json .}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    images_list = []
    for line in image_result.stdout.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        images_list.append({
            "repository": item.get("Repository", "<none>"),
            "tag": item.get("Tag", "<none>"),
            "id": item.get("ID", ""),
            "created": item.get("CreatedSince", "—"),
            "size": item.get("Size", "—"),
        })
    volume_result = subprocess.run(
        [docker, "volume", "ls", "--format", "{{json .}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    volumes_list = []
    for line in volume_result.stdout.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        volume_name = item.get("Name", "")
        volume_details = subprocess.run([docker, "volume", "inspect", volume_name], capture_output=True, text=True, check=False)
        volume_inspect = {}
        if volume_details.returncode == 0:
            try:
                volume_inspect = json.loads(volume_details.stdout)[0]
            except (json.JSONDecodeError, IndexError):
                pass
        mountpoint = volume_inspect.get("Mountpoint") or ""
        size_result = subprocess.run(["du", "-sb", mountpoint], capture_output=True, text=True, check=False) if mountpoint else None
        size_bytes = 0
        if size_result and size_result.returncode == 0:
            try:
                size_bytes = int(size_result.stdout.split()[0])
            except (ValueError, IndexError):
                pass
        volumes_list.append({
            "name": volume_name,
            "driver": item.get("Driver", "local"),
            "scope": item.get("Scope", "local"),
            "created": volume_inspect.get("CreatedAt") or "—",
            "size": size_bytes,
        })
    network_result = subprocess.run(
        [docker, "network", "ls", "--format", "{{json .}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    networks_list = []
    for line in network_result.stdout.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        networks_list.append({
            "name": item.get("Name", ""),
            "driver": item.get("Driver", ""),
            "scope": item.get("Scope", "local"),
            "id": item.get("ID", ""),
        })
    compose_result = subprocess.run(
        [docker, "compose", "ls", "--format", "json"],
        capture_output=True,
        text=True,
        check=False,
    )
    compose_list = []
    if compose_result.returncode == 0:
        try:
            compose_items = json.loads(compose_result.stdout or "[]")
            if isinstance(compose_items, dict):
                compose_items = [compose_items]
            for item in compose_items:
                compose_list.append({
                    "name": item.get("Name", ""),
                    "status": item.get("Status", "Unknown"),
                    "services": item.get("ConfigFiles", "—"),
                    "config": item.get("ConfigFiles", "—"),
                })
        except json.JSONDecodeError:
            pass
    return {
        "installed": True,
        "running": True,
        "version": version_match.group(1) if version_match else None,
        "containers": containers,
        "images_list": images_list,
        "volumes_list": volumes_list,
        "networks_list": networks_list,
        "compose_list": compose_list,
        "images": count("image"),
        "volumes": count("volume"),
        "networks": count("network"),
        "cpu_percent": round(cpu_percent, 2),
        "cpu_limit_percent": (os.cpu_count() or 1) * 100,
        "memory_used_bytes": memory_used,
        "memory_limit_bytes": memory_limit,
        "error": None,
    }


@router.post("/docker/compose")
def create_docker_compose(payload: dict, user=Depends(require_user)):
    docker = shutil.which("docker")
    if not docker:
        raise HTTPException(409, "Docker Engine is not installed or available.")
    project_name = str(payload.get("project_name") or "").strip()
    filename = str(payload.get("filename") or "compose.yml").strip()
    content = str(payload.get("content") or "")
    if not re.fullmatch(r"[A-Za-z0-9]{1,64}", project_name):
        raise HTTPException(422, "Project name must contain only letters and numbers.")
    if filename not in {"compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"}:
        raise HTTPException(422, "Choose a supported Compose filename.")
    if not content.strip() or len(content) > 256 * 1024:
        raise HTTPException(422, "The Compose definition is empty or too large.")
    project_dir = Path(os.getenv("SE_COMPOSE_ROOT", "/server-engine/compose")) / project_name
    if project_dir.exists() and any(project_dir.iterdir()):
        raise HTTPException(409, f"Compose project directory already exists: {project_dir}")
    job_id = f"docker-compose-{project_name}-{uuid.uuid4().hex[:8]}"
    job = job_store.enqueue_docker_compose(job_id, project_dir, filename, content)
    return {"status": "queued", "job_id": job.id, "project_name": project_name, "project_dir": str(project_dir)}


@router.post("/docker/containers/{container_id}/action")
def docker_container_action(container_id: str, payload: dict, user=Depends(require_user)):
    docker = shutil.which("docker")
    action = str(payload.get("action") or "").lower()
    if not docker:
        raise HTTPException(409, "Docker Engine is not installed or available.")
    if action not in {"start", "stop", "restart", "pause", "delete"}:
        raise HTTPException(422, "Unsupported container action.")
    job_id = f"docker-{action}-{container_id[:12]}"
    job_store.enqueue_docker_action(job_id, container_id, action)
    return {"status": "queued", "job_id": job_id, "action": action, "container_id": container_id}


@router.get("/docker/containers/{container_id}")
def docker_container_details(container_id: str, user=Depends(require_user)):
    docker = shutil.which("docker")
    if not docker:
        raise HTTPException(409, "Docker Engine is not installed or available.")
    inspected = subprocess.run([docker, "inspect", "-s", container_id], capture_output=True, text=True, check=False)
    if inspected.returncode != 0:
        raise HTTPException(404, (inspected.stderr or "Container was not found.").strip())
    try:
        item = json.loads(inspected.stdout)[0]
    except (json.JSONDecodeError, IndexError):
        raise HTTPException(502, "Docker returned an invalid container description.")
    logs = subprocess.run([docker, "logs", "--tail", "200", container_id], capture_output=True, text=True, check=False)
    config = item.get("Config") or {}
    state = item.get("State") or {}
    host_config = item.get("HostConfig") or {}
    ports = item.get("NetworkSettings", {}).get("Ports") or {}
    return {
        "id": item.get("Id", "")[:12],
        "name": str(item.get("Name", "")).lstrip("/"),
        "image": config.get("Image", ""),
        "working_dir": config.get("WorkingDir") or "/",
        "size_rw": item.get("SizeRw") or 0,
        "size_rootfs": item.get("SizeRootFs") or 0,
        "status": state.get("Status", "unknown"),
        "started_at": state.get("StartedAt"),
        "ports": ports,
        "mounts": [{"source": mount.get("Source"), "destination": mount.get("Destination"), "mode": mount.get("Mode")} for mount in item.get("Mounts", [])],
        "restart_policy": (host_config.get("RestartPolicy") or {}).get("Name") or "no",
        "compose_yaml": _docker_compose_preview(item, config, host_config, ports),
        "logs": logs.stdout + logs.stderr,
    }


@router.get("/docker/images/{image_ref:path}")
def docker_image_details(image_ref: str, user=Depends(require_user)):
    docker = shutil.which("docker")
    if not docker:
        raise HTTPException(409, "Docker Engine is not installed or available.")
    inspected = subprocess.run([docker, "image", "inspect", image_ref], capture_output=True, text=True, check=False)
    if inspected.returncode:
        raise HTTPException(404, (inspected.stderr or "Docker image was not found.").strip())
    try:
        item = json.loads(inspected.stdout)[0]
    except (json.JSONDecodeError, IndexError):
        raise HTTPException(502, "Docker returned an invalid image description.")
    config = item.get("Config") or {}
    history_result = subprocess.run(
        [docker, "history", "--no-trunc", "--format", "{{json .}}", image_ref],
        capture_output=True,
        text=True,
        check=False,
    )
    layers = []
    for index, line in enumerate(history_result.stdout.splitlines()):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        layers.append({
            "index": index,
            "id": value.get("ID") or "",
            "command": value.get("CreatedBy") or "—",
            "size": value.get("Size") or "0 B",
            "created": value.get("CreatedSince") or value.get("CreatedAt") or "—",
        })
    return {
        "reference": image_ref,
        "id": str(item.get("Id") or "").replace("sha256:", "")[:12],
        "size": f"{round((item.get('Size') or 0) / 1024 / 1024, 1)} MB",
        "created_at": item.get("Created") or "",
        "os": item.get("Os") or "—",
        "architecture": item.get("Architecture") or "—",
        "layers": layers,
        "command": config.get("Cmd") or [],
        "entrypoint": config.get("Entrypoint") or [],
        "environment": config.get("Env") or [],
    }


@router.get("/docker/volumes/{volume_name}")
def docker_volume_details(volume_name: str, user=Depends(require_user)):
    docker = shutil.which("docker")
    if not docker:
        raise HTTPException(409, "Docker Engine is not installed or available.")
    inspected = subprocess.run([docker, "volume", "inspect", volume_name], capture_output=True, text=True, check=False)
    if inspected.returncode:
        raise HTTPException(404, (inspected.stderr or "Docker volume was not found.").strip())
    try:
        item = json.loads(inspected.stdout)[0]
    except (json.JSONDecodeError, IndexError):
        raise HTTPException(502, "Docker returned an invalid volume description.")
    mountpoint = item.get("Mountpoint") or ""
    size_result = subprocess.run(["du", "-sb", mountpoint], capture_output=True, text=True, check=False) if mountpoint else None
    size_bytes = 0
    if size_result and size_result.returncode == 0:
        try:
            size_bytes = int(size_result.stdout.split()[0])
        except (ValueError, IndexError):
            pass
    return {
        "kind": "volume",
        "name": item.get("Name") or volume_name,
        "driver": item.get("Driver") or "—",
        "scope": item.get("Scope") or "—",
        "mountpoint": mountpoint or "—",
        "created": item.get("CreatedAt") or "—",
        "size": size_bytes,
        "labels": item.get("Labels") or {},
        "options": item.get("Options") or {},
        "inspect": item,
    }


@router.post("/docker/volumes/{volume_name}/action")
def docker_volume_action(volume_name: str, payload: dict, user=Depends(require_user)):
    docker = shutil.which("docker")
    if not docker:
        raise HTTPException(409, "Docker Engine is not installed or available.")
    action = str(payload.get("action") or "").lower()
    if action == "delete":
        result = subprocess.run([docker, "volume", "rm", volume_name], capture_output=True, text=True, check=False)
        if result.returncode:
            raise HTTPException(409, (result.stderr or "Docker could not delete this volume.").strip())
        return {"status": "deleted", "name": volume_name}
    if action == "clone":
        clone_name = str(payload.get("clone_name") or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", clone_name):
            raise HTTPException(422, "Enter a valid volume name for the clone.")
        created = subprocess.run([docker, "volume", "create", clone_name], capture_output=True, text=True, check=False)
        if created.returncode:
            raise HTTPException(409, (created.stderr or "Docker could not create the clone volume.").strip())
        copy_result = subprocess.run(
            [docker, "run", "--rm", "-v", f"{volume_name}:/from:ro", "-v", f"{clone_name}:/to", "busybox:latest", "sh", "-c", "cp -a /from/. /to/"],
            capture_output=True,
            text=True,
            check=False,
        )
        if copy_result.returncode:
            subprocess.run([docker, "volume", "rm", clone_name], capture_output=True, text=True, check=False)
            raise HTTPException(409, (copy_result.stderr or "Docker could not copy the volume contents.").strip())
        return {"status": "cloned", "source": volume_name, "name": clone_name}
    raise HTTPException(422, "Unsupported Docker volume action.")


@router.get("/docker/networks/{network_name:path}")
def docker_network_details(network_name: str, user=Depends(require_user)):
    docker = shutil.which("docker")
    if not docker:
        raise HTTPException(409, "Docker Engine is not installed or available.")
    inspected = subprocess.run([docker, "network", "inspect", network_name], capture_output=True, text=True, check=False)
    if inspected.returncode:
        raise HTTPException(404, (inspected.stderr or "Docker network was not found.").strip())
    try:
        item = json.loads(inspected.stdout)[0]
    except (json.JSONDecodeError, IndexError):
        raise HTTPException(502, "Docker returned an invalid network description.")
    return {
        "kind": "network",
        "name": item.get("Name") or network_name,
        "id": str(item.get("Id") or "")[:12],
        "driver": item.get("Driver") or "—",
        "scope": item.get("Scope") or "—",
        "internal": bool(item.get("Internal")),
        "attachable": bool(item.get("Attachable")),
        "ipam": item.get("IPAM") or {},
        "containers": item.get("Containers") or {},
        "inspect": item,
    }


@router.post("/docker/containers")
def create_docker_container(payload: dict, user=Depends(require_user)):
    docker = shutil.which("docker")
    if not docker:
        raise HTTPException(409, "Docker Engine is not installed or available.")
    name = str(payload.get("name") or "").strip()
    image = str(payload.get("image") or "").strip()
    if not name or not image or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-" for character in name):
        raise HTTPException(422, "Enter a valid container name and image.")
    command = [docker, "run", "-d", "--name", name]
    restart = str(payload.get("restart") or "").lower()
    restart_map = {"unless stopped": "unless-stopped", "always": "always", "on failure": "on-failure", "never": "no"}
    if restart in restart_map:
        command.extend(["--restart", restart_map[restart]])
    for port in str(payload.get("ports") or "").split(","):
        port = port.strip()
        if port:
            command.extend(["-p", port])
    command.append(image)
    if str(payload.get("command") or "").strip():
        command.extend(shlex.split(str(payload["command"])))
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise HTTPException(409, (result.stderr or result.stdout or "Docker container creation failed.").strip())
    return {"ok": True, "id": result.stdout.strip(), "message": f"Container {name} created."}


def _installed_package_version(package: str) -> str | None:
    query = shutil.which("dpkg-query")
    if not query:
        return None
    result = subprocess.run([query, "-W", "-f=${Status}\t${Version}", package], capture_output=True, text=True, check=False)
    if not result.stdout.startswith("install ok installed\t"):
        return None
    return result.stdout.split("\t", 1)[1].strip().split(":", 1)[0]


def _installed_service_version(service_id: str, package: str, version: str | None = None) -> str | None:
    try:
        root = service_root(service_id, version)
        marker = root / ".serverengine-version"
        if marker.exists():
            return marker.read_text().strip() or "staged"
        binary = binary_path(service_id, version)
        if not binary.exists():
            return None
        result = subprocess.run([binary, "-v"], capture_output=True, text=True, check=False)
        output = result.stderr or result.stdout
        if service_id == "nginx" and "nginx/" in output:
            return output.split("nginx/", 1)[1].strip()
        return "staged"
    except (OSError, PermissionError):
        # An unreadable optional runtime must not make the complete service
        # inventory endpoint fail. The installer repairs managed ownership on
        # the next update; until then treat this runtime as undetected.
        return None


def _process_running(process_name: str, version: str | None = None) -> bool:
    if process_name == "php" and version:
        return _php_process_running(version)
    if process_name == "phpmyadmin":
        pid_file = service_root("phpmyadmin") / "run/phpmyadmin.pid"
        try:
            os.kill(int(pid_file.read_text().strip()), 0)
            return True
        except (OSError, ValueError, FileNotFoundError):
            return False
    pgrep = shutil.which("pgrep")
    target = str(binary_path("php", version)) if process_name == "php" else str(binary_path(process_name))
    if not pgrep:
        proc = Path("/proc")
        for entry in proc.glob("[0-9]*"):
            try:
                command = (entry / "cmdline").read_bytes().replace(b"\x00", b" ").decode(errors="replace")
            except (OSError, UnicodeError):
                continue
            if target in command:
                return True
        return False
    if process_name == "php":
        return subprocess.run([pgrep, "-f", str(binary_path("php", version))], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode == 0
    if process_name in SERVICE_PACKAGES:
        return subprocess.run([pgrep, "-f", str(binary_path(process_name))], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode == 0
    return subprocess.run([pgrep, "-x", process_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode == 0


def _php_process_running(version: str) -> bool:
    """Detect the PHP-FPM master for one version, including FPM's rewritten argv."""
    from app.services.service_runtime import php_fpm_paths

    paths = php_fpm_paths(version)
    pid_file = paths["pid"]
    config = str(paths["config"])
    if not pid_file.exists():
        return False
    try:
        pid = int(pid_file.read_text().strip())
        os.kill(pid, 0)
    except (OSError, ValueError):
        return False

    proc_cmdline = Path(f"/proc/{pid}/cmdline")
    try:
        command = proc_cmdline.read_bytes().replace(b"\x00", b" ").decode(errors="replace")
    except (OSError, UnicodeError):
        command = ""
    if config in command or "php-fpm" in command:
        return True

    # Some minimal images do not expose a usable /proc cmdline. Fall back to
    # the socket only after confirming the PID is alive.
    return paths["socket"].exists()


@router.post("/{service_id}/install", status_code=status.HTTP_202_ACCEPTED)
def install(service_id: str, payload: InstallServiceRequest, user=Depends(require_user)):
    service = get_service(service_id)
    if service is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    if not service.installable:
        raise HTTPException(status_code=400, detail=f"{service.name} is managed from {service.management_label or 'its dedicated feature area'}, not installed as an isolated service package.")
    if service_id == "composer":
        if not payload.php_version:
            raise HTTPException(status_code=400, detail="Choose an installed PHP CLI runtime for Composer.")
        if not php_cli_path(payload.php_version).exists():
            raise HTTPException(status_code=400, detail=f"PHP {payload.php_version} is not installed or its CLI is unavailable.")
    if service_id == "phpmyadmin":
        if not _phpmyadmin_php8_versions():
            raise HTTPException(status_code=409, detail="Install a PHP 8.x CLI runtime before installing phpMyAdmin.")
        if payload.php_version and payload.php_version not in _phpmyadmin_php8_versions():
            raise HTTPException(status_code=400, detail="Choose an installed PHP 8.x CLI runtime for phpMyAdmin.")
    if service_id == "wp-cli" and payload.php_version:
        if not php_cli_path(payload.php_version).exists():
            raise HTTPException(status_code=400, detail=f"PHP {payload.php_version} is not installed or its CLI is unavailable.")
    if payload.install_method not in service.install_methods:
        available = ", ".join(service.install_methods)
        raise HTTPException(status_code=400, detail=f"{service.name} does not support the {payload.install_method} installation method. Available: {available}.")
    # A service can have two independent catalogs: source releases and host
    # packages. Resolve the selected catalog before accepting a version so a
    # release from the other method can never be queued accidentally.
    try:
        if service_id == "phpmyadmin":
            service = get_service(service_id)
        else:
            refreshed, _, _ = refresh_service_versions(service_id, install_method=payload.install_method)
            service = refreshed
    except Exception:
        service.versions = []
    if not any(item.version == payload.version for item in service.versions):
        # The frontend may have a cached provider list while this API process
        # has just restarted and returned to its catalog defaults. Refresh the
        # provider once before rejecting an otherwise valid cached selection.
        try:
            refreshed, _, _ = refresh_service_versions(service_id, force=True, install_method=payload.install_method)
            service = refreshed
        except Exception:
            pass
    if not any(item.version == payload.version for item in service.versions):
        raise HTTPException(status_code=400, detail=f"Requested {service.name} version {payload.version} is not available for this host. Refresh compatible versions and choose one from the current list.")
    if not payload.confirmed:
        return {"status": "confirmation_required", "service": service, "version": payload.version}
    php_suffix = f"-php-{payload.php_version}" if service_id == "composer" else ""
    job_id = f"preview-{service_id}-{payload.install_method}-{payload.version}{php_suffix}"
    job_store.enqueue_install(job_id, service_id, payload.version, payload.install_method, payload.php_version, payload.composer_version)
    return {"status": "queued", "job_id": job_id, "message": "Install job queued and started in the background."}


@router.get("/{service_id}/configuration")
def configuration(service_id: str, version: str | None = None, file: str = "fpm", user=Depends(require_user)):
    service = get_service(service_id)
    if service is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    if service_id == "nginx":
        ensure_nginx_layout()
    if service_id == "php" and version:
        if not binary_path("php", version).exists():
            raise HTTPException(status_code=404, detail="That PHP-FPM version is not installed")
        ensure_php_fpm_layout(version)
    config_path = _configuration_path(service_id, version, file)
    path = Path(config_path)
    content = path.read_text(errors="replace") if path.exists() else _default_configuration(service_id, file)
    backup_dir = path.parent.parent / "backups"
    backups = sorted(backup_dir.glob(f"{path.name}.*.bak")) if backup_dir.exists() else []
    if service_id == "apache":
        sanitized = _sanitize_apache_configuration(content)
        if sanitized != content and path.exists():
            path.write_text(sanitized)
        content = sanitized
    if service_id == "apache" and "CustomLog" not in content:
        content = content.replace(
            "IncludeOptional conf/sites/*.conf",
            'LogFormat "%v %h %l %u %t \\\"%r\\\" %>s %b" combined\nCustomLog "logs/access.log" combined\nIncludeOptional conf/sites/*.conf',
        )
    return {
        "service": service_id,
        "config_path": str(path),
        "content": content,
        "owner": "serverengine",
        "port": website_service.nginx_http_port() if service_id == "nginx" else service.default_port,
        "http_port": website_service.nginx_http_port() if service_id == "nginx" else None,
        "web_root": os.getenv("SE_WEB_ROOT", "/server-engine/www") if service_id == "nginx" else None,
        "safe_defaults": True,
        "has_previous": bool(backups),
        "notes": "Configuration is isolated inside the Server Engine service root.",
    }


def _configuration_path(service_id: str, version: str | None, file: str = "fpm") -> Path:
    if service_id == "nginx":
        return nginx_paths()["config"]
    if service_id == "php" and version:
        from app.services.service_runtime import php_fpm_paths
        return php_fpm_paths(version)["ini" if file == "ini" else "config"]
    if service_id in {"mysql", "mariadb"}:
        return service_root(service_id) / "conf/my.cnf"
    if service_id == "mongodb":
        return service_root("mongodb") / "conf/mongod.conf"
    if service_id == "apache":
        return service_root("apache") / "conf/httpd.conf"
    if service_id == "openlitespeed":
        if file == "vhost":
            return service_root("openlitespeed") / "conf/vhosts/default/vhost.conf"
        return service_root("openlitespeed") / "conf/httpd_config.conf"
    if service_id == "caddy":
        return service_root("caddy") / "conf/Caddyfile"
    if service_id == "haproxy":
        return service_root("haproxy") / "conf/haproxy.cfg"
    if service_id == "valkey":
        return service_root("valkey") / "conf/valkey.conf"
    if service_id == "fail2ban":
        return service_root("fail2ban") / "conf/jail.local"
    if service_id == "powerdns":
        return service_root("powerdns") / "conf/pdns.conf"
    if service_id == "postgresql":
        return service_root("postgresql") / "conf/pg_hba.conf" if file == "hba" else service_root("postgresql") / "conf/postgresql.conf"
    if service_id == "redis":
        return service_root("redis") / "conf/redis.conf"
    if service_id == "memcached":
        return service_root("memcached") / "conf/memcached.conf"
    if service_id == "sqlserver":
        return service_root("sqlserver") / "conf/service.conf"
    if service_id == "certbot":
        return service_root("certbot") / "conf/cli.ini"
    return service_root(service_id) / "conf/service.conf"


def _default_configuration(service_id: str, file: str = "fpm") -> str:
    if service_id == "nginx":
        return nginx_default_configuration(nginx_paths())
    if service_id in {"mysql", "mariadb"}:
        root = service_root(service_id)
        return f"""[mariadb]
bind-address=127.0.0.1
port=3306
datadir={root / "data"}
log-error={root / "logs/error.log"}
slow_query_log=ON
long_query_time=2
max_connections=151
innodb_buffer_pool_size=256M
table_open_cache=2000
thread_cache_size=16
tmp_table_size=64M
max_heap_table_size=64M
skip_name_resolve=1
local_infile=0
require_secure_transport=OFF
binlog_format=ROW
server_id=1
relay_log_recovery=1
expire_logs_days=7

[client]
port=3306
"""
    if service_id == "mongodb":
        root = service_root("mongodb")
        return f"""# MongoDB server configuration managed by Server Engine
systemLog:
  destination: file
  path: {root / 'logs/mongod.log'}
  logAppend: true
  verbosity: 0
storage:
  dbPath: {root / 'data'}
  journal:
    enabled: true
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.5
net:
  bindIp: 127.0.0.1
  port: 27017
  maxIncomingConnections: 1000
security:
  authorization: disabled
operationProfiling:
  mode: slowOp
  slowOpThresholdMs: 100
processManagement:
  fork: false
"""
    if service_id == "apache":
        return """ServerRoot \"/opt/server-engine/services/apache\"\nListen 80\nServerName localhost\n\n# Apache production baseline for Server Engine\nLoadModule mpm_event_module modules/mod_mpm_event.so\nLoadModule authz_core_module modules/mod_authz_core.so\nLoadModule dir_module modules/mod_dir.so\nLoadModule mime_module modules/mod_mime.so\nLoadModule rewrite_module modules/mod_rewrite.so\nLoadModule headers_module modules/mod_headers.so\nLoadModule ssl_module modules/mod_ssl.so\nLoadModule proxy_module modules/mod_proxy.so\nLoadModule proxy_fcgi_module modules/mod_proxy_fcgi.so\nLoadModule http2_module modules/mod_http2.so\nLoadModule deflate_module modules/mod_deflate.so\n\nPidFile \"/opt/server-engine/services/apache/run/httpd.pid\"\nErrorLog \"/opt/server-engine/services/apache/logs/error.log\"\nLogLevel warn\nServerTokens Prod\nServerSignature Off\nEnableSendfile On\nKeepAlive On\nKeepAliveTimeout 5\nMaxKeepAliveRequests 100\nTimeout 60\n\nTypesConfig conf/mime.types\nDirectoryIndex index.php index.html index.htm\nDocumentRoot \"/opt/server-engine/www\"\n\n<Directory \"/opt/server-engine/www\">\n    AllowOverride All\n    Options FollowSymLinks\n    Require all granted\n</Directory>\n\n<IfModule mod_headers.c>\n    Header always set X-Content-Type-Options \"nosniff\"\n    Header always set X-Frame-Options \"SAMEORIGIN\"\n    Header always set Referrer-Policy \"strict-origin-when-cross-origin\"\n</IfModule>\n\n<IfModule mod_deflate.c>\n    AddOutputFilterByType DEFLATE text/plain text/html text/css application/javascript application/json application/xml image/svg+xml\n</IfModule>\n\nIncludeOptional conf/sites/*.conf\n"""
    if service_id == "openlitespeed":
        root = service_root("openlitespeed")
        return f"""# Server Engine OpenLiteSpeed baseline
serverName ServerEngine
user serverengine
group serverengine
priority -2
inMemBufSize 60M
autoRestart 1
enableIpGeo 0
enableGzip 1
enableBr 1
useSendfile 1
listener HTTP {{
  address *:80
  secure 0
  map default *
}}
virtualHost default {{
  vhRoot {root / "www"}
  configFile {root / "conf/vhosts/default/vhost.conf"}
  allowSymbolLink 1
  enableScript 1
  restrained 1
}}
errorlog {root / "logs/error.log"} {{
  logLevel NOTICE
  rollingSize 10M
  keepDays 30
}}
accesslog {root / "logs/access.log"} {{
  logFormat "%h %l %u %t \\\"%r\\\" %>s %b"
  rollingSize 10M
  keepDays 30
}}
"""
    if service_id == "caddy":
        root = service_root("caddy")
        return f"""# Server Engine Caddy baseline
{{
    email admin@example.com
    auto_https prefer_wildcard
    admin 127.0.0.1:2019
    storage file-system {root / "data"}
}}

import {root / "conf/sites/*.caddy"}

:80 {{
    root * {root / "www"}
    encode zstd gzip
    file_server
    log {{
        output file {root / "logs/access.log"} {{
            roll_size 10MiB
            roll_keep 10
        }}
        format json
    }}
}}
        """
    if service_id == "haproxy":
        root = service_root("haproxy")
        return f"""# Server Engine HAProxy baseline
global
    log stdout format raw local0
    stats socket {root / "run/admin.sock"} mode 660 level admin
    maxconn 4096

defaults
    mode http
    log global
    option httplog
    option dontlognull
    option redispatch
    timeout connect 5s
    timeout client 30s
    timeout server 30s
    timeout check 5s
    default-server inter 3s fall 3 rise 2

frontend http_front
    bind 127.0.0.1:8080
    default_backend web_back

backend web_back
    balance roundrobin
    option httpchk GET /health
    server app1 127.0.0.1:8080 check

listen stats
    bind 127.0.0.1:8404
    stats enable
    stats uri /stats
    stats refresh 10s
"""
    if service_id == "valkey":
        root = service_root("valkey")
        return f"""# Server Engine Valkey baseline
bind 127.0.0.1 ::1
protected-mode yes
port 6379
dir {root / "data"}
dbfilename dump.rdb
appendonly no
appendfsync everysec
maxmemory 256mb
maxmemory-policy allkeys-lru
repl-ping-replica-period 10
save 900 1
save 300 10
save 60 10000
loglevel notice
logfile {root / "logs/valkey.log"}
pidfile {root / "run/valkey.pid"}
daemonize no
"""
    if service_id == "fail2ban":
        root = service_root("fail2ban")
        return f"""# Server Engine Fail2ban baseline
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1
bantime = 1h
findtime = 10m
maxretry = 5
backend = auto
banaction = nftables-multiport
action = %(action_)s

[sshd]
enabled = true
port = ssh
logpath = {root / "logs/sshd.log"}
maxretry = 5

[nginx-http-auth]
enabled = false
logpath = {root / "logs/nginx-auth.log"}

[recidive]
enabled = false
logpath = {root / "logs/fail2ban.log"}
bantime = 1w
findtime = 1d
maxretry = 5
"""
    if service_id == "powerdns":
        root = service_root("powerdns")
        return f"""# Server Engine PowerDNS Authoritative baseline
launch=bind
bind-config={root / 'conf/named.conf'}
primary=yes
socket-dir={root / 'run'}
local-address=0.0.0.0
local-port=53
default-ttl=3600
api=yes
webserver=yes
webserver-address=127.0.0.1
webserver-port=8081
webserver-allow-from=127.0.0.1,::1
log-dns-queries=no
loglevel=4
"""
    if service_id == "postgresql":
        if file == "hba":
            return """# Server Engine PostgreSQL client authentication
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
"""
        return """# Server Engine PostgreSQL baseline
listen_addresses = '127.0.0.1'
port = 5432
max_connections = 100
shared_buffers = 256MB
work_mem = 8MB
maintenance_work_mem = 64MB
effective_cache_size = 768MB
password_encryption = 'scram-sha-256'
ssl = off
logging_collector = on
log_directory = 'logs'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
wal_level = replica
max_wal_senders = 10
max_replication_slots = 4
"""
    if service_id == "redis":
        root = service_root("redis")
        return f"""# Server Engine Redis baseline
bind 127.0.0.1 ::1
protected-mode yes
port 6379
dir {root / "data"}
dbfilename dump.rdb
appendonly no
appendfilename appendonly.aof
appendfsync everysec
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
loglevel notice
logfile {root / "logs/redis.log"}
pidfile {root / "run/redis.pid"}
daemonize no
"""
    if service_id == "memcached":
        root = service_root("memcached")
        return f"""# Server Engine Memcached command-line configuration
-m 256
-p 11211
-l 127.0.0.1
-c 1024
-t 4
-U 0
-o modern
# Memcached is intentionally volatile; it has no persistence or replication.
"""
    if service_id == "sqlserver":
        root = service_root("sqlserver")
        return f"""# Server Engine SQL Server runtime configuration
# Environment-style values used when the managed container is recreated.
MSSQL_PID=Developer
MSSQL_TCP_PORT=1433
MSSQL_MEMORY_LIMIT_MB=2048
MSSQL_AGENT_ENABLED=false
MSSQL_ENABLE_HADR=false
MSSQL_COLLATION=SQL_Latin1_General_CP1_CI_AS
SE_BIND_ADDRESS=127.0.0.1
SE_MAXDOP=0
SE_DATA_DIRECTORY={root / 'data'}
SE_BACKUP_DIRECTORY={root / 'backups'}
"""
    if service_id == "certbot":
        root = service_root("certbot")
        return f"""# Server Engine Certbot defaults
email =
agree-tos = true
non-interactive = true
preferred-challenges = http
config-dir = {root / "config"}
work-dir = {root / "work"}
logs-dir = {root / "logs"}
"""
    return ""


@router.put("/{service_id}/configuration")
def save_configuration(service_id: str, payload: ConfigurationSaveRequest, version: str | None = None, file: str = "fpm", user=Depends(require_user)):
    if get_service(service_id) is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    if service_id == "nginx":
        # Migrate included site blocks before validating the main file. A
        # valid global error/access log path is not enough when an old site
        # block still points at the former service-local log directory.
        ensure_nginx_layout()
    path = _configuration_path(service_id, version, file)
    path.parent.mkdir(parents=True, exist_ok=True)
    backup_dir = path.parent.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / f"{path.name}.{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.bak"
    if path.exists():
        shutil.copy2(path, backup)
    content = _sanitize_apache_configuration(payload.content) if service_id == "apache" else payload.content
    path.write_text(content)
    if service_id == "nginx":
        nginx = nginx_paths()
        # Nginx may load the isolated ModSecurity connector. Its dependent
        # libraries are deliberately kept out of the host linker paths, so
        # configuration validation must use the same managed environment as
        # Nginx start/reload and Application Shield attach.
        runtime_env = managed_library_environment(nginx["root"], service_root("modsecurity"))
        check = subprocess.run([str(nginx["binary"]), "-p", str(nginx["root"]), "-c", str(path), "-t"], capture_output=True, text=True, check=False, env=runtime_env)
        if check.returncode != 0:
            if backup.exists(): shutil.copy2(backup, path)
            raise HTTPException(status_code=400, detail=(check.stderr or check.stdout).strip() or "Configuration validation failed")
    return {"saved": True, "backup": str(backup) if backup.exists() else None, "config_path": str(path)}


@router.post("/{service_id}/configuration/restore")
def restore_configuration(service_id: str, version: str | None = None, file: str = "fpm", payload: dict | None = Body(default=None), user=Depends(require_user)):
    if get_service(service_id) is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    path = _configuration_path(service_id, version, file)
    backup_dir = path.parent.parent / "backups"
    backups = sorted(backup_dir.glob(f"{path.name}.*.bak")) if backup_dir.exists() else []
    if not backups:
        raise HTTPException(status_code=404, detail="No configuration backup exists")
    target = str((payload or {}).get("restore") or "previous").lower()
    if target not in {"previous", "original"}:
        raise HTTPException(status_code=400, detail="Restore target must be previous or original")
    backup = backups[-1] if target == "previous" else backups[0]
    shutil.copy2(backup, path)
    return {"restored": True, "backup": str(backup), "content": path.read_text(errors="replace")}


@router.get("/{service_id}/logs")
def logs(
    service_id: str,
    page: int = 1,
    page_size: int = 50,
    version: str | None = None,
    kind: str = "error",
    user=Depends(require_user),
):
    if get_service(service_id) is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    page = max(1, page)
    page_size = max(25, min(page_size, 250))
    if service_id == "nginx" and kind == "response":
        log_path = nginx_paths().get("access_log", service_root(service_id) / "logs/access.log")
    elif service_id == "nginx":
        log_path = nginx_paths()["error_log"]
    elif service_id == "php" and version:
        from app.services.service_runtime import php_fpm_paths
        log_path = php_fpm_paths(version)["error_log"]
    elif service_id == "mongodb":
        log_path = service_root("mongodb") / "logs/mongod.log"
    elif service_id == "apache" and kind == "response":
        log_path = service_root(service_id) / "logs/access.log"
    elif service_id == "openlitespeed" and kind == "response":
        log_path = service_root(service_id) / "logs/access.log"
    elif service_id == "caddy" and kind == "response":
        log_path = service_root(service_id) / "logs/access.log"
    elif service_id == "haproxy" and kind == "response":
        log_path = service_root(service_id) / "logs/access.log"
    elif service_id == "haproxy":
        log_path = service_root(service_id) / "logs/haproxy.log"
    elif service_id == "valkey":
        log_path = service_root(service_id) / "logs/valkey.log"
    elif service_id == "fail2ban":
        log_path = service_root(service_id) / "logs/fail2ban.log"
    else:
        log_path = service_root(service_id) / "logs/error.log"
    path = Path(log_path)
    if service_id == "apache" and kind == "response":
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch(exist_ok=True)
    if not path.exists():
        return {
            "service": service_id,
            "path": str(path),
            "lines": [],
            "available": False,
            "page": page,
            "page_size": page_size,
            "total_lines": 0,
            "total_pages": 0,
        }
    # Keep memory bounded while serving the newest page first. The browser
    # never receives the whole log file, even when the service log is large.
    recent = deque(maxlen=page * page_size)
    total_lines = 0
    with path.open("r", errors="replace") as stream:
        for line in stream:
            total_lines += 1
            recent.append(line.rstrip("\n\r"))
    items = list(recent)
    end = len(items) - ((page - 1) * page_size)
    start = max(0, end - page_size)
    return {
        "service": service_id,
        "path": str(path),
        "lines": items[start:end] if end > 0 else [],
        "available": True,
        "page": page,
        "page_size": page_size,
        "total_lines": total_lines,
        "total_pages": math.ceil(total_lines / page_size),
    }


@router.post("/{service_id}/switch-version", status_code=status.HTTP_202_ACCEPTED)
def switch_version(service_id: str, payload: SwitchVersionRequest, user=Depends(require_user)):
    service = get_service(service_id)
    if service is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    if payload.install_method not in service.install_methods:
        available = ", ".join(service.install_methods)
        raise HTTPException(status_code=400, detail=f"{service.name} does not support the {payload.install_method} installation method. Available: {available}.")
    try:
        service, _, _ = refresh_service_versions(service_id, install_method=payload.install_method)
    except Exception:
        pass
    if not any(item.version == payload.version for item in service.versions):
        raise HTTPException(status_code=400, detail="Requested version is not available for this provider")
    if not payload.confirmed:
        return {"status": "confirmation_required", "message": "Confirm the version switch before queuing it."}
    job_id = f"switch-{service_id}-{payload.install_method}-{payload.version}"
    job_store.enqueue_install(job_id, service_id, payload.version, payload.install_method)
    return {"status": "queued", "job_id": job_id, "message": "Version switch queued and started in the background."}


@router.post("/{service_id}/action", status_code=status.HTTP_202_ACCEPTED)
def action(service_id: str, payload: ServiceActionRequest, user=Depends(require_user)):
    if get_service(service_id) is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    if service_id == "php":
        if not payload.version:
            raise HTTPException(status_code=400, detail="PHP-FPM actions require a selected version")
        if not binary_path("php", payload.version).exists():
            raise HTTPException(status_code=404, detail="That PHP-FPM version is not installed")
    job_id = f"{payload.action}-{service_id}-{payload.version or 'default'}"
    job_store.enqueue_action(job_id, service_id, payload.action, payload.version)
    return {"status": "queued", "job_id": job_id, "message": f"{payload.action.title()} job queued and started in the background."}
