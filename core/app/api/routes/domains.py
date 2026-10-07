from fastapi import APIRouter, Depends, status
import uuid

from app.api.dependencies import require_user
from app.models.domain import CloudflareSettingsRequest, DomainCreateRequest, DomainRecordRequest, DomainRedirectRequest
from app.services.domain_service import domain_service
from app.services.job_service import job_store
from app.services.account_isolation import account_isolation

router = APIRouter(prefix="/api/v1/domains", tags=["domains"])


@router.get("")
def list_domains(user=Depends(require_user)):
    domains = domain_service.list()
    owned = account_isolation.filter_owned(user, "domain", [item["domain"] for item in domains])
    return domains if owned is None else [item for item in domains if item["domain"] in owned]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_domain(payload: DomainCreateRequest, user=Depends(require_user)):
    created = domain_service.create(payload)
    account_isolation.claim(user, "domain", created["domain"])
    job_store.publish({"type": "email-domain-updated", "action": "domain-created", "domain": created})
    job_store.enqueue_email_domain_sync(f"email-domain-sync-{uuid.uuid4().hex[:12]}", created["domain"])
    return created


@router.delete("/{domain}")
def delete_domain(domain: str, user=Depends(require_user)):
    account_isolation.assert_access(user, "domain", domain)
    domain_service.delete(domain)
    account_isolation.release("domain", domain)
    job_store.publish({"type": "email-domain-updated", "action": "domain-deleted", "domain": domain})
    return {"deleted": True}


@router.get("/{domain}/records")
def list_records(domain: str, user=Depends(require_user)):
    account_isolation.assert_access(user, "domain", domain)
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
    account_isolation.assert_access(user, "domain", domain)
    return domain_service.add_record(domain, payload)


@router.put("/{domain}/records/{record_id}")
def update_record(domain: str, record_id: int, payload: DomainRecordRequest, user=Depends(require_user)):
    account_isolation.assert_access(user, "domain", domain)
    return domain_service.update_record(domain, record_id, payload)


@router.delete("/{domain}/records/{record_id}")
def delete_record(domain: str, record_id: int, user=Depends(require_user)):
    account_isolation.assert_access(user, "domain", domain)
    domain_service.delete_record(domain, record_id)
    return {"deleted": True}


@router.get("/{domain}/redirects")
def list_redirects(domain: str, user=Depends(require_user)):
    account_isolation.assert_access(user, "domain", domain)
    return {"domain": domain, "redirects": domain_service.redirects(domain)}


@router.get("/certificates")
def list_certificates(user=Depends(require_user)):
    return {"certificates": domain_service.certificates()}


@router.post("/{domain}/redirects", status_code=status.HTTP_201_CREATED)
def create_redirect(domain: str, payload: DomainRedirectRequest, user=Depends(require_user)):
    account_isolation.assert_access(user, "domain", domain)
    return domain_service.save_redirect(domain, payload)


@router.put("/{domain}/redirects/{redirect_id}")
def update_redirect(domain: str, redirect_id: str, payload: DomainRedirectRequest, user=Depends(require_user)):
    account_isolation.assert_access(user, "domain", domain)
    return domain_service.save_redirect(domain, payload, redirect_id)


@router.delete("/{domain}/redirects/{redirect_id}")
def delete_redirect(domain: str, redirect_id: str, user=Depends(require_user)):
    account_isolation.assert_access(user, "domain", domain)
    domain_service.delete_redirect(domain, redirect_id)
    return {"deleted": True}
