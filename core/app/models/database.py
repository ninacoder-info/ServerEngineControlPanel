from pydantic import BaseModel, Field


class DatabaseCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_$-]+$")
    engine: str = Field(default="mysql", min_length=1, max_length=32)
    username: str = Field(min_length=1, max_length=32, pattern=r"^[a-zA-Z0-9_$-]+$")
    password: str = Field(min_length=1, max_length=128)
    backup: str = Field(default="daily", max_length=32)
