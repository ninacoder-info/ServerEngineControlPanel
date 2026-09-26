from pydantic import BaseModel, Field


class FTPAccountRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]+$")
    password: str | None = Field(default=None, min_length=8, max_length=128)
    root: str = Field(min_length=1, max_length=512)
    access: str = Field(default="read-write", pattern=r"^(read-only|read-write)$")
    quota_mb: int | None = Field(default=None, ge=1, le=10_000_000)
    enabled: bool = True
    notes: str = Field(default="", max_length=500)


class FTPSettingsRequest(BaseModel):
    control_port: int = Field(default=21, ge=1, le=65535)
    passive_min: int = Field(default=40000, ge=1024, le=65535)
    passive_max: int = Field(default=40100, ge=1024, le=65535)
    tls_required: bool = True
    anonymous_enabled: bool = False
    max_clients: int = Field(default=50, ge=1, le=10000)
