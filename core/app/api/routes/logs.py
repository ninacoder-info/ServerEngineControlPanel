import os
from pathlib import Path

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.api.dependencies import require_user
from app.services.job_service import job_store
from app.services.website_service import website_service

router = APIRouter(prefix="/api/v1/logs", tags=["logs"])


def _root() -> Path:
    return Path(os.getenv("SE_LOG_ROOT", "/server-engine/logs")).resolve()


def _category(path: Path, root: Path) -> str:
    value = path.relative_to(root).parts[0] if path.relative_to(root).parts else "general"
    labels = {
        "php": "PHP",
        "node": "Node",
        "nodejs": "Node",
        "postgres": "PostgreSQL",
        "postgresql": "PostgreSQL",
    }
    normalized = value.lower().replace("-", " ")
    return labels.get(normalized, normalized.title())


def _website_log_metadata(path: Path, root: Path, sites=None) -> dict:
    """Add a human-readable site label to generated website access/error logs."""
    relative = path.relative_to(root)
    parts = relative.parts
    if len(parts) < 3 or parts[-2] != "sites":
        return {}
    filename = path.name
    log_type = ""
    config_id = ""
    for suffix, label in ((".access.log", "Access log"), (".error.log", "Error log")):
        if filename.endswith(suffix):
            config_id = filename[: -len(suffix)]
            log_type = label
            break
    if not config_id:
        return {}
    site = next((item for item in (sites or []) if website_service._configuration_id(item) == config_id), None)
    website = site.domain if site else f"Website {config_id}"
    return {
        "category": "Websites",
        "website": website,
        "log_type": log_type,
        "label": f"{website} · {log_type}",
    }


def _size(root: Path) -> int:
    """Return all managed log-volume bytes, including SQLite indexes/WAL files."""
    total = 0
    if not root.is_dir():
        return 0
    for path in root.rglob("*"):
        try:
            if path.is_file():
                total += path.stat().st_size
        except OSError:
            continue
    return total


def _source_path(source_id: str) -> tuple[Path, Path]:
    root = _root()
    path = (root / source_id).resolve()
    if root != path and root not in path.parents:
        raise HTTPException(status_code=400, detail="Invalid log source")
    if not path.is_file() or path.suffix != ".log":
        raise HTTPException(status_code=404, detail="Log source not found")
    return root, path


@router.get("/summary")
def summary(user=Depends(require_user)):
    root = _root()
    return {"path": str(root), "size": _size(root), "files": sum(1 for path in root.rglob("*.log") if path.is_file()) if root.is_dir() else 0}


def _summary_payload() -> dict:
    root = _root()
    return {"path": str(root), "size": _size(root), "files": sum(1 for path in root.rglob("*.log") if path.is_file()) if root.is_dir() else 0}


@router.post("/clean")
def clean(payload: dict = Body(default={}), user=Depends(require_user)):
    if payload.get("confirmed") is not True:
        raise HTTPException(status_code=400, detail="Confirm log cleanup before continuing")
    root = _root()
    cleared = 0
    failed = []
    if root.is_dir():
        for path in root.rglob("*.log"):
            try:
                if path.is_file():
                    path.write_bytes(b"")
                    cleared += 1
            except OSError as exc:
                failed.append(f"{path}: {exc}")
    if failed:
        raise HTTPException(status_code=500, detail=f"Cleared {cleared} log files, but could not clear {len(failed)} files")
    job_store.publish({"type": "logs-updated", "action": "cleaned", "summary": _summary_payload()})
    return {"cleared": cleared, "size": _size(root)}


@router.get("/sources")
def sources(user=Depends(require_user)):
    root = _root()
    if not root.is_dir():
        return {"sources": []}
    sites = website_service.list()
    items = []
    for path in root.rglob("*.log"):
        try:
            stat = path.stat()
        except OSError:
            continue
        if not path.is_file():
            continue
        category = _category(path, root)
        item = {"id": str(path.relative_to(root)), "name": path.name, "category": category, "label": f"{category} · {path.name}", "path": str(path), "size": stat.st_size, "modified": stat.st_mtime}
        item.update(_website_log_metadata(path, root, sites))
        relative = path.relative_to(root).parts
        if item["category"] == "PHP" and len(relative) >= 4 and relative[1] == "versions":
            item["php_version"] = relative[2]
            item["label"] = f"PHP {relative[2]} · {path.name}"
        items.append(item)
    items.sort(key=lambda item: (item.get("label") or item["name"]).casefold())
    return {"sources": items[:500]}


@router.get("/sources/{source_id:path}")
def read_source(source_id: str, lines: int = Query(100, ge=1, le=1000), user=Depends(require_user)):
    root, path = _source_path(source_id)
    try:
        with path.open("rb") as handle:
            handle.seek(0, 2)
            size = handle.tell()
            handle.seek(max(0, size - 1024 * 1024))
            content = handle.read().decode("utf-8", errors="replace")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"id": source_id, "path": str(path), "lines": content.splitlines()[-lines:], "size": path.stat().st_size}


@router.post("/sources/{source_id:path}/clear")
def clear_source(source_id: str, user=Depends(require_user)):
    _, path = _source_path(source_id)
    try:
        path.write_bytes(b"")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    job_store.publish({"type": "logs-updated", "action": "cleared", "id": source_id, "summary": _summary_payload()})
    return {"id": source_id, "cleared": True, "size": 0}


@router.delete("/sources/{source_id:path}")
def delete_source(source_id: str, user=Depends(require_user)):
    _, path = _source_path(source_id)
    try:
        path.unlink()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    job_store.publish({"type": "logs-updated", "action": "deleted", "id": source_id, "summary": _summary_payload()})
    return {"id": source_id, "deleted": True}
