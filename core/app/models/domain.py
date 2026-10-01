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


class DomainRedirectRequest(BaseModel):
    source_path: str = Field(min_length=1, max_length=2048)
    target: str = Field(min_length=1, max_length=2048)
    code: Literal[301, 302, 307, 308] = 301
    keep_path: bool = False
    enabled: bool = True


class CloudflareSettingsRequest(BaseModel):
    token: str = Field(default="", max_length=500)
    account: str = Field(default="", max_length=320)
    zone: str = Field(default="", max_length=253)
    proxy: bool = True
    ssl: Literal["strict", "full", "flexible"] = "full"
    waf: bool = True
    rate_limit: bool = True
    cache: Literal["standard", "aggressive", "bypass"] = "standard"
    trusted_proxies: str = Field(default="", max_length=10000)
