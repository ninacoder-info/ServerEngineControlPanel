from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ServiceVersion(BaseModel):
    version: str
    channel: Literal["lts", "stable", "mainline", "preview", "security", "legacy"]
    supported: bool = True


class ServiceDefinition(BaseModel):
    id: str
    name: str
    category: str
    description: str
    vendor: str
    license: str
    versions: list[ServiceVersion]
    default_port: int | None = None
    requires_confirmation: bool = True
    mode: Literal["service", "feature", "integration"] = "service"
    installable: bool = True
    management_path: str | None = None
    management_label: str | None = None


class InstalledService(BaseModel):
    id: str
    name: str
    version: str | None = None
    status: Literal["running", "stopped", "installed", "not-installed", "unknown"]
    running_since: datetime | None = None
    port: int | None = None
    managed: bool = False


class InstallServiceRequest(BaseModel):
    version: str = Field(min_length=1, max_length=32)
    confirmed: bool = False


class SwitchVersionRequest(BaseModel):
    version: str = Field(min_length=1, max_length=32)
    confirmed: bool = False


class ServiceActionRequest(BaseModel):
    action: Literal["start", "stop", "restart"]
    version: str | None = Field(default=None, max_length=32)


class ConfigurationSaveRequest(BaseModel):
    content: str = Field(max_length=2_000_000)


class ExtensionInstallRequest(BaseModel):
    extension: str = Field(min_length=2, max_length=32, pattern=r"^[a-z0-9_-]+$")
    confirmed: bool = False
