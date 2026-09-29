from typing import Literal

from pydantic import BaseModel, Field


CronGroup = Literal["Website", "Backup", "System", "Security"]
CronOwner = Literal["serverengine", "root", "www-data"]


class CronJobRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    group: CronGroup = "Website"
    owner: CronOwner = "serverengine"
    minute: str = Field(default="0", min_length=1, max_length=32)
    hour: str = Field(default="2", min_length=1, max_length=32)
    day: str = Field(default="*", min_length=1, max_length=32)
    month: str = Field(default="*", min_length=1, max_length=32)
    weekday: str = Field(default="*", min_length=1, max_length=32)
    command: str = Field(min_length=1, max_length=4096)
    email: str = Field(default="", max_length=320)
    enabled: bool = True


class CronJobToggle(BaseModel):
    enabled: bool
