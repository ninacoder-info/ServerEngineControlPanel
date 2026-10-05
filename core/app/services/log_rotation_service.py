"""Background rotation for logs owned by Server Engine services."""

import gzip
import json
import os
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from app.services.settings_service import settings_service
from app.services.service_runtime import service_root


SERVICE_LOGS = (
    "nginx",
    "apache",
    "php",
    "mysql",
    "mariadb",
    "postgresql",
    "redis",
    "valkey",
    "memcached",
    "mongodb",
    "rabbitmq",
    "postfix",
    "dovecot",
    "rspamd",
    "vsftpd",
    "powerdns",
    "haproxy",
    "caddy",
    "fail2ban",
    "supervisor",
    "ffmpeg",
    "imagemagick",
    "git",
)


class LogRotationService:
    def __init__(self):
        self.service_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services"))
        self.log_root = Path(os.getenv("SE_LOG_ROOT", "/server-engine/logs"))
        self.state_dir = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.state_path = self.state_dir / "log-rotation.json"
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, name="server-engine-log-rotation", daemon=True)
        self.lock = threading.Lock()
        self._prepare_service_log_links()

    def _prepare_service_log_links(self):
        for service_id in SERVICE_LOGS:
            service_root(service_id)
        versions = self.service_root / "php" / "versions"
        if versions.exists():
            for version in versions.iterdir():
                if version.is_dir():
                    service_root("php", version.name)

    def start(self):
        if not self.thread.is_alive():
            self.thread.start()
        return self

    def stop(self):
        self.stop_event.set()

    def status(self):
        try:
            state = json.loads(self.state_path.read_text())
        except (OSError, json.JSONDecodeError):
            state = {}
        return {
            "enabled": settings_service.read().get("log_rotation_enabled", True),
            "last_run": state.get("last_run"),
            "last_rotated": state.get("last_rotated", 0),
            "last_error": state.get("last_error"),
        }

    def rotate_now(self):
        with self.lock:
            settings = settings_service.read()
            result = self._rotate(settings, force=True)
            self._write_state({
                "last_run": datetime.now(timezone.utc).isoformat(),
                "last_rotated": result["rotated"],
                "last_error": None,
            })
            return result

    def _run(self):
        # The first check also catches oversized logs after a panel restart.
        while not self.stop_event.is_set():
            try:
                settings = settings_service.read()
                if settings.get("log_rotation_enabled", True):
                    with self.lock:
                        result = self._rotate(settings, force=False)
                        if result["rotated"] or self._scheduled_due(settings):
                            self._write_state({
                                "last_run": datetime.now(timezone.utc).isoformat(),
                                "last_rotated": result["rotated"],
                                "last_error": None,
                            })
            except Exception as error:  # keep maintenance from stopping the panel
                self._write_state({"last_error": str(error)})
            self.stop_event.wait(60)

    def _due(self, settings):
        return self._scheduled_due(settings)

    def _scheduled_due(self, settings):
        return self._scheduled_due_for(settings, settings.get("log_rotation_schedule", "daily"))

    def _scheduled_due_for(self, settings, schedule):
        if schedule == "size-only":
            return False
        window = settings.get("maintenance_window", "02:00-04:00")
        if window == "off":
            return False
        try:
            timezone_name = settings.get("timezone", "UTC")
            current = datetime.now(ZoneInfo(timezone_name))
        except Exception:
            current = datetime.now().astimezone()
        try:
            start_text, end_text = window.split("-", 1)
            start = datetime.strptime(start_text, "%H:%M").time()
            end = datetime.strptime(end_text, "%H:%M").time()
            if start <= end:
                in_window = start <= current.time() <= end
            else:
                in_window = current.time() >= start or current.time() <= end
        except ValueError:
            in_window = False
        if not in_window:
            return False
        try:
            state = json.loads(self.state_path.read_text())
            last = datetime.fromisoformat(state.get("last_run", ""))
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return True
        now = datetime.now(timezone.utc)
        if schedule == "weekly":
            return now.isocalendar()[:2] != last.isocalendar()[:2]
        return now.date() != last.date()

    def _rotate(self, settings, force):
        defaults = {
            "enabled": settings.get("log_rotation_enabled", True),
            "max_size_mb": settings.get("log_rotation_max_size_mb", 50),
            "schedule": settings.get("log_rotation_schedule", "daily"),
            "compression": settings.get("log_rotation_compression", "gzip"),
            "retention_count": settings.get("log_rotation_retention_count", 14),
        }
        overrides = settings.get("log_rotation_service_policies", {})
        rotated = 0
        for service_id in SERVICE_LOGS:
            policy = {**defaults, **(overrides.get(service_id) or {})}
            if policy.get("enabled") is False:
                continue
            roots = [self.service_root / service_id / "logs"]
            if service_id == "php":
                roots = [item / "logs" for item in (self.service_root / "php" / "versions").iterdir() if item.is_dir()] if (self.service_root / "php" / "versions").exists() else []
            if service_id == "nginx":
                # Nginx site logs are generated directly in the shared log
                # tree. Rotate the canonical directory once; the service-root
                # logs path is only a compatibility link for older configs.
                roots = [self.log_root / "nginx"]
            for log_root in roots:
                rotated += self._rotate_directory(log_root, policy, settings, force)
        return {"rotated": rotated}

    def _rotate_directory(self, directory, policy, settings, force):
        if not directory.exists() or not directory.is_dir():
            return 0
        count = 0
        max_bytes = int(policy["max_size_mb"]) * 1024 * 1024
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        for path in directory.glob("*.log"):
            try:
                size = path.stat().st_size
            except OSError:
                continue
            scheduled = force or self._scheduled_due_for(settings, policy["schedule"])
            if size == 0 or (size < max_bytes and not scheduled):
                continue
            archive = path.with_name(f"{path.name}.{stamp}")
            try:
                # Copy and truncate so a running service can keep its open file descriptor.
                shutil.copy2(path, archive)
                with path.open("w"):
                    pass
                if policy["compression"] == "gzip":
                    compressed = archive.with_name(archive.name + ".gz")
                    with archive.open("rb") as source, gzip.open(compressed, "wb") as target:
                        shutil.copyfileobj(source, target)
                    archive.unlink(missing_ok=True)
                count += 1
            except OSError:
                archive.unlink(missing_ok=True)
        archives = sorted(
            [item for item in directory.iterdir() if item.is_file() and ".log." in item.name],
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )
        for old in archives[int(policy["retention_count"]):]:
            old.unlink(missing_ok=True)
        return count

    def _write_state(self, changes):
        self.state_dir.mkdir(parents=True, exist_ok=True)
        try:
            current = json.loads(self.state_path.read_text())
        except (OSError, json.JSONDecodeError):
            current = {}
        current.update(changes)
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(current, indent=2) + "\n")
        os.replace(temporary, self.state_path)


log_rotation_service = LogRotationService()
