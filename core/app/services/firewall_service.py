from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from fastapi import HTTPException

from app.models.firewall import (
    FirewallRule,
    FirewallRulePatch,
    FirewallRuleRequest,
    NftablesConfigRequest,
    FirewallAlias,
    FirewallAliasPatch,
    FirewallAliasRequest,
    BlockedAddress,
    BlockedAddressPatch,
    BlockedAddressRequest,
    PortForward,
    PortForwardPatch,
    PortForwardRequest,
)


_PORTS = re.compile(r"^[A-Za-z0-9_./,: -]+$")
_ADDRESS = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}(?:/\d{1,2})?$|^[0-9a-fA-F:]+(?:/\d{1,3})?$")
_PORT_ITEM = re.compile(r"^(?:\d{1,5})(?:-\d{1,5})?$")
_ALIAS_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")
_IPV4 = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}(?:/\d{1,2})?$")
_DEFAULT_RULES = [
    {"id": "web", "enabled": True, "action": "Allow", "protocol": "TCP", "source": "Any", "destination": "Any", "service": "HTTP / HTTPS", "port": "80, 443", "interface": "WAN", "states": 1284, "note": "Public websites"},
    {"id": "panel", "enabled": True, "action": "Allow", "protocol": "TCP", "source": "Management network", "destination": "Panel", "service": "Control panel", "port": "2309", "interface": "WAN", "states": 42, "note": "Trusted administrators only"},
    {"id": "ssh", "enabled": True, "action": "Allow", "protocol": "TCP", "source": "Any", "destination": "Any", "service": "SSH", "port": "22", "interface": "WAN", "states": 8, "note": "Review source restriction"},
    {"id": "blocklist", "enabled": True, "action": "Deny", "protocol": "TCP", "source": "Threat blocklist", "destination": "Any", "service": "All services", "port": "Any", "interface": "WAN", "states": 317, "note": "Automated protection"},
]
_DEFAULT_NFTABLES_CONFIG = {
    "enabled": True,
    "input_policy": "accept",
    "forward_policy": "accept",
}


class FirewallService:
    def __init__(self):
        state = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.path = Path(os.getenv("SE_FIREWALL_STATE_PATH", str(state / "firewall.json")))
        self.nft = shutil.which("nft")
        self.nft_table = os.getenv("SE_FIREWALL_NFT_TABLE", "server_engine_firewall")
        self._lock = RLock()

    def overview(self) -> dict:
        with self._lock:
            rules = self._read()
            backend = self._backend_status()
            state = self._read_state()
            nftables = self._nftables_config_from_state(state)
            forwardings = self._read_forwardings()
            aliases = self._read_aliases()
            blocked_addresses = self._read_blocked_addresses()
            counters = self._read_counters() if backend["available"] else {}
            for rule in rules:
                rule["states"] = counters.get(rule["id"], 0)
            return {
                "enabled": nftables["enabled"] and backend["available"],
                "status": "disabled" if not nftables["enabled"] else ("protected" if state.get("last_apply") and backend["available"] else "not-applied"),
                "last_reload": state.get("last_reload"),
                "rules": rules,
                "forwardings": [self._with_forwarding_counter(item, counters) for item in forwardings],
                "aliases": aliases,
                "blocked_addresses": [self._with_forwarding_counter(item, counters) for item in blocked_addresses],
                "blocked_states": sum(item["states"] for item in rules if item.get("action") in {"Deny", "Reject"}),
                "management_access": "restricted" if any(item.get("service") == "Control panel" and item.get("enabled") for item in rules) else "review",
                "capability": "nftables",
                "backend": backend,
                "nftables": self._nftables_config_response(nftables, backend),
                "last_apply": state.get("last_apply"),
                "apply_warnings": state.get("apply_warnings", []),
            }

    def nftables_config(self) -> dict:
        with self._lock:
            state = self._read_state()
            backend = self._backend_status()
            return self._nftables_config_response(
                self._nftables_config_from_state(state), backend
            )

    def update_nftables_config(self, payload: NftablesConfigRequest) -> dict:
        with self._lock:
            rules = self._read()
            forwardings = self._read_forwardings()
            aliases = self._read_aliases()
            blocked_addresses = self._read_blocked_addresses()
            config = payload.model_dump()
            result = self._apply_rules(
                rules,
                forwardings,
                aliases,
                blocked_addresses,
                nftables_config=config,
            )
            if not result.get("applied") and payload.enabled:
                raise HTTPException(503, "Unable to apply nftables configuration: " + " ".join(result.get("warnings", [])))
            self._write(
                rules,
                forwardings,
                aliases,
                blocked_addresses,
                reloaded=False,
                apply_result=result,
                nftables_config=config,
            )
            return self.nftables_config()

    def create_rule(self, payload: FirewallRuleRequest) -> FirewallRule:
        self._validate(payload)
        with self._lock:
            rules = self._read()
            rule = FirewallRule(id=str(uuid.uuid4()), **payload.model_dump())
            rules.append(rule.model_dump())
            self._save_and_apply(rules)
            return rule

    def patch_rule(self, rule_id: str, payload: FirewallRulePatch) -> FirewallRule:
        with self._lock:
            rules = self._read()
            item = next((rule for rule in rules if rule["id"] == rule_id), None)
            if item is None:
                raise HTTPException(404, "Firewall rule not found")
            for key, value in payload.model_dump(exclude_unset=True).items():
                item[key] = value
            self._save_and_apply(rules)
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
            self._save_and_apply(rules)
            return FirewallRule.model_validate(item)

    def delete_rule(self, rule_id: str) -> dict:
        with self._lock:
            rules = self._read()
            remaining = [rule for rule in rules if rule["id"] != rule_id]
            if len(remaining) == len(rules):
                raise HTTPException(404, "Firewall rule not found")
            self._save_and_apply(remaining)
            return {"deleted": True, "id": rule_id}

    def reload(self) -> dict:
        with self._lock:
            rules = self._read()
            self._save_and_apply(rules, reloaded=True)
            return self.overview()

    def create_forwarding(self, payload: PortForwardRequest) -> PortForward:
        self._validate_forwarding(payload)
        with self._lock:
            forwardings = self._read_forwardings()
            self._check_forwarding_conflict(payload, forwardings)
            forwarding = PortForward(id=str(uuid.uuid4()), **payload.model_dump())
            forwardings.append(forwarding.model_dump())
            self._save_and_apply(self._read(), forwardings)
            return forwarding

    def update_forwarding(self, forwarding_id: str, payload: PortForwardRequest) -> PortForward:
        self._validate_forwarding(payload)
        with self._lock:
            forwardings = self._read_forwardings()
            item = next((value for value in forwardings if value["id"] == forwarding_id), None)
            if item is None:
                raise HTTPException(404, "Port forwarding rule not found")
            self._check_forwarding_conflict(payload, forwardings, forwarding_id)
            enabled = item.get("enabled", True)
            states = item.get("states", 0)
            item.update(payload.model_dump())
            item["enabled"] = enabled
            item["states"] = states
            self._save_and_apply(self._read(), forwardings)
            return PortForward.model_validate(item)

    def patch_forwarding(self, forwarding_id: str, payload: PortForwardPatch) -> PortForward:
        with self._lock:
            forwardings = self._read_forwardings()
            item = next((value for value in forwardings if value["id"] == forwarding_id), None)
            if item is None:
                raise HTTPException(404, "Port forwarding rule not found")
            for key, value in payload.model_dump(exclude_unset=True).items():
                item[key] = value
            self._save_and_apply(self._read(), forwardings)
            return PortForward.model_validate(item)

    def delete_forwarding(self, forwarding_id: str) -> dict:
        with self._lock:
            forwardings = self._read_forwardings()
            remaining = [value for value in forwardings if value["id"] != forwarding_id]
            if len(remaining) == len(forwardings):
                raise HTTPException(404, "Port forwarding rule not found")
            self._save_and_apply(self._read(), remaining)
            return {"deleted": True, "id": forwarding_id}

    def create_alias(self, payload: FirewallAliasRequest) -> FirewallAlias:
        self._validate_alias(payload)
        with self._lock:
            aliases = self._read_aliases()
            if any(item["name"].lower() == payload.name.lower() for item in aliases):
                raise HTTPException(409, "An alias with this name already exists")
            alias = FirewallAlias(id=str(uuid.uuid4()), **payload.model_dump())
            aliases.append(alias.model_dump())
            self._save_and_apply(self._read(), self._read_forwardings(), aliases)
            return alias

    def update_alias(self, alias_id: str, payload: FirewallAliasRequest) -> FirewallAlias:
        self._validate_alias(payload)
        with self._lock:
            aliases = self._read_aliases()
            item = next((value for value in aliases if value["id"] == alias_id), None)
            if item is None:
                raise HTTPException(404, "Firewall alias not found")
            if any(value["id"] != alias_id and value["name"].lower() == payload.name.lower() for value in aliases):
                raise HTTPException(409, "An alias with this name already exists")
            item.update(payload.model_dump())
            item["id"] = alias_id
            self._save_and_apply(self._read(), self._read_forwardings(), aliases)
            return FirewallAlias.model_validate(item)

    def patch_alias(self, alias_id: str, payload: FirewallAliasPatch) -> FirewallAlias:
        with self._lock:
            aliases = self._read_aliases()
            item = next((value for value in aliases if value["id"] == alias_id), None)
            if item is None:
                raise HTTPException(404, "Firewall alias not found")
            item.update(payload.model_dump(exclude_unset=True))
            self._save_and_apply(self._read(), self._read_forwardings(), aliases)
            return FirewallAlias.model_validate(item)

    def delete_alias(self, alias_id: str) -> dict:
        with self._lock:
            aliases = self._read_aliases()
            remaining = [value for value in aliases if value["id"] != alias_id]
            if len(remaining) == len(aliases):
                raise HTTPException(404, "Firewall alias not found")
            self._save_and_apply(self._read(), self._read_forwardings(), remaining)
            return {"deleted": True, "id": alias_id}

    def create_blocked_address(self, payload: BlockedAddressRequest) -> BlockedAddress:
        self._validate_blocked_address(payload)
        with self._lock:
            blocked = self._read_blocked_addresses()
            if any(item["address"] == payload.address for item in blocked):
                raise HTTPException(409, "This address is already blocked")
            entry = BlockedAddress(id=str(uuid.uuid4()), **payload.model_dump())
            blocked.append(entry.model_dump(mode="json"))
            self._save_and_apply(self._read(), self._read_forwardings(), self._read_aliases(), blocked)
            return entry

    def update_blocked_address(self, blocked_id: str, payload: BlockedAddressRequest) -> BlockedAddress:
        self._validate_blocked_address(payload)
        with self._lock:
            blocked = self._read_blocked_addresses()
            item = next((value for value in blocked if value["id"] == blocked_id), None)
            if item is None:
                raise HTTPException(404, "Blocked address not found")
            if any(value["id"] != blocked_id and value["address"] == payload.address for value in blocked):
                raise HTTPException(409, "This address is already blocked")
            item.update(payload.model_dump(mode="json"))
            item["id"] = blocked_id
            self._save_and_apply(self._read(), self._read_forwardings(), self._read_aliases(), blocked)
            return BlockedAddress.model_validate(item)

    def patch_blocked_address(self, blocked_id: str, payload: BlockedAddressPatch) -> BlockedAddress:
        with self._lock:
            blocked = self._read_blocked_addresses()
            item = next((value for value in blocked if value["id"] == blocked_id), None)
            if item is None:
                raise HTTPException(404, "Blocked address not found")
            item.update(payload.model_dump(exclude_unset=True))
            self._save_and_apply(self._read(), self._read_forwardings(), self._read_aliases(), blocked)
            return BlockedAddress.model_validate(item)

    def delete_blocked_address(self, blocked_id: str) -> dict:
        with self._lock:
            blocked = self._read_blocked_addresses()
            remaining = [value for value in blocked if value["id"] != blocked_id]
            if len(remaining) == len(blocked):
                raise HTTPException(404, "Blocked address not found")
            self._save_and_apply(self._read(), self._read_forwardings(), self._read_aliases(), remaining)
            return {"deleted": True, "id": blocked_id}

    def traffic_activity(self) -> dict:
        with self._lock:
            overview = self.overview()
            entries = []
            for rule in overview["rules"]:
                entries.append({
                    "id": rule["id"],
                    "type": "Firewall rule",
                    "name": rule.get("service", "Firewall rule"),
                    "match": f"{rule.get('protocol', 'TCP')} · {rule.get('port', 'Any')}",
                    "action": rule.get("action", "Allow"),
                    "packets": rule.get("states", 0),
                    "note": rule.get("note", ""),
                })
            for forwarding in overview["forwardings"]:
                entries.append({
                    "id": forwarding["id"],
                    "type": "Port forwarding",
                    "name": f"{forwarding['listen_address']}:{forwarding['listen_port']}",
                    "match": f"{forwarding['target_address']}:{forwarding['target_port']}",
                    "action": "Forward" if forwarding.get("enabled", True) else "Paused",
                    "packets": forwarding.get("states", 0),
                    "note": forwarding.get("note", ""),
                })
            for blocked in overview["blocked_addresses"]:
                entries.append({
                    "id": blocked["id"],
                    "type": "Blocked address",
                    "name": blocked["address"],
                    "match": "Input and forwarded traffic",
                    "action": "Drop" if blocked.get("enabled", True) else "Paused",
                    "packets": blocked.get("states", 0),
                    "note": blocked.get("note", ""),
                })
            blocked_packets = sum(item["packets"] for item in entries if item["type"] == "Blocked address" or item["action"] in {"Deny", "Reject", "Drop"})
            forwarded_packets = sum(item["packets"] for item in entries if item["type"] == "Port forwarding")
            return {
                "backend": overview["backend"],
                "last_apply": overview["last_apply"],
                "entries": entries,
                "summary": {
                    "packets": sum(item["packets"] for item in entries),
                    "blocked_packets": blocked_packets,
                    "forwarded_packets": forwarded_packets,
                    "active_sources": sum(1 for item in entries if item["packets"] > 0),
                },
            }

    def _read(self) -> list[dict]:
        if not self.path.exists():
            return [dict(item) for item in _DEFAULT_RULES]
        try:
            value = json.loads(self.path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(500, f"Firewall policy is unreadable: {exc}")
        rules = value.get("rules", []) if isinstance(value, dict) else []
        return [FirewallRule.model_validate(item).model_dump() for item in rules]

    def _read_state(self) -> dict:
        if not self.path.exists():
            return {}
        try:
            value = json.loads(self.path.read_text())
            return value if isinstance(value, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _read_forwardings(self) -> list[dict]:
        value = self._read_state()
        forwardings = value.get("forwardings", [])
        return [PortForward.model_validate(item).model_dump() for item in forwardings]

    def _read_aliases(self) -> list[dict]:
        value = self._read_state()
        aliases = value.get("aliases", [])
        return [FirewallAlias.model_validate(item).model_dump() for item in aliases]

    def _read_blocked_addresses(self) -> list[dict]:
        value = self._read_state()
        blocked = value.get("blocked_addresses", [])
        return [BlockedAddress.model_validate(item).model_dump(mode="json") for item in blocked]

    @staticmethod
    def _with_forwarding_counter(item: dict, counters: dict[str, int]) -> dict:
        value = dict(item)
        value["states"] = counters.get(value["id"], 0)
        return value

    def _last_reload(self) -> str | None:
        return self._read_state().get("last_reload")

    def _save_and_apply(self, rules: list[dict], forwardings: list[dict] | None = None, aliases: list[dict] | None = None, blocked_addresses: list[dict] | None = None, reloaded: bool = False):
        forwardings = self._read_forwardings() if forwardings is None else forwardings
        aliases = self._read_aliases() if aliases is None else aliases
        blocked_addresses = self._read_blocked_addresses() if blocked_addresses is None else blocked_addresses
        result = self._apply_rules(rules, forwardings, aliases, blocked_addresses)
        self._write(rules, forwardings, aliases, blocked_addresses, reloaded=reloaded, apply_result=result)

    def _write(self, rules: list[dict], forwardings: list[dict], aliases: list[dict], blocked_addresses: list[dict], reloaded: bool, apply_result: dict | None = None, nftables_config: dict | None = None):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        current = self._read_state()
        value = {
            "rules": rules,
            "forwardings": forwardings,
            "aliases": aliases,
            "blocked_addresses": blocked_addresses,
            "last_reload": self._now() if reloaded else current.get("last_reload"),
            "last_apply": self._now() if apply_result and apply_result.get("applied") else current.get("last_apply"),
            "apply_warnings": (apply_result or {}).get("warnings", current.get("apply_warnings", [])),
            "nftables": nftables_config or current.get("nftables", dict(_DEFAULT_NFTABLES_CONFIG)),
        }
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
        if payload.protocol == "ICMP" and payload.port.strip().lower() not in {"any", ""}:
            raise HTTPException(400, "ICMP rules cannot specify ports")
        for value, label in ((payload.source, "source"), (payload.destination, "destination")):
            if value.strip() in {"", "Any"}:
                continue
            if value.lower() in {"management network", "threat blocklist", "panel", "webservers"}:
                continue
            if _ALIAS_NAME.fullmatch(value):
                continue
            if not _ADDRESS.fullmatch(value.strip()):
                raise HTTPException(400, f"{label} must be an IP address, CIDR range, or supported alias")

    @staticmethod
    def _validate_forwarding(payload: PortForwardRequest):
        if not re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}", payload.target_address.strip()) or any(int(part) > 255 for part in payload.target_address.split(".")):
            raise HTTPException(400, "Target host must be an IPv4 address")
        for value, label in ((payload.source, "source"), (payload.listen_address, "listen address")):
            if value.strip() != "Any" and not _IPV4.fullmatch(value.strip()):
                raise HTTPException(400, f"{label} must be Any or an IPv4 address/CIDR")
        for value, label in ((payload.listen_port, "public port"), (payload.target_port, "target port")):
            if not _PORT_ITEM.fullmatch(value.strip()):
                raise HTTPException(400, f"{label} must be a port or port range")
            for part in value.split("-"):
                if not 1 <= int(part) <= 65535:
                    raise HTTPException(400, f"{label} must be between 1 and 65535")
        if payload.protocol == "TCP / UDP" and "-" in payload.listen_port and payload.listen_port != payload.target_port:
                raise HTTPException(400, "TCP / UDP range forwarding requires matching public and target ranges")

    @staticmethod
    def _validate_alias(payload: FirewallAliasRequest):
        if not payload.values:
            raise HTTPException(400, "Add at least one alias value")
        if payload.kind == "Port":
            for value in payload.values:
                if not _PORT_ITEM.fullmatch(value.strip()) or any(int(part) > 65535 for part in value.split("-")):
                    raise HTTPException(400, f"Invalid port alias value: {value}")
        else:
            families = set()
            for value in payload.values:
                value = value.strip()
                if not _IPV4.fullmatch(value) and not re.fullmatch(r"[0-9a-fA-F:]+(?:/\d{1,3})?", value):
                    raise HTTPException(400, f"Invalid address alias value: {value}")
                families.add("ipv6" if ":" in value else "ipv4")
            if len(families) > 1:
                raise HTTPException(400, "Address aliases must contain only IPv4 or only IPv6 values")

    @staticmethod
    def _validate_blocked_address(payload: BlockedAddressRequest):
        address = payload.address.strip()
        if (not _IPV4.fullmatch(address) and not re.fullmatch(r"[0-9a-fA-F:]+(?:/\d{1,3})?", address)):
            raise HTTPException(400, "Enter a valid IPv4/IPv6 address or CIDR range")
        if ":" not in address and any(int(part) > 255 for part in address.split("/")[0].split(".")):
            raise HTTPException(400, "IPv4 address contains an invalid octet")
        if payload.expires_at and payload.expires_at <= datetime.now(timezone.utc):
            raise HTTPException(400, "Expiration must be in the future")

    @staticmethod
    def _check_forwarding_conflict(payload: PortForwardRequest, forwardings: list[dict], exclude_id: str | None = None):
        if not payload.enabled:
            return
        for item in forwardings:
            if item.get("id") == exclude_id or not item.get("enabled", True):
                continue
            same_protocol = item["protocol"] == payload.protocol or "TCP / UDP" in {item["protocol"], payload.protocol}
            same_listener = item["listen_port"] == payload.listen_port and item["listen_address"] == payload.listen_address and item["interface"] == payload.interface
            if same_protocol and same_listener:
                raise HTTPException(409, "Another enabled forwarding rule already uses this public listener")

    def _nftables_config_from_state(self, state: dict) -> dict:
        value = state.get("nftables", {}) if isinstance(state, dict) else {}
        input_policy = value.get("input_policy", _DEFAULT_NFTABLES_CONFIG["input_policy"])
        forward_policy = value.get("forward_policy", _DEFAULT_NFTABLES_CONFIG["forward_policy"])
        return {
            "enabled": bool(value.get("enabled", _DEFAULT_NFTABLES_CONFIG["enabled"])),
            "input_policy": input_policy if input_policy in {"accept", "drop"} else "accept",
            "forward_policy": forward_policy if forward_policy in {"accept", "drop"} else "accept",
        }

    def _nftables_config_response(self, config: dict, backend: dict) -> dict:
        return {
            **config,
            "table_name": self.nft_table,
            "nat_table_name": f"{self.nft_table}_nat",
            "available": backend.get("available", False),
            "provider": backend.get("provider", "none"),
            "forwarding_enabled": backend.get("forwarding_enabled", False),
            "backend_message": backend.get("message", ""),
        }

    def _remove_managed_tables(self) -> dict:
        warnings = []
        for family, table in (("ip", f"{self.nft_table}_nat"), ("inet", self.nft_table)):
            existing = subprocess.run(
                [self.nft, "list", "table", family, table],
                capture_output=True,
                text=True,
                check=False,
                timeout=8,
            )
            if existing.returncode != 0:
                continue
            removed = subprocess.run(
                [self.nft, "delete", "table", family, table],
                capture_output=True,
                text=True,
                check=False,
                timeout=8,
            )
            if removed.returncode != 0:
                warnings.append(f"Unable to remove managed {family} table {table}: {(removed.stderr or removed.stdout).strip()}")
        return {"applied": not warnings, "warnings": warnings}

    def _backend_status(self) -> dict:
        if not self.nft:
            return {"available": False, "provider": "none", "message": "nftables is not installed."}
        check = subprocess.run([self.nft, "list", "ruleset"], capture_output=True, text=True, check=False, timeout=8)
        if check.returncode != 0:
            return {"available": False, "provider": "nftables", "message": "nftables is installed but this process cannot access the firewall namespace."}
        forwarding_enabled = False
        try:
            forwarding_enabled = Path("/proc/sys/net/ipv4/ip_forward").read_text().strip() == "1"
        except OSError:
            pass
        message = "Rules apply to the current server firewall namespace."
        if not forwarding_enabled:
            message += " IP forwarding is disabled, so port forwards will not route traffic yet."
        return {"available": True, "provider": "nftables", "forwarding_enabled": forwarding_enabled, "message": message}

    def _apply_rules(self, rules: list[dict], forwardings: list[dict] | None = None, aliases: list[dict] | None = None, blocked_addresses: list[dict] | None = None, nftables_config: dict | None = None) -> dict:
        forwardings = self._read_forwardings() if forwardings is None else forwardings
        aliases = self._read_aliases() if aliases is None else aliases
        blocked_addresses = self._read_blocked_addresses() if blocked_addresses is None else blocked_addresses
        config = nftables_config or self._nftables_config_from_state(self._read_state())
        backend = self._backend_status()
        if not backend["available"]:
            return {"applied": False, "warnings": [backend["message"]]}

        if not config["enabled"]:
            return self._remove_managed_tables()

        lines = [
            f"add table inet {self.nft_table}",
            f"add chain inet {self.nft_table} input {{ type filter hook input priority filter; policy {config['input_policy']}; }}",
            f"add chain inet {self.nft_table} forward {{ type filter hook forward priority filter; policy {config['forward_policy']}; }}",
            f"add rule inet {self.nft_table} input ct state established,related accept",
            f"add rule inet {self.nft_table} input iif \"lo\" accept",
        ]
        nat_lines = [
            f"add table ip {self.nft_table}_nat",
            f"add chain ip {self.nft_table}_nat prerouting {{ type nat hook prerouting priority dstnat; policy accept; }}",
            f"add chain ip {self.nft_table}_nat postrouting {{ type nat hook postrouting priority srcnat; policy accept; }}",
        ]
        warnings = []
        applied_count = 0
        for blocked in blocked_addresses:
            if not blocked.get("enabled", True) or self._blocked_expired(blocked):
                continue
            address = blocked["address"]
            family = "ip6" if ":" in address else "ip"
            lines.append(f"add rule inet {self.nft_table} input {family} saddr {address} counter drop comment \"server-engine:{blocked['id']}\"")
            lines.append(f"add rule inet {self.nft_table} forward {family} saddr {address} counter drop comment \"server-engine:{blocked['id']}\"")
            applied_count += 1
        for rule in rules:
            if not rule.get("enabled", True):
                continue
            expression = self._nft_expression(rule, aliases)
            if expression is None:
                warnings.append(f"{rule.get('name') or rule.get('service')}: address or port alias was not applied")
                continue
            lines.append(f"add rule inet {self.nft_table} input {expression}")
            applied_count += 1

        forwarding_count = 0
        for forwarding in forwardings:
            if not forwarding.get("enabled", True):
                continue
            nat_expression = self._nft_forward_expression(forwarding)
            if nat_expression is None:
                warnings.append(f"Port forwarding {forwarding.get('id')}: invalid address or port was not applied")
                continue
            nat_lines.append(f"add rule ip {self.nft_table}_nat prerouting {nat_expression} counter dnat to {forwarding['target_address']}:{forwarding['target_port']} comment \"server-engine:{forwarding['id']}\"")
            forward_expression = self._nft_forward_filter_expression(forwarding)
            lines.append(f"add rule inet {self.nft_table} forward {forward_expression} counter accept comment \"server-engine:{forwarding['id']}\"")
            forwarding_count += 1

        existing = subprocess.run([self.nft, "list", "table", "inet", self.nft_table], capture_output=True, text=True, check=False, timeout=8)
        filter_script = "\n".join(lines) + "\n"
        if existing.returncode == 0:
            filter_script = f"flush table inet {self.nft_table}\n" + "\n".join(lines[1:]) + "\n"
        existing_nat = subprocess.run([self.nft, "list", "table", "ip", f"{self.nft_table}_nat"], capture_output=True, text=True, check=False, timeout=8)
        nat_script = "\n".join(nat_lines) + "\n"
        if existing_nat.returncode == 0:
            nat_script = f"flush table ip {self.nft_table}_nat\n" + "\n".join(nat_lines[1:]) + "\n"
        script = filter_script + nat_script
        check = subprocess.run([self.nft, "-c", "-f", "-"], input=script, capture_output=True, text=True, check=False, timeout=8)
        if check.returncode != 0:
            return {"applied": False, "warnings": [f"Firewall validation failed: {(check.stderr or check.stdout).strip()}"]}
        applied = subprocess.run([self.nft, "-f", "-"], input=script, capture_output=True, text=True, check=False, timeout=8)
        if applied.returncode != 0:
            return {"applied": False, "warnings": [f"Firewall apply failed: {(applied.stderr or applied.stdout).strip()}"]}
        if applied_count == 0 and forwarding_count == 0:
            warnings.append("No enabled rules had concrete addresses or ports to apply.")
        return {"applied": True, "warnings": warnings}

    @staticmethod
    def _blocked_expired(entry: dict) -> bool:
        value = entry.get("expires_at")
        if not value:
            return False
        try:
            expiry = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            return expiry <= datetime.now(timezone.utc)
        except ValueError:
            return True

    def _nft_forward_expression(self, forwarding: dict) -> str | None:
        parts = []
        if forwarding["source"] != "Any":
            parts.append(f"ip saddr {forwarding['source']}")
        if forwarding["listen_address"] != "Any":
            parts.append(f"ip daddr {forwarding['listen_address']}")
        if forwarding["interface"] != "Any":
            if not re.fullmatch(r"[A-Za-z0-9_.:-]+", forwarding["interface"]):
                return None
            parts.append(f"iifname \"{forwarding['interface']}\"")
        protocol = forwarding["protocol"]
        port = forwarding["listen_port"]
        if protocol == "TCP / UDP":
            parts.append(f"meta l4proto {{ tcp, udp }} th dport {port}")
        else:
            parts.append(f"{protocol.lower()} dport {port}")
        return " ".join(parts)

    @staticmethod
    def _nft_forward_filter_expression(forwarding: dict) -> str:
        protocol = forwarding["protocol"]
        port = forwarding["target_port"]
        if protocol == "TCP / UDP":
            return f"ip daddr {forwarding['target_address']} meta l4proto {{ tcp, udp }} th dport {port}"
        return f"ip daddr {forwarding['target_address']} {protocol.lower()} dport {port}"

    def _nft_expression(self, rule: dict, aliases: list[dict] | None = None) -> str | None:
        aliases = aliases or []
        address_aliases = {item["name"]: item for item in aliases if item.get("kind") == "Address" and item.get("enabled", True)}
        port_aliases = {item["name"]: item for item in aliases if item.get("kind") == "Port" and item.get("enabled", True)}
        source = rule.get("source", "Any").strip()
        destination = rule.get("destination", "Any").strip()
        protocol = rule.get("protocol", "TCP")
        port = rule.get("port", "Any").strip()
        parts = []
        if source != "Any":
            alias = address_aliases.get(source)
            if alias:
                family = "ip6" if ":" in alias["values"][0] else "ip"
                parts.append(f"{family} saddr {{ {', '.join(alias['values'])} }}")
            elif not _ADDRESS.fullmatch(source):
                return None
            else:
                family = "ip6" if ":" in source else "ip"
                parts.append(f"{family} saddr {source}")
        if destination != "Any":
            alias = address_aliases.get(destination)
            if alias:
                family = "ip6" if ":" in alias["values"][0] else "ip"
                parts.append(f"{family} daddr {{ {', '.join(alias['values'])} }}")
            elif not _ADDRESS.fullmatch(destination):
                return None
            else:
                family = "ip6" if ":" in destination else "ip"
                parts.append(f"{family} daddr {destination}")
        if protocol == "ICMP":
            parts.append("icmp type echo-request")
        elif protocol in {"TCP", "UDP"}:
            parts.append(protocol.lower())
            if port.lower() != "any":
                alias = port_aliases.get(port)
                values = alias["values"] if alias else [item.strip() for item in port.split(",") if item.strip()]
                if not values or any(not _PORT_ITEM.fullmatch(item) or any(int(part) > 65535 for part in item.split("-")) for item in values):
                    return None
                parts.append(f"dport {{ {', '.join(values)} }}")
        elif protocol == "TCP / UDP":
            if port.lower() == "any":
                parts.append("meta l4proto { tcp, udp }")
            else:
                alias = port_aliases.get(port)
                values = alias["values"] if alias else [item.strip() for item in port.split(",") if item.strip()]
                if not values or any(not _PORT_ITEM.fullmatch(item) for item in values):
                    return None
                parts.append(f"meta l4proto {{ tcp, udp }} th dport {{ {', '.join(values)} }}")
        else:
            return None
        action = rule.get("action", "Allow")
        verdict = {"Allow": "accept", "Deny": "drop", "Reject": "reject with icmpx type admin-prohibited"}.get(action, "accept")
        # Every managed rule gets its own nftables counter and stable comment so
        # live packet counters can be mapped back to the panel rule.
        parts.append(f'counter {verdict} comment "server-engine:{rule["id"]}"')
        return " ".join(parts)

    def _read_counters(self) -> dict[str, int]:
        return {
            **self._read_counters_from_table("inet", self.nft_table),
            **self._read_counters_from_table("ip", f"{self.nft_table}_nat"),
        }

    def _read_counters_from_table(self, family: str, table: str) -> dict[str, int]:
        if not self.nft:
            return {}
        result = subprocess.run(
            [self.nft, "-j", "list", "table", family, table],
            capture_output=True,
            text=True,
            check=False,
            timeout=8,
        )
        if result.returncode != 0:
            return {}
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError:
            return {}
        counters = {}
        for item in payload.get("nftables", []):
            rule = item.get("rule") or {}
            comment = rule.get("comment", "")
            if not comment.startswith("server-engine:"):
                continue
            counter = next((expr.get("counter") for expr in rule.get("expr", []) if "counter" in expr), None)
            if counter:
                counters[comment.removeprefix("server-engine:")] = int(counter.get("packets", 0))
        return counters

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()


firewall_service = FirewallService()
