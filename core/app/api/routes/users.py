import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
import sqlite3
from app.auth import BUILTIN_PANEL_ROLES

from app.api.dependencies import require_user
from app.services.job_service import job_store


router = APIRouter(prefix="/api/v1/users", tags=["users"])
USERNAME = re.compile(r"^[a-z][a-z0-9._-]{2,63}$")
PERMISSION_AREAS = {"websites", "domains", "files", "databases", "backups", "mail", "services", "logs", "firewall", "malware", "docker", "jobs", "cron", "supervisor"}


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=12, max_length=256)
    display_name: str = Field(default="", max_length=120)
    email: str = Field(default="", max_length=320)
    role: str = Field(default="viewer", max_length=40)


class RoleCreate(BaseModel):
    id: str = Field(min_length=3, max_length=64, pattern=r"^[a-z][a-z0-9_-]*$")
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=240)
    permissions: list[str] = Field(default_factory=list, max_length=30)


class RoleDelete(BaseModel):
    replacement_role: str | None = Field(default=None, max_length=64)


def _require_administrator(user):
    if user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="Only administrators can manage panel users")


def _audit(request, user, action, target, detail, status="success", metadata=None):
    event = request.app.state.auth_service.store.record_activity("access", action, user.get("username", "unknown"), target, detail, status, metadata=metadata, actor_user_id=user.get("id"), source_ip=request.client.host if request.client else None)
    job_store.publish({"type": "activity", "event": event})


@router.get("")
def list_users(request: Request, user=Depends(require_user)):
    _require_administrator(user)
    return {"users": request.app.state.auth_service.store.list_users()}


@router.get("/roles")
def list_roles(request: Request, user=Depends(require_user)):
    _require_administrator(user)
    return {"roles": request.app.state.auth_service.store.list_roles()}


@router.post("/roles", status_code=status.HTTP_201_CREATED)
def create_role(payload: RoleCreate, request: Request, user=Depends(require_user)):
    _require_administrator(user)
    if payload.id in {role[0] for role in BUILTIN_PANEL_ROLES}:
        raise HTTPException(status_code=409, detail="That role ID is reserved")
    invalid = sorted(set(payload.permissions) - PERMISSION_AREAS)
    if invalid:
        raise HTTPException(status_code=422, detail=f"Unsupported permission area: {invalid[0]}")
    try:
        role = request.app.state.auth_service.store.create_role(payload.id, payload.name.strip(), payload.description.strip(), sorted(set(payload.permissions)))
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="That role ID already exists") from error
    job_store.publish({"type": "roles", "action": "created", "role": role})
    _audit(request, user, "role.created", role["name"], f"Created panel role {role['name']}.", metadata={"Role ID": role["id"], "Permissions": role["permissions"]})
    return role


@router.put("/roles/{role_id}")
def update_role(role_id: str, payload: RoleCreate, request: Request, user=Depends(require_user)):
    _require_administrator(user)
    invalid = sorted(set(payload.permissions) - PERMISSION_AREAS)
    if invalid:
        raise HTTPException(status_code=422, detail=f"Unsupported permission area: {invalid[0]}")
    if payload.id != role_id:
        raise HTTPException(status_code=422, detail="Role ID cannot be changed")
    role = request.app.state.auth_service.store.update_role(role_id, payload.name.strip(), payload.description.strip(), sorted(set(payload.permissions)))
    if role is None:
        raise HTTPException(status_code=403, detail="Administrator is protected and cannot be edited")
    job_store.publish({"type": "roles", "action": "updated", "role": role})
    _audit(request, user, "role.updated", role["name"], f"Updated panel role {role['name']}.", metadata={"Role ID": role["id"], "Permissions": role["permissions"]})
    return role


@router.delete("/roles/{role_id}")
def delete_role(role_id: str, request: Request, payload: RoleDelete | None = None, user=Depends(require_user)):
    _require_administrator(user)
    replacement_role = payload.replacement_role if payload else None
    if not request.app.state.auth_service.store.delete_role(role_id, replacement_role):
        if role_id == "administrator":
            raise HTTPException(status_code=403, detail="Administrator is protected and cannot be deleted")
        raise HTTPException(status_code=409, detail="This role has users assigned. Select another role to move them to before deleting it.")
    job_store.publish({"type": "roles", "action": "deleted", "role_id": role_id})
    _audit(request, user, "role.deleted", role_id, f"Deleted panel role {role_id}; assigned users were moved.", metadata={"Replacement role": replacement_role} if replacement_role else {})
    return {"ok": True, "role_id": role_id}


@router.get("/me")
def current_user(user=Depends(require_user)):
    return user


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, request: Request, user=Depends(require_user)):
    _require_administrator(user)
    username = payload.username.strip().lower()
    if not USERNAME.fullmatch(username):
        raise HTTPException(status_code=422, detail="Username must start with a letter and contain only lowercase letters, numbers, dots, underscores, or hyphens")
    if not any(role["id"] == payload.role for role in request.app.state.auth_service.store.list_roles()):
        raise HTTPException(status_code=422, detail="Unsupported user role")
    try:
        created = request.app.state.auth_service.store.create_user(username, payload.password, payload.display_name.strip(), payload.email.strip(), payload.role)
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="That username is already in use") from error
    job_store.publish({"type": "users", "action": "created", "user": created})
    _audit(request, user, "user.created", created["username"], f"Created panel user {created['username']}.", metadata={"Role": created["role"]})
    return created
