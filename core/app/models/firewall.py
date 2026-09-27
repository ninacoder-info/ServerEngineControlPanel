from typing import Literal

from pydantic import BaseModel, Field


FirewallAction = Literal["Allow", "Deny", "Reject"]
FirewallProtocol = Literal["TCP", "UDP", "TCP / UDP", "ICMP"]


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
