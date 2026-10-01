from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import require_user
from app.models.email import AutoresponderRequest, FilterRequest, ForwarderRequest, MailboxRequest
from app.services.email_service import email_service

router = APIRouter(prefix="/api/v1/email", tags=["email"])


@router.get("/summary")
def summary(user=Depends(require_user)):
    return email_service.summary()


@router.get("/deliverability")
def deliverability(refresh: bool = False, user=Depends(require_user)):
    return email_service.deliverability(refresh=refresh)


@router.get("/mailboxes")
def mailboxes(user=Depends(require_user)):
    return email_service.mailboxes()


@router.post("/mailboxes", status_code=status.HTTP_201_CREATED)
def create_mailbox(payload: MailboxRequest, user=Depends(require_user)):
    try:
        return email_service.create_mailbox(payload)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.delete("/mailboxes/{mailbox_id}")
def delete_mailbox(mailbox_id: str, user=Depends(require_user)):
    if not email_service.delete_mailbox(mailbox_id):
        raise HTTPException(404, "Mailbox not found")
    return {"deleted": True}


@router.get("/forwarders")
def forwarders(user=Depends(require_user)):
    return email_service.forwarders()


@router.post("/forwarders", status_code=status.HTTP_201_CREATED)
def create_forwarder(payload: ForwarderRequest, user=Depends(require_user)):
    try:
        return email_service.save_forwarder(payload)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.put("/forwarders/{forwarder_id}")
def update_forwarder(forwarder_id: str, payload: ForwarderRequest, user=Depends(require_user)):
    try:
        result = email_service.save_forwarder(payload, forwarder_id)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    if result is None:
        raise HTTPException(404, "Forwarder not found")
    return result


@router.delete("/forwarders/{forwarder_id}")
def delete_forwarder(forwarder_id: str, user=Depends(require_user)):
    if not email_service.delete_forwarder(forwarder_id):
        raise HTTPException(404, "Forwarder not found")
    return {"deleted": True}


@router.get("/autoresponders")
def autoresponders(user=Depends(require_user)):
    return email_service.autoresponders()


@router.post("/autoresponders", status_code=status.HTTP_201_CREATED)
def create_autoresponder(payload: AutoresponderRequest, user=Depends(require_user)):
    try:
        return email_service.save_autoresponder(payload)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.put("/autoresponders/{autoresponder_id}")
def update_autoresponder(autoresponder_id: str, payload: AutoresponderRequest, user=Depends(require_user)):
    try:
        result = email_service.save_autoresponder(payload, autoresponder_id)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    if result is None:
        raise HTTPException(404, "Autoresponder not found")
    return result


@router.delete("/autoresponders/{autoresponder_id}")
def delete_autoresponder(autoresponder_id: str, user=Depends(require_user)):
    if not email_service.delete_autoresponder(autoresponder_id):
        raise HTTPException(404, "Autoresponder not found")
    return {"deleted": True}


@router.get("/filters")
def filters(user=Depends(require_user)):
    return email_service.filters()


@router.post("/filters", status_code=status.HTTP_201_CREATED)
def create_filter(payload: FilterRequest, user=Depends(require_user)):
    try:
        return email_service.save_filter(payload)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.put("/filters/{filter_id}")
def update_filter(filter_id: str, payload: FilterRequest, user=Depends(require_user)):
    try:
        result = email_service.save_filter(payload, filter_id)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    if result is None:
        raise HTTPException(404, "Filter not found")
    return result


@router.delete("/filters/{filter_id}")
def delete_filter(filter_id: str, user=Depends(require_user)):
    if not email_service.delete_filter(filter_id):
        raise HTTPException(404, "Filter not found")
    return {"deleted": True}
