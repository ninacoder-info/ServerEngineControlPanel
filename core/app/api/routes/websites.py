import uuid
import re
import json
import time
import urllib.request
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.dependencies import require_user
from app.models.website import WebsiteActionRequest, WebsiteCreateRequest, WebsiteDeployRequest, WebsiteDirectoryRequest, WebsiteUpdateRequest
from app.services.job_service import job_store
from app.services.service_runtime import composer_path, php_cli_path
from app.services.website_service import website_service

router = APIRouter(prefix="/api/v1/websites", tags=["websites"])
_wordpress_versions: tuple[float, list[str]] = (0, [])
_laravel_versions: tuple[float, list[str]] = (0, [])


class WebsiteConfigurationSaveRequest(BaseModel):
    content: str = Field(max_length=200000)


class WebsiteConfigurationRestoreRequest(BaseModel):
    restore: str


class WebsiteCertificateRequest(BaseModel):
    method: str = Field(pattern="^(acme|upload)$")
    email: str = Field(default="", max_length=320)
    staging: bool = False
    certificate: str = Field(default="", max_length=200000)
    private_key: str = Field(default="", max_length=200000)
    chain: str = Field(default="", max_length=200000)


@router.get("")
def list_websites(user=Depends(require_user)):
    return website_service.list()


@router.get("/directories")
def list_directories(path: str | None = None, recursive: bool = False, user=Depends(require_user)):
    return website_service.directories(path, recursive)


@router.get("/directories/status")
def project_directory_status(path: str, user=Depends(require_user)):
    return website_service.project_path_status(path)


@router.post("/directories", status_code=status.HTTP_201_CREATED)
def create_directory(payload: WebsiteDirectoryRequest, user=Depends(require_user)):
    return website_service.create_directory(payload.path, payload.name)


@router.get("/wordpress/versions")
def wordpress_versions(user=Depends(require_user)):
    global _wordpress_versions
    if time.time() - _wordpress_versions[0] < 3600 and _wordpress_versions[1]:
        return _wordpress_versions[1]
    versions = ["latest"]
    try:
        request = urllib.request.Request("https://api.wordpress.org/core/version-check/1.7/", headers={"User-Agent": "Server-Engine-Control-Panel"})
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
        versions.extend(str(item.get("version", "")).strip() for item in payload.get("offers", []) if item.get("version"))
    except Exception:
        pass
    _wordpress_versions = (time.time(), list(dict.fromkeys(versions)))
    return _wordpress_versions[1]


@router.get("/laravel/versions")
def laravel_versions(user=Depends(require_user)):
    """Return stable Laravel application versions from Packagist, cached briefly."""
    global _laravel_versions
    if time.time() - _laravel_versions[0] < 3600 and _laravel_versions[1]:
        return _laravel_versions[1]
    versions = []
    try:
        request = urllib.request.Request(
            "https://repo.packagist.org/p2/laravel/laravel.json",
            headers={"User-Agent": "Server-Engine-Control-Panel"},
        )
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
        for package in payload.get("packages", {}).get("laravel/laravel", []):
            version = str(package.get("version", "")).removeprefix("v")
            if re.fullmatch(r"\d+\.\d+(?:\.\d+)?", version):
                versions.append(version)
    except Exception:
        pass
    versions = sorted(set(versions), key=lambda value: tuple(int(part) for part in value.split(".")), reverse=True)
    _laravel_versions = (time.time(), versions)
    return versions


@router.get("/{website_id}/configuration")
def get_website_configuration(website_id: str, server_type: str | None = None, user=Depends(require_user)):
    result = website_service.configuration(website_id, server_type)
    path = Path(result["config_path"])
    if path.exists():
        result["content"] = path.read_text(errors="replace")
    site = website_service.get(website_id)
    provider = server_type or (site.server_type if site else "")
    backup = website_service.config_backup_root / website_service._configuration_id(site) / f"{provider}.previous" if site else None
    result["has_previous"] = bool(backup and backup.exists())
    return result


@router.put("/{website_id}/configuration")
def save_website_configuration(website_id: str, payload: WebsiteConfigurationSaveRequest, server_type: str | None = None, user=Depends(require_user)):
    site = website_service.get(website_id)
    if site is None:
        raise HTTPException(404, "Website not found")
    provider = server_type or site.server_type
    result = website_service.save_provider_configuration(website_id, provider, payload.content)
    job_store.enqueue_action(f"provider-reload-site-config-{site.id}-{uuid.uuid4().hex[:8]}", provider, "restart")
    result["saved"] = True
    return result


@router.post("/{website_id}/configuration/restore")
def restore_website_configuration(website_id: str, payload: WebsiteConfigurationRestoreRequest, server_type: str | None = None, user=Depends(require_user)):
    site = website_service.get(website_id)
    if site is None:
        raise HTTPException(404, "Website not found")
    provider = server_type or site.server_type
    result = website_service.restore_provider_configuration(website_id, provider, payload.restore)
    job_store.enqueue_action(f"provider-restore-site-config-{site.id}-{uuid.uuid4().hex[:8]}", provider, "restart")
    result["restored"] = payload.restore
    return result


@router.get("/{website_id}")
def get_website(website_id: str, user=Depends(require_user)):
    site = website_service.get(website_id)
    if site is None:
        from fastapi import HTTPException
        raise HTTPException(404, "Website not found")
    return {**site.model_dump(mode="json"), "certificate": website_service.certificate_info(site)}


@router.get("/{website_id}/certificate")
def get_website_certificate(website_id: str, user=Depends(require_user)):
    site = website_service.get(website_id)
    if site is None:
        raise HTTPException(404, "Website not found")
    return website_service.certificate_info(site)


@router.post("/{website_id}/certificate", status_code=status.HTTP_202_ACCEPTED)
def request_website_certificate(website_id: str, payload: WebsiteCertificateRequest, user=Depends(require_user)):
    site = website_service.get(website_id)
    if site is None:
        raise HTTPException(404, "Website not found")
    if payload.method == "upload" and (not payload.certificate.strip() or not payload.private_key.strip()):
        raise HTTPException(400, "Certificate and private key are required for upload.")
    return {"job": job_store.enqueue_certificate(f"website-certificate-{uuid.uuid4().hex}", website_id, payload.method, payload.email, payload.staging, payload.certificate, payload.private_key, payload.chain).model_dump(mode="json")}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_website(payload: WebsiteCreateRequest, user=Depends(require_user)):
    site = website_service.create(payload)
    job_store.enqueue_action(f"provider-reload-site-{site.id}-{uuid.uuid4().hex[:8]}", site.server_type, "restart")
    job_store.publish({"type": "websites-updated", "action": "created", "website_id": site.id})
    return site


@router.post("/deploy", status_code=status.HTTP_202_ACCEPTED)
def deploy_website(payload: WebsiteDeployRequest, user=Depends(require_user)):
    """Create the website profile, then deploy the selected application serially."""
    if not payload.php_version or not php_cli_path(payload.php_version).exists():
        raise HTTPException(400, "Install a PHP runtime and select it before deploying this application.")
    if payload.application_template == "wordpress":
        payload.database_enabled = True
        if payload.database_engine != "mysql":
            raise HTTPException(400, "WordPress requires a running MySQL service. Start MySQL and select it before deploying.")
        if not payload.database_name.strip():
            raise HTTPException(400, "A WordPress database name is required.")
        if not payload.database_user.strip():
            raise HTTPException(400, "A WordPress database owner is required.")
    project_status = website_service.project_path_status(payload.project_path)
    if project_status["exists"] and (not project_status["is_directory"] or not project_status["is_empty"]):
        raise HTTPException(400, "Project folder is not empty. Choose a new domain or project folder before deploying.")
    if payload.application_template != "wordpress" and not composer_path().exists():
        raise HTTPException(400, "Install Composer before deploying this PHP application.")
    if payload.database_enabled and payload.database_engine != "mysql":
        raise HTTPException(400, "One-click database provisioning currently supports running MySQL only.")
    if payload.database_enabled and not payload.database_name.strip():
        raise HTTPException(400, "A database name is required when database attachment is enabled.")
    if payload.database_enabled and not payload.database_user.strip():
        raise HTTPException(400, "A database user is required when database attachment is enabled.")
    if payload.application_template == "wordpress" and payload.framework != "wordpress":
        payload.framework = "wordpress"
    if payload.application_template == "laravel" and payload.framework != "laravel":
        payload.framework = "laravel"
    if payload.application_template == "laravel" and payload.laravel_version and not re.fullmatch(r"[0-9A-Za-z.*^~_-]+", payload.laravel_version):
        raise HTTPException(400, "The Laravel version is invalid.")
    if payload.application_template == "wordpress":
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", payload.wordpress_admin_user.strip()):
            raise HTTPException(400, "WordPress admin username must start with a letter and use only letters, numbers, hyphens, and underscores.")
        if len(payload.wordpress_admin_password) < 10:
            raise HTTPException(400, "WordPress admin password must contain at least 10 characters.")
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,31}", payload.wordpress_database_prefix.strip()):
            raise HTTPException(400, "WordPress database prefix is invalid.")
    site = website_service.create(payload)
    job = job_store.enqueue_application_deploy(
        f"website-deploy-{uuid.uuid4().hex}",
        site,
        payload.application_template,
        payload.database_engine,
        payload.database_password,
        payload.wordpress_version,
        payload.wordpress_admin_user,
        payload.wordpress_admin_password,
        payload.wordpress_database_prefix,
        payload.wordpress_site_title,
        payload.laravel_version,
    )
    return {"website": site, "job": job}


@router.patch("/{website_id}")
def update_website(website_id: str, payload: WebsiteUpdateRequest, user=Depends(require_user)):
    site = website_service.update(website_id, payload)
    # Configuration changes, including maintenance mode, must be loaded by
    # the active provider immediately. The action is serialized with other
    # service operations and its result is delivered over the shared jobs
    # socket; the PATCH response remains the website record for compatibility.
    job_store.enqueue_action(f"provider-reload-site-{site.id}-{uuid.uuid4().hex[:8]}", site.server_type, "restart")
    job_store.publish({"type": "websites-updated", "action": "updated", "website_id": site.id})
    return site


@router.post("/{website_id}/actions")
def website_action(website_id: str, payload: WebsiteActionRequest, user=Depends(require_user)):
    return website_service.action(website_id, payload.action)


@router.delete("/{website_id}")
def delete_website(website_id: str, remove_files: bool = False, user=Depends(require_user)):
    website_service.delete(website_id, remove_files)
    job_store.publish({"type": "websites-updated", "action": "deleted", "website_id": website_id})
    return {"deleted": True}
