from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import require_user

router = APIRouter(prefix="/api/v1/api-access", tags=["api-access"])


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
    return request.app.state.auth_service.store.create_api_token(
        user["id"],
        payload.name.strip(),
        payload.scopes,
        payload.expires_days,
        device_name=payload.device_name or payload.name.strip(),
        platform=payload.platform,
        created_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.delete("/tokens/{token_id}")
def revoke_token(token_id: int, request: Request, user=Depends(require_user)):
    if not request.app.state.auth_service.store.revoke_api_token(user["id"], token_id):
        raise HTTPException(status_code=404, detail="API token not found")
    return {"revoked": True}


@router.post("/pairing")
def create_pairing(request: Request, user=Depends(require_user)):
    pairing = request.app.state.auth_service.store.create_pairing(user["id"])
    pairing["server_url"] = str(request.base_url).rstrip("/")
    pairing["payload"] = f"server-engine://pair?server={pairing['server_url']}&code={pairing['code']}"
    return pairing


@router.post("/pairing/exchange")
def exchange_pairing(payload: PairingExchange, request: Request):
    token = request.app.state.auth_service.store.exchange_pairing(payload.code, payload.device_name.strip(), payload.platform)
    if not token:
        raise HTTPException(status_code=400, detail="Pairing code is invalid or expired")
    return token
