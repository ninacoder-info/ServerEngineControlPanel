import os
import grp
import pwd
import re
import stat as stat_module
import zipfile
import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.models.file_manager import FileEntry, FileTreeNode

EDITABLE_EXTENSIONS = {
    "bash", "c", "cjs", "conf", "cpp", "css", "env", "go", "h", "hpp",
    "htaccess", "htm", "html", "ini", "java", "js", "json", "jsx", "less",
    "lock", "log", "mjs", "md", "php", "phtml", "properties", "py", "rb",
    "rs", "scss", "sh", "sql", "svg", "toml", "ts", "tsx", "txt", "vue",
    "xml", "yaml", "yml", "zsh",
}
EDITABLE_FILENAMES = {
    ".env", ".env.local", ".env.production", ".env.example", ".gitignore",
    ".htaccess", "Dockerfile", "Makefile", "README", "README.md",
}


def is_editable_file(name: str) -> bool:
    lower_name = name.lower()
    extension = lower_name.rsplit(".", 1)[-1] if "." in lower_name else lower_name
    return name in EDITABLE_FILENAMES or extension in EDITABLE_EXTENSIONS


class FileManagerService:
    def __init__(self, root: str | Path | None = None):
        self.root = Path(root or os.getenv("SE_FILE_MANAGER_ROOT", "/"))
        self.web_root = self.root if root is not None else Path(os.getenv("SE_WEB_ROOT", "/server-engine/www"))

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

    @staticmethod
    def _managed_account() -> tuple[int, int]:
        try:
            account = pwd.getpwnam("serverengine")
        except KeyError as error:
            raise HTTPException(
                status_code=503,
                detail="The serverengine service account is not available",
            ) from error
        return account.pw_uid, account.pw_gid

    def _set_managed_owner(self, path: Path, recursive: bool = False) -> None:
        uid, gid = self._managed_account()
        targets = [path]
        if recursive and path.is_dir() and not path.is_symlink():
            targets = [path, *path.rglob("*")]
        try:
            for target in targets:
                os.chown(target, uid, gid, follow_symlinks=False)
        except OSError as error:
            raise HTTPException(
                status_code=403,
                detail="Server Engine could not assign the serverengine owner to this path",
            ) from error

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
                entries.append(FileEntry(name=item.name, path=self.relative(item), kind=kind, size=stat.st_size, modified_at=stat.st_mtime, owner=self._owner(stat.st_uid), group=self._group(stat.st_gid), permissions=f"{stat_module.S_IMODE(stat.st_mode):04o}"))
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
        self._managed_account()
        if not name or name in {".", ".."} or "/" in name or "\\" in name:
            raise HTTPException(status_code=400, detail="Invalid folder name")
        directory = self.safe_path(parent)
        if not directory.is_dir():
            raise HTTPException(status_code=404, detail="Folder not found")
        target = directory / name
        try:
            target.mkdir()
        except FileExistsError as error:
            raise HTTPException(status_code=409, detail="A folder with that name already exists") from error
        self._set_managed_owner(target)
        return self._entry(target)

    def create_file(self, parent: str, name: str) -> FileEntry:
        self._managed_account()
        if not name or name in {".", ".."} or "/" in name or "\\" in name:
            raise HTTPException(status_code=400, detail="Invalid file name")
        directory = self.safe_path(parent)
        if not directory.is_dir():
            raise HTTPException(status_code=404, detail="Folder not found")
        target = directory / name
        try:
            target.touch(exist_ok=False)
        except FileExistsError as error:
            raise HTTPException(status_code=409, detail="A file with that name already exists") from error
        self._set_managed_owner(target)
        return self._entry(target)

    def rename(self, relative: str, name: str) -> FileEntry:
        self._managed_account()
        source = self.safe_path(relative)
        if source == self.root or not source.exists():
            raise HTTPException(status_code=400, detail="Cannot rename this path")
        if not name or name in {".", ".."} or "/" in name or "\\" in name:
            raise HTTPException(status_code=400, detail="Invalid name")
        target = self.safe_path(self.relative(source.parent) + "/" + name)
        source.rename(target)
        self._set_managed_owner(target, recursive=target.is_dir())
        return self._entry(target)

    def change_permissions(self, relative: str, mode: str) -> FileEntry:
        target = self.safe_path(relative)
        if target == self.root or not target.exists() or target.is_symlink():
            raise HTTPException(status_code=400, detail="Cannot change permissions for this path")
        if not re.fullmatch(r"[0-7]{3,4}", mode):
            raise HTTPException(status_code=400, detail="Permissions must be an octal mode such as 0644 or 0755")
        try:
            target.chmod(int(mode, 8))
        except OSError as error:
            raise HTTPException(status_code=403, detail="Permissions could not be changed") from error
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
        self._managed_account()
        relative_path = relative_path or upload.filename or ""
        if not relative_path or relative_path.startswith(("/", "\\")):
            raise HTTPException(status_code=400, detail="Invalid upload filename")
        target = (self.safe_path(directory) / relative_path).resolve()
        try: target.relative_to(self.root.resolve())
        except ValueError as error: raise HTTPException(status_code=400, detail="Invalid upload path") from error
        if target.exists() and not overwrite:
            raise HTTPException(status_code=409, detail={"message": "File already exists", "path": relative_path})
        missing_directories = []
        directory = target.parent
        while not directory.exists():
            missing_directories.append(directory)
            directory = directory.parent
        target.parent.mkdir(parents=True, exist_ok=True)
        for created_directory in reversed(missing_directories):
            self._set_managed_owner(created_directory)
        with target.open("wb") as destination:
            while chunk := await upload.read(1024 * 1024):
                destination.write(chunk)
        self._set_managed_owner(target)
        return self._entry(target)

    def copy(self, paths: list[str], destination: str) -> list[FileEntry]:
        self._managed_account()
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
            self._set_managed_owner(target, recursive=target.is_dir())
            copied.append(self._entry(target))
        return copied

    def copy_conflicts(self, paths: list[str], destination: str) -> list[str]:
        target_dir = self.safe_path(destination)
        if not target_dir.is_dir():
            raise HTTPException(status_code=404, detail="Destination folder not found")
        conflicts = []
        for relative in paths:
            source = self.safe_path(relative)
            target = target_dir / source.name
            if source != target.resolve() and target.exists():
                conflicts.append(source.name)
        return conflicts

    def move(self, paths: list[str], destination: str, overwrite: bool = False) -> list[FileEntry]:
        self._managed_account()
        target_dir = self.safe_path(destination)
        if not target_dir.is_dir():
            raise HTTPException(status_code=404, detail="Destination folder not found")
        sources = [(self.safe_path(relative), relative) for relative in paths]
        targets = [(source, target_dir / source.name) for source, _ in sources]
        for source, target in targets:
            if source == self.root:
                raise HTTPException(status_code=400, detail="The file manager root cannot be moved")
            if target.resolve() == source.resolve():
                continue
            if source.is_dir():
                try:
                    target_dir.resolve().relative_to(source.resolve())
                except ValueError:
                    pass
                else:
                    raise HTTPException(status_code=400, detail="A folder cannot be moved into itself")
            if target.exists() and not overwrite:
                raise HTTPException(status_code=409, detail={"message": "Destination already contains one or more selected items", "conflicts": [item.name for _, item in targets if item.exists()]})
        moved = []
        for source, target in targets:
            if target.resolve() == source.resolve():
                continue
            if target.exists() and overwrite:
                if target.is_dir() and not target.is_symlink():
                    shutil.rmtree(target)
                else:
                    target.unlink()
            shutil.move(str(source), str(target))
            self._set_managed_owner(target, recursive=target.is_dir())
            moved.append(self._entry(target))
        return moved

    def archive(self, paths: list[str], destination: str, name: str) -> FileEntry:
        self._managed_account()
        if not name.endswith(".zip"):
            name += ".zip"
        target_dir = self.safe_path(destination)
        if not target_dir.is_dir() or not name or "/" in name or "\\" in name:
            raise HTTPException(status_code=400, detail="Invalid archive destination")
        archive = target_dir / name
        try:
            with zipfile.ZipFile(archive, "x", zipfile.ZIP_DEFLATED) as output:
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
        except FileExistsError as error:
            raise HTTPException(status_code=409, detail="An archive with that name already exists") from error
        except Exception:
            archive.unlink(missing_ok=True)
            raise
        self._set_managed_owner(archive)
        return self._entry(archive)

    def extract(self, relative: str) -> FileEntry:
        self._managed_account()
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
        self._set_managed_owner(destination, recursive=True)
        return self._entry(destination)

    def read_file(self, relative: str) -> str:
        target = self.safe_path(relative)
        if not target.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        if target.stat().st_size > 2_000_000:
            raise HTTPException(status_code=400, detail="Files up to 2 MB can be edited")
        return target.read_bytes().decode("utf-8", errors="replace")

    def write_file(self, relative: str, content: str) -> FileEntry:
        self._managed_account()
        target = self.safe_path(relative)
        if not target.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        if len(content.encode()) > 2_000_000:
            raise HTTPException(status_code=400, detail="Files up to 2 MB can be edited")
        target.write_text(content)
        self._set_managed_owner(target)
        return self._entry(target)

    def _entry(self, item: Path) -> FileEntry:
        stat = item.stat()
        return FileEntry(name=item.name, path=self.relative(item), kind="folder" if item.is_dir() else "file", size=stat.st_size, modified_at=stat.st_mtime, owner=self._owner(stat.st_uid), group=self._group(stat.st_gid), permissions=f"{stat_module.S_IMODE(stat.st_mode):04o}")

    @staticmethod
    def _owner(uid: int) -> str:
        try: return pwd.getpwuid(uid).pw_name
        except KeyError: return str(uid)

    @staticmethod
    def _group(gid: int) -> str:
        try: return grp.getgrgid(gid).gr_name
        except KeyError: return str(gid)


file_manager_service = FileManagerService()
