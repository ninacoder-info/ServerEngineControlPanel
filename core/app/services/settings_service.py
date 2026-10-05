import json
import os
import tempfile
from pathlib import Path

from fastapi import HTTPException


DEFAULT_SETTINGS = {
    "panel_name": "Server Engine",
    "language": "en",
    "timezone": "UTC",
    "panel_theme": "system",
    "panel_density": "comfortable",
    "panel_accent": "blue",
    "panel_landing": "overview",
    "panel_date_format": "local",
    "panel_show_hints": True,
    "default_site_root": "/server-engine/www",
    "default_backup_root": "/server-engine/backups",
    "storage_file_manager_start": "web-root",
    "storage_show_hidden_files": True,
    "storage_verify_encoding": True,
    "storage_index_files": ["index.php", "index.html"],
    "storage_upload_limit_mb": 2048,
    "storage_required_free_mb": 512,
    "storage_backup_enabled": True,
    "storage_backup_type": "compressed",
    "storage_backup_schedule": "daily",
    "storage_backup_retain_local": True,
    "storage_backup_destination": "none",
    "storage_backup_compression": "balanced",
    "storage_backup_exclusions": [".git", "node_modules", "cache"],
    "security_require_mfa": False,
    "security_strong_passwords": True,
    "security_panel_domain": "",
    "security_panel_port": 2309,
    "security_authorized_ips": [],
    "security_entry_path": "",
    "security_proxy_mode": "direct",
    "security_require_https": False,
    "security_hsts": True,
    "security_secure_cookies": True,
    "security_csrf_checks": True,
    "security_brute_force": True,
    "security_max_failed_attempts": 5,
    "security_lockout_minutes": 15,
    "security_audit_events": True,
    "security_auth_alerts": True,
    "session_timeout_minutes": 120,
    "api_enabled": True,
    "api_bind_host": "127.0.0.1",
    "api_auth_mode": "tokens",
    "api_version": "v1",
    "api_require_https": True,
    "api_allowed_origins": "",
    "api_rate_limit": 120,
    "api_burst": 30,
    "api_max_page_size": 100,
    "api_webhooks_enabled": True,
    "api_webhook_signing": True,
    "api_audit_enabled": True,
    "api_webhook_url": "",
    "api_token_expiry_days": 90,
    "api_token_allowed_ips": "",
    "telemetry_enabled": False,
    "notifications_enabled": True,
    "notification_email": "",
    "notification_email_channel": True,
    "notification_slack_channel": False,
    "notification_webhook_channel": False,
    "notification_digest": "immediate",
    "notification_quiet_hours": False,
    "notification_quiet_date": "",
    "notification_quiet_start": "22:00",
    "notification_quiet_end": "07:00",
    "notification_failed_jobs": True,
    "notification_security_events": True,
    "notification_certificate_expiry": True,
    "notification_resource_thresholds": True,
    "notification_service_health": True,
    "notification_backup_events": True,
    "notification_history_days": 30,
    "certbot_provider": "letsencrypt",
    "certbot_account_email": "",
    "certbot_staging": False,
    "certbot_challenge": "http-01",
    "certbot_require_https": True,
    "certbot_keep_previous": True,
    "certbot_renewal_time": "03:00",
    "certbot_expiry_notify_days": 14,
    "certbot_config_dir": "/var/lib/server-engine/letsencrypt",
    "certbot_auto_renew": True,
    "certbot_renew_window_days": 30,
    "job_retention_days": 30,
    "log_retention_days": 30,
    "maintenance_window": "02:00-04:00",
    "maintenance_auto_cleanup": True,
    "maintenance_notify_before": True,
    "maintenance_show_reboot": True,
    "maintenance_update_policy": "security",
    "maintenance_health_checks": True,
    "maintenance_verify_backups": True,
    "maintenance_notify_failed_jobs": True,
    "maintenance_stale_job_hours": 24,
    "log_rotation_enabled": True,
    "log_rotation_max_size_mb": 50,
    "log_rotation_schedule": "daily",
    "log_rotation_compression": "gzip",
    "log_rotation_retention_count": 14,
    "log_rotation_service_policies": {},
}

PANEL_SETTINGS_KEYS = {
    "panel_name",
    "language",
    "timezone",
    "panel_theme",
    "panel_density",
    "panel_accent",
    "panel_landing",
    "panel_date_format",
    "panel_show_hints",
    "session_timeout_minutes",
    "api_enabled",
    "api_bind_host",
}

API_SETTINGS_KEYS = {
    "api_enabled",
    "api_bind_host",
    "api_auth_mode",
    "api_version",
    "api_require_https",
    "api_allowed_origins",
    "api_rate_limit",
    "api_burst",
    "api_max_page_size",
    "api_webhooks_enabled",
    "api_webhook_signing",
    "api_audit_enabled",
    "api_webhook_url",
    "api_token_expiry_days",
    "api_token_allowed_ips",
}

STORAGE_SETTINGS_KEYS = {
    "default_site_root",
    "default_backup_root",
    "storage_file_manager_start",
    "storage_show_hidden_files",
    "storage_verify_encoding",
    "storage_index_files",
    "storage_upload_limit_mb",
    "storage_required_free_mb",
    "storage_backup_enabled",
    "storage_backup_type",
    "storage_backup_schedule",
    "storage_backup_retain_local",
    "storage_backup_destination",
    "storage_backup_compression",
    "storage_backup_exclusions",
}

SECURITY_SETTINGS_KEYS = {
    "session_timeout_minutes",
    "security_require_mfa",
    "security_strong_passwords",
    "security_panel_domain",
    "security_panel_port",
    "security_authorized_ips",
    "security_entry_path",
    "security_proxy_mode",
    "security_require_https",
    "security_hsts",
    "security_secure_cookies",
    "security_csrf_checks",
    "security_brute_force",
    "security_max_failed_attempts",
    "security_lockout_minutes",
    "security_audit_events",
    "security_auth_alerts",
}

NOTIFICATION_SETTINGS_KEYS = {
    "notifications_enabled",
    "notification_email",
    "notification_email_channel",
    "notification_slack_channel",
    "notification_webhook_channel",
    "notification_digest",
    "notification_quiet_hours",
    "notification_quiet_date",
    "notification_quiet_start",
    "notification_quiet_end",
    "notification_failed_jobs",
    "notification_security_events",
    "notification_certificate_expiry",
    "notification_resource_thresholds",
    "notification_service_health",
    "notification_backup_events",
    "notification_history_days",
    "telemetry_enabled",
}

CERTIFICATE_SETTINGS_KEYS = {
    "certbot_provider",
    "certbot_account_email",
    "certbot_staging",
    "certbot_challenge",
    "certbot_require_https",
    "certbot_keep_previous",
    "certbot_auto_renew",
    "certbot_renew_window_days",
    "certbot_renewal_time",
    "certbot_expiry_notify_days",
    "certbot_config_dir",
}

MAINTENANCE_SETTINGS_KEYS = {
    "job_retention_days",
    "log_retention_days",
    "maintenance_window",
    "maintenance_auto_cleanup",
    "maintenance_notify_before",
    "maintenance_show_reboot",
    "maintenance_update_policy",
    "maintenance_health_checks",
    "maintenance_verify_backups",
    "maintenance_notify_failed_jobs",
    "maintenance_stale_job_hours",
    "log_rotation_enabled",
    "log_rotation_max_size_mb",
    "log_rotation_schedule",
    "log_rotation_compression",
    "log_rotation_retention_count",
    "log_rotation_service_policies",
}


class SettingsService:
    def __init__(self):
        state_dir = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.path = Path(os.getenv("SE_SETTINGS_PATH", str(state_dir / "settings.json")))
        self.github_token_path = state_dir / "github-token"

    def read(self) -> dict:
        values = dict(DEFAULT_SETTINGS)
        if self.path.exists():
            try:
                stored = json.loads(self.path.read_text())
                if isinstance(stored, dict): values.update({key: value for key, value in stored.items() if key in DEFAULT_SETTINGS})
            except (OSError, json.JSONDecodeError):
                raise HTTPException(status_code=500, detail="Settings file is unreadable")
        # Backup storage is a panel-managed location, not a user-selectable
        # setting. Keep older settings files compatible with the fixed path.
        values["default_backup_root"] = "/server-engine/backups"
        return values

    def update(self, changes: dict) -> dict:
        unknown = sorted(set(changes) - set(DEFAULT_SETTINGS))
        if unknown: raise HTTPException(status_code=400, detail=f"Unknown settings: {', '.join(unknown)}")
        values = self.read()
        values.update(changes)
        values["default_backup_root"] = "/server-engine/backups"
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

    def read_panel(self) -> dict:
        values = self.read()
        return {key: values[key] for key in PANEL_SETTINGS_KEYS}

    def update_panel(self, changes: dict) -> dict:
        unknown = sorted(set(changes) - PANEL_SETTINGS_KEYS)
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown panel settings: {', '.join(unknown)}",
            )
        values = self.update(changes)
        return {key: values[key] for key in PANEL_SETTINGS_KEYS}

    def reset_panel(self) -> dict:
        values = self.update(
            {key: DEFAULT_SETTINGS[key] for key in PANEL_SETTINGS_KEYS}
        )
        return {key: values[key] for key in PANEL_SETTINGS_KEYS}

    def read_api(self) -> dict:
        values = self.read()
        return {key: values[key] for key in API_SETTINGS_KEYS}

    def update_api(self, changes: dict) -> dict:
        unknown = sorted(set(changes) - API_SETTINGS_KEYS)
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown API settings: {', '.join(unknown)}")
        values = self.update(changes)
        return {key: values[key] for key in API_SETTINGS_KEYS}

    def reset_api(self) -> dict:
        values = self.update({key: DEFAULT_SETTINGS[key] for key in API_SETTINGS_KEYS})
        return {key: values[key] for key in API_SETTINGS_KEYS}

    def read_storage(self) -> dict:
        values = self.read()
        return {key: values[key] for key in STORAGE_SETTINGS_KEYS}

    def update_storage(self, changes: dict) -> dict:
        unknown = sorted(set(changes) - STORAGE_SETTINGS_KEYS)
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown storage settings: {', '.join(unknown)}",
            )
        values = self.update(changes)
        return {key: values[key] for key in STORAGE_SETTINGS_KEYS}

    def reset_storage(self) -> dict:
        values = self.update(
            {key: DEFAULT_SETTINGS[key] for key in STORAGE_SETTINGS_KEYS}
        )
        return {key: values[key] for key in STORAGE_SETTINGS_KEYS}

    def read_security(self) -> dict:
        values = self.read()
        result = {key: values[key] for key in SECURITY_SETTINGS_KEYS}
        result["security_github_token"] = ""
        result["security_github_token_configured"] = bool(self.github_token())
        return result

    def update_security(self, changes: dict) -> dict:
        changes = dict(changes)
        token = changes.pop("security_github_token", None)
        unknown = sorted(set(changes) - SECURITY_SETTINGS_KEYS)
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown security settings: {', '.join(unknown)}",
            )
        self.update(changes)
        if token is not None and str(token).strip():
            self._write_github_token(str(token).strip())
        return self.read_security()

    def reset_security(self) -> dict:
        self._remove_github_token()
        self.update(
            {key: DEFAULT_SETTINGS[key] for key in SECURITY_SETTINGS_KEYS}
        )
        return self.read_security()

    def github_token(self) -> str:
        try:
            return self.github_token_path.read_text().strip()
        except OSError:
            return ""

    def _write_github_token(self, token: str) -> None:
        self.github_token_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.github_token_path.with_name(f".{self.github_token_path.name}.tmp")
        temporary.write_text(f"{token}\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, self.github_token_path)

    def _remove_github_token(self) -> None:
        try:
            self.github_token_path.unlink()
        except FileNotFoundError:
            pass

    def read_notifications(self) -> dict:
        values = self.read()
        return {key: values[key] for key in NOTIFICATION_SETTINGS_KEYS}

    def update_notifications(self, changes: dict) -> dict:
        unknown = sorted(set(changes) - NOTIFICATION_SETTINGS_KEYS)
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown notification settings: {', '.join(unknown)}",
            )
        values = self.update(changes)
        return {key: values[key] for key in NOTIFICATION_SETTINGS_KEYS}

    def reset_notifications(self) -> dict:
        values = self.update(
            {key: DEFAULT_SETTINGS[key] for key in NOTIFICATION_SETTINGS_KEYS}
        )
        return {key: values[key] for key in NOTIFICATION_SETTINGS_KEYS}

    def read_certificates(self) -> dict:
        values = self.read()
        return {key: values[key] for key in CERTIFICATE_SETTINGS_KEYS}

    def update_certificates(self, changes: dict) -> dict:
        unknown = sorted(set(changes) - CERTIFICATE_SETTINGS_KEYS)
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown certificate settings: {', '.join(unknown)}",
            )
        values = self.update(changes)
        return {key: values[key] for key in CERTIFICATE_SETTINGS_KEYS}

    def reset_certificates(self) -> dict:
        values = self.update(
            {key: DEFAULT_SETTINGS[key] for key in CERTIFICATE_SETTINGS_KEYS}
        )
        return {key: values[key] for key in CERTIFICATE_SETTINGS_KEYS}

    def read_maintenance(self) -> dict:
        values = self.read()
        return {key: values[key] for key in MAINTENANCE_SETTINGS_KEYS}

    def update_maintenance(self, changes: dict) -> dict:
        unknown = sorted(set(changes) - MAINTENANCE_SETTINGS_KEYS)
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown maintenance settings: {', '.join(unknown)}",
            )
        values = self.update(changes)
        return {key: values[key] for key in MAINTENANCE_SETTINGS_KEYS}

    def reset_maintenance(self) -> dict:
        values = self.update(
            {key: DEFAULT_SETTINGS[key] for key in MAINTENANCE_SETTINGS_KEYS}
        )
        return {key: values[key] for key in MAINTENANCE_SETTINGS_KEYS}

    @staticmethod
    def _validate(values: dict):
        if not isinstance(values["panel_name"], str) or not 1 <= len(values["panel_name"].strip()) <= 80:
            raise HTTPException(status_code=400, detail="panel_name must contain between 1 and 80 characters")
        if not isinstance(values["language"], str) or values["language"] not in {"en", "vi", "fr"}:
            raise HTTPException(status_code=400, detail="Unsupported panel language")
        if not isinstance(values["timezone"], str) or not 1 <= len(values["timezone"]) <= 64:
            raise HTTPException(status_code=400, detail="timezone is invalid")
        if values["panel_theme"] not in {"system", "dark", "light"}:
            raise HTTPException(status_code=400, detail="panel_theme is invalid")
        if values["panel_density"] not in {"comfortable", "compact"}:
            raise HTTPException(status_code=400, detail="panel_density is invalid")
        if values["panel_accent"] not in {
            "blue",
            "purple",
            "pink",
            "red",
            "orange",
            "yellow",
            "green",
            "graphite",
        }:
            raise HTTPException(status_code=400, detail="panel_accent is invalid")
        if values["panel_landing"] not in {"overview", "websites", "services"}:
            raise HTTPException(status_code=400, detail="panel_landing is invalid")
        if values["panel_date_format"] not in {"local", "iso", "relative"}:
            raise HTTPException(status_code=400, detail="panel_date_format is invalid")
        if not isinstance(values["panel_show_hints"], bool):
            raise HTTPException(status_code=400, detail="panel_show_hints is invalid")
        if values["panel_density"] not in {"comfortable", "compact"}:
            raise HTTPException(status_code=400, detail="panel_density is invalid")
        if values["storage_file_manager_start"] not in {"web-root", "home", "last-used"}:
            raise HTTPException(status_code=400, detail="storage_file_manager_start is invalid")
        if not isinstance(values["storage_show_hidden_files"], bool) or not isinstance(values["storage_verify_encoding"], bool):
            raise HTTPException(status_code=400, detail="Storage file manager settings are invalid")
        if not isinstance(values["storage_index_files"], list) or not all(isinstance(item, str) and item.strip() for item in values["storage_index_files"]):
            raise HTTPException(status_code=400, detail="storage_index_files must be a list of names")
        if not isinstance(values["storage_backup_exclusions"], list) or not all(isinstance(item, str) and item.strip() for item in values["storage_backup_exclusions"]):
            raise HTTPException(status_code=400, detail="storage_backup_exclusions must be a list of patterns")
        for key in ("storage_upload_limit_mb", "storage_required_free_mb"):
            if not isinstance(values[key], int) or values[key] < 0:
                raise HTTPException(status_code=400, detail=f"{key} must be a non-negative integer")
        if values["storage_backup_type"] not in {"compressed", "incremental", "uncompressed"}:
            raise HTTPException(status_code=400, detail="storage_backup_type is invalid")
        if values["storage_backup_schedule"] not in {"daily", "weekly", "monthly"}:
            raise HTTPException(status_code=400, detail="storage_backup_schedule is invalid")
        if values["storage_backup_destination"] not in {"none", "s3", "sftp", "ftp"}:
            raise HTTPException(status_code=400, detail="storage_backup_destination is invalid")
        if values["storage_backup_compression"] not in {"balanced", "fast", "maximum"}:
            raise HTTPException(status_code=400, detail="storage_backup_compression is invalid")
        if not isinstance(values["storage_backup_enabled"], bool) or not isinstance(values["storage_backup_retain_local"], bool):
            raise HTTPException(status_code=400, detail="Storage backup settings are invalid")
        if not isinstance(values["security_require_mfa"], bool) or not isinstance(values["security_strong_passwords"], bool):
            raise HTTPException(status_code=400, detail="Security authentication settings are invalid")
        if not isinstance(values["security_panel_domain"], str) or len(values["security_panel_domain"]) > 253:
            raise HTTPException(status_code=400, detail="security_panel_domain is invalid")
        if not isinstance(values["security_entry_path"], str) or (values["security_entry_path"] and not values["security_entry_path"].startswith("/")):
            raise HTTPException(status_code=400, detail="security_entry_path must start with /")
        if not isinstance(values["security_authorized_ips"], list) or not all(isinstance(item, str) and item.strip() for item in values["security_authorized_ips"]):
            raise HTTPException(status_code=400, detail="security_authorized_ips must be a list")
        if values["security_proxy_mode"] not in {"direct", "trusted", "cdn"}:
            raise HTTPException(status_code=400, detail="security_proxy_mode is invalid")
        if not isinstance(values["security_panel_port"], int) or not 1 <= values["security_panel_port"] <= 65535:
            raise HTTPException(status_code=400, detail="security_panel_port must be between 1 and 65535")
        for key in ("security_require_https", "security_hsts", "security_secure_cookies", "security_csrf_checks", "security_brute_force", "security_audit_events", "security_auth_alerts"):
            if not isinstance(values[key], bool):
                raise HTTPException(status_code=400, detail=f"{key} must be boolean")
        if not isinstance(values["security_max_failed_attempts"], int) or values["security_max_failed_attempts"] < 1:
            raise HTTPException(status_code=400, detail="security_max_failed_attempts must be positive")
        if not isinstance(values["security_lockout_minutes"], int) or values["security_lockout_minutes"] < 1:
            raise HTTPException(status_code=400, detail="security_lockout_minutes must be positive")
        for key in (
            "notifications_enabled",
            "notification_email_channel",
            "notification_slack_channel",
            "notification_webhook_channel",
            "notification_quiet_hours",
            "notification_failed_jobs",
            "notification_security_events",
            "notification_certificate_expiry",
            "notification_resource_thresholds",
            "notification_service_health",
            "notification_backup_events",
            "telemetry_enabled",
        ):
            if not isinstance(values[key], bool):
                raise HTTPException(status_code=400, detail=f"{key} must be boolean")
        if values["notification_digest"] not in {"immediate", "hourly", "daily"}:
            raise HTTPException(status_code=400, detail="notification_digest is invalid")
        for key in ("notification_quiet_date", "notification_quiet_start", "notification_quiet_end"):
            if not isinstance(values[key], str):
                raise HTTPException(status_code=400, detail=f"{key} must be text")
        if not isinstance(values["notification_history_days"], int) or values["notification_history_days"] < 1 or values["notification_history_days"] > 3650:
            raise HTTPException(status_code=400, detail="notification_history_days must be between 1 and 3650")
        if values["certbot_provider"] not in {"letsencrypt", "zerossl", "custom"}:
            raise HTTPException(status_code=400, detail="certbot_provider is invalid")
        if values["certbot_challenge"] not in {"http-01", "dns-01", "tls-alpn-01"}:
            raise HTTPException(status_code=400, detail="certbot_challenge is invalid")
        if not isinstance(values["certbot_account_email"], str) or len(values["certbot_account_email"]) > 320:
            raise HTTPException(status_code=400, detail="certbot_account_email is invalid")
        for key in ("certbot_staging", "certbot_require_https", "certbot_keep_previous", "certbot_auto_renew"):
            if not isinstance(values[key], bool):
                raise HTTPException(status_code=400, detail=f"{key} must be boolean")
        for key in ("certbot_renew_window_days", "certbot_expiry_notify_days"):
            if not isinstance(values[key], int) or values[key] < 1 or values[key] > 90:
                raise HTTPException(status_code=400, detail=f"{key} must be between 1 and 90")
        if not isinstance(values["certbot_renewal_time"], str) or len(values["certbot_renewal_time"]) != 5:
            raise HTTPException(status_code=400, detail="certbot_renewal_time must use HH:MM format")
        if values["maintenance_window"] not in {"00:00-02:00", "02:00-04:00", "04:00-06:00", "off"}:
            raise HTTPException(status_code=400, detail="maintenance_window is invalid")
        if values["maintenance_update_policy"] not in {"security", "patch", "manual"}:
            raise HTTPException(status_code=400, detail="maintenance_update_policy is invalid")
        for key in (
            "maintenance_auto_cleanup",
            "maintenance_notify_before",
            "maintenance_show_reboot",
            "maintenance_health_checks",
            "maintenance_verify_backups",
            "maintenance_notify_failed_jobs",
        ):
            if not isinstance(values[key], bool):
                raise HTTPException(status_code=400, detail=f"{key} must be boolean")
        if not isinstance(values["maintenance_stale_job_hours"], int) or values["maintenance_stale_job_hours"] < 1:
            raise HTTPException(status_code=400, detail="maintenance_stale_job_hours must be positive")
        if not isinstance(values["log_rotation_enabled"], bool):
            raise HTTPException(status_code=400, detail="log_rotation_enabled must be boolean")
        for key in ("log_rotation_max_size_mb", "log_rotation_retention_count"):
            if not isinstance(values[key], int) or values[key] < 1 or values[key] > 100000:
                raise HTTPException(status_code=400, detail=f"{key} must be between 1 and 100000")
        if values["log_rotation_schedule"] not in {"size-only", "daily", "weekly"}:
            raise HTTPException(status_code=400, detail="log_rotation_schedule is invalid")
        if values["log_rotation_compression"] not in {"none", "gzip"}:
            raise HTTPException(status_code=400, detail="log_rotation_compression is invalid")
        if not isinstance(values["log_rotation_service_policies"], dict):
            raise HTTPException(status_code=400, detail="log_rotation_service_policies must be an object")
        for key in ("default_site_root", "default_backup_root", "certbot_config_dir"):
            value = values[key]
            if not isinstance(value, str) or not value.startswith("/") or "\x00" in value:
                raise HTTPException(status_code=400, detail=f"{key} must be an absolute path")
        for key in ("session_timeout_minutes", "certbot_renew_window_days", "job_retention_days", "log_retention_days"):
            if not isinstance(values[key], int) or values[key] < 1 or values[key] > 3650:
                raise HTTPException(status_code=400, detail=f"{key} must be between 1 and 3650")
        if not isinstance(values["api_enabled"], bool):
            raise HTTPException(status_code=400, detail="api_enabled must be boolean")
        if not isinstance(values["api_bind_host"], str) or values["api_bind_host"] not in {"127.0.0.1", "0.0.0.0", "::1", "::"}:
            raise HTTPException(status_code=400, detail="api_bind_host must be a supported bind address")
        if values["api_auth_mode"] not in {"tokens", "session", "both"}:
            raise HTTPException(status_code=400, detail="api_auth_mode is invalid")
        if values["api_version"] not in {"v1", "v2"}:
            raise HTTPException(status_code=400, detail="api_version is invalid")
        for key in ("api_require_https", "api_webhooks_enabled", "api_webhook_signing", "api_audit_enabled"):
            if not isinstance(values[key], bool):
                raise HTTPException(status_code=400, detail=f"{key} must be boolean")
        for key in ("api_allowed_origins", "api_token_allowed_ips", "api_webhook_url"):
            if not isinstance(values[key], str) or len(values[key]) > 8000:
                raise HTTPException(status_code=400, detail=f"{key} is invalid")
        for key, maximum in (("api_rate_limit", 100000), ("api_burst", 10000), ("api_max_page_size", 250), ("api_token_expiry_days", 3650)):
            if not isinstance(values[key], int) or values[key] < 1 or values[key] > maximum:
                raise HTTPException(status_code=400, detail=f"{key} is out of range")
        if not isinstance(values["notification_email"], str) or len(values["notification_email"]) > 320:
            raise HTTPException(status_code=400, detail="notification_email is invalid")


settings_service = SettingsService()
