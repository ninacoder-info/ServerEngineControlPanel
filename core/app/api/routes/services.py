import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import require_user
from app.models.service import ConfigurationSaveRequest, ExtensionInstallRequest, InstallServiceRequest, InstalledService, ServiceActionRequest, ServiceDefinition, SwitchVersionRequest
from app.services.service_catalog import CATALOG, PHP_EXTENSIONS, get_service
from app.services.job_service import job_store
from app.services.service_runtime import PHP_BASELINE_MODULES, SERVICE_PACKAGES, binary_path, ensure_nginx_layout, ensure_php_fpm_layout, nginx_default_configuration, nginx_paths, php_cli_path, service_root

router = APIRouter(prefix="/api/v1/services", tags=["services"])


def _php_extension_state(version: str) -> list[dict]:
    from app.services.service_runtime import php_fpm_paths
    ini = php_fpm_paths(version)["ini"]
    content = ini.read_text(errors="replace") if ini.exists() else ""
    result = []
    root = service_root("php", version)
    for extension in PHP_EXTENSIONS:
        module = next((candidate for name in PHP_BASELINE_MODULES.get(extension["id"], (extension["id"],)) for candidate in root.glob(f"usr/lib/php/*/{name}.so")), None)
        result.append({**extension, "installed": bool(module), "enabled": bool(module and str(module) in content), "module_path": str(module) if module else None})
    return result


@router.get("/php/runtimes")
def php_runtimes(user=Depends(require_user)):
    definition = get_service("php")
    detected = {item.version: item for item in installed(user) if item.id.startswith("php@") and item.version}
    return [{"version": item.version, "channel": item.channel, "supported": item.supported, "installed": item.version in detected, "status": detected[item.version].status if item.version in detected else "not-installed", "config_path": str(service_root("php", item.version) / "conf/php-fpm.conf"), "socket_path": str(service_root("php", item.version) / "run/php-fpm.sock") if item.version in detected else None, "binary_path": str(binary_path("php", item.version)) if item.version in detected else None, "fpm_path": str(binary_path("php", item.version)) if item.version in detected else None, "cli_path": str(php_cli_path(item.version)) if item.version in detected and php_cli_path(item.version).exists() else None, "extensions": _php_extension_state(item.version) if item.version in detected else []} for item in definition.versions]


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
    job_store.enqueue_extension(job_id, version, payload.extension)
    return {"status": "queued", "job_id": job_id, "message": f"PHP {version} extension {payload.extension} queued."}


@router.delete("/php/{version}", status_code=status.HTTP_202_ACCEPTED)
def uninstall_php(version: str, user=Depends(require_user)):
    if not binary_path("php", version).exists():
        raise HTTPException(status_code=404, detail="That PHP-FPM version is not installed")
    job_id = f"uninstall-php-{version}"
    job_store.enqueue_action(job_id, "php", "uninstall", version)
    return {"status": "queued", "job_id": job_id, "message": f"PHP-FPM {version} uninstall queued."}


@router.get("/catalog", response_model=list[ServiceDefinition])
def catalog(user=Depends(require_user)):
    return CATALOG


@router.get("/installed", response_model=list[InstalledService])
def installed(user=Depends(require_user)):
    detected = [InstalledService(id="server-engine", name="Server Engine", version="0.1.0", status="running", managed=True)]
    packages = SERVICE_PACKAGES
    for service_id, package in packages.items():
        if service_id == "php":
            php_root = service_root("php") / "versions"
            if php_root.exists():
                for version_root in sorted(item for item in php_root.iterdir() if item.is_dir()):
                    version = _installed_service_version("php", package, version_root.name)
                    if version is not None:
                        definition = get_service("php")
                        running = _process_running("php", version_root.name)
                        detected.append(InstalledService(id=f"php@{version_root.name}", name=f"{definition.name} {version_root.name}", version=version, status="running" if running else "stopped", managed=False))
            continue
        version = _installed_service_version(service_id, package)
        if version is None:
            continue
        definition = get_service(service_id)
        process_name = service_id
        running = _process_running(process_name)
        detected.append(InstalledService(id=service_id, name=definition.name if definition else service_id, version=version, status="running" if running else "stopped", managed=False))
    return detected


def _installed_package_version(package: str) -> str | None:
    query = shutil.which("dpkg-query")
    if not query:
        return None
    result = subprocess.run([query, "-W", "-f=${Status}\t${Version}", package], capture_output=True, text=True, check=False)
    if not result.stdout.startswith("install ok installed\t"):
        return None
    return result.stdout.split("\t", 1)[1].strip().split(":", 1)[0]


def _installed_service_version(service_id: str, package: str, version: str | None = None) -> str | None:
    root = service_root(service_id, version)
    marker = root / ".serverengine-version"
    binary = binary_path(service_id, version)
    if not binary.exists():
        return None
    if marker.exists():
        return marker.read_text().strip() or "staged"
    result = subprocess.run([binary, "-v"], capture_output=True, text=True, check=False)
    output = result.stderr or result.stdout
    if service_id == "nginx" and "nginx/" in output:
        return output.split("nginx/", 1)[1].strip()
    return "staged"


def _process_running(process_name: str, version: str | None = None) -> bool:
    if process_name == "php" and version:
        return _php_process_running(version)
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
    if not any(item.version == payload.version for item in service.versions):
        raise HTTPException(status_code=400, detail="Requested version is not available for this provider")
    if not payload.confirmed:
        return {"status": "confirmation_required", "service": service, "version": payload.version}
    job_id = f"preview-{service_id}-{payload.version}"
    job_store.enqueue_install(job_id, service_id, payload.version)
    return {"status": "queued", "job_id": job_id, "message": "Install job queued and started in the background."}


@router.get("/{service_id}/configuration")
def configuration(service_id: str, version: str | None = None, file: str = "fpm", user=Depends(require_user)):
    service = get_service(service_id)
    if service is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    if service_id == "nginx":
        ensure_nginx_layout()
    if service_id == "php" and version:
        ensure_php_fpm_layout(version)
    config_path = _configuration_path(service_id, version, file)
    path = Path(config_path)
    content = path.read_text(errors="replace") if path.exists() else _default_configuration(service_id)
    return {"service": service_id, "config_path": str(path), "content": content, "owner": "serverengine", "port": service.default_port, "safe_defaults": True, "notes": "Configuration is isolated inside the Server Engine service root."}


def _configuration_path(service_id: str, version: str | None, file: str = "fpm") -> Path:
    if service_id == "nginx":
        return nginx_paths()["config"]
    if service_id == "php" and version:
        from app.services.service_runtime import php_fpm_paths
        return php_fpm_paths(version)["ini" if file == "ini" else "config"]
    if service_id == "mysql":
        return service_root("mysql") / "conf/my.cnf"
    return service_root(service_id) / "conf/service.conf"


def _default_configuration(service_id: str) -> str:
    if service_id == "nginx":
        return nginx_default_configuration(nginx_paths())
    if service_id == "mysql":
        return """[mysqld]\nbind-address=127.0.0.1\nport=3306\ndatadir=/opt/server-engine/services/mysql/data\nlog-error=/opt/server-engine/services/mysql/logs/error.log\nslow_query_log=ON\nmax_connections=151\nsql_mode=STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION\n\n[client]\nport=3306\n"""
    return ""


@router.put("/{service_id}/configuration")
def save_configuration(service_id: str, payload: ConfigurationSaveRequest, version: str | None = None, file: str = "fpm", user=Depends(require_user)):
    if get_service(service_id) is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    path = _configuration_path(service_id, version, file)
    path.parent.mkdir(parents=True, exist_ok=True)
    backup_dir = path.parent.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / f"{path.name}.{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.bak"
    if path.exists():
        shutil.copy2(path, backup)
    path.write_text(payload.content)
    if service_id == "nginx":
        nginx = nginx_paths()
        check = subprocess.run([str(nginx["binary"]), "-p", str(nginx["root"]), "-c", str(path), "-t"], capture_output=True, text=True, check=False)
        if check.returncode != 0:
            if backup.exists(): shutil.copy2(backup, path)
            raise HTTPException(status_code=400, detail=(check.stderr or check.stdout).strip() or "Configuration validation failed")
    return {"saved": True, "backup": str(backup) if backup.exists() else None, "config_path": str(path)}


@router.post("/{service_id}/configuration/restore")
def restore_configuration(service_id: str, version: str | None = None, file: str = "fpm", user=Depends(require_user)):
    if get_service(service_id) is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    path = _configuration_path(service_id, version, file)
    backup_dir = path.parent.parent / "backups"
    backups = sorted(backup_dir.glob(f"{path.name}.*.bak")) if backup_dir.exists() else []
    if not backups:
        raise HTTPException(status_code=404, detail="No configuration backup exists")
    backup = backups[-1]
    shutil.copy2(backup, path)
    return {"restored": True, "backup": str(backup), "content": path.read_text(errors="replace")}


@router.get("/{service_id}/logs")
def logs(service_id: str, lines: int = 100, version: str | None = None, user=Depends(require_user)):
    if get_service(service_id) is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    lines = max(10, min(lines, 500))
    if service_id == "nginx":
        log_path = nginx_paths()["error_log"]
    elif service_id == "php" and version:
        from app.services.service_runtime import php_fpm_paths
        log_path = php_fpm_paths(version)["error_log"]
    else:
        log_path = service_root(service_id) / "logs/error.log"
    path = Path(log_path)
    if not path.exists():
        return {"service": service_id, "path": str(path), "lines": [], "available": False}
    return {"service": service_id, "path": str(path), "lines": path.read_text(errors="replace").splitlines()[-lines:], "available": True}


@router.post("/{service_id}/switch-version", status_code=status.HTTP_202_ACCEPTED)
def switch_version(service_id: str, payload: SwitchVersionRequest, user=Depends(require_user)):
    service = get_service(service_id)
    if service is None:
        raise HTTPException(status_code=404, detail="Service is not in the provider catalog")
    if not any(item.version == payload.version for item in service.versions):
        raise HTTPException(status_code=400, detail="Requested version is not available for this provider")
    if not payload.confirmed:
        return {"status": "confirmation_required", "message": "Confirm the version switch before queuing it."}
    job_id = f"switch-{service_id}-{payload.version}"
    job_store.enqueue_install(job_id, service_id, payload.version)
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
