from fastapi import APIRouter, Depends, HTTPException, status
import secrets

from app.api.dependencies import require_user
from app.models.application_shield import ApplicationShieldPolicyUpdate
from app.models.application_shield_rule import ApplicationShieldRuleRequest
from app.models.application_shield_ip import ApplicationShieldIpRequest
from app.models.application_shield_geo import ApplicationShieldGeoRequest
from app.services.application_shield_service import application_shield_service
from app.services.geoip_service import geoip_service
from app.services.job_service import job_store
from app.services.service_runtime import service_root


router = APIRouter(prefix="/api/v1/application-shield", tags=["application-shield"])


@router.get("/overview")
def overview(user=Depends(require_user)):
    return application_shield_service.overview()


@router.patch("/policy")
def update_policy(payload: ApplicationShieldPolicyUpdate, user=Depends(require_user)):
    try:
        updated = application_shield_service.update_policy(payload)
        job_store.publish({
            "type": "application-shield-policy",
            "policy": updated.model_dump(mode="json"),
        })
        return updated
    except (RuntimeError, ValueError) as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.get("/logs")
def logs(lines: int = 120, user=Depends(require_user)):
    return application_shield_service.logs(lines)


@router.get("/traffic")
def traffic(page: int = 1, page_size: int = 50, limit: int | None = None, user=Depends(require_user)):
    if limit is not None:
        page_size = limit
    return application_shield_service.traffic(page=page, page_size=page_size)


@router.get("/report")
def report(hours: int = 24, host: str = "", country: str = "", user=Depends(require_user)):
    return application_shield_service.report(hours, host=host, country=country)


@router.get("/attack-map")
def attack_map(limit: int = 1000, user=Depends(require_user)):
    return application_shield_service.attack_map(limit)


@router.get("/metrics")
def metrics(user=Depends(require_user)):
    return application_shield_service.metrics()


@router.get("/activity")
def activity(hours: int = 24, user=Depends(require_user)):
    return application_shield_service.activity(hours)


@router.get("/protected-sites")
def protected_sites(user=Depends(require_user)):
    return {"sites": application_shield_service.protected_sites()}


@router.get("/rules")
def rules(user=Depends(require_user)):
    return {"rules": application_shield_service.rules()}


@router.post("/rules", status_code=status.HTTP_201_CREATED)
def create_rule(payload: ApplicationShieldRuleRequest, user=Depends(require_user)):
    try:
        return application_shield_service.create_rule(payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/rules/{rule_id}")
def update_rule(rule_id: str, payload: ApplicationShieldRuleRequest, user=Depends(require_user)):
    try:
        return application_shield_service.update_rule(rule_id, payload)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/rules/{rule_id}/toggle")
def toggle_rule(rule_id: str, user=Depends(require_user)):
    try:
        return application_shield_service.toggle_rule(rule_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str, user=Depends(require_user)):
    try:
        application_shield_service.delete_rule(rule_id)
        return {"deleted": True}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/ip-lists")
def ip_lists(user=Depends(require_user)):
    return {"entries": application_shield_service.ip_entries()}


@router.post("/ip-lists", status_code=status.HTTP_201_CREATED)
def create_ip_entry(payload: ApplicationShieldIpRequest, user=Depends(require_user)):
    try:
        return application_shield_service.create_ip_entry(payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"Invalid IP address or network: {error}") from error


@router.patch("/ip-lists/{entry_id}")
def update_ip_entry(entry_id: str, payload: ApplicationShieldIpRequest, user=Depends(require_user)):
    try:
        return application_shield_service.update_ip_entry(entry_id, payload)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"Invalid IP address or network: {error}") from error


@router.delete("/ip-lists/{entry_id}")
def delete_ip_entry(entry_id: str, user=Depends(require_user)):
    try:
        application_shield_service.delete_ip_entry(entry_id)
        return {"deleted": True}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/geo-controls")
def geo_controls(user=Depends(require_user)):
    return application_shield_service.geo_overview()


@router.post("/geo-controls/database")
def install_geo_database(user=Depends(require_user)):
    result = geoip_service.install_latest_country_database()
    if not result.get("installed"):
        raise HTTPException(status_code=502, detail=result.get("message", "Unable to download the optional country database."))
    return geoip_service.status()


@router.post("/geo-controls", status_code=status.HTTP_201_CREATED)
def create_geo_control(payload: ApplicationShieldGeoRequest, user=Depends(require_user)):
    try:
        return application_shield_service.create_geo_entry(payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.patch("/geo-controls/{entry_id}")
def update_geo_control(entry_id: str, payload: ApplicationShieldGeoRequest, user=Depends(require_user)):
    try:
        return application_shield_service.update_geo_entry(entry_id, payload)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/geo-controls/{entry_id}")
def delete_geo_control(entry_id: str, user=Depends(require_user)):
    try:
        application_shield_service.delete_geo_entry(entry_id)
        return {"deleted": True}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/connectors/{provider}/attach")
def attach_connector(provider: str, user=Depends(require_user)):
    if provider in {"nginx", "apache", "openlitespeed", "caddy"}:
        root = service_root(provider)
        marker = root / ".serverengine-install-method"
        method = marker.read_text(errors="replace").strip() if marker.exists() else "source"
        if method != "prebuilt":
            raise HTTPException(
                status_code=400,
                detail=f"Application Shield currently supports prebuilt {provider.title()} runtimes only. Install or reinstall {provider.title()} using the Prebuilt package method, then attach Shield again.",
            )
    try:
        return application_shield_service.attach(provider)
    except (ValueError, RuntimeError) as error:
        overview = application_shield_service.overview()
        installed = next((connector for connector in overview.connectors if connector.provider == provider and connector.installed and not connector.attached), None)
        if installed and provider in {"nginx", "apache", "openlitespeed", "caddy"}:
            job_type = f"Prepare {provider.title()} Application Shield connector"
            active = next((job for job in job_store.list() if job.type == job_type and job.status in {"queued", "running"}), None)
            if active:
                job = active
            else:
                job = job_store.enqueue_provider_shield_connector(f"application-shield-{provider}-{secrets.token_hex(8)}", provider)
            result = overview.model_dump(mode="json")
            result.update({"status": "queued", "job_id": job.id, "message": f"{provider.title()} Application Shield connector preparation queued. It will attach automatically after validation."})
            return result
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/connectors/{provider}/detach")
def detach_connector(provider: str, user=Depends(require_user)):
    try:
        return application_shield_service.detach(provider)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/install")
def install(user=Depends(require_user)):
    active = next((job for job in job_store.list() if job.type == "Install Application Shield bundle" and job.status in {"queued", "running"}), None)
    if active:
        return {"status": "already_running", "job_id": active.id, "message": active.message or "Application Shield installation is already running."}
    job_id = f"application-shield-{secrets.token_hex(8)}"
    job = job_store.enqueue_application_shield(job_id)
    return {"status": "queued", "job_id": job.id, "message": "Application Shield installation queued and started in the background."}
