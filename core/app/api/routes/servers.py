from fastapi import APIRouter, Depends

from app.api.dependencies import require_user
from app.models.server import ServerSummary

router = APIRouter(prefix="/api/v1/servers", tags=["servers"])


@router.get("", response_model=list[ServerSummary])
def list_servers(user=Depends(require_user)):
    return [ServerSummary(id="local-dev", name="Development node", status="pending")]
