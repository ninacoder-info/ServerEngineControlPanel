from fastapi import APIRouter, Depends, status

from app.api.dependencies import require_user
from app.models.domain import DomainCreateRequest, DomainRecordRequest
from app.services.domain_service import domain_service

router = APIRouter(prefix="/api/v1/domains", tags=["domains"])


@router.get("")
def list_domains(user=Depends(require_user)):
    return domain_service.list()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_domain(payload: DomainCreateRequest, user=Depends(require_user)):
    return domain_service.create(payload)


@router.get("/{domain}/records")
def list_records(domain: str, user=Depends(require_user)):
    return {"domain": domain, "records": domain_service.records(domain)}


@router.post("/{domain}/records", status_code=status.HTTP_201_CREATED)
def add_record(domain: str, payload: DomainRecordRequest, user=Depends(require_user)):
    return domain_service.add_record(domain, payload)


@router.delete("/{domain}/records/{record_id}")
def delete_record(domain: str, record_id: int, user=Depends(require_user)):
    domain_service.delete_record(domain, record_id)
    return {"deleted": True}
