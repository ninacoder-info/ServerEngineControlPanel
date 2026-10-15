from typing import Literal

from pydantic import BaseModel, Field


ShieldMode = Literal["off", "detection", "blocking"]
AuditEngine = Literal["Off", "RelevantOnly", "On"]
AuditLogType = Literal["Serial", "Concurrent"]
AuditLogFormat = Literal["Native", "JSON"]


class ApplicationShieldPolicy(BaseModel):
    enabled: bool = False
    mode: ShieldMode = "detection"
    crs_enabled: bool = True
    crs_version: str = "not installed"
    request_body_limit: int = Field(default=131072, ge=1024, le=104857600)
    audit_engine: AuditEngine = "RelevantOnly"
    audit_relevant_status: str = "^(?:5|403|406|409|429|444|499)"
    audit_log_parts: str = "ABFHZ"
    audit_log_type: AuditLogType = "Serial"
    audit_log_format: AuditLogFormat = "Native"
    audit_successful_responses: bool = False
    audit_ignore_get_content_type: bool = True


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
    audit_engine: AuditEngine | None = None
    audit_relevant_status: str | None = None
    audit_log_parts: str | None = None
    audit_log_type: AuditLogType | None = None
    audit_log_format: AuditLogFormat | None = None
    audit_successful_responses: bool | None = None
    audit_ignore_get_content_type: bool | None = None


class ApplicationShieldMetrics(BaseModel):
    protection_status: str
    requests_blocked: int
    protected_sites: int
    requests_observed: int
    inspection_rate: float | None = None
    inspection_rate_label: str = "No traffic observed"
    window: str = "observed log data"
