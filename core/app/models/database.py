from typing import Literal

from pydantic import BaseModel, Field


class DatabaseCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_$-]+$")
    engine: str = Field(default="mysql", min_length=1, max_length=32)
    charset: Literal["utf8mb4", "utf8", "latin1", "ascii"] = "utf8mb4"
    username: str = Field(min_length=1, max_length=32, pattern=r"^[a-zA-Z0-9_$-]+$")
    password: str = Field(min_length=1, max_length=128)
    backup: Literal["daily", "weekly", "manual"] = "daily"
