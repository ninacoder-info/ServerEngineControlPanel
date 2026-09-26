from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse

from app.api.dependencies import require_user
from app.models.file_manager import FileBulkRequest, FileContentRequest, FileOperationRequest, FileUploadCheckRequest
from app.services.file_manager_service import file_manager_service

router = APIRouter(prefix="/api/v1/file-manager", tags=["file-manager"])


@router.get("/root")
def root(user=Depends(require_user)):
    directory = file_manager_service.ensure_root()
    default = file_manager_service.default_directory()
    return {"path": str(default), "root_path": str(directory), "default_path": str(default), "name": directory.name or "filesystem"}


@router.get("/tree")
def tree(path: str = "/", depth: int = 1, user=Depends(require_user)):
    return file_manager_service.tree(path, depth=max(0, min(depth, 6))).model_dump()


@router.get("/entries")
def entries(path: str = "", user=Depends(require_user)):
    return {"path": path, "entries": [item.model_dump() for item in file_manager_service.list_directory(path)]}


@router.get("/content")
def content(path: str, user=Depends(require_user)):
    return {"path": path, "content": file_manager_service.read_file(path)}


@router.put("/content")
def save_content(path: str, payload: FileContentRequest, user=Depends(require_user)):
    return file_manager_service.write_file(path, payload.content).model_dump()


@router.post("/restore")
def restore_content(payload: FileOperationRequest, user=Depends(require_user)):
    return file_manager_service.restore_file(payload.path).model_dump()


@router.post("/folders")
def create_folder(payload: FileOperationRequest, user=Depends(require_user)):
    return file_manager_service.create_folder(payload.path, payload.name or "").model_dump()


@router.post("/rename")
def rename(payload: FileOperationRequest, user=Depends(require_user)):
    return file_manager_service.rename(payload.path, payload.name or "").model_dump()


@router.post("/copy")
def copy(payload: FileBulkRequest, user=Depends(require_user)):
    return {"entries": [item.model_dump() for item in file_manager_service.copy(payload.paths, payload.destination)]}


@router.post("/archive")
def archive(payload: FileBulkRequest, user=Depends(require_user)):
    return file_manager_service.archive(payload.paths, payload.destination, payload.name or "archive.zip").model_dump()


@router.post("/extract")
def extract(payload: FileOperationRequest, user=Depends(require_user)):
    return file_manager_service.extract(payload.path).model_dump()


@router.delete("/item")
def delete(payload: FileOperationRequest, user=Depends(require_user)):
    file_manager_service.delete(payload.path)
    return {"deleted": True, "path": payload.path}


@router.post("/upload")
async def upload(path: str = "", relative_path: str = "", overwrite: bool = False, file: UploadFile = File(...), user=Depends(require_user)):
    return (await file_manager_service.upload(path, file, relative_path, overwrite)).model_dump()


@router.post("/upload/check")
def upload_check(payload: FileUploadCheckRequest, user=Depends(require_user)):
    return {"conflicts": file_manager_service.upload_conflicts(payload.destination, payload.paths)}


@router.get("/download")
def download(path: str, user=Depends(require_user)):
    target = file_manager_service.safe_path(path)
    if not target.exists() or not target.is_file():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(target, filename=target.name)
