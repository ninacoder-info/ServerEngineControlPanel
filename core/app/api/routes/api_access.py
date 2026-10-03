from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import require_user
from app.services.job_service import job_store

router = APIRouter(prefix="/api/v1/api-access", tags=["api-access"])


def _audit(request: Request, user, action: str, target: str, detail: str, metadata: dict | None = None, status: str = "success"):
    event = request.app.state.auth_service.store.record_activity(
        "access",
        action,
        user.get("username", "unknown") if user else "anonymous",
        target,
        detail,
        status,
        metadata=metadata,
        actor_user_id=user.get("id") if user else None,
        source_ip=request.client.host if request.client else None,
    )
    job_store.publish({"type": "activity", "event": event})


class TokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scopes: list[str] = Field(default_factory=list)
    expires_days: int | None = Field(default=90, ge=1, le=3650)
    device_name: str | None = Field(default=None, max_length=120)
    platform: str = Field(default="web", pattern="^(ios|android|web)$")


class PairingExchange(BaseModel):
    code: str = Field(min_length=10, max_length=200)
    device_name: str = Field(default="Mobile device", min_length=1, max_length=80)
    platform: str = Field(default="ios", pattern="^(ios|android|web)$")


@router.get("/tokens")
def list_tokens(request: Request, user=Depends(require_user)):
    return {"tokens": request.app.state.auth_service.store.api_tokens_for_user(user["id"])}


@router.post("/tokens")
def create_token(payload: TokenCreate, request: Request, user=Depends(require_user)):
    token = request.app.state.auth_service.store.create_api_token(
        user["id"],
        payload.name.strip(),
        payload.scopes,
        payload.expires_days,
        device_name=payload.device_name or payload.name.strip(),
        platform=payload.platform,
        created_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    _audit(request, user, "api-token.created", payload.name.strip(), f"Created API access token {payload.name.strip()}.", {"Scopes": payload.scopes, "Platform": payload.platform, "Expires (days)": payload.expires_days or "Never"})
    return token


@router.delete("/tokens/{token_id}")
def revoke_token(token_id: int, request: Request, user=Depends(require_user)):
    if not request.app.state.auth_service.store.revoke_api_token(user["id"], token_id):
        raise HTTPException(status_code=404, detail="API token not found")
    _audit(request, user, "api-token.revoked", str(token_id), f"Revoked API access token {token_id}.")
    return {"revoked": True}


@router.post("/pairing")
def create_pairing(request: Request, user=Depends(require_user)):
    pairing = request.app.state.auth_service.store.create_pairing(user["id"])
    pairing["server_url"] = str(request.base_url).rstrip("/")
    pairing["payload"] = f"server-engine://pair?server={pairing['server_url']}&code={pairing['code']}"
    _audit(request, user, "device-pairing.created", "mobile-device", "Created a short-lived mobile device pairing code.", {"Expires": pairing.get("expires_at")})
    return pairing


@router.post("/pairing/exchange")
def exchange_pairing(payload: PairingExchange, request: Request):
    token = request.app.state.auth_service.store.exchange_pairing(payload.code, payload.device_name.strip(), payload.platform)
    if not token:
        _audit(request, None, "device-pairing.failed", payload.device_name.strip(), "Rejected an invalid or expired device pairing code.", {"Platform": payload.platform}, "error")
        raise HTTPException(status_code=400, detail="Pairing code is invalid or expired")
    _audit(request, None, "device-pairing.completed", payload.device_name.strip(), "Completed mobile device pairing.", {"Platform": payload.platform})
    return token
