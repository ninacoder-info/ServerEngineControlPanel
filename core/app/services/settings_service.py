import json
import os
import tempfile
from pathlib import Path

from fastapi import HTTPException


DEFAULT_SETTINGS = {
    "panel_name": "Server Engine",
    "language": "en",
    "timezone": "UTC",
    "default_site_root": "/server-engine/www",
    "default_backup_root": "/var/lib/server-engine/backups",
    "session_timeout_minutes": 120,
    "api_enabled": True,
    "api_bind_host": "127.0.0.1",
    "telemetry_enabled": False,
    "notifications_enabled": True,
    "notification_email": "",
    "certbot_config_dir": "/var/lib/server-engine/letsencrypt",
    "certbot_auto_renew": True,
    "certbot_renew_window_days": 30,
    "job_retention_days": 30,
    "log_retention_days": 30,
}


class SettingsService:
    def __init__(self):
        state_dir = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.path = Path(os.getenv("SE_SETTINGS_PATH", str(state_dir / "settings.json")))

    def read(self) -> dict:
        values = dict(DEFAULT_SETTINGS)
        if self.path.exists():
            try:
                stored = json.loads(self.path.read_text())
                if isinstance(stored, dict): values.update({key: value for key, value in stored.items() if key in DEFAULT_SETTINGS})
            except (OSError, json.JSONDecodeError):
                raise HTTPException(status_code=500, detail="Settings file is unreadable")
        return values

    def update(self, changes: dict) -> dict:
        unknown = sorted(set(changes) - set(DEFAULT_SETTINGS))
        if unknown: raise HTTPException(status_code=400, detail=f"Unknown settings: {', '.join(unknown)}")
        values = self.read()
        values.update(changes)
        self._validate(values)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix="settings.", suffix=".tmp", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(values, stream, indent=2, sort_keys=True); stream.write("\n"); stream.flush(); os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
        return values

    def reset(self) -> dict:
        return self.update(DEFAULT_SETTINGS)

    @staticmethod
    def _validate(values: dict):
        for key in ("default_site_root", "default_backup_root", "certbot_config_dir"):
            value = values[key]
            if not isinstance(value, str) or not value.startswith("/") or "\x00" in value:
                raise HTTPException(status_code=400, detail=f"{key} must be an absolute path")
        for key in ("session_timeout_minutes", "certbot_renew_window_days", "job_retention_days", "log_retention_days"):
            if not isinstance(values[key], int) or values[key] < 1 or values[key] > 3650:
                raise HTTPException(status_code=400, detail=f"{key} must be between 1 and 3650")
        if values["api_bind_host"] not in {"127.0.0.1", "0.0.0.0", "::1", "::"}:
            raise HTTPException(status_code=400, detail="api_bind_host must be a supported bind address")
        if values["language"] not in {"en"}:
            raise HTTPException(status_code=400, detail="Only English is currently available")
        if not isinstance(values["notification_email"], str) or len(values["notification_email"]) > 320:
            raise HTTPException(status_code=400, detail="notification_email is invalid")


settings_service = SettingsService()
