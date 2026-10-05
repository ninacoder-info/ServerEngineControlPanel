from fastapi import APIRouter, Depends, status

from app.api.dependencies import require_user
from app.models.domain import CloudflareSettingsRequest, DomainCreateRequest, DomainRecordRequest, DomainRedirectRequest
from app.services.domain_service import domain_service

router = APIRouter(prefix="/api/v1/domains", tags=["domains"])


@router.get("")
def list_domains(user=Depends(require_user)):
    return domain_service.list()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_domain(payload: DomainCreateRequest, user=Depends(require_user)):
    return domain_service.create(payload)


@router.delete("/{domain}")
def delete_domain(domain: str, user=Depends(require_user)):
    domain_service.delete(domain)
    return {"deleted": True}


@router.get("/{domain}/records")
def list_records(domain: str, user=Depends(require_user)):
    return {"domain": domain, "records": domain_service.records(domain)}


@router.get("/cloudflare/status")
def cloudflare_status(user=Depends(require_user)):
    return domain_service.cloudflare_status()


@router.get("/bind9/configuration")
def bind9_configuration(user=Depends(require_user)):
    return domain_service.bind9_config()


@router.put("/bind9/configuration")
def save_bind9_configuration(payload: dict, user=Depends(require_user)):
    return domain_service.save_bind9_config(payload)


@router.get("/unbound/configuration")
def unbound_configuration(user=Depends(require_user)):
    return domain_service.unbound_config()


@router.put("/unbound/configuration")
def save_unbound_configuration(payload: dict, user=Depends(require_user)):
    return domain_service.save_unbound_config(payload)


@router.post("/cloudflare/settings")
def save_cloudflare_settings(payload: CloudflareSettingsRequest, user=Depends(require_user)):
    return domain_service.save_cloudflare(payload)


@router.post("/{domain}/records", status_code=status.HTTP_201_CREATED)
def add_record(domain: str, payload: DomainRecordRequest, user=Depends(require_user)):
    return domain_service.add_record(domain, payload)


@router.put("/{domain}/records/{record_id}")
def update_record(domain: str, record_id: int, payload: DomainRecordRequest, user=Depends(require_user)):
    return domain_service.update_record(domain, record_id, payload)


@router.delete("/{domain}/records/{record_id}")
def delete_record(domain: str, record_id: int, user=Depends(require_user)):
    domain_service.delete_record(domain, record_id)
    return {"deleted": True}


@router.get("/{domain}/redirects")
def list_redirects(domain: str, user=Depends(require_user)):
    return {"domain": domain, "redirects": domain_service.redirects(domain)}


@router.get("/certificates")
def list_certificates(user=Depends(require_user)):
    return {"certificates": domain_service.certificates()}


@router.post("/{domain}/redirects", status_code=status.HTTP_201_CREATED)
def create_redirect(domain: str, payload: DomainRedirectRequest, user=Depends(require_user)):
    return domain_service.save_redirect(domain, payload)


@router.put("/{domain}/redirects/{redirect_id}")
def update_redirect(domain: str, redirect_id: str, payload: DomainRedirectRequest, user=Depends(require_user)):
    return domain_service.save_redirect(domain, payload, redirect_id)


@router.delete("/{domain}/redirects/{redirect_id}")
def delete_redirect(domain: str, redirect_id: str, user=Depends(require_user)):
    domain_service.delete_redirect(domain, redirect_id)
    return {"deleted": True}
