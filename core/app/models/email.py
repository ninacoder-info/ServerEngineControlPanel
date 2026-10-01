from pydantic import BaseModel, Field


class MailboxRequest(BaseModel):
    address: str = Field(min_length=3, max_length=320)
    quota_bytes: int = Field(default=1_073_741_824, ge=0, le=10_995_116_277_760)
    password: str = Field(min_length=8, max_length=256)
    status: str = Field(default="Active", pattern=r"^(Active|Paused)$")


class ForwarderRequest(BaseModel):
    source: str = Field(min_length=3, max_length=320)
    destination: str = Field(min_length=3, max_length=320)
    mode: str = Field(default="Deliver", pattern=r"^(Deliver|Copy|Reject)$")
    status: str = Field(default="Active", pattern=r"^(Active|Paused)$")


class AutoresponderRequest(BaseModel):
    address: str = Field(min_length=3, max_length=320)
    subject: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1, max_length=10000)
    start_at: str | None = Field(default=None, max_length=64)
    end_at: str | None = Field(default=None, max_length=64)
    status: str = Field(default="Active", pattern=r"^(Active|Paused)$")


class FilterRequest(BaseModel):
    address: str = Field(min_length=3, max_length=320)
    match_type: str = Field(pattern=r"^(Sender|Subject|Recipient)$")
    pattern: str = Field(min_length=1, max_length=500)
    action: str = Field(pattern=r"^(Move to folder|Mark as read|Star message|Delete message|Reject message)$")
    action_value: str = Field(default="", max_length=255)
    status: str = Field(default="Active", pattern=r"^(Active|Paused)$")
