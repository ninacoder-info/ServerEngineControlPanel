from typing import Literal

from pydantic import BaseModel


class ServerSummary(BaseModel):
    id: str
    name: str
    status: Literal["pending", "online", "offline"]
    agent_version: str | None = None
