from typing import Literal

from pydantic import BaseModel, Field


DomainType = Literal["Primary domain", "Addon domain", "Subdomain", "Alias"]


class DomainCreateRequest(BaseModel):
    domain: str = Field(min_length=3, max_length=253)
    root: str = Field(default="", max_length=1024)
    domain_type: DomainType = "Addon domain"
    tls: bool = True


class DomainRecordRequest(BaseModel):
    record_type: Literal["A", "AAAA", "CNAME", "MX", "TXT", "CAA", "NS", "SRV"]
    name: str = Field(min_length=1, max_length=253)
    value: str = Field(min_length=1, max_length=2048)
    ttl: int = Field(default=300, ge=30, le=86400)

