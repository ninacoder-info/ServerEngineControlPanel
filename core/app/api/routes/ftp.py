import json
import os
import re
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import require_user
from app.models.ftp import FTPAccountRequest, FTPSettingsRequest
from app.services.service_runtime import binary_path, service_root

router = APIRouter(prefix="/api/v1/ftp", tags=["ftp"])
DEFAULT_SETTINGS = {"control_port": 21, "passive_min": 40000, "passive_max": 40100, "tls_required": True, "anonymous_enabled": False, "max_clients": 50}


def _path() -> Path:
    state = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
    return Path(os.getenv("SE_FTP_STATE_PATH", str(state / "ftp.json")))


def _read() -> dict:
    path = _path()
    if not path.exists():
        return {"settings": dict(DEFAULT_SETTINGS), "accounts": []}
    try:
        value = json.loads(path.read_text())
        return {"settings": {**DEFAULT_SETTINGS, **value.get("settings", {})}, "accounts": value.get("accounts", [])}
    except (OSError, json.JSONDecodeError):
        raise HTTPException(status_code=500, detail="FTP state file is unreadable")


def _write(value: dict):
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix="ftp.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, indent=2, sort_keys=True)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _public(account: dict) -> dict:
    return {key: value for key, value in account.items() if key != "password"}


def _service_state() -> dict:
    root = service_root("vsftpd")
    installed = binary_path("vsftpd").exists()
    running = (root / "run/vsftpd.pid").exists()
    return {"installed": installed, "running": running, "status": "running" if running else "stopped" if installed else "not-installed", "root": str(root)}


def _allowed_roots() -> list[Path]:
    configured = os.getenv("SE_FTP_ROOTS")
    values = configured.split(":") if configured else [os.getenv("SE_WEB_ROOT", "/server-engine/www")]
    roots = []
    for value in values:
        if not value:
            continue
        try:
            root = Path(value).expanduser().resolve()
        except (OSError, RuntimeError):
            continue
        if root not in roots:
            roots.append(root)
    return roots


def _safe_root(value: str) -> Path:
    if not value or "\x00" in value:
        raise HTTPException(status_code=400, detail="Choose an allowed account root folder")
    try:
        candidate = Path(value).expanduser().resolve()
    except (OSError, RuntimeError):
        raise HTTPException(status_code=400, detail="Account root is not a valid folder")
    roots = _allowed_roots()
    if not any(candidate == root or root in candidate.parents for root in roots):
        raise HTTPException(status_code=400, detail="Account root must be inside an allowed FTP folder")
    if not candidate.is_dir():
        raise HTTPException(status_code=400, detail="Account root folder does not exist")
    return candidate


@router.get("")
def overview(user=Depends(require_user)):
    state = _read()
    return {"service": _service_state(), "settings": state["settings"], "accounts": [_public(account) for account in state["accounts"]]}


@router.get("/directories")
def directories(path: str | None = None, user=Depends(require_user)):
    roots = [root for root in _allowed_roots() if root.is_dir()]
    if path:
        current = _safe_root(path)
        if not current.is_dir():
            raise HTTPException(status_code=400, detail="That folder does not exist")
    else:
        current = None
    folders = []
    if current:
        try:
            folders = sorted(
                ({"name": item.name, "path": str(item)} for item in current.iterdir() if item.is_dir() and not item.name.startswith(".")),
                key=lambda item: item["name"].lower(),
            )
        except OSError:
            raise HTTPException(status_code=400, detail="This folder cannot be read")
    parent = None
    if current and any(root != current and root in current.parents for root in roots):
        parent = str(current.parent)
    return {"path": str(current) if current else None, "parent": parent, "roots": [{"name": root.name or str(root), "path": str(root)} for root in roots], "directories": folders}


@router.post("/accounts", status_code=status.HTTP_201_CREATED)
def create_account(payload: FTPAccountRequest, user=Depends(require_user)):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]+", payload.username):
        raise HTTPException(status_code=400, detail="Username contains unsupported characters")
    root = _safe_root(payload.root)
    if payload.password is None:
        raise HTTPException(status_code=400, detail="Password is required for a new FTP account")
    state = _read()
    if any(account["username"] == payload.username for account in state["accounts"]):
        raise HTTPException(status_code=409, detail="That FTP username already exists")
    account = {**payload.model_dump(), "root": str(root), "password_set": True}
    account.pop("password", None)
    state["accounts"].append(account)
    _write(state)
    return _public(account)


@router.put("/accounts/{username}")
def update_account(username: str, payload: FTPAccountRequest, user=Depends(require_user)):
    state = _read()
    account = next((item for item in state["accounts"] if item["username"] == username), None)
    if account is None:
        raise HTTPException(status_code=404, detail="FTP account not found")
    changes = payload.model_dump()
    changes["root"] = str(_safe_root(changes["root"]))
    if changes.get("password"):
        account["password_set"] = True
    changes.pop("password", None)
    account.update(changes)
    _write(state)
    return _public(account)


@router.delete("/accounts/{username}")
def delete_account(username: str, user=Depends(require_user)):
    state = _read()
    before = len(state["accounts"])
    state["accounts"] = [item for item in state["accounts"] if item["username"] != username]
    if len(state["accounts"]) == before:
        raise HTTPException(status_code=404, detail="FTP account not found")
    _write(state)
    return {"deleted": True, "username": username}


@router.put("/settings")
def update_settings(payload: FTPSettingsRequest, user=Depends(require_user)):
    if payload.passive_min >= payload.passive_max:
        raise HTTPException(status_code=400, detail="Passive port start must be lower than passive port end")
    state = _read()
    state["settings"] = payload.model_dump()
    _write(state)
    return state["settings"]
