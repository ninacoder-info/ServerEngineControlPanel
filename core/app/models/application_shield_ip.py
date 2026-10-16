from typing import Literal

from pydantic import BaseModel, Field


class ApplicationShieldIpEntry(BaseModel):
    id: str
    address: str
    decision: Literal["Allow", "Block"]
    reason: str = Field(min_length=1, max_length=500)
    hosts: list[str] = Field(default_factory=lambda: ["*"], max_length=100)
    expires_at: str | None = None
    created_at: str
    updated_at: str


class ApplicationShieldIpRequest(BaseModel):
    address: str = Field(min_length=1, max_length=128)
    decision: Literal["Allow", "Block"] = "Block"
    reason: str = Field(min_length=1, max_length=500)
    hosts: list[str] = Field(default_factory=lambda: ["*"], max_length=100)
    expires_at: str | None = None
