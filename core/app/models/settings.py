from typing import Any

from pydantic import BaseModel, Field


class SettingsUpdate(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)
