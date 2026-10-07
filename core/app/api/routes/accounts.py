import re
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.dependencies import require_user
from app.services.job_service import job_store
from app.services.account_isolation import account_isolation


router = APIRouter(prefix="/api/v1/accounts", tags=["hosting-accounts"])
USERNAME = re.compile(r"^[a-z][a-z0-9._-]{2,63}$")


class HostingAccountCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=12, max_length=256)
    account_name: str = Field(min_length=1, max_length=120)
    primary_domain: str = Field(min_length=3, max_length=253)
    email: str = Field(default="", max_length=320)
    package_id: str = Field(default="starter", max_length=64)
    disk_quota_mb: int = Field(default=10240, ge=0, le=10_000_000)
    bandwidth_quota_mb: int = Field(default=102400, ge=0, le=100_000_000)
    websites_quota: int = Field(default=1, ge=1, le=10_000)
    feature_flags: dict[str, bool] = Field(default_factory=dict)


class HostingAccountStatus(BaseModel):
    status: str = Field(pattern=r"^(active|suspended)$")


def _require_admin(user):
    if user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="Only the administrator can manage hosting accounts")


def _audit(request, user, action, target, detail, metadata=None):
    event = request.app.state.auth_service.store.record_activity("hosting", action, user.get("username", "unknown"), target, detail, "success", metadata=metadata, actor_user_id=user.get("id"), source_ip=request.client.host if request.client else None)
    job_store.publish({"type": "activity", "event": event})


@router.get("")
def list_accounts(request: Request, user=Depends(require_user)):
    _require_admin(user)
    return {"accounts": request.app.state.auth_service.store.list_hosting_accounts()}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_account(payload: HostingAccountCreate, request: Request, user=Depends(require_user)):
    _require_admin(user)
    username = payload.username.strip().lower()
    if not USERNAME.fullmatch(username):
        raise HTTPException(status_code=422, detail="Username must start with a letter and contain only lowercase letters, numbers, dots, underscores, or hyphens")
    plan = next((item for item in request.app.state.auth_service.store.list_hosting_plans() if item["id"] == payload.package_id), None)
    if plan is None:
        raise HTTPException(status_code=422, detail="Select an existing hosting plan")
    if plan["status"] != "active":
        raise HTTPException(status_code=422, detail="That hosting plan is suspended and cannot be assigned")
    try:
        account = request.app.state.auth_service.store.create_hosting_account(
            username=username,
            password=payload.password,
            account_name=payload.account_name.strip(),
            primary_domain=payload.primary_domain.strip().lower(),
            email=payload.email.strip(),
            package_id=payload.package_id,
            disk_quota_mb=plan["disk_quota_mb"],
            bandwidth_quota_mb=plan["bandwidth_quota_mb"],
            websites_quota=plan["websites_quota"],
            databases_quota=plan["databases_quota"],
            mailboxes_quota=plan["mailboxes_quota"],
            ftp_quota=plan["ftp_quota"],
            cron_quota=plan["cron_quota"],
            feature_flags={"plan_features": plan["features"], **payload.feature_flags},
        )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="That username or hosting home is already in use") from error
    job_store.publish({"type": "hosting-accounts", "action": "created", "account": account})
    _audit(request, user, "hosting-account.created", account["account_name"], f"Created hosting account {account['account_name']}.", metadata={"Username": account["username"], "Domain": account["primary_domain"], "Package": account["package_id"]})
    return account


@router.get("/{account_id}/usage")
def account_usage(account_id: int, request: Request, user=Depends(require_user)):
    _require_admin(user)
    account = next((item for item in request.app.state.auth_service.store.list_hosting_accounts() if item["id"] == account_id), None)
    if account is None:
        raise HTTPException(status_code=404, detail="Hosting account not found")
    return {"account_id": account_id, "status": account["status"], "usage": account_isolation.usage(account_id), "quotas": {key: account[key] for key in ("websites_quota", "databases_quota", "mailboxes_quota", "ftp_quota", "cron_quota")}}


@router.patch("/{account_id}/status")
def update_account_status(account_id: int, payload: HostingAccountStatus, request: Request, user=Depends(require_user)):
    _require_admin(user)
    account = account_isolation.set_status(account_id, payload.status)
    if account is None:
        raise HTTPException(status_code=404, detail="Hosting account not found")
    request.app.state.auth_service.store.record_activity("hosting", f"hosting-account.{payload.status}", user["username"], account["account_name"], f"Set hosting account status to {payload.status}.", "success", actor_user_id=user["id"])
    job_store.publish({"type": "hosting-accounts", "action": "status-changed", "account": account})
    return account


@router.delete("/{account_id}")
def delete_account(account_id: int, request: Request, user=Depends(require_user)):
    _require_admin(user)
    account = account_isolation.soft_delete(account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Hosting account not found")
    job_store.publish({"type": "hosting-accounts", "action": "deleted", "account": account})
    return {"deleted": True, "recoverable": True, "account": account}


@router.post("/{account_id}/restore")
def restore_account(account_id: int, request: Request, user=Depends(require_user)):
    _require_admin(user)
    account = account_isolation.restore(account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="No deleted hosting account can be restored")
    job_store.publish({"type": "hosting-accounts", "action": "restored", "account": account})
    return {"restored": True, "account": account}
