from __future__ import annotations

import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from fastapi import HTTPException

from app.models.firewall import FirewallRule, FirewallRulePatch, FirewallRuleRequest


_PORTS = re.compile(r"^[A-Za-z0-9_./,: -]+$")
_DEFAULT_RULES = [
    {"id": "web", "enabled": True, "action": "Allow", "protocol": "TCP", "source": "Any", "destination": "Any", "service": "HTTP / HTTPS", "port": "80, 443", "interface": "WAN", "states": 1284, "note": "Public websites"},
    {"id": "panel", "enabled": True, "action": "Allow", "protocol": "TCP", "source": "Management network", "destination": "Panel", "service": "Control panel", "port": "8888", "interface": "WAN", "states": 42, "note": "Trusted administrators only"},
    {"id": "ssh", "enabled": True, "action": "Allow", "protocol": "TCP", "source": "Any", "destination": "Any", "service": "SSH", "port": "22", "interface": "WAN", "states": 8, "note": "Review source restriction"},
    {"id": "blocklist", "enabled": True, "action": "Deny", "protocol": "TCP", "source": "Threat blocklist", "destination": "Any", "service": "All services", "port": "Any", "interface": "WAN", "states": 317, "note": "Automated protection"},
]


class FirewallService:
    def __init__(self):
        state = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.path = Path(os.getenv("SE_FIREWALL_STATE_PATH", str(state / "firewall.json")))
        self._lock = RLock()

    def overview(self) -> dict:
        with self._lock:
            rules = self._read()
            return {
                "enabled": True,
                "status": "protected",
                "last_reload": self._last_reload(),
                "rules": rules,
                "blocked_states": sum(item.get("states", 0) for item in rules if item.get("action") != "Allow"),
                "management_access": "restricted" if any(item.get("service") == "Control panel" and item.get("enabled") for item in rules) else "review",
                "capability": "policy",
            }

    def create_rule(self, payload: FirewallRuleRequest) -> FirewallRule:
        self._validate(payload)
        with self._lock:
            rules = self._read()
            rule = FirewallRule(id=str(uuid.uuid4()), **payload.model_dump())
            rules.append(rule.model_dump())
            self._write(rules, reloaded=False)
            return rule

    def patch_rule(self, rule_id: str, payload: FirewallRulePatch) -> FirewallRule:
        with self._lock:
            rules = self._read()
            item = next((rule for rule in rules if rule["id"] == rule_id), None)
            if item is None:
                raise HTTPException(404, "Firewall rule not found")
            for key, value in payload.model_dump(exclude_unset=True).items():
                item[key] = value
            self._write(rules, reloaded=False)
            return FirewallRule.model_validate(item)

    def update_rule(self, rule_id: str, payload: FirewallRuleRequest) -> FirewallRule:
        self._validate(payload)
        with self._lock:
            rules = self._read()
            item = next((rule for rule in rules if rule["id"] == rule_id), None)
            if item is None:
                raise HTTPException(404, "Firewall rule not found")
            enabled = item.get("enabled", True)
            states = item.get("states", 0)
            item.update(payload.model_dump())
            item["enabled"] = enabled
            item["states"] = states
            self._write(rules, reloaded=False)
            return FirewallRule.model_validate(item)

    def delete_rule(self, rule_id: str) -> dict:
        with self._lock:
            rules = self._read()
            remaining = [rule for rule in rules if rule["id"] != rule_id]
            if len(remaining) == len(rules):
                raise HTTPException(404, "Firewall rule not found")
            self._write(remaining, reloaded=False)
            return {"deleted": True, "id": rule_id}

    def reload(self) -> dict:
        with self._lock:
            rules = self._read()
            self._write(rules, reloaded=True)
            return self.overview()

    def _read(self) -> list[dict]:
        if not self.path.exists():
            return [dict(item) for item in _DEFAULT_RULES]
        try:
            value = json.loads(self.path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(500, f"Firewall policy is unreadable: {exc}")
        rules = value.get("rules", []) if isinstance(value, dict) else []
        return [FirewallRule.model_validate(item).model_dump() for item in rules]

    def _last_reload(self) -> str | None:
        if not self.path.exists():
            return None
        try:
            value = json.loads(self.path.read_text())
            return value.get("last_reload") if isinstance(value, dict) else None
        except (OSError, json.JSONDecodeError):
            return None

    def _write(self, rules: list[dict], reloaded: bool):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        value = {"rules": rules, "last_reload": self._now() if reloaded else self._last_reload()}
        fd, temporary = tempfile.mkstemp(prefix="firewall.", suffix=".tmp", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(value, stream, indent=2, sort_keys=True)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    @staticmethod
    def _validate(payload: FirewallRuleRequest):
        if not _PORTS.fullmatch(payload.port):
            raise HTTPException(400, "Port contains unsupported characters")

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()


firewall_service = FirewallService()
