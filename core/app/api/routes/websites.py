from fastapi import APIRouter, Depends, status

from app.api.dependencies import require_user
from app.models.website import WebsiteActionRequest, WebsiteCreateRequest, WebsiteUpdateRequest
from app.services.website_service import website_service

router = APIRouter(prefix="/api/v1/websites", tags=["websites"])


@router.get("")
def list_websites(user=Depends(require_user)):
    return website_service.list()


@router.get("/{website_id}")
def get_website(website_id: str, user=Depends(require_user)):
    site = website_service.get(website_id)
    if site is None:
        from fastapi import HTTPException
        raise HTTPException(404, "Website not found")
    return site


@router.post("", status_code=status.HTTP_201_CREATED)
def create_website(payload: WebsiteCreateRequest, user=Depends(require_user)):
    return website_service.create(payload)


@router.patch("/{website_id}")
def update_website(website_id: str, payload: WebsiteUpdateRequest, user=Depends(require_user)):
    return website_service.update(website_id, payload)


@router.post("/{website_id}/actions")
def website_action(website_id: str, payload: WebsiteActionRequest, user=Depends(require_user)):
    return website_service.action(website_id, payload.action)


@router.delete("/{website_id}")
def delete_website(website_id: str, remove_files: bool = False, user=Depends(require_user)):
    website_service.delete(website_id, remove_files)
    return {"deleted": True}
