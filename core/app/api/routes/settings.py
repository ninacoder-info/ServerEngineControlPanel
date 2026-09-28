from fastapi import APIRouter, Depends

from app.api.dependencies import require_user
from app.models.settings import SettingsUpdate
from app.services.settings_service import (
    DEFAULT_SETTINGS,
    CERTIFICATE_SETTINGS_KEYS,
    PANEL_SETTINGS_KEYS,
    SECURITY_SETTINGS_KEYS,
    STORAGE_SETTINGS_KEYS,
    NOTIFICATION_SETTINGS_KEYS,
    MAINTENANCE_SETTINGS_KEYS,
    API_SETTINGS_KEYS,
    settings_service,
)

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("/api")
def get_api_settings(user=Depends(require_user)):
    defaults = {key: DEFAULT_SETTINGS[key] for key in API_SETTINGS_KEYS}
    return {"values": settings_service.read_api(), "defaults": defaults}


@router.patch("/api")
def update_api_settings(payload: SettingsUpdate, user=Depends(require_user)):
    return {"saved": True, "values": settings_service.update_api(payload.values)}


@router.post("/api/reset")
def reset_api_settings(user=Depends(require_user)):
    return {"saved": True, "values": settings_service.reset_api()}


@router.get("/panel")
def get_panel_settings(user=Depends(require_user)):
    defaults = {key: DEFAULT_SETTINGS[key] for key in PANEL_SETTINGS_KEYS}
    return {"values": settings_service.read_panel(), "defaults": defaults}


@router.patch("/panel")
def update_panel_settings(payload: SettingsUpdate, user=Depends(require_user)):
    return {"saved": True, "values": settings_service.update_panel(payload.values)}


@router.post("/panel/reset")
def reset_panel_settings(user=Depends(require_user)):
    return {"saved": True, "values": settings_service.reset_panel()}


@router.get("/storage")
def get_storage_settings(user=Depends(require_user)):
    defaults = {key: DEFAULT_SETTINGS[key] for key in STORAGE_SETTINGS_KEYS}
    return {"values": settings_service.read_storage(), "defaults": defaults}


@router.patch("/storage")
def update_storage_settings(payload: SettingsUpdate, user=Depends(require_user)):
    return {"saved": True, "values": settings_service.update_storage(payload.values)}


@router.post("/storage/reset")
def reset_storage_settings(user=Depends(require_user)):
    return {"saved": True, "values": settings_service.reset_storage()}


@router.get("/security")
def get_security_settings(user=Depends(require_user)):
    defaults = {key: DEFAULT_SETTINGS[key] for key in SECURITY_SETTINGS_KEYS}
    return {"values": settings_service.read_security(), "defaults": defaults}


@router.patch("/security")
def update_security_settings(payload: SettingsUpdate, user=Depends(require_user)):
    return {"saved": True, "values": settings_service.update_security(payload.values)}


@router.post("/security/reset")
def reset_security_settings(user=Depends(require_user)):
    return {"saved": True, "values": settings_service.reset_security()}


@router.get("/notifications")
def get_notification_settings(user=Depends(require_user)):
    defaults = {key: DEFAULT_SETTINGS[key] for key in NOTIFICATION_SETTINGS_KEYS}
    return {"values": settings_service.read_notifications(), "defaults": defaults}


@router.patch("/notifications")
def update_notification_settings(payload: SettingsUpdate, user=Depends(require_user)):
    return {"saved": True, "values": settings_service.update_notifications(payload.values)}


@router.post("/notifications/reset")
def reset_notification_settings(user=Depends(require_user)):
    return {"saved": True, "values": settings_service.reset_notifications()}


@router.get("/certificates")
def get_certificate_settings(user=Depends(require_user)):
    defaults = {key: DEFAULT_SETTINGS[key] for key in CERTIFICATE_SETTINGS_KEYS}
    return {"values": settings_service.read_certificates(), "defaults": defaults}


@router.patch("/certificates")
def update_certificate_settings(payload: SettingsUpdate, user=Depends(require_user)):
    return {"saved": True, "values": settings_service.update_certificates(payload.values)}


@router.post("/certificates/reset")
def reset_certificate_settings(user=Depends(require_user)):
    return {"saved": True, "values": settings_service.reset_certificates()}


@router.get("/maintenance")
def get_maintenance_settings(user=Depends(require_user)):
    defaults = {key: DEFAULT_SETTINGS[key] for key in MAINTENANCE_SETTINGS_KEYS}
    return {"values": settings_service.read_maintenance(), "defaults": defaults}


@router.patch("/maintenance")
def update_maintenance_settings(payload: SettingsUpdate, user=Depends(require_user)):
    return {"saved": True, "values": settings_service.update_maintenance(payload.values)}


@router.post("/maintenance/reset")
def reset_maintenance_settings(user=Depends(require_user)):
    return {"saved": True, "values": settings_service.reset_maintenance()}


@router.get("")
def get_settings(user=Depends(require_user)):
    return {"values": settings_service.read(), "defaults": DEFAULT_SETTINGS}


@router.patch("")
def update_settings(payload: SettingsUpdate, user=Depends(require_user)):
    return {"saved": True, "values": settings_service.update(payload.values)}


@router.post("/reset")
def reset_settings(user=Depends(require_user)):
    return {"saved": True, "values": settings_service.reset()}
