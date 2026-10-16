from __future__ import annotations

import json
import ipaddress
import logging
import os
import shutil
import sqlite3
import subprocess
import tempfile
import re
import time
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock, Thread
from urllib.parse import urlsplit

from app.models.application_shield import (
    ApplicationShieldOverview,
    ApplicationShieldPolicy,
    ApplicationShieldPolicyUpdate,
    ApplicationShieldMetrics,
    ShieldConnector,
)
from app.models.application_shield_rule import ApplicationShieldRule, ApplicationShieldRuleRequest
from app.models.application_shield_ip import ApplicationShieldIpEntry, ApplicationShieldIpRequest
from app.models.application_shield_geo import ApplicationShieldGeoEntry, ApplicationShieldGeoRequest, ApplicationShieldGeoOverview
from app.services.service_runtime import binary_path, ensure_nginx_layout, managed_library_environment, nginx_paths
from app.services.website_service import website_service
from app.services.geoip_service import geoip_service


_CONTINENT_COUNTRIES = {
    "AF": "AF", "AX": "EU", "AL": "EU", "DZ": "AF", "AS": "OC", "AD": "EU", "AO": "AF", "AI": "NA", "AQ": "AN", "AG": "NA", "AR": "SA", "AM": "AS", "AW": "NA", "AU": "OC", "AT": "EU", "AZ": "AS",
    "BS": "NA", "BH": "AS", "BD": "AS", "BB": "NA", "BY": "EU", "BE": "EU", "BZ": "NA", "BJ": "AF", "BM": "NA", "BT": "AS", "BO": "SA", "BQ": "NA", "BA": "EU", "BW": "AF", "BV": "AN", "BR": "SA", "IO": "AS", "BN": "AS", "BG": "EU", "BF": "AF", "BI": "AF",
    "CV": "AF", "KH": "AS", "CM": "AF", "CA": "NA", "KY": "NA", "CF": "AF", "TD": "AF", "CL": "SA", "CN": "AS", "CX": "AS", "CC": "AS", "CO": "SA", "KM": "AF", "CG": "AF", "CD": "AF", "CK": "OC", "CR": "NA", "CI": "AF", "HR": "EU", "CU": "NA", "CW": "NA", "CY": "AS", "CZ": "EU",
    "DK": "EU", "DJ": "AF", "DM": "NA", "DO": "NA", "EC": "SA", "EG": "AF", "SV": "NA", "GQ": "AF", "ER": "AF", "EE": "EU", "SZ": "AF", "ET": "AF", "FK": "SA", "FO": "EU", "FJ": "OC", "FI": "EU", "FR": "EU", "GF": "SA", "PF": "OC", "TF": "AN", "GA": "AF", "GM": "AF", "GE": "AS", "DE": "EU", "GH": "AF", "GI": "EU", "GR": "EU", "GL": "NA", "GD": "NA", "GP": "NA", "GU": "OC", "GT": "NA", "GG": "EU", "GN": "AF", "GW": "AF", "GY": "SA",
    "HT": "NA", "HM": "AN", "VA": "EU", "HN": "NA", "HK": "AS", "HU": "EU", "IS": "EU", "IN": "AS", "ID": "AS", "IR": "AS", "IQ": "AS", "IE": "EU", "IM": "EU", "IL": "AS", "IT": "EU", "JM": "NA", "JP": "AS", "JE": "EU", "JO": "AS", "KZ": "AS", "KE": "AF", "KI": "OC", "KP": "AS", "KR": "AS", "KW": "AS", "KG": "AS", "LA": "AS", "LV": "EU", "LB": "AS", "LS": "AF", "LR": "AF", "LY": "AF", "LI": "EU", "LT": "EU", "LU": "EU",
    "MO": "AS", "MG": "AF", "MW": "AF", "MY": "AS", "MV": "AS", "ML": "AF", "MT": "EU", "MH": "OC", "MQ": "NA", "MR": "AF", "MU": "AF", "YT": "AF", "MX": "NA", "FM": "OC", "MD": "EU", "MC": "EU", "MN": "AS", "ME": "EU", "MS": "NA", "MA": "AF", "MZ": "AF", "MM": "AS", "NA": "AF", "NR": "OC", "NP": "AS", "NL": "EU", "NC": "OC", "NZ": "OC", "NI": "NA", "NE": "AF", "NG": "AF", "NU": "OC", "NF": "OC", "MK": "EU", "MP": "OC", "NO": "EU", "OM": "AS", "PK": "AS", "PW": "OC", "PS": "AS", "PA": "NA", "PG": "OC", "PY": "SA", "PE": "SA", "PH": "AS", "PN": "OC", "PL": "EU", "PT": "EU", "PR": "NA", "QA": "AS", "RE": "AF", "RO": "EU", "RU": "EU", "RW": "AF", "BL": "NA", "SH": "AF", "KN": "NA", "LC": "NA", "MF": "NA", "PM": "NA", "VC": "NA", "WS": "OC", "SM": "EU", "ST": "AF", "SA": "AS", "SN": "AF", "RS": "EU", "SC": "AF", "SL": "AF", "SG": "AS", "SX": "NA", "SK": "EU", "SI": "EU", "SB": "OC", "SO": "AF", "ZA": "AF", "GS": "AN", "SS": "AF", "ES": "EU", "LK": "AS", "SD": "AF", "SR": "SA", "SJ": "EU", "SE": "EU", "CH": "EU", "SY": "AS", "TW": "AS", "TJ": "AS", "TZ": "AF", "TH": "AS", "TL": "AS", "TG": "AF", "TK": "OC", "TO": "OC", "TT": "NA", "TN": "AF", "TR": "AS", "TM": "AS", "TC": "NA", "TV": "OC", "UG": "AF", "UA": "EU", "AE": "AS", "GB": "EU", "US": "NA", "UM": "OC", "UY": "SA", "UZ": "AS", "VU": "OC", "VE": "SA", "VN": "AS", "VG": "NA", "VI": "NA", "WF": "OC", "EH": "AF", "YE": "AS", "ZM": "AF", "ZW": "AF"}
_CONTINENT_NAMES = {"AF": "Africa", "AN": "Antarctica", "AS": "Asia", "EU": "Europe", "NA": "North America", "OC": "Oceania", "SA": "South America"}

_AUDIT_LOG_PATH = Path("/server-engine/logs/application-shield/audit.log")
_AUDIT_LOG_STORAGE_DIR = Path("/server-engine/logs/application-shield/audit")
_AUDIT_LOG_FILE_MODE = "0600"
_AUDIT_LOG_DIR_MODE = "0700"
_LOGGER = logging.getLogger(__name__)


def _continent_for_country(code: str) -> tuple[str, str]:
    continent = _CONTINENT_COUNTRIES.get(str(code or "").upper(), "")
    return continent, _CONTINENT_NAMES.get(continent, "")


class ApplicationShieldService:
    providers = (
        ("nginx", "Nginx", "conf/modsecurity.conf"),
        ("apache", "Apache HTTP Server", "conf/modsecurity.conf"),
        ("openlitespeed", "OpenLiteSpeed", "conf/modsecurity.conf"),
    )

    def __init__(self) -> None:
        state_dir = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.path = Path(os.getenv("SE_APPLICATION_SHIELD_PATH", str(state_dir / "application-shield.json")))
        self.rules_path = Path(os.getenv("SE_APPLICATION_SHIELD_RULES_PATH", str(state_dir / "application-shield-rules.json")))
        self.ip_path = Path(os.getenv("SE_APPLICATION_SHIELD_IP_PATH", str(state_dir / "application-shield-ip.json")))
        self.geo_path = Path(os.getenv("SE_APPLICATION_SHIELD_GEO_PATH", str(state_dir / "application-shield-geo.json")))
        self.events_db_path = Path(os.getenv(
            "SE_APPLICATION_SHIELD_DB_PATH",
            "/server-engine/logs/application-shield/application-shield.db",
        ))
        self.service_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services"))
        self._lock = RLock()
        self._provider_refresh_lock = RLock()
        self._traffic_cache_signature: tuple[int, int] | None = None
        self._traffic_cache_events: list[dict] = []
        self._activity_cache_expires = 0.0
        self._activity_cache_signature: tuple[int, int] | None = None
        self._activity_cache: dict | None = None
        self._setup_events_db()

    def _events_connection(self):
        connection = sqlite3.connect(self.events_db_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        connection.execute("PRAGMA busy_timeout=30000")
        return connection

    def _setup_events_db(self) -> None:
        self.events_db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._events_connection() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS audit_events (
                    id TEXT PRIMARY KEY,
                    occurred_at TEXT NOT NULL DEFAULT '',
                    source_ip TEXT NOT NULL DEFAULT '',
                    host TEXT NOT NULL DEFAULT '',
                    method TEXT NOT NULL DEFAULT '',
                    uri TEXT NOT NULL DEFAULT '',
                    status INTEGER,
                    outcome TEXT NOT NULL DEFAULT 'Inspected',
                    country_code TEXT NOT NULL DEFAULT '',
                    country_name TEXT NOT NULL DEFAULT '',
                    continent_code TEXT NOT NULL DEFAULT '',
                    continent_name TEXT NOT NULL DEFAULT '',
                    messages TEXT NOT NULL DEFAULT '[]'
                );
                CREATE INDEX IF NOT EXISTS idx_shield_events_time ON audit_events(occurred_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_shield_events_status ON audit_events(status, occurred_at DESC);
                CREATE INDEX IF NOT EXISTS idx_shield_events_source ON audit_events(source_ip, occurred_at DESC);
                CREATE INDEX IF NOT EXISTS idx_shield_events_country ON audit_events(country_code, occurred_at DESC);
                CREATE TABLE IF NOT EXISTS report_cache (
                    cache_key TEXT PRIMARY KEY,
                    generated_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS hourly_security_rollups (
                    bucket_start TEXT PRIMARY KEY,
                    requests INTEGER NOT NULL DEFAULT 0,
                    blocked INTEGER NOT NULL DEFAULT 0,
                    allowed INTEGER NOT NULL DEFAULT 0,
                    client_errors INTEGER NOT NULL DEFAULT 0,
                    server_errors INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS daily_security_rollups (
                    bucket_start TEXT PRIMARY KEY,
                    requests INTEGER NOT NULL DEFAULT 0,
                    blocked INTEGER NOT NULL DEFAULT 0,
                    allowed INTEGER NOT NULL DEFAULT 0,
                    client_errors INTEGER NOT NULL DEFAULT 0,
                    server_errors INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS audit_log_state (
                    path TEXT PRIMARY KEY,
                    inode INTEGER NOT NULL DEFAULT 0,
                    offset INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL DEFAULT ''
                );
                """
            )

    def policy(self) -> ApplicationShieldPolicy:
        if not self.path.exists():
            return ApplicationShieldPolicy()
        try:
            return ApplicationShieldPolicy.model_validate(json.loads(self.path.read_text()))
        except (OSError, json.JSONDecodeError, ValueError):
            return ApplicationShieldPolicy()

    def rules(self) -> list[ApplicationShieldRule]:
        if not self.rules_path.exists():
            return []
        try:
            values = json.loads(self.rules_path.read_text())
            if not isinstance(values, list):
                return []
            audit = _AUDIT_LOG_PATH.read_text(errors="replace") if _AUDIT_LOG_PATH.exists() else ""
            result = []
            for item in values:
                rule = ApplicationShieldRule.model_validate(item)
                rule_id = 1000000 + (uuid.uuid5(uuid.NAMESPACE_URL, f"server-engine:shield-rule:{rule.id}").int % 899999)
                result.append(rule.model_copy(update={"hits": audit.count(f'[id "{rule_id}"]')}))
            return result
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise RuntimeError(f"Application Shield rule registry is unreadable: {error}") from error

    def create_rule(self, payload: ApplicationShieldRuleRequest) -> ApplicationShieldRule:
        now = datetime.now(timezone.utc).isoformat()
        rule = ApplicationShieldRule(id=str(uuid.uuid4()), **payload.model_dump(), created_at=now, updated_at=now)
        self._save_rules(self.rules() + [rule])
        self._refresh_rule_config()
        return rule

    def update_rule(self, rule_id: str, payload: ApplicationShieldRuleRequest) -> ApplicationShieldRule:
        values = self.rules()
        current = next((item for item in values if item.id == rule_id), None)
        if current is None:
            raise KeyError("Application Shield rule not found")
        updated = ApplicationShieldRule(id=current.id, hits=current.hits, created_at=current.created_at, updated_at=datetime.now(timezone.utc).isoformat(), **payload.model_dump())
        self._save_rules([updated if item.id == rule_id else item for item in values])
        self._refresh_rule_config()
        return updated

    def delete_rule(self, rule_id: str) -> None:
        values = self.rules()
        if not any(item.id == rule_id for item in values):
            raise KeyError("Application Shield rule not found")
        self._save_rules([item for item in values if item.id != rule_id])
        self._refresh_rule_config()

    def toggle_rule(self, rule_id: str) -> ApplicationShieldRule:
        values = self.rules()
        current = next((item for item in values if item.id == rule_id), None)
        if current is None:
            raise KeyError("Application Shield rule not found")
        updated = current.model_copy(update={"enabled": not current.enabled, "updated_at": datetime.now(timezone.utc).isoformat()})
        self._save_rules([updated if item.id == rule_id else item for item in values])
        self._refresh_rule_config()
        return updated

    def _save_rules(self, values: list[ApplicationShieldRule]) -> None:
        self.rules_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.rules_path.with_suffix(".tmp")
        temporary.write_text(json.dumps([item.model_dump(mode="json") for item in values], indent=2) + "\n")
        os.replace(temporary, self.rules_path)

    def _refresh_rule_config(self) -> None:
        self._write_engine_config(self.policy())
        for provider, _, _ in self.providers:
            root = self.service_root / provider
            if (root / ".serverengine-application-shield-attached").exists():
                self._validate_and_reload(provider, root)

    def ip_entries(self) -> list[ApplicationShieldIpEntry]:
        if not self.ip_path.exists():
            return []
        try:
            values = json.loads(self.ip_path.read_text())
            now = datetime.now(timezone.utc)
            entries = [ApplicationShieldIpEntry.model_validate(item) for item in values] if isinstance(values, list) else []
            return [item for item in entries if not item.expires_at or datetime.fromisoformat(item.expires_at) > now]
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise RuntimeError(f"Application Shield IP registry is unreadable: {error}") from error

    def create_ip_entry(self, payload: ApplicationShieldIpRequest) -> ApplicationShieldIpEntry:
        address = str(ipaddress.ip_network(payload.address.strip(), strict=False))
        hosts = self._normalize_ip_hosts(payload.hosts)
        now = datetime.now(timezone.utc).isoformat()
        entry = ApplicationShieldIpEntry(id=str(uuid.uuid4()), address=address, **payload.model_dump(exclude={"address", "hosts"}), hosts=hosts, created_at=now, updated_at=now)
        self._save_ip_entries(self.ip_entries() + [entry])
        self._refresh_ip_config()
        return entry

    def update_ip_entry(self, entry_id: str, payload: ApplicationShieldIpRequest) -> ApplicationShieldIpEntry:
        values = self.ip_entries()
        current = next((item for item in values if item.id == entry_id), None)
        if current is None:
            raise KeyError("Application Shield IP entry not found")
        address = str(ipaddress.ip_network(payload.address.strip(), strict=False))
        hosts = self._normalize_ip_hosts(payload.hosts)
        updated = ApplicationShieldIpEntry(id=current.id, address=address, **payload.model_dump(exclude={"address", "hosts"}), hosts=hosts, created_at=current.created_at, updated_at=datetime.now(timezone.utc).isoformat())
        self._save_ip_entries([updated if item.id == entry_id else item for item in values])
        self._refresh_ip_config()
        return updated

    def delete_ip_entry(self, entry_id: str) -> None:
        values = self.ip_entries()
        if not any(item.id == entry_id for item in values):
            raise KeyError("Application Shield IP entry not found")
        self._save_ip_entries([item for item in values if item.id != entry_id])
        self._refresh_ip_config()

    def _save_ip_entries(self, values: list[ApplicationShieldIpEntry]) -> None:
        self.ip_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.ip_path.with_suffix(".tmp")
        temporary.write_text(json.dumps([item.model_dump(mode="json") for item in values], indent=2) + "\n")
        os.replace(temporary, self.ip_path)

    @staticmethod
    def _normalize_ip_hosts(hosts: list[str]) -> list[str]:
        values = []
        for value in hosts or ["*"]:
            host = str(value).strip().lower()
            if not host:
                continue
            if host == "*":
                return ["*"]
            if re.search(r'[\s"\\]', host) or len(host) > 253:
                raise ValueError("IP entry hosts must be valid host names")
            if host not in values:
                values.append(host)
        return values or ["*"]

    def geo_entries(self) -> list[ApplicationShieldGeoEntry]:
        if not self.geo_path.exists():
            return []
        try:
            values = json.loads(self.geo_path.read_text())
            return [ApplicationShieldGeoEntry.model_validate(item) for item in values] if isinstance(values, list) else []
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise RuntimeError(f"Application Shield Geo policy registry is unreadable: {error}") from error

    def geo_overview(self) -> ApplicationShieldGeoOverview:
        traffic = self.traffic(1000).get("events", [])
        observed = {}
        for event in traffic:
            country = event.get("country")
            if not country:
                continue
            code = country["country_code"]
            observed.setdefault(code, {**country, "requests": 0})["requests"] += 1
        return ApplicationShieldGeoOverview(
            database=geoip_service.status(),
            entries=self.geo_entries(),
            observed_countries=sorted(observed.values(), key=lambda item: item["requests"], reverse=True),
        )

    def create_geo_entry(self, payload: ApplicationShieldGeoRequest) -> ApplicationShieldGeoEntry:
        if not geoip_service.status().get("ready"):
            raise RuntimeError("The optional DB-IP country database is not ready")
        values = self.geo_entries()
        if any(item.country_code == payload.country_code for item in values):
            raise ValueError(f"A Geo policy for {payload.country_code} already exists")
        now = datetime.now(timezone.utc).isoformat()
        entry = ApplicationShieldGeoEntry(id=str(uuid.uuid4()), **payload.model_dump(), created_at=now, updated_at=now)
        self._save_geo_entries(values + [entry])
        self._refresh_geo_config()
        return entry

    def create_geo_entries(
        self, payloads: list[ApplicationShieldGeoRequest]
    ) -> list[ApplicationShieldGeoEntry]:
        if not payloads:
            raise ValueError("At least one country policy is required")
        if not geoip_service.status().get("ready"):
            raise RuntimeError("The optional DB-IP country database is not ready")
        values = self.geo_entries()
        existing_codes = {item.country_code for item in values}
        requested_codes = [payload.country_code for payload in payloads]
        if len(requested_codes) != len(set(requested_codes)):
            raise ValueError("Each country may only have one policy")
        duplicate = next(
            (code for code in requested_codes if code in existing_codes), None
        )
        if duplicate:
            raise ValueError(f"A Geo policy for {duplicate} already exists")
        now = datetime.now(timezone.utc).isoformat()
        entries = [
            ApplicationShieldGeoEntry(
                id=str(uuid.uuid4()),
                **payload.model_dump(),
                created_at=now,
                updated_at=now,
            )
            for payload in payloads
        ]
        self._save_geo_entries(values + entries)
        self._refresh_geo_config()
        return entries

    def update_geo_entry(self, entry_id: str, payload: ApplicationShieldGeoRequest) -> ApplicationShieldGeoEntry:
        values = self.geo_entries()
        current = next((item for item in values if item.id == entry_id), None)
        if current is None:
            raise KeyError("Application Shield Geo policy not found")
        if any(item.id != entry_id and item.country_code == payload.country_code for item in values):
            raise ValueError(f"A Geo policy for {payload.country_code} already exists")
        updated = ApplicationShieldGeoEntry(id=current.id, created_at=current.created_at, updated_at=datetime.now(timezone.utc).isoformat(), **payload.model_dump())
        self._save_geo_entries([updated if item.id == entry_id else item for item in values])
        self._refresh_geo_config()
        return updated

    def delete_geo_entry(self, entry_id: str) -> None:
        values = self.geo_entries()
        if not any(item.id == entry_id for item in values):
            raise KeyError("Application Shield Geo policy not found")
        self._save_geo_entries([item for item in values if item.id != entry_id])
        self._refresh_geo_config()

    def _save_geo_entries(self, values: list[ApplicationShieldGeoEntry]) -> None:
        self.geo_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.geo_path.with_suffix(".tmp")
        temporary.write_text(json.dumps([item.model_dump(mode="json") for item in values], indent=2) + "\n")
        os.replace(temporary, self.geo_path)

    def _refresh_geo_config(self) -> None:
        self._write_engine_config(self.policy())
        attached = [
            (provider, self.service_root / provider)
            for provider, _, _ in self.providers
            if (self.service_root / provider / ".serverengine-application-shield-attached").exists()
        ]
        if attached:
            Thread(
                target=self._reload_geo_providers,
                args=(attached,),
                name="application-shield-geo-reload",
                daemon=True,
            ).start()

    def _reload_geo_providers(self, providers: list[tuple[str, Path]]) -> None:
        with self._provider_refresh_lock:
            for provider, root in providers:
                try:
                    self._validate_and_reload(provider, root)
                except Exception:
                    _LOGGER.exception(
                        "Application Shield geo policy reload failed for %s",
                        provider,
                    )

    def _refresh_ip_config(self) -> None:
        self._write_engine_config(self.policy())
        for provider, _, _ in self.providers:
            root = self.service_root / provider
            if (root / ".serverengine-application-shield-attached").exists():
                self._validate_and_reload(provider, root)

    def update_policy(self, changes: ApplicationShieldPolicyUpdate) -> ApplicationShieldPolicy:
        with self._lock:
            current = self.policy()
            values = current.model_dump()
            values.update(changes.model_dump(exclude_unset=True))
            updated = ApplicationShieldPolicy.model_validate(values)
            # Validate and render the new audit directives before persisting
            # the policy, so a malformed regex or mode cannot become the
            # active saved configuration.
            self._write_engine_config(updated)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            handle = tempfile.NamedTemporaryFile("w", dir=self.path.parent, prefix=".application-shield.", delete=False)
            try:
                json.dump(updated.model_dump(), handle, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
                temporary = Path(handle.name)
            finally:
                handle.close()
            os.replace(temporary, self.path)
            website_service.refresh_scheduled_maintenance()
            active_providers = [provider for provider, _, _ in self.providers if (self.service_root / provider / ".serverengine-application-shield-attached").exists()]
            if updated.enabled and updated.mode != "off":
                try:
                    for provider in active_providers:
                        self._validate_and_reload(provider, self.service_root / provider)
                except RuntimeError:
                    rollback = self.path.with_suffix(".rollback")
                    rollback.write_text(json.dumps(current.model_dump(), indent=2) + "\n")
                    os.replace(rollback, self.path)
                    self._write_engine_config(current)
                    raise
            if not updated.enabled or updated.mode == "off":
                # The emergency switch is physical: detach markers and leave
                # a harmless fragment behind so a later reload cannot keep an
                # old connector active.
                for provider, _, relative_config in self.providers:
                    root = self.service_root / provider
                    (root / ".serverengine-application-shield-attached").unlink(missing_ok=True)
                    if root.exists():
                        config = root / relative_config
                        if config.exists():
                            config.write_text("# Managed by Server Engine Application Shield\n# Connector detached by emergency disable.\n")
                        (root / ".serverengine-application-shield-ready").write_text("disabled\n")
                for provider in active_providers:
                    try:
                        self._validate_and_reload(provider, self.service_root / provider)
                    except RuntimeError:
                        # The emergency setting remains persisted even when a
                        # provider is already stopped; its connector marker
                        # has been removed above, so it cannot be re-enabled
                        # accidentally on the next start.
                        pass
            return updated

    def _write_engine_config(self, policy: ApplicationShieldPolicy) -> None:
        root = self.service_root / "modsecurity"
        config_dir = root / "conf"
        config_dir.mkdir(parents=True, exist_ok=True)
        audit_storage_dir = _AUDIT_LOG_STORAGE_DIR
        _AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        if policy.audit_log_type == "Concurrent":
            audit_storage_dir.mkdir(parents=True, exist_ok=True)
        engine_config = config_dir / "modsecurity.conf"
        mode = "Off" if not policy.enabled or policy.mode == "off" else ("On" if policy.mode == "blocking" else "DetectionOnly")
        audit = "Off" if not policy.enabled or policy.mode == "off" else policy.audit_engine
        audit_path = _AUDIT_LOG_PATH
        self._ensure_crs_setup(root)
        shield_block_status = 418 if policy.block_page_enabled and policy.mode == "blocking" else 403
        custom_rules = self._write_custom_rules(root, shield_block_status)
        geo_rules = self._write_geo_rules(root)
        crs_setup = root / "crs/crs-setup.conf"
        crs_rules = root / "crs/rules"
        relevant_status = policy.audit_relevant_status
        if policy.audit_successful_responses and relevant_status == "^(?:5|403|406|409|429|444|499)":
            relevant_status = "^(?:2|3|5|403|406|409|429|444|499)"
        if "\n" in relevant_status or "\r" in relevant_status or '"' in relevant_status:
            raise ValueError("Audit relevant-status must be a single regex without quotes or newlines")
        try:
            re.compile(relevant_status)
        except re.error as exc:
            raise ValueError(f"Invalid audit relevant-status regex: {exc}") from exc
        audit_parts = "".join(dict.fromkeys(policy.audit_log_parts.upper()))
        if "A" not in audit_parts or any(part not in "ABCDEFGHIJKZ" for part in audit_parts):
            raise ValueError("Audit log parts must contain A and only use documented part letters")
        crs_lines = []
        if policy.crs_enabled and crs_setup.is_file():
            crs_lines.append(f"Include {crs_setup}")
        if policy.crs_enabled and crs_rules.is_dir() and any(crs_rules.glob("*.conf")):
            crs_lines.append(f"Include {crs_rules}/*.conf")
        if custom_rules:
            crs_lines.insert(0, f"Include {custom_rules}")
        if geo_rules:
            crs_lines.insert(0, f"Include {geo_rules}")
        if not crs_lines:
            crs_lines.append("# OWASP CRS rules are not installed")
        management_api_exclusion = (
            'SecRule REQUEST_URI "@beginsWith /api/v1/" '
            '"id:1999996,phase:1,pass,nolog,ctl:ruleRemoveByTag=OWASP_CRS"'
        )
        crs_block_page_override = (
            'SecRuleUpdateActionByTag "OWASP_CRS" "status:418"'
            if shield_block_status == 418 and policy.crs_enabled
            else "# OWASP CRS keeps its normal 403 response"
        )
        content = "\n".join([
            "# Generated by Server Engine Application Shield. Edit policy in the panel.",
            f"SecRuleEngine {mode}",
            f"SecRequestBodyLimit {policy.request_body_limit}",
            f"SecAuditEngine {audit}",
            # RelevantOnly uses the operator-provided status expression;
            # DetectionOnly and blocking mode do not change that audit choice.
            f'SecAuditLogRelevantStatus "{relevant_status}"',
            f"SecAuditLogParts {audit_parts}",
            f"SecAuditLogType {policy.audit_log_type}",
            f"SecAuditLogFormat {policy.audit_log_format}",
            f"SecAuditLog {audit_path}",
            *([f"SecAuditLogStorageDir {audit_storage_dir}"] if policy.audit_log_type == "Concurrent" else []),
            *([f"SecAuditLogFileMode {_AUDIT_LOG_FILE_MODE}"] if policy.audit_log_type == "Concurrent" else []),
            *([f"SecAuditLogDirMode {_AUDIT_LOG_DIR_MODE}"] if policy.audit_log_type == "Concurrent" else []),
            # Authenticated panel API requests contain user-provided JSON and
            # configuration values. Do not let CRS block the control plane it
            # is configuring, but keep managed IP, geo, and custom rules.
            management_api_exclusion,
            crs_block_page_override,
            # IncludeOptional is Apache-only syntax. This file is consumed
            # by Nginx's ModSecurity rules parser, so use native ModSecurity
            # Include directives and only reference files that exist.
            *([
                # GET and HEAD requests do not carry an application request
                # body; CRS 920420 otherwise treats a normal text/html
                # content type as a protocol violation.
                'SecRule REQUEST_METHOD "@rx ^(?:GET|HEAD)$" "id:1999997,phase:1,pass,nolog,ctl:ruleRemoveById=920420"',
            ] if policy.audit_ignore_get_content_type else []),
            *crs_lines,
            *([
                # CRS can explicitly request audit logging for a rule that
                # only detects a harmless request. Keep routine successful
                # responses out of the audit log by default.
                'SecRule RESPONSE_STATUS "@rx ^(?:2|3)\\d\\d$" "id:1999998,phase:5,pass,nolog,ctl:auditEngine=Off"',
            ] if audit == "RelevantOnly" and not policy.audit_successful_responses else []),
            "",
        ])
        temporary = engine_config.with_suffix(".tmp")
        temporary.write_text(content)
        os.replace(temporary, engine_config)

    def _write_geo_rules(self, root: Path) -> Path | None:
        entries = [entry for entry in self.geo_entries() if entry.enabled]
        if not entries or not geoip_service.status().get("ready"):
            target = root / "conf/geo-rules.conf"
            target.unlink(missing_ok=True)
            return None
        target = root / "conf/geo-rules.conf"
        lines = ["# Managed by Server Engine Application Shield. Geo policies are edited in the panel."]

        def collect_networks(source_files: list[Path]) -> tuple[list[ipaddress._BaseNetwork], list[ipaddress._BaseNetwork]]:
            values: set[ipaddress._BaseNetwork] = set()
            for source_file in source_files:
                for line in source_file.read_text(errors="replace").splitlines():
                    value = line.strip()
                    if not value or value.startswith("#"):
                        continue
                    try:
                        values.add(ipaddress.ip_network(value, strict=False))
                    except ValueError:
                        continue
            ipv4_values = [network for network in values if network.version == 4]
            ipv6_values = [network for network in values if network.version == 6]
            return (
                list(ipaddress.collapse_addresses(ipv4_values)),
                list(ipaddress.collapse_addresses(ipv6_values)),
            )

        def write_family_files(prefix: str, source_files: list[Path]) -> tuple[Path | None, Path | None]:
            ipv4, ipv6 = collect_networks(source_files)
            result: list[Path | None] = []
            for suffix, networks in (("v4", ipv4), ("v6", ipv6)):
                path = root / "geo" / f"{prefix}-{suffix}.cidr"
                if not networks:
                    path.unlink(missing_ok=True)
                    result.append(None)
                    continue
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(
                    "".join(
                        f"{network.network_address if network.prefixlen == network.max_prefixlen else network}\n"
                        for network in networks
                    )
                )
                result.append(path)
            return result[0], result[1]

        allow_entries = [entry for entry in entries if entry.decision == "Allow"]
        block_entries = [entry for entry in entries if entry.decision == "Block"]
        if allow_entries:
            sources = [geoip_service.country_network_file(entry.country_code) for entry in allow_entries]
            allowed_v4, allowed_v6 = write_family_files("allowed", sources)
            (root / "geo/allowed.cidr").unlink(missing_ok=True)
            if allowed_v4:
                rule_id = 2100000 + (uuid.uuid5(uuid.NAMESPACE_URL, "server-engine:shield-geo-allow-v4").int % 899999)
                lines.extend([
                    f"SecRule REMOTE_ADDR \"!@rx :\" \"id:{rule_id},phase:1,deny,status:403,log,auditlog,msg:'Geo policy denied country',chain\"",
                    f"SecRule REMOTE_ADDR \"!@ipMatchFromFile {allowed_v4}\" \"t:none\"",
                ])
            if allowed_v6:
                rule_id = 2100000 + (uuid.uuid5(uuid.NAMESPACE_URL, "server-engine:shield-geo-allow-v6").int % 899999)
                lines.extend([
                    f"SecRule REMOTE_ADDR \"@rx :\" \"id:{rule_id},phase:1,deny,status:403,log,auditlog,msg:'Geo policy denied country',chain\"",
                    f"SecRule REMOTE_ADDR \"!@ipMatchFromFile {allowed_v6}\" \"t:none\"",
                ])
        for entry in block_entries:
            country_file = geoip_service.country_network_file(entry.country_code)
            block_v4, block_v6 = write_family_files(f"blocked-{entry.country_code.lower()}", [country_file])
            message = entry.country_name.replace("'", "")
            if block_v4:
                rule_id = 2200000 + (uuid.uuid5(uuid.NAMESPACE_URL, f"server-engine:shield-geo-block:{entry.country_code}:v4").int % 799999)
                lines.extend([
                    f"SecRule REMOTE_ADDR \"!@rx :\" \"id:{rule_id},phase:1,deny,status:403,log,auditlog,msg:'Geo blocked {message}',chain\"",
                    f"SecRule REMOTE_ADDR \"@ipMatchFromFile {block_v4}\" \"t:none\"",
                ])
            if block_v6:
                rule_id = 2200000 + (uuid.uuid5(uuid.NAMESPACE_URL, f"server-engine:shield-geo-block:{entry.country_code}:v6").int % 799999)
                lines.extend([
                    f"SecRule REMOTE_ADDR \"@rx :\" \"id:{rule_id},phase:1,deny,status:403,log,auditlog,msg:'Geo blocked {message}',chain\"",
                    f"SecRule REMOTE_ADDR \"@ipMatchFromFile {block_v6}\" \"t:none\"",
                ])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("\n".join(lines) + "\n")
        return target

    def _write_custom_rules(self, root: Path, block_status: int = 403) -> Path | None:
        rules = [rule for rule in self.rules() if rule.enabled]
        ip_entries = self.ip_entries()
        target = root / "conf/custom-rules.conf"
        lines = ["# Managed by Server Engine Application Shield. Edit rules in the panel."]
        deny_action = f"deny,status:{block_status}"
        for entry in ip_entries:
            action = "allow" if entry.decision == "Allow" else deny_action
            message = entry.reason.replace('"', "'")
            hosts = entry.hosts or ["*"]
            for host in hosts:
                rule_id = 1900000 + (uuid.uuid5(uuid.NAMESPACE_URL, f"server-engine:shield-ip:{entry.id}:{host}").int % 899999)
                rule_line = f'SecRule REMOTE_ADDR "@ipMatch {entry.address}" "id:{rule_id},phase:1,{action},log,auditlog,msg:\"{message}\""'
                if host == "*":
                    lines.append(rule_line)
                else:
                    lines.extend([
                        f'SecRule REQUEST_HEADERS:Host "@streq {host}" "id:{rule_id},phase:1,pass,nolog,chain"',
                        rule_line.replace(f"id:{rule_id},", "", 1),
                    ])
        for rule in rules:
            match = re.match(r"^URI contains (.+)$", rule.match.strip(), re.I)
            variable = "REQUEST_URI"
            operator = "@contains"
            value = None
            if match:
                value = match.group(1).strip()
            else:
                match = re.match(r"^Request method is ([A-Za-z]+)$", rule.match.strip(), re.I)
                if match:
                    variable = "REQUEST_METHOD"
                    operator = "@streq"
                    value = match.group(1).upper()
            if not value:
                continue
            value = value.replace('"', "\\\"")
            rule_id = 1000000 + (uuid.uuid5(uuid.NAMESPACE_URL, f"server-engine:shield-rule:{rule.id}").int % 899999)
            action = {
                "Block": deny_action,
                "Allow": "allow",
                "Log only": "pass",
                "Challenge": "pass",
            }[rule.action]
            message = rule.name.replace('"', "'")
            rule_line = f'SecRule {variable} "{operator} {value}" "id:{rule_id},phase:1,{action},log,auditlog,msg:\"{message}\""'
            if rule.scope != "All protected sites" and re.fullmatch(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", rule.scope, re.I):
                lines.extend([
                    f'SecRule REQUEST_HEADERS:Host "@streq {rule.scope}" "id:{rule_id},phase:1,pass,nolog,chain"',
                    rule_line.replace(f"id:{rule_id},", "", 1),
                ])
            else:
                lines.append(rule_line)
        if len(lines) == 1:
            target.unlink(missing_ok=True)
            return None
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("\n".join(lines) + "\n")
        return target

    @staticmethod
    def _ensure_crs_setup(root: Path) -> None:
        """Install a managed CRS setup file before loading CRS rule files.

        Debian packages commonly ship only the example file. CRS emits a
        warning, and uses incomplete defaults, when the setup file is absent.
        Preserve an operator-edited setup file and only create it when missing.
        """
        crs_root = root / "crs"
        setup = crs_root / "crs-setup.conf"
        if setup.exists():
            return
        examples = (
            crs_root / "crs-setup.conf.example",
            crs_root / "crs-setup.conf.example.template",
            root / "crs-setup.conf.example",
        )
        example = next((item for item in examples if item.is_file()), None)
        setup.parent.mkdir(parents=True, exist_ok=True)
        if example:
            shutil.copyfile(example, setup)
            return
        # Minimal safe baseline for package layouts that omit the template.
        # CRS 3.x uses this transaction variable to confirm setup is loaded.
        setup.write_text(
            """# Managed by Server Engine Application Shield.
# Safe baseline generated because the CRS package did not ship a template.
SecAction \"id:900990,phase:1,nolog,pass,t:none,setvar:tx.crs_setup_version=335\"
SecAction \"id:900000,phase:1,nolog,pass,t:none,setvar:tx.paranoia_level=1\"
"""
        )

    def ensure_engine_config(self) -> None:
        with self._lock:
            self._write_engine_config(self.policy())

    @staticmethod
    def _audit_event_from_block(block: bytes) -> dict | None:
        text = block.decode("utf-8", errors="replace")
        sections = {}
        for match in re.finditer(r"(?ms)^---[^\r\n-]+---([A-Z])--\s*\n(.*?)(?=^---[^\r\n-]+---[A-Z]--|\Z)", text):
            sections[match.group(1)] = match.group(2)
        event_match = re.search(r"(?m)^---([^\r\n-]+)---A--", text)
        if not event_match or "Z" not in sections:
            return None
        event_id = event_match.group(1)
        metadata = sections.get("A", "").splitlines()
        metadata_line = metadata[0] if metadata else ""
        timestamp = ""
        timestamp_match = re.search(r"\[([^\]]+)\]", metadata_line)
        if timestamp_match:
            try:
                timestamp = datetime.strptime(timestamp_match.group(1), "%d/%b/%Y:%H:%M:%S %z").isoformat()
            except ValueError:
                timestamp = timestamp_match.group(1)
        source_match = re.search(r"\]\s+\S+\s+(\S+)", metadata_line)
        source_ip = source_match.group(1) if source_match else "Unknown"
        request_headers = {}
        request_lines = sections.get("B", "").splitlines()
        request_line = next((line for line in request_lines if re.match(r"\S+\s+\S+\s+HTTP/", line)), "")
        request_match = re.match(r"(\S+)\s+(\S+)\s+HTTP/", request_line)
        if request_match:
            method, uri = request_match.group(1), request_match.group(2)
        else:
            method, uri = "?", "?"
        for line in request_lines:
            if ":" in line:
                key, value = line.split(":", 1)
                request_headers[key.lower()] = value.strip()
        source_ip = request_headers.get("x-forwarded-for", request_headers.get("cf-connecting-ip", source_ip)).split(",", 1)[0].strip()
        final = sections.get("F", "")
        status_match = re.search(r"HTTP/[0-9.]+\s+(\d{3})", final)
        status = int(status_match.group(1)) if status_match else None
        # 418 is the private upstream status used to distinguish a Shield
        # denial from an ordinary Nginx/application 403. Nginx exposes it to
        # the client as 403 after rendering the custom block page.
        if status == 418:
            status = 403
        messages = list(dict.fromkeys(re.findall(r'\[id "([0-9]+)"\].*?\[msg "([^"]+)"\]', sections.get("H", ""))))
        country = geoip_service.lookup(source_ip) or {}
        country_code = request_headers.get("cf-ipcountry", "").strip().upper()
        if not country.get("country_code") and country_code and country_code != "XX":
            country = {"country_code": country_code, "country_name": country_code, "continent_code": "", "continent_name": ""}
        outcome = "Blocked" if status in {403, 406, 409, 429, 444, 499} else "Allowed" if status else "Inspected"
        return {
            "id": event_id,
            "occurred_at": timestamp,
            "source_ip": source_ip,
            "host": request_headers.get("host", "Unknown"),
            "method": method,
            "uri": uri,
            "status": status,
            "outcome": outcome,
            "country_code": country.get("country_code", ""),
            "country_name": country.get("country_name", ""),
            "continent_code": country.get("continent_code", ""),
            "continent_name": country.get("continent_name", ""),
            "messages": messages,
        }

    def _sync_audit_events(self) -> None:
        path = _AUDIT_LOG_PATH
        if not path.exists() or not path.is_file():
            return
        try:
            stat = path.stat()
        except OSError:
            return
        with self._events_connection() as db:
            state = db.execute("SELECT inode, offset FROM audit_log_state WHERE path = ?", (str(path),)).fetchone()
            offset = int(state[1]) if state else 0
            if state and not isinstance(state, sqlite3.Row):
                state = {"inode": state[0], "offset": state[1]}
            if state and (int(state["inode"]) != int(stat.st_ino) or int(state["offset"]) > stat.st_size):
                offset = 0
            with path.open("rb") as source:
                source.seek(offset)
                data = source.read()
            if not data:
                return
            markers = list(re.finditer(rb"(?m)^---[^\r\n-]+---A--\r?\n", data))
            parsed = []
            consumed = 0
            for index, marker in enumerate(markers):
                end = markers[index + 1].start() if index + 1 < len(markers) else len(data)
                block = data[marker.start():end]
                if not re.search(rb"(?m)^---[^\r\n-]+---Z--\s*$", block):
                    break
                event = self._audit_event_from_block(block)
                if event:
                    parsed.append(event)
                consumed = end
            if not consumed:
                return
            db.executemany(
                """INSERT OR REPLACE INTO audit_events(
                    id, occurred_at, source_ip, host, method, uri, status, outcome,
                    country_code, country_name, continent_code, continent_name, messages
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [(
                    event["id"], event["occurred_at"], event["source_ip"], event["host"],
                    event["method"], event["uri"], event["status"], event["outcome"],
                    event["country_code"], event["country_name"], event["continent_code"],
                    event["continent_name"], json.dumps(event["messages"], separators=(",", ":")),
                ) for event in parsed],
            )
            db.execute(
                """INSERT INTO audit_log_state(path, inode, offset, updated_at) VALUES (?, ?, ?, ?)
                   ON CONFLICT(path) DO UPDATE SET inode = excluded.inode, offset = excluded.offset, updated_at = excluded.updated_at""",
                (str(path), int(stat.st_ino), offset + consumed, datetime.now(timezone.utc).isoformat()),
            )

    def clear_traffic_index(self) -> None:
        """Remove indexed traffic and derived aggregates after its raw log is cleared."""
        with self._lock:
            with self._events_connection() as db:
                db.execute("DELETE FROM audit_events")
                db.execute("DELETE FROM report_cache")
                db.execute("DELETE FROM hourly_security_rollups")
                db.execute("DELETE FROM daily_security_rollups")
                db.execute("DELETE FROM audit_log_state")
            with self._events_connection() as db:
                db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                db.execute("VACUUM")
            self._traffic_cache_signature = None
            self._traffic_cache_events = []
            self._activity_cache_expires = 0.0
            self._activity_cache_signature = None
            self._activity_cache = None

    def is_traffic_log(self, path: Path) -> bool:
        """Return whether a log path is the Application Shield audit log."""
        candidates = {
            _AUDIT_LOG_PATH.resolve(),
            (self.service_root / "modsecurity/logs/audit.log").resolve(),
        }
        try:
            return path.resolve() in candidates
        except OSError:
            return path in candidates

    @staticmethod
    def _event_public(row: sqlite3.Row) -> dict:
        try:
            messages = json.loads(row["messages"] or "[]")
        except json.JSONDecodeError:
            messages = []
        country = None
        if row["country_code"]:
            country = {
                "country_code": row["country_code"],
                "country_name": row["country_name"],
                "continent_code": row["continent_code"],
                "continent_name": row["continent_name"],
            }
        return {
            "id": row["id"], "time": row["occurred_at"], "method": row["method"],
            "uri": row["uri"], "source_ip": row["source_ip"], "host": row["host"],
            "status": row["status"], "outcome": row["outcome"], "messages": messages,
            "country": country,
        }

    def report(self, hours: int = 24, host: str = "", country: str = "") -> dict:
        hours = max(1, min(hours, 8760))
        host = (host or "").strip().lower()
        country = (country or "").strip().upper()
        cache_key = f"report:v3:{hours}:{host}:{country}"
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        with self._events_connection() as db:
            cached = db.execute("SELECT generated_at, expires_at, payload FROM report_cache WHERE cache_key = ?", (cache_key,)).fetchone()
            if cached:
                try:
                    if cached[1] > now_iso:
                        value = json.loads(cached[2])
                        value["cached"] = True
                        value["cache_expires_at"] = cached[1]
                        return value
                except (TypeError, json.JSONDecodeError):
                    pass
        self._sync_audit_events()
        cutoff = now.timestamp() - hours * 3600
        cutoff_iso = datetime.fromtimestamp(cutoff, timezone.utc).isoformat()
        conditions = ["occurred_at >= ?"]
        query_params: list[str] = [cutoff_iso]
        if host:
            conditions.append("LOWER(host) = ?")
            query_params.append(host)
        if country:
            conditions.append("UPPER(country_code) = ?")
            query_params.append(country)
        where = " AND ".join(conditions)
        with self._events_connection() as db:
            summary = db.execute(
                """SELECT COUNT(*) AS total,
                          SUM(CASE WHEN outcome = 'Blocked' THEN 1 ELSE 0 END) AS blocked,
                          SUM(CASE WHEN outcome = 'Allowed' THEN 1 ELSE 0 END) AS allowed,
                          COUNT(DISTINCT source_ip) AS unique_sources,
                          COUNT(DISTINCT host) AS protected_hosts
                   FROM audit_events WHERE """ + where, query_params).fetchone()
            countries = db.execute(
                """SELECT country_code, country_name, continent_code, continent_name,
                          COUNT(*) AS requests,
                          SUM(CASE WHEN outcome = 'Blocked' THEN 1 ELSE 0 END) AS blocked
                   FROM audit_events WHERE """ + where + " AND country_code != '' GROUP BY country_code ORDER BY blocked DESC, requests DESC LIMIT 100", query_params).fetchall()
            rows = db.execute("SELECT occurred_at, source_ip, host, method, uri, status, outcome, country_code, country_name, continent_code, continent_name, messages FROM audit_events WHERE """ + where, query_params).fetchall()
            statuses = db.execute(
                """SELECT COALESCE(status, 0) AS status, COUNT(*) AS count
                   FROM audit_events WHERE """ + where + " GROUP BY status ORDER BY count DESC", query_params).fetchall()
            methods = db.execute("SELECT method, COUNT(*) AS count FROM audit_events WHERE """ + where + " GROUP BY method ORDER BY count DESC", query_params).fetchall()
            hosts = db.execute("SELECT host, COUNT(*) AS requests, SUM(CASE WHEN outcome = 'Blocked' THEN 1 ELSE 0 END) AS blocked FROM audit_events WHERE """ + where + " GROUP BY host ORDER BY blocked DESC, requests DESC LIMIT 25", query_params).fetchall()
            sources = db.execute("SELECT source_ip, COUNT(*) AS requests, SUM(CASE WHEN outcome = 'Blocked' THEN 1 ELSE 0 END) AS blocked, COUNT(DISTINCT host) AS hosts FROM audit_events WHERE """ + where + " GROUP BY source_ip ORDER BY blocked DESC, requests DESC LIMIT 25", query_params).fetchall()
        rule_counts = Counter()
        category_counts = Counter()
        path_counts = Counter()
        timeline = Counter()
        for row in rows:
            timestamp = row["occurred_at"] or ""
            bucket = timestamp[:13] + ":00:00+00:00" if hours <= 48 else timestamp[:10] + "T00:00:00+00:00"
            timeline[(bucket, "requests")] += 1
            status = int(row["status"] or 0)
            if row["outcome"] == "Blocked": timeline[(bucket, "blocked")] += 1
            if row["outcome"] == "Allowed": timeline[(bucket, "allowed")] += 1
            if 400 <= status < 500: timeline[(bucket, "client_errors")] += 1
            if 500 <= status < 600: timeline[(bucket, "server_errors")] += 1
            path_counts[urlsplit(row["uri"] or "?").path or "/"] += 1
            try:
                for _, message in json.loads(row["messages"] or "[]"):
                    rule_counts[message] += 1
                    lowered = message.lower()
                    category = "Other detection"
                    for keyword, label in (("sql", "SQL injection"), ("scanner", "Scanner behavior"), ("travers", "Path traversal"), ("command", "Command injection"), ("credential", "Credential abuse"), ("sensitive", "Sensitive file exposure"), ("xss", "Cross-site scripting")):
                        if keyword in lowered:
                            category = label
                            break
                    category_counts[category] += 1
            except (TypeError, json.JSONDecodeError):
                continue
        total = int(summary["total"] or 0)
        ordered_buckets = sorted({key[0] for key in timeline})
        payload = {
            "hours": hours,
            "source": "Application Shield SQLite event index",
            "generated_at": now_iso,
            "cache_expires_at": (now.timestamp() + 3600),
            "cached": False,
            "filters": {"host": host, "country": country},
            "summary": {
                "total": total, "blocked": int(summary["blocked"] or 0),
                "allowed": int(summary["allowed"] or 0), "unique_sources": int(summary["unique_sources"] or 0), "protected_hosts": int(summary["protected_hosts"] or 0),
            },
            "countries": [dict(row) for row in countries],
            "rule_groups": [{"message": message, "count": count} for message, count in rule_counts.most_common(100)],
            "categories": [{"category": label, "count": count} for label, count in category_counts.most_common(20)],
            "timeline": [{"bucket": bucket, "requests": timeline[(bucket, "requests")], "blocked": timeline[(bucket, "blocked")], "allowed": timeline[(bucket, "allowed")], "client_errors": timeline[(bucket, "client_errors")], "server_errors": timeline[(bucket, "server_errors")]} for bucket in ordered_buckets],
            "hosts": [dict(row) for row in hosts],
            "sources": [dict(row) for row in sources],
            "paths": [{"path": path, "count": count} for path, count in path_counts.most_common(25)],
            "methods": [dict(row) for row in methods],
            "statuses": [{"status": int(row["status"]), "count": int(row["count"])} for row in statuses],
        }
        expires_at = datetime.fromtimestamp(now.timestamp() + 3600, timezone.utc).isoformat()
        payload["cache_expires_at"] = expires_at
        with self._events_connection() as db:
            if not host and not country:
                hourly = Counter()
                daily = Counter()
                for row in rows:
                    timestamp = row["occurred_at"] or ""
                    hour_bucket = timestamp[:13] + ":00:00+00:00"
                    day_bucket = timestamp[:10] + "T00:00:00+00:00"
                    for bucket, target in ((hour_bucket, hourly), (day_bucket, daily)):
                        target[(bucket, "requests")] += 1
                        target[(bucket, "blocked")] += int(row["outcome"] == "Blocked")
                        target[(bucket, "allowed")] += int(row["outcome"] == "Allowed")
                        target[(bucket, "client_errors")] += int(400 <= int(row["status"] or 0) < 500)
                        target[(bucket, "server_errors")] += int(500 <= int(row["status"] or 0) < 600)
                for table, values in (("hourly_security_rollups", hourly), ("daily_security_rollups", daily)):
                    for bucket in {key[0] for key in values}:
                        db.execute(f"INSERT OR REPLACE INTO {table}(bucket_start, requests, blocked, allowed, client_errors, server_errors) VALUES (?, ?, ?, ?, ?, ?)", (bucket, values[(bucket, "requests")], values[(bucket, "blocked")], values[(bucket, "allowed")], values[(bucket, "client_errors")], values[(bucket, "server_errors")]))
            db.execute("INSERT OR REPLACE INTO report_cache(cache_key, generated_at, expires_at, payload) VALUES (?, ?, ?, ?)", (cache_key, now_iso, expires_at, json.dumps(payload, separators=(",", ":"))))
        return payload

    def logs(self, lines: int = 120) -> dict:
        candidates = [
            _AUDIT_LOG_PATH,
            self.service_root / "modsecurity/logs/audit.log",
        ]
        for path in candidates:
            if path.exists() and path.is_file():
                try:
                    count = max(1, min(lines, 1000))
                    with path.open("rb") as handle:
                        handle.seek(0, os.SEEK_END)
                        position = handle.tell()
                        chunks = []
                        newlines = 0
                        while position > 0 and newlines <= count:
                            size = min(65536, position)
                            position -= size
                            handle.seek(position)
                            chunk = handle.read(size)
                            chunks.append(chunk)
                            newlines += chunk.count(b"\n")
                    output = b"".join(reversed(chunks)).decode("utf-8", errors="replace").splitlines()[-count:]
                    if output:
                        return {"path": str(path), "lines": output, "available": True}
                    return {"path": str(path), "lines": [], "available": False, "message": "No Application Shield audit events have been recorded yet."}
                except OSError:
                    pass
        return {"path": str(candidates[0]), "lines": [], "available": False, "message": "No Application Shield audit events have been recorded yet."}

    def traffic(self, page: int = 1, page_size: int = 50, limit: int | None = None) -> dict:
        """Return one page of ModSecurity traffic, reparsing only changed audit logs."""
        if limit is not None:
            page_size = limit
        page = max(1, page)
        page_size = max(1, min(page_size, 100))
        path = _AUDIT_LOG_PATH
        if not path.exists():
            return {"events": [], "summary": {"requests_inspected": 0, "blocked": 0, "unique_sources": 0}, "pagination": {"page": page, "page_size": page_size, "total": 0, "has_next": False, "has_previous": page > 1}}
        try:
            stat = path.stat()
            signature = (stat.st_mtime_ns, stat.st_size)
        except OSError:
            signature = None
        with self._lock:
            if signature != self._traffic_cache_signature:
                text = path.read_text(errors="replace")
                events = {}
                for match in re.finditer(r"(?ms)^---([^\r\n-]+)---A--\s*\n(.*?)(?=^---\1---[A-Z]--|\Z)", text):
                    event_id, request_block = match.group(1), match.group(2)
                    request_lines = request_block.splitlines()
                    metadata = request_lines[0] if request_lines else ""
                    source = re.search(r"\]\s+\S+\s+(\S+)", metadata)
                    timestamp = ""
                    timestamp_match = re.search(r"\[([^\]]+)\]", metadata)
                    if timestamp_match:
                        try:
                            timestamp = datetime.strptime(timestamp_match.group(1), "%d/%b/%Y:%H:%M:%S %z").isoformat()
                        except ValueError:
                            timestamp = timestamp_match.group(1)
                    events[event_id] = {"id": event_id, "time": timestamp, "method": "?", "uri": "?", "source_ip": source.group(1) if source else "Unknown", "host": "Unknown", "status": None, "messages": []}
                for event_id, event in events.items():
                    block_match = re.search(rf"(?ms)^---{re.escape(event_id)}---F--\s*\n(.*?)(?=^---{re.escape(event_id)}---[A-Z]--|\Z)", text)
                    header_match = re.search(rf"(?ms)^---{re.escape(event_id)}---B--\s*\n(.*?)(?=^---{re.escape(event_id)}---[A-Z]--|\Z)", text)
                    audit_match = re.search(rf"(?ms)^---{re.escape(event_id)}---H--\s*\n(.*?)(?=^---{re.escape(event_id)}---[A-Z]--|\Z)", text)
                    if block_match:
                        status = re.search(r"HTTP/[0-9.]+\s+(\d{3})", block_match.group(1))
                        event["status"] = int(status.group(1)) if status else None
                    if header_match:
                        request_lines = header_match.group(1).splitlines()
                        request_line = next((line for line in request_lines if re.match(r"\S+\s+\S+\s+HTTP/", line)), "")
                        request_match = re.match(r"(\S+)\s+(\S+)\s+HTTP/(\S+)", request_line)
                        if request_match:
                            event["method"], event["uri"] = request_match.group(1), request_match.group(2)
                        request_headers = {}
                        for line in request_lines:
                            if ":" in line:
                                key, value = line.split(":", 1)
                                request_headers[key.lower()] = value.strip()
                        event["host"] = request_headers.get("host", event["host"])
                        event["source_ip"] = request_headers.get("x-forwarded-for", event["source_ip"])
                    if audit_match:
                        event["messages"] = list(dict.fromkeys(re.findall(r'\[id "([0-9]+)"\].*?\[msg "([^"]+)"\]', audit_match.group(1))))
                    event["country"] = geoip_service.lookup(event["source_ip"])
                    event["outcome"] = "Blocked" if event["status"] in {403, 406, 409, 429, 444, 499} else "Allowed" if event["status"] else "Inspected"
                self._traffic_cache_events = list(events.values())
                self._traffic_cache_signature = signature
            all_events = self._traffic_cache_events
        total = len(all_events)
        ordered = list(reversed(all_events))[(page - 1) * page_size:page * page_size]
        blocked = sum(1 for event in all_events if event["outcome"] == "Blocked")
        return {"events": ordered, "summary": {"requests_inspected": self.metrics().requests_observed, "blocked": blocked, "unique_sources": len({event["source_ip"] for event in all_events})}, "pagination": {"page": page, "page_size": page_size, "total": total, "has_next": page * page_size < total, "has_previous": page > 1}}

    def traffic(self, page: int = 1, page_size: int = 50, limit: int | None = None) -> dict:
        """Return traffic from the indexed event store without rescanning the raw log."""
        if limit is not None:
            page_size = limit
        page = max(1, page)
        page_size = max(1, min(page_size, 100))
        self._sync_audit_events()
        with self._events_connection() as db:
            total = int(db.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0])
            blocked = int(db.execute("SELECT COUNT(*) FROM audit_events WHERE outcome = 'Blocked'").fetchone()[0])
            unique_sources = int(db.execute("SELECT COUNT(DISTINCT source_ip) FROM audit_events").fetchone()[0])
            rows = db.execute(
                "SELECT * FROM audit_events ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?",
                (page_size, (page - 1) * page_size),
            ).fetchall()
        return {
            "events": [self._event_public(row) for row in rows],
            "summary": {"requests_inspected": self.metrics().requests_observed, "blocked": blocked, "unique_sources": unique_sources},
            "pagination": {"page": page, "page_size": page_size, "total": total, "has_next": page * page_size < total, "has_previous": page > 1},
        }

    def attack_map(self, limit: int = 1000) -> dict:
        """Return real country/continent aggregates from audited traffic."""
        events = self.traffic(page=1, page_size=min(limit, 100)).get("events", [])
        countries = {}
        continents = {}
        for event in events:
            country = event.get("country")
            if not country:
                continue
            country_key = country["country_code"]
            blocked = event.get("outcome") == "Blocked"
            country_summary = countries.setdefault(country_key, {
                **country,
                "requests": 0,
                "blocked": 0,
                "last_seen": event.get("id"),
            })
            country_summary["requests"] += 1
            country_summary["blocked"] += int(blocked)
            continent_key = country.get("continent_code", "??")
            continent_summary = continents.setdefault(continent_key, {
                "continent_code": continent_key,
                "continent_name": country.get("continent_name", "Unknown"),
                "requests": 0,
                "blocked": 0,
            })
            continent_summary["requests"] += 1
            continent_summary["blocked"] += int(blocked)
        return {
            "source": "Application Shield audit log + DB-IP Lite country database",
            "events_considered": len(events),
            "countries": sorted(countries.values(), key=lambda item: (item["blocked"], item["requests"]), reverse=True),
            "continents": sorted(continents.values(), key=lambda item: (item["blocked"], item["requests"]), reverse=True),
            "recent_events": [event for event in events if event.get("country")][:100],
        }

    def activity(self, hours: int = 24) -> dict:
        """Return cached hourly protection activity from real audit transactions."""
        hours = max(1, min(hours, 168))
        path = _AUDIT_LOG_PATH
        now = int(time.time())
        start = now - hours * 3600
        signature = None
        if path.exists():
            try:
                stat = path.stat()
                signature = (stat.st_mtime_ns, stat.st_size)
            except OSError:
                pass
        with self._lock:
            if self._activity_cache and time.monotonic() < self._activity_cache_expires and signature == self._activity_cache_signature and self._activity_cache.get("hours") == hours:
                return self._activity_cache["data"]
            buckets = [{"timestamp": start + index * 3600, "requests": 0, "blocked": 0} for index in range(hours)]
            if path.exists():
                text = path.read_text(errors="replace")
                markers = list(re.finditer(r"(?ms)^---[^\r\n-]+---A--\s*\n\[[^\r\n]+\]\s+(\d{10})\d*(?:\.[^\r\n ]+)?", text))
                for index, marker in enumerate(markers):
                    timestamp = int(marker.group(1))
                    if timestamp < start or timestamp > now:
                        continue
                    bucket_index = min(hours - 1, max(0, (timestamp - start) // 3600))
                    block_end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
                    block = text[marker.start():block_end]
                    status = re.search(r"HTTP/[0-9.]+\s+(\d{3})", block)
                    buckets[bucket_index]["requests"] += 1
                    if status and int(status.group(1)) in {403, 406, 409, 429, 444, 499}:
                        buckets[bucket_index]["blocked"] += 1
            data = {"hours": hours, "source": "Application Shield audit log", "cached_for_seconds": 3600, "buckets": buckets}
            self._activity_cache = {"hours": hours, "data": data}
            self._activity_cache_signature = signature
            self._activity_cache_expires = time.monotonic() + 3600
            return data

    def metrics(self) -> ApplicationShieldMetrics:
        policy = self.policy()
        overview = self.overview()
        attached = {connector.provider for connector in overview.connectors if connector.attached}
        protected_sites = sum(1 for site in website_service.list() if site.enabled and site.server_type in attached)
        access_logs = []
        for site in website_service.list():
            if site.enabled and site.server_type in attached:
                access_logs.append(website_service.log_root / site.server_type / "sites" / f"{website_service._configuration_id(site)}.access.log")
        access_logs.append(nginx_paths()["access_log"]) if "nginx" in attached else None
        requests_observed = sum(self._line_count(path) for path in access_logs)
        audit_path = _AUDIT_LOG_PATH
        audit_text = audit_path.read_text(errors="replace") if audit_path.exists() else ""
        statuses = [int(value) for value in re.findall(r"HTTP/[0-9.]+\s+(\d{3})", audit_text)]
        requests_blocked = sum(1 for status in statuses if status in {403, 406, 409, 429, 444, 499})
        inspection_rate = 100.0 if policy.enabled and attached and requests_observed else None
        return ApplicationShieldMetrics(
            # Keep the headline consistent with the policy badge. Connector
            # and protected-site counts remain separate real health signals.
            protection_status="Active" if policy.enabled else "Disabled",
            requests_blocked=requests_blocked,
            protected_sites=protected_sites,
            requests_observed=requests_observed,
            inspection_rate=inspection_rate,
            inspection_rate_label="100% of observed provider traffic" if inspection_rate is not None else "No traffic observed",
        )

    def metrics(self) -> ApplicationShieldMetrics:
        """Return metrics from access-log counts and indexed shield events."""
        policy = self.policy()
        overview = self.overview()
        attached = {connector.provider for connector in overview.connectors if connector.attached}
        protected_sites = sum(1 for site in website_service.list() if site.enabled and site.server_type in attached)
        access_logs = []
        for site in website_service.list():
            if site.enabled and site.server_type in attached:
                access_logs.append(website_service.log_root / site.server_type / "sites" / f"{website_service._configuration_id(site)}.access.log")
        if "nginx" in attached:
            access_logs.append(nginx_paths()["access_log"])
        requests_observed = sum(self._line_count(path) for path in access_logs)
        self._sync_audit_events()
        with self._events_connection() as db:
            requests_blocked = int(db.execute("SELECT COUNT(*) FROM audit_events WHERE outcome = 'Blocked'").fetchone()[0])
        inspection_rate = 100.0 if policy.enabled and attached and requests_observed else None
        return ApplicationShieldMetrics(
            protection_status="Active" if policy.enabled else "Disabled",
            requests_blocked=requests_blocked,
            protected_sites=protected_sites,
            requests_observed=requests_observed,
            inspection_rate=inspection_rate,
            inspection_rate_label="100% of observed provider traffic" if inspection_rate is not None else "No traffic observed",
        )

    def attack_map(self, limit: int = 1000) -> dict:
        """Aggregate every indexed event, rather than only the visible page."""
        self._sync_audit_events()
        limit = max(1, min(limit, 5000))
        with self._events_connection() as db:
            rows = db.execute(
                "SELECT country_code, country_name, continent_code, continent_name, outcome, source_ip FROM audit_events WHERE country_code != ''"
            ).fetchall()
            recent = db.execute(
                "SELECT * FROM audit_events WHERE country_code != '' ORDER BY occurred_at DESC, id DESC LIMIT ?",
                (min(limit, 100),),
            ).fetchall()
            count = int(db.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0])
        country_totals = {}
        continent_totals = {}
        for row in rows:
            code = str(row["country_code"] or "").upper()
            continent_code = row["continent_code"] or ""
            continent_name = row["continent_name"] or ""
            if not continent_code:
                resolved = geoip_service.lookup(row["source_ip"] or "") or {}
                continent_code = resolved.get("continent_code", "")
                continent_name = resolved.get("continent_name", "")
            if not continent_code:
                continent_code, continent_name = _continent_for_country(code)
            country = country_totals.setdefault(code, {
                "country_code": code,
                "country_name": row["country_name"] or code,
                "continent_code": continent_code,
                "continent_name": continent_name,
                "requests": 0,
                "blocked": 0,
            })
            country["requests"] += 1
            country["blocked"] += int(row["outcome"] == "Blocked")
            if continent_code:
                continent = continent_totals.setdefault(continent_code, {
                    "continent_code": continent_code,
                    "continent_name": continent_name or _CONTINENT_NAMES.get(continent_code, continent_code),
                    "requests": 0,
                    "blocked": 0,
                })
                continent["requests"] += 1
                continent["blocked"] += int(row["outcome"] == "Blocked")
        countries = sorted(country_totals.values(), key=lambda item: (item["blocked"], item["requests"]), reverse=True)[:limit]
        continents = sorted(continent_totals.values(), key=lambda item: (item["blocked"], item["requests"]), reverse=True)[:limit]
        return {
            "source": "Application Shield SQLite event index",
            "events_considered": count,
            "countries": countries,
            "continents": continents,
            "recent_events": [self._event_public(row) for row in recent],
        }

    def activity(self, hours: int = 24) -> dict:
        """Build hourly activity from indexed timestamps without reading the raw log."""
        hours = max(1, min(hours, 168))
        self._sync_audit_events()
        now = int(time.time())
        start = now - hours * 3600
        buckets = [{"timestamp": start + index * 3600, "requests": 0, "blocked": 0} for index in range(hours)]
        cutoff = datetime.fromtimestamp(start, timezone.utc).isoformat()
        with self._events_connection() as db:
            rows = db.execute("SELECT occurred_at, outcome FROM audit_events WHERE occurred_at >= ?", (cutoff,)).fetchall()
        for row in rows:
            try:
                timestamp = int(datetime.fromisoformat(row["occurred_at"]).timestamp())
            except (TypeError, ValueError):
                continue
            bucket = min(hours - 1, max(0, (timestamp - start) // 3600))
            buckets[bucket]["requests"] += 1
            buckets[bucket]["blocked"] += int(row["outcome"] == "Blocked")
        return {"hours": hours, "source": "Application Shield SQLite event index", "buckets": buckets}

    def rules(self) -> list[ApplicationShieldRule]:
        """Read rule hit counts from SQLite instead of rescanning the audit file."""
        if not self.rules_path.exists():
            return []
        try:
            values = json.loads(self.rules_path.read_text())
            if not isinstance(values, list):
                return []
            self._sync_audit_events()
            with self._events_connection() as db:
                rows = db.execute("SELECT messages FROM audit_events WHERE messages != '[]'").fetchall()
            hits = Counter()
            for row in rows:
                try:
                    for rule_id, _ in json.loads(row["messages"] or "[]"):
                        hits[str(rule_id)] += 1
                except (TypeError, json.JSONDecodeError):
                    continue
            result = []
            for item in values:
                rule = ApplicationShieldRule.model_validate(item)
                rule_id = str(1000000 + (uuid.uuid5(uuid.NAMESPACE_URL, f"server-engine:shield-rule:{rule.id}").int % 899999))
                result.append(rule.model_copy(update={"hits": hits[rule_id]}))
            return result
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise RuntimeError(f"Application Shield rule registry is unreadable: {error}") from error

    def protected_sites(self) -> list[dict]:
        """Return live website profiles that are currently behind a connector."""
        policy = self.policy()
        attached = {connector.provider for connector in self.overview().connectors if connector.attached}
        provider_names = {
            "nginx": "Nginx",
            "apache": "Apache HTTP Server",
            "openlitespeed": "OpenLiteSpeed",
            "caddy": "Caddy",
        }
        sites = []
        for site in website_service.list():
            if not site.enabled or site.server_type not in attached:
                continue
            log_path = website_service.log_root / site.server_type / "sites" / f"{website_service._configuration_id(site)}.access.log"
            sites.append({
                "id": site.id,
                "domain": site.domain,
                "aliases": site.aliases,
                "provider": site.server_type,
                "provider_name": provider_names.get(site.server_type, site.server_type),
                "runtime": site.php_version or "Static site",
                "project_path": site.project_path,
                "status": "Protected" if policy.enabled else "Attached · disabled",
                "mode": policy.mode if policy.enabled else "off",
                "requests_observed": self._line_count(log_path),
                "log_path": str(log_path),
            })
        return sites

    @staticmethod
    def _line_count(path: Path) -> int:
        if not path.is_file():
            return 0
        try:
            with path.open("rb") as handle:
                return sum(1 for _ in handle)
        except OSError:
            return 0


    def _provider(self, provider: str) -> tuple[str, str, str]:
        for item in self.providers:
            if item[0] == provider:
                return item
        raise ValueError(f"Unsupported Application Shield provider: {provider}")

    def _connector_module(self, provider: str, root: Path) -> Path | None:
        if provider == "caddy":
            binary = binary_path("caddy")
            if not binary.exists():
                return None
            modules = subprocess.run([str(binary), "list-modules"], capture_output=True, text=True, check=False, timeout=15)
            return binary if "http.handlers.coraza_waf" in modules.stdout else None
        patterns = {
            "nginx": ("*modsecurity*.so", "*ModSecurity*.so"),
            "apache": ("mod_security2.so", "*modsecurity*.so"),
            "openlitespeed": ("*modsecurity*.so", "*security*.so"),
        }.get(provider, ())
        return next((candidate for pattern in patterns for candidate in root.rglob(pattern) if candidate.is_file()), None)

    def _provider_main_config(self, provider: str, root: Path) -> Path:
        return {
            "nginx": nginx_paths()["config"],
            "apache": root / "conf/httpd.conf",
            "openlitespeed": root / "conf/httpd_config.conf",
        }.get(provider, root / "conf/Caddyfile")

    def _set_provider_include(self, provider: str, root: Path, config: Path, active: bool) -> tuple[Path, bytes | None]:
        main = self._provider_main_config(provider, root)
        previous = main.read_bytes() if main.exists() else None
        if not main.exists():
            return main, previous
        content = main.read_text(errors="replace")
        marker = f"# server-engine-application-shield: {config}"
        lines = content.splitlines()
        lines = [line for line in lines if marker not in line and str(config) not in line]
        if provider == "nginx":
            # A new Nginx package can leave the previous version's connector
            # load behind. Remove every managed ModSecurity module line before
            # attaching the connector built for the currently selected Nginx.
            lines = [
                line for line in lines
                if not re.match(r"^\s*load_module\s+[^;]*modsecurity[^;]*;", line, re.IGNORECASE)
            ]
        if provider == "apache":
            # Older attach attempts could leave a differently formatted
            # IncludeOptional for the same managed file. Loading the engine
            # twice makes ModSecurity report an innocent CIDR as a duplicate
            # on the second parse. Remove every managed-looking entry before
            # adding exactly one below.
            lines = [
                line
                for line in lines
                if not (
                    "modsecurity.conf" in line.lower()
                    and line.strip().lower().startswith(("include ", "includeoptional "))
                )
            ]
        if active:
            if provider == "nginx":
                module = self._connector_module(provider, root)
                if module is None:
                    raise RuntimeError(
                        "The Nginx Application Shield connector is not installed for this Nginx version."
                    )
                load = f"load_module {module};"
                if load not in lines:
                    lines.insert(0, load)
                http_index = next((index for index, line in enumerate(lines) if line.strip() == "http {"), None)
                if http_index is None:
                    raise RuntimeError("Nginx configuration has no http context; cannot safely attach Application Shield.")
                # modsecurity and modsecurity_rules_file are valid in the
                # http/server/location contexts, never after the http block.
                insertion = http_index + 1
                lines[insertion:insertion] = [f"    include {config}; {marker}"]
            elif provider == "caddy":
                # Coraza's Caddy handler must be ordered before reverse_proxy
                # and other HTTP handlers. Keep this block managed and
                # idempotent so repeated attach/detach operations are safe.
                order_marker = "# server-engine-application-shield: caddy-order"
                lines = [line for line in lines if order_marker not in line and "order coraza_waf first" not in line]
                order_block = ["{", "    order coraza_waf first", f"}} {order_marker}"]
                lines = order_block + lines
                lines.extend([f"import {config} {marker}"])
            elif provider == "openlitespeed":
                lines.extend([f"include {config} {marker}"])
            else:
                # Apache directives accept one IncludeOptional path. Keep the
                # idempotency marker on its own comment line; an inline
                # marker is parsed as a second argument by httpd.
                lines.extend([f"IncludeOptional {config}", marker])
            main.write_text("\n".join(lines) + "\n")
        else:
            main.write_text("\n".join(lines) + "\n")
        return main, previous

    def attach(self, provider: str) -> ApplicationShieldOverview:
        with self._lock:
            _, _, relative_config = self._provider(provider)
            root = self.service_root / provider
            installed = (root / ".serverengine-version").exists() or binary_path(provider).exists()
            if not installed:
                raise ValueError(f"{provider} is not installed.")
            module = self._connector_module(provider, root)
            if module is None:
                if provider == "nginx":
                    version = (root / ".serverengine-version").read_text(errors="replace").strip() if (root / ".serverengine-version").exists() else "the installed version"
                    raise ValueError(f"This managed Nginx {version} needs a custom ModSecurity connector compiled for its exact Nginx version before it can be attached.")
                raise ValueError(f"No compatible native connector is available for {provider} in this managed installation.")
            config = nginx_paths()["shared_root"] / relative_config if provider == "nginx" else root / relative_config
            config.parent.mkdir(parents=True, exist_ok=True)
            previous = config.read_bytes() if config.exists() else None
            engine = self.service_root / "modsecurity"
            rules = engine / "crs" / "owasp-crs.conf"
            lines = ["# Managed by Server Engine Application Shield", f"# Connector module: {module}"]
            if provider == "nginx":
                lines += ["modsecurity on;", f"modsecurity_rules_file {engine / 'conf/modsecurity.conf'};"]
            elif provider == "apache":
                lines += ["LoadModule security2_module " + str(module), "<IfModule security2_module>", "  SecRuleEngine DetectionOnly", f"  IncludeOptional {engine / 'conf/modsecurity.conf'}", "</IfModule>"]
            elif provider == "openlitespeed":
                lines += ["module mod_security {", "    modsecurity on", f"    modsecurity_rules_file {engine / 'conf/modsecurity.conf'}", "    ls_enabled 1", "}"]
            else:
                lines += ["# Coraza Caddy adapter", "coraza_waf {", f"    Include {engine / 'conf/modsecurity.conf'}", "}"]
            temporary = config.with_suffix(config.suffix + ".tmp")
            temporary.write_text("\n".join(lines) + "\n")
            os.replace(temporary, config)
            main = self._provider_main_config(provider, root)
            previous_main = main.read_bytes() if main.exists() else None
            try:
                self._set_provider_include(provider, root, config, True)
                self._validate_and_reload(provider, root)
            except RuntimeError as error:
                if previous is None:
                    config.unlink(missing_ok=True)
                else:
                    config.write_bytes(previous)
                if previous_main is None:
                    main.unlink(missing_ok=True)
                else:
                    main.write_bytes(previous_main)
                (root / ".serverengine-application-shield-ready").write_text("disabled\n")
                detail = str(error)
                if provider == "nginx" and "instead of" in detail and "version" in detail:
                    raise RuntimeError("The downloaded Nginx ModSecurity module was built for a different Nginx ABI. This managed Nginx requires a connector compiled against its exact version; it was not attached.") from error
                raise
            (root / ".serverengine-application-shield-ready").unlink(missing_ok=True)
            (root / ".serverengine-application-shield-attached").write_text("attached\n")
            return self.overview()

    def _validate_and_reload(self, provider: str, root: Path) -> None:
        # Regenerate the shared rules file before every validation so older
        # bundles using Apache-only IncludeOptional syntax are migrated before
        # Nginx or another provider parses them.
        self._write_engine_config(self.policy())
        binary = binary_path(provider)
        runtime_env = managed_library_environment(root, self.service_root / "modsecurity")
        running = self._provider_running(provider, root)
        if provider == "nginx":
            # Shield attach validates the complete Nginx tree directly. Make
            # sure legacy included site configs are migrated before nginx -t,
            # otherwise an old service-local log path can fail validation even
            # when the main config already uses shared logs.
            ensure_nginx_layout()
            paths = nginx_paths()
            command = [str(binary), "-p", str(paths["root"]), "-c", str(paths["config"]), "-t"]
            check = subprocess.run(command, capture_output=True, text=True, check=False, timeout=20, env=runtime_env)
            if check.returncode:
                raise RuntimeError((check.stdout + check.stderr).strip()[-1200:] or "Nginx configuration validation failed.")
            if not running:
                return
            reload_result = subprocess.run([str(binary), "-p", str(paths["root"]), "-c", str(paths["config"]), "-s", "reload"], capture_output=True, text=True, check=False, timeout=20, env=runtime_env)
        elif provider == "apache":
            config = root / "conf/httpd.conf"
            check = subprocess.run([str(binary), "-f", str(config), "-t"], capture_output=True, text=True, check=False, timeout=20, env=runtime_env)
            if check.returncode:
                raise RuntimeError((check.stdout + check.stderr).strip()[-1200:] or "Apache configuration validation failed.")
            if not running:
                return
            reload_result = subprocess.run([str(binary), "-f", str(config), "-k", "graceful"], capture_output=True, text=True, check=False, timeout=20, env=runtime_env)
        elif provider == "openlitespeed":
            check = subprocess.run([str(binary), "-t"], cwd=root, capture_output=True, text=True, check=False, timeout=20, env=runtime_env)
            if check.returncode:
                raise RuntimeError((check.stdout + check.stderr).strip()[-1200:] or "OpenLiteSpeed configuration validation failed.")
            if not running:
                return
            reload_result = subprocess.run([str(binary), "-r"], cwd=root, capture_output=True, text=True, check=False, timeout=20, env=runtime_env)
        elif provider == "caddy":
            config = root / "conf/Caddyfile"
            check = subprocess.run([str(binary), "validate", "--config", str(config), "--adapter", "caddyfile"], capture_output=True, text=True, check=False, timeout=20)
            if check.returncode:
                raise RuntimeError((check.stdout + check.stderr).strip()[-1200:] or "Caddy configuration validation failed.")
            if not running:
                return
            reload_result = subprocess.run([str(binary), "reload", "--config", str(config), "--adapter", "caddyfile"], capture_output=True, text=True, check=False, timeout=20)
        else:
            raise RuntimeError("This provider has no managed validation and reload command yet.")
        if reload_result.returncode:
            raise RuntimeError((reload_result.stdout + reload_result.stderr).strip()[-1200:] or f"{provider} reload failed.")

    def _provider_running(self, provider: str, root: Path) -> bool:
        if provider == "nginx":
            pid_file = nginx_paths()["pid"]
            try:
                pid = int(pid_file.read_text().strip())
                os.kill(pid, 0)
                return True
            except (OSError, ValueError):
                return False
        pid_files = {
            "nginx": root / "run/nginx.pid",
            "apache": root / "run/httpd.pid",
            "openlitespeed": root / "run/lshttpd.pid",
            "caddy": root / "run/caddy.pid",
        }
        pid_file = pid_files.get(provider)
        if not pid_file or not pid_file.exists():
            return False
        try:
            pid = int(pid_file.read_text().strip())
            os.kill(pid, 0)
            return True
        except (OSError, ValueError):
            return False

    def detach(self, provider: str) -> ApplicationShieldOverview:
        with self._lock:
            _, _, relative_config = self._provider(provider)
            root = self.service_root / provider
            config = nginx_paths()["shared_root"] / relative_config if provider == "nginx" else root / relative_config
            previous = config.read_bytes() if config.exists() else None
            main, previous_main = self._set_provider_include(provider, root, config, False)
            (root / ".serverengine-application-shield-attached").unlink(missing_ok=True)
            if root.exists():
                if config.exists():
                    config.write_text("# Managed by Server Engine Application Shield\n# Connector detached; traffic inspection is disabled.\n")
                (root / ".serverengine-application-shield-ready").write_text("disabled\n")
                try:
                    self._validate_and_reload(provider, root)
                except RuntimeError:
                    if previous is not None:
                        config.write_bytes(previous)
                    if previous_main is None:
                        main.unlink(missing_ok=True)
                    else:
                        main.write_bytes(previous_main)
                    (root / ".serverengine-application-shield-ready").unlink(missing_ok=True)
                    (root / ".serverengine-application-shield-attached").write_text("attached\n")
                    raise
            return self.overview()

    def overview(self) -> ApplicationShieldOverview:
        policy = self.policy()
        connectors = []
        engine_root = self.service_root / "modsecurity"
        engine_installed = (engine_root / ".serverengine-version").exists() or (engine_root / "usr/lib/x86_64-linux-gnu/libModSecurity.so.3").exists() or (engine_root / "usr/lib/aarch64-linux-gnu/libModSecurity.so.3").exists()
        crs_root = engine_root / "crs"
        crs_installed = (crs_root / ".serverengine-version").exists()
        for provider, name, relative_config in self.providers:
            root = self.service_root / provider
            installed = (root / ".serverengine-version").exists() or binary_path(provider).exists()
            config = nginx_paths()["shared_root"] / relative_config if provider == "nginx" else root / relative_config
            connector_ready = installed and (
                (root / ".serverengine-application-shield-ready").exists()
                or provider in {"nginx", "apache", "openlitespeed", "caddy"}
            )
            module_available = provider != "nginx" or self._connector_module(provider, root) is not None
            attached = installed and module_available and (root / ".serverengine-application-shield-attached").exists() and config.exists()
            connectors.append(ShieldConnector(
                provider=provider,
                name=name,
                installed=installed,
                attached=attached,
                status="attached" if attached else ("ready" if connector_ready else ("available" if installed else "not-installed")),
                config_path=str(config),
                message=("Connector configuration is attached." if attached else "Provider is installed; attach will prepare the matching connector automatically.") if installed else "Provider is not installed.",
            ))
        if crs_installed:
            policy.crs_version = "installed"
        return ApplicationShieldOverview(
            policy=policy,
            engine={
                "installed": engine_installed,
                "status": "ready" if engine_installed else "not-installed",
                "root": str(engine_root),
            },
            connectors=connectors,
        )


application_shield_service = ApplicationShieldService()
