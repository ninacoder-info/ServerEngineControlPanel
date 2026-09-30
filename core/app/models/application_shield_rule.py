from typing import Literal

from pydantic import BaseModel, Field


RuleAction = Literal["Block", "Challenge", "Log only", "Allow"]


class ApplicationShieldRule(BaseModel):
    id: str
    name: str
    match: str
    scope: str = "All protected sites"
    action: RuleAction = "Block"
    enabled: bool = True
    hits: int = 0
    created_at: str
    updated_at: str


class ApplicationShieldRuleRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    match: str = Field(min_length=1, max_length=1000)
    scope: str = Field(default="All protected sites", min_length=1, max_length=253)
    action: RuleAction = "Block"
    enabled: bool = True
