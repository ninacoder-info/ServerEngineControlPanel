import posixpath
import re
import shlex
import shutil
import subprocess
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import require_user

router = APIRouter(prefix="/api/v1/services/docker/containers/{container_id}/files", tags=["docker-files"])


def _docker() -> str:
    docker = shutil.which("docker")
    if not docker:
        raise HTTPException(409, "Docker Engine is not installed or available.")
    return docker


def _path(value: str = "/", allow_root: bool = True) -> str:
    path = str(value or "/")
    if not path.startswith("/") or "\x00" in path:
        raise HTTPException(422, "Container paths must be absolute.")
    normalized = posixpath.normpath(path)
    if not allow_root and normalized == "/":
        raise HTTPException(400, "The container root cannot be changed.")
    if any(part == ".." for part in PurePosixPath(normalized).parts):
        raise HTTPException(422, "Path traversal is not allowed.")
    return normalized


def _verify(container_id: str) -> str:
    docker = _docker()
    result = subprocess.run([docker, "inspect", container_id], capture_output=True, check=False, timeout=10)
    if result.returncode:
        raise HTTPException(404, "Docker container was not found.")
    return docker


def _exec(container_id: str, command: str, input_data: bytes | None = None, check: bool = False):
    result = subprocess.run(
        [_docker(), "exec", "-i", container_id, "/bin/sh", "-lc", command],
        input=input_data,
        capture_output=True,
        check=False,
        timeout=30,
    )
    if check and result.returncode:
        message = (result.stderr or result.stdout or b"Container command failed").decode(errors="replace").strip()
        raise HTTPException(400, message)
    return result


def _entries(container_id: str, directory: str) -> list[dict]:
    directory = _path(directory)
    result = _exec(container_id, f"find -- {shlex.quote(directory)} -mindepth 1 -maxdepth 1 -printf '%p\\t%y\\t%s\\t%T@\\n' 2>/dev/null", check=True)
    entries = []
    for line in result.stdout.decode(errors="replace").splitlines():
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        item_path, kind, size, modified = parts[:4]
        entries.append({
            "name": posixpath.basename(item_path),
            "path": item_path,
            "kind": "folder" if kind == "d" else "file",
            "size": int(float(size or 0)),
            "modified_at": float(modified or 0),
            "owner": "—",
            "group": "—",
            "permissions": "—",
        })
    return sorted(entries, key=lambda item: (item["kind"] != "folder", item["name"].lower()))


def _name(value: str) -> str:
    value = str(value or "")
    if not re.fullmatch(r"[^/\\.][^/\\]*", value):
        raise HTTPException(422, "Invalid file or folder name.")
    return value


@router.get("/root")
def root(container_id: str, user=Depends(require_user)):
    _verify(container_id)
    return {"path": "/", "root_path": "/", "default_path": "/", "name": container_id}


@router.get("/tree")
def tree(container_id: str, path: str = "/", depth: int = 1, user=Depends(require_user)):
    _verify(container_id)
    path = _path(path)
    children = []
    if depth > 0:
        children = [{"id": item["path"], "name": item["name"], "path": item["path"], "kind": "folder", "children": []} for item in _entries(container_id, path) if item["kind"] == "folder"]
    return {"id": path, "name": posixpath.basename(path) or container_id, "path": path, "kind": "folder", "children": children}


@router.get("/entries")
def entries(container_id: str, path: str = "/", user=Depends(require_user)):
    _verify(container_id)
    path = _path(path)
    return {"path": path, "entries": _entries(container_id, path)}


@router.get("/content")
def content(container_id: str, path: str, user=Depends(require_user)):
    _verify(container_id)
    path = _path(path, allow_root=False)
    result = _exec(container_id, f"cat -- {shlex.quote(path)}")
    if result.returncode:
        raise HTTPException(404, "File could not be read.")
    return {"path": path, "content": result.stdout.decode(errors="replace")}


@router.put("/content")
def save_content(container_id: str, path: str, payload: dict, user=Depends(require_user)):
    _verify(container_id)
    path = _path(path, allow_root=False)
    _exec(container_id, f"cat > {shlex.quote(path)}", str(payload.get("content") or "").encode(), check=True)
    return {"path": path, "saved": True}


@router.post("/folders")
def create_folder(container_id: str, payload: dict, user=Depends(require_user)):
    _verify(container_id)
    target = posixpath.join(_path(payload.get("path", "/")), _name(payload.get("name")))
    _exec(container_id, f"mkdir -- {shlex.quote(target)}", check=True)
    return {"path": target, "name": posixpath.basename(target), "kind": "folder"}


@router.post("/files")
def create_file(container_id: str, payload: dict, user=Depends(require_user)):
    _verify(container_id)
    target = posixpath.join(_path(payload.get("path", "/")), _name(payload.get("name")))
    _exec(container_id, f"set -C; : > {shlex.quote(target)}", check=True)
    return {"path": target, "name": posixpath.basename(target), "kind": "file"}


@router.post("/rename")
def rename(container_id: str, payload: dict, user=Depends(require_user)):
    _verify(container_id)
    source = _path(payload.get("path"), allow_root=False)
    target = posixpath.join(posixpath.dirname(source), _name(payload.get("name")))
    _exec(container_id, f"mv -- {shlex.quote(source)} {shlex.quote(target)}", check=True)
    return {"path": target, "name": posixpath.basename(target)}


@router.post("/permissions")
def permissions(container_id: str, payload: dict, user=Depends(require_user)):
    _verify(container_id)
    path = _path(payload.get("path"), allow_root=False)
    mode = str(payload.get("mode") or "")
    if not re.fullmatch(r"[0-7]{3,4}", mode):
        raise HTTPException(422, "Permissions must be an octal mode such as 0644 or 0755.")
    _exec(container_id, f"chmod {mode} -- {shlex.quote(path)}", check=True)
    return {"path": path, "permissions": mode}


@router.delete("/item")
def delete(container_id: str, payload: dict, user=Depends(require_user)):
    _verify(container_id)
    path = _path(payload.get("path"), allow_root=False)
    _exec(container_id, f"rm -rf -- {shlex.quote(path)}", check=True)
    return {"deleted": True, "path": path}
