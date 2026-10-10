from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse

from app.api.dependencies import require_user
from app.models.file_manager import FileBulkRequest, FileContentRequest, FileOperationRequest, FilePermissionRequest, FileUploadCheckRequest
from app.services.file_manager_service import file_manager_service
from app.services.account_isolation import account_isolation

router = APIRouter(prefix="/api/v1/file-manager", tags=["file-manager"])


def _file_service(user):
    account = account_isolation.account_for_user(user)
    return file_manager_service if not account else type(file_manager_service)(account["home_path"])


def _check_disk(user, additional_bytes: int = 0):
    account_isolation.assert_disk_quota(user, additional_bytes)


@router.get("/root")
def root(user=Depends(require_user)):
    service = _file_service(user)
    directory = service.ensure_root()
    default = service.default_directory()
    return {"path": str(default), "root_path": str(directory), "default_path": str(default), "name": directory.name or "filesystem"}


@router.get("/tree")
def tree(path: str = "/", depth: int = 1, user=Depends(require_user)):
    return _file_service(user).tree(path, depth=max(0, min(depth, 6))).model_dump()


@router.get("/entries")
def entries(path: str = "", user=Depends(require_user)):
    return {"path": path, "entries": [item.model_dump() for item in _file_service(user).list_directory(path)]}


@router.get("/content")
def content(path: str, user=Depends(require_user)):
    return {"path": path, "content": _file_service(user).read_file(path)}


@router.put("/content")
def save_content(path: str, payload: FileContentRequest, user=Depends(require_user)):
    _check_disk(user, len(payload.content.encode()))
    return _file_service(user).write_file(path, payload.content).model_dump()


@router.post("/folders")
def create_folder(payload: FileOperationRequest, user=Depends(require_user)):
    _check_disk(user)
    return _file_service(user).create_folder(payload.path, payload.name or "").model_dump()


@router.post("/files")
def create_file(payload: FileOperationRequest, user=Depends(require_user)):
    _check_disk(user)
    return _file_service(user).create_file(payload.path, payload.name or "").model_dump()


@router.post("/rename")
def rename(payload: FileOperationRequest, user=Depends(require_user)):
    return _file_service(user).rename(payload.path, payload.name or "").model_dump()


@router.post("/permissions")
def permissions(payload: FilePermissionRequest, user=Depends(require_user)):
    return _file_service(user).change_permissions(payload.path, payload.mode).model_dump()


@router.post("/copy")
def copy(payload: FileBulkRequest, user=Depends(require_user)):
    _check_disk(user)
    return {"entries": [item.model_dump() for item in _file_service(user).copy(payload.paths, payload.destination)]}


@router.post("/copy/check")
def copy_check(payload: FileBulkRequest, user=Depends(require_user)):
    return {"conflicts": _file_service(user).copy_conflicts(payload.paths, payload.destination)}


@router.post("/move")
def move(payload: FileBulkRequest, user=Depends(require_user)):
    return {"entries": [item.model_dump() for item in _file_service(user).move(payload.paths, payload.destination, payload.overwrite)]}


@router.post("/move/check")
def move_check(payload: FileBulkRequest, user=Depends(require_user)):
    return {"conflicts": _file_service(user).copy_conflicts(payload.paths, payload.destination)}


@router.post("/archive")
def archive(payload: FileBulkRequest, user=Depends(require_user)):
    _check_disk(user)
    return _file_service(user).archive(payload.paths, payload.destination, payload.name or "archive.zip").model_dump()


@router.post("/extract")
def extract(payload: FileOperationRequest, user=Depends(require_user)):
    _check_disk(user)
    return _file_service(user).extract(payload.path).model_dump()


@router.delete("/item")
def delete(payload: FileOperationRequest, user=Depends(require_user)):
    _file_service(user).delete(payload.path)
    return {"deleted": True, "path": payload.path}


@router.post("/upload")
async def upload(path: str = "", relative_path: str = "", overwrite: bool = False, file: UploadFile = File(...), user=Depends(require_user)):
    try:
        current = file.file.tell()
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(current)
    except (OSError, ValueError):
        size = 0
    _check_disk(user, size)
    return (await _file_service(user).upload(path, file, relative_path, overwrite)).model_dump()


@router.post("/upload/check")
def upload_check(payload: FileUploadCheckRequest, user=Depends(require_user)):
    return {"conflicts": _file_service(user).upload_conflicts(payload.destination, payload.paths)}


@router.get("/download")
def download(path: str, user=Depends(require_user)):
    target = _file_service(user).safe_path(path)
    if not target.exists() or not target.is_file():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(target, filename=target.name)
