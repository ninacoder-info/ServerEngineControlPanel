from typing import Literal

from pydantic import BaseModel, Field


ProjectStatus = Literal["ready", "disabled", "error"]
ProcessManager = Literal["pm2", "supervisor", "none"]
ProjectAction = Literal["start", "stop", "restart"]


class NodeProject(BaseModel):
    id: str
    name: str
    domain: str
    project_path: str
    document_root: str
    node_version: str
    template_id: str = "existing"
    package_manager: Literal["npm", "pnpm", "yarn"] = "npm"
    install_command: str = "npm install"
    build_command: str = "npm run build"
    run_command: str = "npm run start"
    process_manager: ProcessManager = "pm2"
    port: int = Field(default=3000, ge=1, le=65535)
    server_type: Literal["nginx", "apache", "openlitespeed", "caddy"] = "nginx"
    ssl_enabled: bool = False
    status: ProjectStatus = "ready"
    enabled: bool = True
    created_at: str
    updated_at: str
    config_path: str = ""
    process_config_path: str = ""


class NodeProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9 ._-]*$")
    domain: str = Field(min_length=3, max_length=253)
    project_path: str = Field(min_length=1, max_length=1024)
    document_root: str = Field(default=".", max_length=255)
    node_version: str = Field(min_length=1, max_length=32)
    template_id: str = Field(default="existing", max_length=32, pattern=r"^[a-z0-9_-]+$")
    package_manager: Literal["npm", "pnpm", "yarn"] = "npm"
    install_command: str = Field(default="npm install", max_length=500)
    build_command: str = Field(default="npm run build", max_length=500)
    run_command: str = Field(default="npm run start", max_length=500)
    process_manager: ProcessManager = "pm2"
    port: int = Field(default=3000, ge=1, le=65535)
    server_type: Literal["nginx", "apache", "openlitespeed", "caddy"] = "nginx"
    ssl_enabled: bool = False


class ProxyRoute(BaseModel):
    id: str
    name: str
    domain: str
    target: str
    path: str = "/"
    send_host: str = "$host"
    websocket: bool = True
    timeout: int = Field(default=60, ge=1, le=3600)
    server_type: Literal["nginx", "apache", "openlitespeed", "caddy"] = "nginx"
    ssl_enabled: bool = False
    status: ProjectStatus = "ready"
    enabled: bool = True
    created_at: str
    updated_at: str
    config_path: str = ""


class ProxyRouteCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9 ._-]*$")
    domain: str = Field(min_length=3, max_length=253)
    target: str = Field(min_length=1, max_length=2048)
    path: str = Field(default="/", max_length=2048)
    send_host: str = Field(default="$host", max_length=253)
    websocket: bool = True
    timeout: int = Field(default=60, ge=1, le=3600)
    server_type: Literal["nginx", "apache", "openlitespeed", "caddy"] = "nginx"
    ssl_enabled: bool = False


class NodeProjectActionRequest(BaseModel):
    action: ProjectAction
