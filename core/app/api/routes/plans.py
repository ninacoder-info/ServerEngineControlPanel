import re
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.dependencies import require_user
from app.services.job_service import job_store

router = APIRouter(prefix="/api/v1/plans", tags=["hosting-plans"])
PLAN_ID = re.compile(r"^[a-z][a-z0-9_-]{2,63}$")
VALID_WEBSERVERS = {"nginx", "apache", "openlitespeed", "caddy"}
VALID_DATABASES = {"mysql", "mariadb", "postgresql", "none"}


class PlanPayload(BaseModel):
    id: str = Field(min_length=3, max_length=64, pattern=r"^[a-z][a-z0-9_-]*$")
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=240)
    disk_quota_mb: int = Field(default=10240, ge=0, le=10_000_000)
    bandwidth_quota_mb: int = Field(default=102400, ge=0, le=100_000_000)
    websites_quota: int = Field(default=1, ge=1, le=10_000)
    databases_quota: int = Field(default=2, ge=0, le=10_000)
    mailboxes_quota: int = Field(default=5, ge=0, le=100_000)
    ftp_quota: int = Field(default=2, ge=0, le=10_000)
    cron_quota: int = Field(default=5, ge=0, le=10_000)
    php_version: str = Field(default="latest", min_length=1, max_length=32)
    webserver: str = Field(default="nginx", min_length=1, max_length=32)
    database_engine: str = Field(default="mysql", min_length=1, max_length=32)
    features: list[str] = Field(default_factory=list, max_length=30)
    status: str = Field(default="active", pattern="^(active|suspended)$")


class PlanDelete(BaseModel):
    replacement_plan: str | None = Field(default=None, max_length=64)


def _admin(user):
    if user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="Only the administrator can manage hosting plans")


def _audit(request: Request, user, action: str, target: str, detail: str, metadata=None):
    event = request.app.state.auth_service.store.record_activity("hosting", action, user["username"], target, detail, "success", metadata=metadata or {}, actor_user_id=user["id"], source_ip=request.client.host if request.client else None)
    job_store.publish({"type": "plans", "action": action, "plan": target, "event": event})


def _validated(payload: PlanPayload, plan_id: str | None = None):
    values = payload.model_dump()
    if plan_id is not None:
        values["id"] = plan_id
    if not PLAN_ID.fullmatch(values["id"]):
        raise HTTPException(status_code=422, detail="Plan ID must use lowercase letters, numbers, underscores, or hyphens")
    values["webserver"] = values["webserver"].lower()
    values["database_engine"] = values["database_engine"].lower()
    if values["webserver"] not in VALID_WEBSERVERS:
        raise HTTPException(status_code=422, detail="Unsupported web server")
    if values["database_engine"] not in VALID_DATABASES:
        raise HTTPException(status_code=422, detail="Unsupported database engine")
    values["name"] = values["name"].strip()
    values["description"] = values["description"].strip()
    values["features"] = sorted(set(values["features"]))
    return values


@router.get("")
def list_plans(request: Request, user=Depends(require_user)):
    _admin(user)
    return {"plans": request.app.state.auth_service.store.list_hosting_plans()}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_plan(payload: PlanPayload, request: Request, user=Depends(require_user)):
    _admin(user)
    values = _validated(payload)
    try:
        plan = request.app.state.auth_service.store.create_hosting_plan(values)
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="That plan ID already exists") from error
    _audit(request, user, "hosting-plan.created", plan["id"], f"Created hosting plan {plan['name']}.", {"Name": plan["name"]})
    return plan


@router.put("/{plan_id}")
def update_plan(plan_id: str, payload: PlanPayload, request: Request, user=Depends(require_user)):
    _admin(user)
    if payload.id != plan_id:
        raise HTTPException(status_code=422, detail="Plan ID cannot be changed")
    plan = request.app.state.auth_service.store.update_hosting_plan(plan_id, _validated(payload, plan_id))
    if plan is None:
        raise HTTPException(status_code=404, detail="Hosting plan not found")
    _audit(request, user, "hosting-plan.updated", plan["id"], f"Updated hosting plan {plan['name']}.", {"Assigned accounts": plan["assigned_count"]})
    return plan


@router.delete("/{plan_id}")
def delete_plan(plan_id: str, request: Request, payload: PlanDelete | None = None, user=Depends(require_user)):
    _admin(user)
    ok, assigned = request.app.state.auth_service.store.delete_hosting_plan(plan_id, payload.replacement_plan if payload else None)
    if not ok:
        if any(plan["id"] == plan_id and plan["system_plan"] for plan in request.app.state.auth_service.store.list_hosting_plans()):
            raise HTTPException(status_code=403, detail="Built-in plans cannot be deleted")
        if assigned:
            raise HTTPException(status_code=409, detail=f"This plan is assigned to {assigned} account(s). Choose a replacement plan first.")
        raise HTTPException(status_code=404, detail="Hosting plan not found")
    _audit(request, user, "hosting-plan.deleted", plan_id, f"Deleted hosting plan {plan_id}.", {"Moved accounts": assigned})
    return {"ok": True, "plan_id": plan_id, "moved_accounts": assigned}
