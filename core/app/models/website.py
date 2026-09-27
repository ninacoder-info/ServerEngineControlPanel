from typing import Literal

from pydantic import BaseModel, Field


WebsiteStatus = Literal["ready", "disabled", "error"]
ServerType = Literal["nginx", "apache"]
FrameworkType = Literal["generic_php", "laravel", "wordpress", "symfony", "codeigniter", "custom"]


class Website(BaseModel):
    id: str
    name: str
    domain: str
    aliases: list[str] = Field(default_factory=list)
    project_path: str
    web_root: str = "."
    document_root: str
    php_version: str = ""
    framework: FrameworkType = "generic_php"
    server_type: ServerType = "nginx"
    ssl_enabled: bool = False
    ssl_enforce_tls: bool = False
    ssl_allow_http: bool = True
    database_enabled: bool = False
    database_name: str = ""
    database_user: str = ""
    notes: str = ""
    tags: list[str] = Field(default_factory=list)
    status: WebsiteStatus = "ready"
    enabled: bool = True
    created_at: str
    updated_at: str
    config_path: str


class WebsiteCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    domain: str = Field(min_length=3, max_length=253)
    aliases: list[str] = Field(default_factory=list, max_length=50)
    project_path: str = Field(min_length=1, max_length=1024)
    web_root: str = Field(default=".", max_length=255)
    php_version: str = Field(default="", max_length=32)
    framework: FrameworkType = "generic_php"
    server_type: ServerType = "nginx"
    ssl_enabled: bool = False
    ssl_enforce_tls: bool = False
    ssl_allow_http: bool = True
    database_enabled: bool = False
    database_name: str = Field(default="", max_length=128)
    database_user: str = Field(default="", max_length=128)
    notes: str = Field(default="", max_length=4000)
    tags: list[str] = Field(default_factory=list, max_length=30)


class WebsiteUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    domain: str | None = Field(default=None, min_length=3, max_length=253)
    aliases: list[str] | None = Field(default=None, max_length=50)
    project_path: str | None = Field(default=None, min_length=1, max_length=1024)
    web_root: str | None = Field(default=None, max_length=255)
    php_version: str | None = Field(default=None, max_length=32)
    framework: FrameworkType | None = None
    server_type: ServerType | None = None
    ssl_enabled: bool | None = None
    ssl_enforce_tls: bool | None = None
    ssl_allow_http: bool | None = None
    database_enabled: bool | None = None
    database_name: str | None = Field(default=None, max_length=128)
    database_user: str | None = Field(default=None, max_length=128)
    notes: str | None = Field(default=None, max_length=4000)
    tags: list[str] | None = Field(default=None, max_length=30)


class WebsiteActionRequest(BaseModel):
    action: Literal["enable", "disable"]


class WebsiteDirectoryRequest(BaseModel):
    path: str = Field(min_length=1, max_length=1024)
    name: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")
