import os
import grp
import pwd
import zipfile
import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.models.file_manager import FileEntry, FileTreeNode


class FileManagerService:
    def __init__(self):
        self.root = Path(os.getenv("SE_FILE_MANAGER_ROOT", "/"))
        self.web_root = Path(os.getenv("SE_WEB_ROOT", "/server-engine/www"))

    def safe_path(self, relative: str = "") -> Path:
        candidate = (self.root / relative.lstrip("/")).resolve()
        root = self.root.resolve()
        try:
            candidate.relative_to(root)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Path is outside the managed web root") from error
        return candidate

    def relative(self, path: Path) -> str:
        resolved = path.resolve()
        if self.root == Path("/"):
            return resolved.as_posix()
        return resolved.relative_to(self.root.resolve()).as_posix()

    def ensure_root(self) -> Path:
        self.root.mkdir(parents=True, exist_ok=True)
        return self.root

    def default_directory(self) -> Path:
        return self.web_root if self.web_root.is_dir() else self.root

    def list_directory(self, relative: str = "") -> list[FileEntry]:
        directory = self.safe_path(relative)
        if not directory.exists() or not directory.is_dir():
            raise HTTPException(status_code=404, detail="Folder not found")
        entries = []
        for item in directory.iterdir():
            try:
                stat = item.stat()
                kind = "folder" if item.is_dir() else "link" if item.is_symlink() else "file"
                entries.append(FileEntry(name=item.name, path=self.relative(item), kind=kind, size=stat.st_size, modified_at=stat.st_mtime, owner=self._owner(stat.st_uid), group=self._group(stat.st_gid)))
            except OSError:
                continue
        return sorted(entries, key=lambda item: (item.kind != "folder", item.name.lower()))

    def tree(self, relative: str = "", depth: int = 3) -> FileTreeNode:
        directory = self.safe_path(relative)
        if not directory.exists() or not directory.is_dir():
            raise HTTPException(status_code=404, detail="Folder not found")
        children = []
        if depth > 0:
            try:
                items = sorted(directory.iterdir(), key=lambda value: value.name.lower())
            except OSError:
                items = []
            for item in items:
                try:
                    if item.is_dir() and not item.is_symlink():
                        children.append(self.tree(self.relative(item), depth - 1))
                except OSError:
                    continue
        return FileTreeNode(id=self.relative(directory) or ".", name=directory.name or "web-root", path=self.relative(directory), kind="folder", children=children)

    def create_folder(self, parent: str, name: str) -> FileEntry:
        if not name or name in {".", ".."} or "/" in name or "\\" in name:
            raise HTTPException(status_code=400, detail="Invalid folder name")
        target = self.safe_path(parent) / name
        target.mkdir()
        return self._entry(target)

    def rename(self, relative: str, name: str) -> FileEntry:
        source = self.safe_path(relative)
        if source == self.root or not source.exists():
            raise HTTPException(status_code=400, detail="Cannot rename this path")
        if not name or name in {".", ".."} or "/" in name or "\\" in name:
            raise HTTPException(status_code=400, detail="Invalid name")
        target = self.safe_path(self.relative(source.parent) + "/" + name)
        source.rename(target)
        return self._entry(target)

    def delete(self, relative: str) -> None:
        target = self.safe_path(relative)
        if target == self.root or not target.exists():
            raise HTTPException(status_code=400, detail="Cannot delete this path")
        if target.is_dir() and not target.is_symlink():
            shutil.rmtree(target)
        else:
            target.unlink()

    def upload_conflicts(self, directory: str, paths: list[str]) -> list[str]:
        destination = self.safe_path(directory)
        conflicts = []
        for relative in paths:
            target = (destination / relative.lstrip("/\\")).resolve()
            try: target.relative_to(self.root.resolve())
            except ValueError: raise HTTPException(status_code=400, detail="Invalid upload path")
            if target.exists(): conflicts.append(relative)
        return conflicts

    async def upload(self, directory: str, upload: UploadFile, relative_path: str = "", overwrite: bool = False) -> FileEntry:
        relative_path = relative_path or upload.filename or ""
        if not relative_path or relative_path.startswith(("/", "\\")):
            raise HTTPException(status_code=400, detail="Invalid upload filename")
        target = (self.safe_path(directory) / relative_path).resolve()
        try: target.relative_to(self.root.resolve())
        except ValueError as error: raise HTTPException(status_code=400, detail="Invalid upload path") from error
        if target.exists() and not overwrite:
            raise HTTPException(status_code=409, detail={"message": "File already exists", "path": relative_path})
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as destination:
            while chunk := await upload.read(1024 * 1024):
                destination.write(chunk)
        return self._entry(target)

    def copy(self, paths: list[str], destination: str) -> list[FileEntry]:
        target_dir = self.safe_path(destination)
        if not target_dir.is_dir():
            raise HTTPException(status_code=404, detail="Destination folder not found")
        copied = []
        for relative in paths:
            source = self.safe_path(relative)
            target = target_dir / source.name
            if source == self.root or target.resolve() == source.resolve():
                continue
            if source.is_dir():
                shutil.copytree(source, target, dirs_exist_ok=True)
            else:
                shutil.copy2(source, target)
            copied.append(self._entry(target))
        return copied

    def archive(self, paths: list[str], destination: str, name: str) -> FileEntry:
        if not name.endswith(".zip"):
            name += ".zip"
        target_dir = self.safe_path(destination)
        if not target_dir.is_dir() or not name or "/" in name or "\\" in name:
            raise HTTPException(status_code=400, detail="Invalid archive destination")
        archive = target_dir / name
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
            for relative in paths:
                source = self.safe_path(relative)
                if source == archive:
                    continue
                if source.is_dir():
                    for item in source.rglob("*"):
                        if item.is_file() and item != archive:
                            output.write(item, Path(source.name) / item.relative_to(source))
                elif source.is_file():
                    output.write(source, source.name)
        return self._entry(archive)

    def extract(self, relative: str) -> FileEntry:
        archive = self.safe_path(relative)
        if archive.suffix.lower() != ".zip" or not archive.is_file():
            raise HTTPException(status_code=400, detail="Only ZIP files can be extracted")
        destination = archive.with_suffix("")
        destination.mkdir(exist_ok=True)
        with zipfile.ZipFile(archive) as source:
            for member in source.infolist():
                target = (destination / member.filename).resolve()
                try: target.relative_to(destination.resolve())
                except ValueError: raise HTTPException(status_code=400, detail="Unsafe ZIP entry")
            source.extractall(destination)
        return self._entry(destination)

    def read_file(self, relative: str) -> str:
        target = self.safe_path(relative)
        if not target.is_file() or target.stat().st_size > 2_000_000:
            raise HTTPException(status_code=400, detail="Only text files up to 2 MB can be edited")
        try: return target.read_text()
        except UnicodeDecodeError as error: raise HTTPException(status_code=400, detail="Binary files cannot be edited") from error

    def write_file(self, relative: str, content: str) -> FileEntry:
        target = self.safe_path(relative)
        if not target.is_file() or len(content.encode()) > 2_000_000:
            raise HTTPException(status_code=400, detail="Only existing text files up to 2 MB can be edited")
        backup = target.with_name(f".{target.name}.serverengine.bak")
        shutil.copy2(target, backup)
        target.write_text(content)
        return self._entry(target)

    def restore_file(self, relative: str) -> FileEntry:
        target = self.safe_path(relative)
        backup = target.with_name(f".{target.name}.serverengine.bak")
        if not backup.is_file():
            raise HTTPException(status_code=404, detail="No Server Engine backup exists for this file")
        shutil.copy2(backup, target)
        return self._entry(target)

    def _entry(self, item: Path) -> FileEntry:
        stat = item.stat()
        return FileEntry(name=item.name, path=self.relative(item), kind="folder" if item.is_dir() else "file", size=stat.st_size, modified_at=stat.st_mtime, owner=self._owner(stat.st_uid), group=self._group(stat.st_gid))

    @staticmethod
    def _owner(uid: int) -> str:
        try: return pwd.getpwuid(uid).pw_name
        except KeyError: return str(uid)

    @staticmethod
    def _group(gid: int) -> str:
        try: return grp.getgrgid(gid).gr_name
        except KeyError: return str(gid)


file_manager_service = FileManagerService()
