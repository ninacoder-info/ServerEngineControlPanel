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
    aliases: list[str] = Field(default_factory=list)
    canonical_domain: str = ""
    send_host: str = "$host"
    websocket: bool = True
    buffering: bool = True
    timeout: int = Field(default=60, ge=1, le=3600)
    server_type: Literal["nginx", "apache", "openlitespeed", "caddy"] = "nginx"
    ssl_enabled: bool = False
    ssl_enforce_tls: bool = False
    ssl_allow_http: bool = True
    certificate_status: str = "not-issued"
    certificate_source: str = ""
    certificate_path: str = ""
    private_key_path: str = ""
    certificate_expires_at: str = ""
    access_allowed_ips: list[str] = Field(default_factory=list)
    access_auth_enabled: bool = False
    access_auth_username: str = ""
    access_log_enabled: bool = True
    error_log_enabled: bool = True
    redirects: list[dict] = Field(default_factory=list)
    headers: dict[str, str] = Field(default_factory=dict)
    cache_enabled: bool = False
    cache_ttl: int = Field(default=300, ge=0, le=31536000)
    maintenance_enabled: bool = False
    maintenance_response_code: Literal["503", "200"] = "503"
    maintenance_message: str = "We'll be back shortly."
    maintenance_bypass: list[str] = Field(default_factory=list)
    maintenance_start: str = ""
    maintenance_end: str = ""
    hotlink: dict = Field(default_factory=dict)
    custom_config: str = ""
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
    aliases: list[str] = Field(default_factory=list, max_length=50)
    canonical_domain: str = Field(default="", max_length=253)
    send_host: str = Field(default="$host", max_length=253)
    websocket: bool = True
    buffering: bool = True
    timeout: int = Field(default=60, ge=1, le=3600)
    server_type: Literal["nginx", "apache", "openlitespeed", "caddy"] = "nginx"
    ssl_enabled: bool = False
    ssl_enforce_tls: bool = False
    ssl_allow_http: bool = True
    certificate_path: str = Field(default="", max_length=200000)
    private_key_path: str = Field(default="", max_length=200000)
    access_allowed_ips: list[str] = Field(default_factory=list, max_length=100)
    access_auth_enabled: bool = False
    access_auth_username: str = Field(default="", max_length=128)
    access_auth_password: str = Field(default="", max_length=256)
    access_log_enabled: bool = True
    error_log_enabled: bool = True
    redirects: list[dict] = Field(default_factory=list, max_length=100)
    headers: dict[str, str] = Field(default_factory=dict)
    cache_enabled: bool = False
    cache_ttl: int = Field(default=300, ge=0, le=31536000)
    maintenance_enabled: bool = False
    maintenance_response_code: Literal["503", "200"] = "503"
    maintenance_message: str = Field(default="We'll be back shortly.", max_length=2000)
    maintenance_bypass: list[str] = Field(default_factory=list, max_length=100)
    maintenance_start: str = Field(default="", max_length=64)
    maintenance_end: str = Field(default="", max_length=64)
    hotlink: dict = Field(default_factory=dict)


class ProxyCertificateRequest(BaseModel):
    method: Literal["upload"] = "upload"
    certificate: str = Field(min_length=1, max_length=200000)
    private_key: str = Field(min_length=1, max_length=200000)


class NodeProjectActionRequest(BaseModel):
    action: ProjectAction
