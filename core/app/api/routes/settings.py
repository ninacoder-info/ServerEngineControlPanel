from fastapi import APIRouter, Depends

from app.api.dependencies import require_user
from app.models.settings import SettingsUpdate
from app.services.settings_service import DEFAULT_SETTINGS, settings_service

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("")
def get_settings(user=Depends(require_user)):
    return {"values": settings_service.read(), "defaults": DEFAULT_SETTINGS}


@router.patch("")
def update_settings(payload: SettingsUpdate, user=Depends(require_user)):
    return {"saved": True, "values": settings_service.update(payload.values)}


@router.post("/reset")
def reset_settings(user=Depends(require_user)):
    return {"saved": True, "values": settings_service.reset()}
