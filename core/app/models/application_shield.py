from typing import Literal

from pydantic import BaseModel, Field


ShieldMode = Literal["off", "detection", "blocking"]


class ApplicationShieldPolicy(BaseModel):
    enabled: bool = False
    mode: ShieldMode = "detection"
    crs_enabled: bool = True
    crs_version: str = "not installed"
    request_body_limit: int = Field(default=131072, ge=1024, le=104857600)
    audit_log_path: str = "/server-engine/logs/application-shield/audit.log"


class ShieldConnector(BaseModel):
    provider: str
    name: str
    installed: bool = False
    attached: bool = False
    status: str = "not-installed"
    config_path: str | None = None
    message: str = ""


class ApplicationShieldOverview(BaseModel):
    policy: ApplicationShieldPolicy
    engine: dict
    connectors: list[ShieldConnector]


class ApplicationShieldPolicyUpdate(BaseModel):
    enabled: bool | None = None
    mode: ShieldMode | None = None
    crs_enabled: bool | None = None
    request_body_limit: int | None = Field(default=None, ge=1024, le=104857600)


class ApplicationShieldMetrics(BaseModel):
    protection_status: str
    requests_blocked: int
    protected_sites: int
    requests_observed: int
    inspection_rate: float | None = None
    inspection_rate_label: str = "No traffic observed"
    window: str = "observed log data"
