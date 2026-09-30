from typing import Literal

from pydantic import BaseModel, Field, field_validator


GeoDecision = Literal["Allow", "Block"]


class ApplicationShieldGeoEntry(BaseModel):
    id: str
    country_code: str
    country_name: str
    decision: GeoDecision = "Block"
    enabled: bool = True
    created_at: str
    updated_at: str

    @field_validator("country_code")
    @classmethod
    def normalize_country_code(cls, value: str) -> str:
        value = value.strip().upper()
        if len(value) != 2 or not value.isalpha():
            raise ValueError("Country code must be a two-letter ISO code")
        return value


class ApplicationShieldGeoRequest(BaseModel):
    country_code: str = Field(min_length=2, max_length=2)
    country_name: str = Field(min_length=1, max_length=120)
    decision: GeoDecision = "Block"
    enabled: bool = True

    @field_validator("country_code")
    @classmethod
    def normalize_country_code(cls, value: str) -> str:
        value = value.strip().upper()
        if len(value) != 2 or not value.isalpha():
            raise ValueError("Country code must be a two-letter ISO code")
        return value


class ApplicationShieldGeoOverview(BaseModel):
    database: dict
    entries: list[ApplicationShieldGeoEntry]
    observed_countries: list[dict]
