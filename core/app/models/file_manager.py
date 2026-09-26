from typing import Literal

from pydantic import BaseModel, Field


class FileOperationRequest(BaseModel):
    path: str = Field(default="", max_length=4096)
    name: str | None = Field(default=None, max_length=255)


class FileBulkRequest(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=100)
    destination: str = ""
    name: str | None = Field(default=None, max_length=255)


class FileContentRequest(BaseModel):
    content: str = Field(max_length=2_000_000)


class FileUploadCheckRequest(BaseModel):
    destination: str = ""
    paths: list[str] = Field(min_length=1, max_length=1000)


class FileEntry(BaseModel):
    name: str
    path: str
    kind: Literal["folder", "file", "link"]
    size: int
    modified_at: float
    owner: str
    group: str


class FileTreeNode(BaseModel):
    id: str
    name: str
    path: str
    kind: Literal["folder", "file"]
    children: list["FileTreeNode"] = Field(default_factory=list)
