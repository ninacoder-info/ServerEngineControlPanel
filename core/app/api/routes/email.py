from fastapi import APIRouter, Depends, HTTPException, status
import uuid

from app.api.dependencies import require_user
from app.services.account_isolation import account_isolation
from app.models.email import AutoresponderRequest, FilterRequest, ForwarderRequest, MailboxRequest, MailDomainCheckRequest, MailDomainRequest
from app.services.email_service import email_service
from app.services.job_service import job_store

router = APIRouter(prefix="/api/v1/email", tags=["email"])


def _owned(user, resource_type: str, rows: list[dict], key: str = "id"):
    ids = [str(row[key]) for row in rows if row.get(key) is not None]
    visible = account_isolation.filter_owned(user, resource_type, ids)
    return rows if visible is None else [row for row in rows if str(row.get(key)) in visible]


def _assert_address(user, address: str):
    account_isolation.assert_access(user, "mailbox", address)


@router.get("/summary")
def summary(user=Depends(require_user)):
    summary = email_service.summary()
    visible = _owned(user, "mailbox", email_service.mailboxes(), "address")
    if account_isolation.account_for_user(user):
        summary["mailboxes"] = len(visible)
        summary["domains"] = len({item.get("domain") for item in visible})
        summary["storage_used_bytes"] = sum(int(item.get("used_bytes") or 0) for item in visible)
        summary["storage_quota_bytes"] = sum(int(item.get("quota_bytes") or 0) for item in visible)
    return summary


@router.get("/deliverability")
def deliverability(refresh: bool = False, user=Depends(require_user)):
    return email_service.deliverability(refresh=refresh)


@router.get("/mailboxes")
def mailboxes(user=Depends(require_user)):
    return _owned(user, "mailbox", email_service.mailboxes(), "address")


@router.get("/domains")
def mail_domains(user=Depends(require_user)):
    return _owned(user, "mail-domain", email_service.mail_domains(), "domain")


@router.post("/domains/check")
def check_mail_domain(payload: MailDomainCheckRequest, user=Depends(require_user)):
    try:
        return email_service.check_mail_domain_record(payload.domain, payload.record)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.post("/domains/guide")
def mail_domain_guide(payload: MailDomainRequest, user=Depends(require_user)):
    try:
        return email_service.mail_domain_guide(payload.domain)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except Exception as error:
        raise HTTPException(503, str(error)) from error


@router.post("/domains", status_code=status.HTTP_201_CREATED)
def create_mail_domain(payload: MailDomainRequest, user=Depends(require_user)):
    try:
        domain = email_service.create_mail_domain(payload.domain)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    result = dict(domain)
    account_isolation.claim(user, "mail-domain", result["domain"])
    job_store.publish({"type": "email-domain-updated", "action": "mail-domain-created", "domain": result})
    job_store.enqueue_email_domain_sync(f"email-domain-sync-{uuid.uuid4().hex[:12]}", result["domain"])
    return result


@router.post("/mailboxes", status_code=status.HTTP_202_ACCEPTED)
def create_mailbox(payload: MailboxRequest, user=Depends(require_user)):
    account_isolation.assert_quota(user, "mailbox")
    address = payload.address.strip().lower()
    account_isolation.assert_access(user, "mail-domain", address.rsplit("@", 1)[1])
    account_isolation.claim(user, "mailbox", address, check_quota=False)
    job_id = f"email-mailbox-create-{uuid.uuid4().hex[:12]}"
    return job_store.enqueue_email_mailbox_create(job_id, payload.model_dump())


@router.delete("/mailboxes/{mailbox_id}", status_code=status.HTTP_202_ACCEPTED)
def delete_mailbox(mailbox_id: str, user=Depends(require_user)):
    mailbox = next((item for item in email_service.mailboxes() if item.get("id") == mailbox_id), None)
    if mailbox is None:
        raise HTTPException(404, "Mailbox not found")
    _assert_address(user, mailbox["address"])
    job_id = f"email-mailbox-delete-{uuid.uuid4().hex[:12]}"
    return job_store.enqueue_email_mailbox_delete(job_id, mailbox_id)


@router.get("/forwarders")
def forwarders(user=Depends(require_user)):
    return _owned(user, "forwarder", email_service.forwarders())


@router.post("/forwarders", status_code=status.HTTP_201_CREATED)
def create_forwarder(payload: ForwarderRequest, user=Depends(require_user)):
    try:
        account_isolation.assert_access(user, "mail-domain", payload.source.strip().lower().rsplit("@", 1)[1])
        result = email_service.save_forwarder(payload)
        account_isolation.claim(user, "forwarder", result["id"])
        return result
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.put("/forwarders/{forwarder_id}")
def update_forwarder(forwarder_id: str, payload: ForwarderRequest, user=Depends(require_user)):
    account_isolation.assert_access(user, "forwarder", forwarder_id)
    account_isolation.assert_access(user, "mail-domain", payload.source.strip().lower().rsplit("@", 1)[1])
    try:
        result = email_service.save_forwarder(payload, forwarder_id)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    if result is None:
        raise HTTPException(404, "Forwarder not found")
    return result


@router.delete("/forwarders/{forwarder_id}")
def delete_forwarder(forwarder_id: str, user=Depends(require_user)):
    account_isolation.assert_access(user, "forwarder", forwarder_id)
    if not email_service.delete_forwarder(forwarder_id):
        raise HTTPException(404, "Forwarder not found")
    account_isolation.release("forwarder", forwarder_id)
    return {"deleted": True}


@router.get("/autoresponders")
def autoresponders(user=Depends(require_user)):
    rows = email_service.autoresponders()
    visible = account_isolation.filter_owned(user, "mailbox", [row["address"] for row in rows])
    return rows if visible is None else [row for row in rows if row["address"] in visible]


@router.post("/autoresponders", status_code=status.HTTP_201_CREATED)
def create_autoresponder(payload: AutoresponderRequest, user=Depends(require_user)):
    try:
        _assert_address(user, payload.address.strip().lower())
        return email_service.save_autoresponder(payload)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.put("/autoresponders/{autoresponder_id}")
def update_autoresponder(autoresponder_id: str, payload: AutoresponderRequest, user=Depends(require_user)):
    existing = next((row for row in email_service.autoresponders() if row["id"] == autoresponder_id), None)
    if existing is None:
        raise HTTPException(404, "Autoresponder not found")
    _assert_address(user, existing["address"])
    try:
        result = email_service.save_autoresponder(payload, autoresponder_id)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    if result is None:
        raise HTTPException(404, "Autoresponder not found")
    return result


@router.delete("/autoresponders/{autoresponder_id}")
def delete_autoresponder(autoresponder_id: str, user=Depends(require_user)):
    existing = next((row for row in email_service.autoresponders() if row["id"] == autoresponder_id), None)
    if existing is None:
        raise HTTPException(404, "Autoresponder not found")
    _assert_address(user, existing["address"])
    if not email_service.delete_autoresponder(autoresponder_id):
        raise HTTPException(404, "Autoresponder not found")
    return {"deleted": True}


@router.get("/filters")
def filters(user=Depends(require_user)):
    rows = email_service.filters()
    visible = account_isolation.filter_owned(user, "mailbox", [row["address"] for row in rows])
    return rows if visible is None else [row for row in rows if row["address"] in visible]


@router.post("/filters", status_code=status.HTTP_201_CREATED)
def create_filter(payload: FilterRequest, user=Depends(require_user)):
    try:
        _assert_address(user, payload.address.strip().lower())
        return email_service.save_filter(payload)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.put("/filters/{filter_id}")
def update_filter(filter_id: str, payload: FilterRequest, user=Depends(require_user)):
    existing = next((row for row in email_service.filters() if row["id"] == filter_id), None)
    if existing is None:
        raise HTTPException(404, "Filter not found")
    _assert_address(user, existing["address"])
    try:
        result = email_service.save_filter(payload, filter_id)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    if result is None:
        raise HTTPException(404, "Filter not found")
    return result


@router.delete("/filters/{filter_id}")
def delete_filter(filter_id: str, user=Depends(require_user)):
    existing = next((row for row in email_service.filters() if row["id"] == filter_id), None)
    if existing is None:
        raise HTTPException(404, "Filter not found")
    _assert_address(user, existing["address"])
    if not email_service.delete_filter(filter_id):
        raise HTTPException(404, "Filter not found")
    return {"deleted": True}
