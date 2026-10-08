from typing import Literal

from pydantic import BaseModel, Field


WebsiteStatus = Literal["ready", "disabled", "error"]
ServerType = Literal["nginx", "apache", "openlitespeed", "caddy"]
MaintenanceResponseCode = Literal["503", "200"]
FrameworkType = Literal["generic_php", "laravel", "wordpress", "symfony", "codeigniter", "custom"]
ApplicationTemplate = Literal["wordpress", "laravel", "drupal", "symfony", "cakephp", "codeigniter4", "yii", "slim", "laminas"]


class Website(BaseModel):
    id: str
    name: str
    domain: str
    aliases: list[str] = Field(default_factory=list)
    canonical_domain: str = ""
    project_path: str
    web_root: str = "."
    document_root: str
    php_version: str = ""
    framework: FrameworkType = "generic_php"
    server_type: ServerType = "nginx"
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
    rewrite_rules: str = ""
    redirects: list[dict] = Field(default_factory=list)
    proxies: list[dict] = Field(default_factory=list)
    hotlink: dict = Field(default_factory=dict)
    maintenance_enabled: bool = False
    maintenance_response_code: MaintenanceResponseCode = "503"
    maintenance_message: str = "We'll be back shortly."
    maintenance_bypass: list[str] = Field(default_factory=list)
    maintenance_start: str = ""
    maintenance_end: str = ""
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
    canonical_domain: str = Field(default="", max_length=253)
    project_path: str = Field(default="", max_length=1024)
    web_root: str = Field(default=".", max_length=255)
    php_version: str = Field(default="", max_length=32)
    framework: FrameworkType = "generic_php"
    server_type: ServerType = "nginx"
    ssl_enabled: bool = False
    ssl_enforce_tls: bool = False
    ssl_allow_http: bool = True
    access_allowed_ips: list[str] = Field(default_factory=list, max_length=100)
    access_auth_enabled: bool = False
    access_auth_username: str = Field(default="", max_length=128)
    access_auth_password: str = Field(default="", max_length=256)
    access_log_enabled: bool = True
    error_log_enabled: bool = True
    rewrite_rules: str = Field(default="", max_length=12000)
    redirects: list[dict] = Field(default_factory=list)
    proxies: list[dict] = Field(default_factory=list)
    hotlink: dict = Field(default_factory=dict)
    maintenance_enabled: bool = False
    maintenance_response_code: MaintenanceResponseCode = "503"
    maintenance_message: str = Field(default="We'll be back shortly.", max_length=2000)
    maintenance_bypass: list[str] = Field(default_factory=list, max_length=100)
    maintenance_start: str = Field(default="", max_length=64)
    maintenance_end: str = Field(default="", max_length=64)
    database_enabled: bool = False
    database_name: str = Field(default="", max_length=128)
    database_user: str = Field(default="", max_length=128)
    notes: str = Field(default="", max_length=4000)
    tags: list[str] = Field(default_factory=list, max_length=30)


class WebsiteDeployRequest(WebsiteCreateRequest):
    """Validated input for a one-click application deployment."""

    application_template: ApplicationTemplate
    database_engine: Literal["", "mysql", "mariadb", "postgresql", "sqlite"] = ""
    database_password: str = Field(default="", max_length=256)
    wordpress_version: str = Field(default="latest", max_length=32)
    wordpress_admin_user: str = Field(default="", max_length=64)
    wordpress_admin_password: str = Field(default="", max_length=256)
    wordpress_database_prefix: str = Field(default="wp_", max_length=32)
    wordpress_site_title: str = Field(default="", max_length=200)
    laravel_version: str = Field(default="", max_length=64)


class WebsiteUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    domain: str | None = Field(default=None, min_length=3, max_length=253)
    aliases: list[str] | None = Field(default=None, max_length=50)
    canonical_domain: str | None = Field(default=None, max_length=253)
    project_path: str | None = Field(default=None, min_length=1, max_length=1024)
    web_root: str | None = Field(default=None, max_length=255)
    php_version: str | None = Field(default=None, max_length=32)
    framework: FrameworkType | None = None
    server_type: ServerType | None = None
    ssl_enabled: bool | None = None
    ssl_enforce_tls: bool | None = None
    ssl_allow_http: bool | None = None
    access_allowed_ips: list[str] | None = Field(default=None, max_length=100)
    access_auth_enabled: bool | None = None
    access_auth_username: str | None = Field(default=None, max_length=128)
    access_auth_password: str | None = Field(default=None, max_length=256)
    access_log_enabled: bool | None = None
    error_log_enabled: bool | None = None
    rewrite_rules: str | None = Field(default=None, max_length=12000)
    redirects: list[dict] | None = Field(default=None, max_length=100)
    proxies: list[dict] | None = Field(default=None, max_length=100)
    hotlink: dict | None = None
    maintenance_enabled: bool | None = None
    maintenance_response_code: MaintenanceResponseCode | None = None
    maintenance_message: str | None = Field(default=None, max_length=2000)
    maintenance_bypass: list[str] | None = Field(default=None, max_length=100)
    maintenance_start: str | None = Field(default=None, max_length=64)
    maintenance_end: str | None = Field(default=None, max_length=64)
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
