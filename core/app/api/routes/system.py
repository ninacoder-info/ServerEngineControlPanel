from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.api.dependencies import require_user

router = APIRouter(prefix="/api/v1", tags=["system"])


@router.get("/health")
def health():
    return {"status": "ok", "service": "server-engine-core", "version": "0.1.0", "timestamp": datetime.now(timezone.utc)}


@router.get("/capabilities")
def capabilities(user=Depends(require_user)):
    return {"api_version": "v1", "agent_connected": False, "providers": []}
