from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


FirewallAction = Literal["Allow", "Deny", "Reject"]
FirewallProtocol = Literal["TCP", "UDP", "TCP / UDP", "ICMP"]
NftablesPolicy = Literal["accept", "drop"]


class FirewallRuleRequest(BaseModel):
    action: FirewallAction = "Allow"
    protocol: FirewallProtocol = "TCP"
    source: str = Field(default="Any", min_length=1, max_length=255)
    destination: str = Field(default="Any", min_length=1, max_length=255)
    service: str = Field(default="Custom service", min_length=1, max_length=120)
    port: str = Field(min_length=1, max_length=120)
    interface: str = Field(default="WAN", min_length=1, max_length=64)
    note: str = Field(default="", max_length=500)
    enabled: bool = True


class FirewallRule(FirewallRuleRequest):
    id: str
    states: int = Field(default=0, ge=0)


class FirewallRulePatch(BaseModel):
    enabled: bool | None = None


class NftablesConfigRequest(BaseModel):
    enabled: bool = True
    input_policy: NftablesPolicy = "drop"
    forward_policy: NftablesPolicy = "accept"
    output_policy: NftablesPolicy = "accept"


class PortForwardRequest(BaseModel):
    protocol: Literal["TCP", "UDP", "TCP / UDP"] = "TCP"
    source: str = Field(default="Any", min_length=1, max_length=64)
    interface: str = Field(default="Any", min_length=1, max_length=64)
    listen_address: str = Field(default="Any", min_length=1, max_length=64)
    listen_port: str = Field(min_length=1, max_length=32)
    target_address: str = Field(min_length=1, max_length=64)
    target_port: str = Field(min_length=1, max_length=32)
    note: str = Field(default="", max_length=500)
    enabled: bool = True


class PortForward(PortForwardRequest):
    id: str
    states: int = Field(default=0, ge=0)


class PortForwardPatch(BaseModel):
    enabled: bool | None = None


AliasKind = Literal["Address", "Port"]


class FirewallAliasRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    kind: AliasKind = "Address"
    values: list[str] = Field(min_length=1, max_length=128)
    note: str = Field(default="", max_length=500)
    enabled: bool = True


class FirewallAlias(FirewallAliasRequest):
    id: str


class FirewallAliasPatch(BaseModel):
    enabled: bool | None = None


class BlockedAddressRequest(BaseModel):
    address: str = Field(min_length=1, max_length=64)
    note: str = Field(default="", max_length=500)
    expires_at: datetime | None = None
    enabled: bool = True


class BlockedAddress(BlockedAddressRequest):
    id: str
    states: int = Field(default=0, ge=0)


class BlockedAddressPatch(BaseModel):
    enabled: bool | None = None
