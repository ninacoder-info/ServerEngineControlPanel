from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class JobSummary(BaseModel):
    id: str
    type: str
    status: Literal["queued", "running", "succeeded", "failed", "cancelled"]
    created_at: datetime
    updated_at: datetime | None = None
    message: str | None = None
    log: list[str] = Field(default_factory=list)
