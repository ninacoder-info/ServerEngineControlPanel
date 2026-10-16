"""Persistent logging for rate-limit and temporary-block decisions."""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path


class MitigationLogService:
    def __init__(self):
        log_root = Path(os.getenv("SE_LOG_ROOT", "/server-engine/logs"))
        state_root = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.log_path = Path(
            os.getenv(
                "SE_MITIGATION_LOG_PATH",
                str(log_root / "firewall/mitigation-events.jsonl"),
            )
        )
        self.policy_path = Path(
            os.getenv("SE_DDOS_POLICY_PATH", str(state_root / "ddos-policy.json"))
        )
        self._lock = threading.RLock()

    def read_policy(self) -> dict:
        defaults = {
            "enabled": True,
            "requestsPerSecond": 25,
            "burst": 50,
            "concurrent": 200,
            "banDuration": "10m",
            "trustedProxies": "",
            "mode": "rate-limit",
            "logMitigations": True,
        }
        try:
            value = json.loads(self.policy_path.read_text())
        except (OSError, json.JSONDecodeError):
            value = {}
        return {**defaults, **value}

    def save_policy(self, policy: dict) -> dict:
        with self._lock:
            self.policy_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.policy_path.with_suffix(".tmp")
            temporary.write_text(json.dumps(policy, indent=2) + "\n")
            os.replace(temporary, self.policy_path)
            return policy

    def record(
        self,
        event: str,
        action: str,
        source_ip: str | None = None,
        subject: str | None = None,
        detail: str | None = None,
        retry_after: int | None = None,
    ) -> dict:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event": event,
            "action": action,
            "source_ip": source_ip or "unknown",
            "subject": subject or "",
            "detail": detail or "",
        }
        if retry_after is not None:
            entry["retry_after"] = retry_after
        with self._lock:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            with self.log_path.open("a", encoding="utf-8") as output:
                output.write(json.dumps(entry, separators=(",", ":")) + "\n")
        return entry

    def recent(self, limit: int = 50) -> list[dict]:
        limit = max(1, min(int(limit), 200))
        try:
            lines = self.log_path.read_text(encoding="utf-8").splitlines()
        except OSError:
            return []
        events = []
        for line in reversed(lines):
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
            if len(events) >= limit:
                break
        return events


mitigation_log_service = MitigationLogService()
