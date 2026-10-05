import os
from pathlib import Path

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.api.dependencies import require_user

router = APIRouter(prefix="/api/v1/logs", tags=["logs"])


def _root() -> Path:
    return Path(os.getenv("SE_LOG_ROOT", "/server-engine/logs")).resolve()


def _category(path: Path, root: Path) -> str:
    value = path.relative_to(root).parts[0] if path.relative_to(root).parts else "general"
    return value.lower().replace("-", " ").title()


def _size(root: Path) -> int:
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


@router.get("/summary")
def summary(user=Depends(require_user)):
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
    return {"cleared": cleared, "size": _size(root)}


@router.get("/sources")
def sources(user=Depends(require_user)):
    root = _root()
    if not root.is_dir():
        return {"sources": []}
    items = []
    for path in root.rglob("*.log"):
        try:
            stat = path.stat()
        except OSError:
            continue
        if not path.is_file():
            continue
        items.append({"id": str(path.relative_to(root)), "name": path.name, "category": _category(path, root), "path": str(path), "size": stat.st_size, "modified": stat.st_mtime})
    items.sort(key=lambda item: (-item["modified"], item["name"].lower()))
    return {"sources": items[:500]}


@router.get("/sources/{source_id:path}")
def read_source(source_id: str, lines: int = Query(100, ge=1, le=1000), user=Depends(require_user)):
    root = _root()
    path = (root / source_id).resolve()
    if root != path and root not in path.parents:
        raise HTTPException(status_code=400, detail="Invalid log source")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Log source not found")
    try:
        with path.open("rb") as handle:
            handle.seek(0, 2)
            size = handle.tell()
            handle.seek(max(0, size - 1024 * 1024))
            content = handle.read().decode("utf-8", errors="replace")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"id": source_id, "path": str(path), "lines": content.splitlines()[-lines:]}
