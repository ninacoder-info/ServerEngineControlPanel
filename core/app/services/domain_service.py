from __future__ import annotations

import json
import ipaddress
import os
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from fastapi import HTTPException

from app.models.domain import CloudflareSettingsRequest, DomainCreateRequest, DomainRecordRequest, DomainRedirectRequest
from app.models.website import WebsiteCreateRequest
from app.services.website_service import website_service


_DOMAIN = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$", re.I)


class DomainService:
    def __init__(self):
        state = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.path = Path(os.getenv("SE_DOMAINS_PATH", str(state / "domains.json")))
        self.cloudflare_path = state / "cloudflare.json"
        self._lock = RLock()

    def list(self) -> list[dict]:
        sites = {site.domain: site for site in website_service.list()}
        metadata = {item["domain"]: item for item in self._read()}
        result = []
        for domain, site in sites.items():
            item = metadata.get(domain, {})
            result.append(self._view(site, item))
        return result

    def create(self, payload: DomainCreateRequest) -> dict:
        domain = self._domain(payload.domain)
        root = payload.root.strip() or str(website_service.web_root / domain)
        if root.endswith("/"):
            root = root.rstrip("/")
        site = website_service.create(WebsiteCreateRequest(
            name=domain,
            domain=domain,
            project_path=root,
            web_root=".",
            ssl_enabled=payload.tls,
            ssl_enforce_tls=False,
            ssl_allow_http=True,
        ))
        with self._lock:
            entries = [item for item in self._read() if item.get("domain") != domain]
            entries.append({"domain": domain, "domain_type": payload.domain_type, "records": []})
            self._write(entries)
        return self._view(site, entries[-1])

    def records(self, domain: str) -> list[dict]:
        self._site(domain)
        item = next((item for item in self._read() if item.get("domain") == domain), {})
        return item.get("records", [])

    def add_record(self, domain: str, payload: DomainRecordRequest) -> dict:
        self._site(domain)
        self._validate_record(payload)
        record = {"id": self._next_record_id(), "type": payload.record_type, "name": payload.name.strip(), "value": payload.value.strip(), "ttl": payload.ttl}
        with self._lock:
            entries = self._read()
            item = next((entry for entry in entries if entry.get("domain") == domain), None)
            if item is None:
                item = {"domain": domain, "domain_type": "Addon domain", "records": []}
                entries.append(item)
            item.setdefault("records", []).append(record)
            self._write(entries)
        return record

    def update_record(self, domain: str, record_id: int, payload: DomainRecordRequest) -> dict:
        self._site(domain)
        self._validate_record(payload)
        with self._lock:
            entries = self._read()
            item = next((entry for entry in entries if entry.get("domain") == domain), None)
            record = next((record for record in (item or {}).get("records", []) if record.get("id") == record_id), None)
            if record is None:
                raise HTTPException(404, "DNS record not found")
            record.update({"type": payload.record_type, "name": payload.name.strip(), "value": payload.value.strip(), "ttl": payload.ttl})
            self._write(entries)
            return record

    def delete_record(self, domain: str, record_id: int) -> None:
        self._site(domain)
        with self._lock:
            entries = self._read()
            item = next((entry for entry in entries if entry.get("domain") == domain), None)
            if item is None or not any(record.get("id") == record_id for record in item.get("records", [])):
                raise HTTPException(404, "DNS record not found")
            item["records"] = [record for record in item.get("records", []) if record.get("id") != record_id]
            self._write(entries)

    def _site(self, domain: str):
        domain = self._domain(domain)
        site = next((site for site in website_service.list() if site.domain == domain), None)
        if site is None:
            raise HTTPException(404, "Domain not found")
        return site

    @staticmethod
    def _domain(value: str) -> str:
        value = value.strip().lower().rstrip(".")
        if not _DOMAIN.fullmatch(value):
            raise HTTPException(400, f"Invalid domain: {value}")
        return value

    @staticmethod
    def _view(site, metadata: dict) -> dict:
        records = metadata.get("records", [])
        redirects = metadata.get("redirects", [])
        return {
            "id": site.id,
            "domain": site.domain,
            "type": metadata.get("domain_type", "Primary domain"),
            "root": site.document_root,
            "dns": "Not configured",
            "tls": "Active" if site.ssl_enabled else "Off",
            "records": len(records),
            "redirects": len(redirects),
            "website_id": site.id,
            "server_type": site.server_type,
        }

    def redirects(self, domain: str) -> list[dict]:
        self._site(domain)
        item = next((entry for entry in self._read() if entry.get("domain") == domain), {})
        return item.get("redirects", [])

    def save_redirect(self, domain: str, payload: DomainRedirectRequest, redirect_id: str | None = None) -> dict:
        self._site(domain)
        source = payload.source_path.strip()
        target = payload.target.strip()
        if not source.startswith("/"):
            raise HTTPException(422, "Source path must start with /")
        if any(character in source for character in ("\n", "\r")):
            raise HTTPException(422, "Source path contains an invalid line break")
        if not (target.startswith("/") or re.match(r"^https?://", target, re.I)):
            raise HTTPException(422, "Target must be a path or an http(s) URL")
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            entries = self._read()
            item = next((entry for entry in entries if entry.get("domain") == domain), None)
            if item is None:
                raise HTTPException(404, "Domain not found")
            item.setdefault("redirects", [])
            duplicate = next((rule for rule in item["redirects"] if rule.get("source_path") == source and rule.get("id") != redirect_id), None)
            if duplicate:
                raise HTTPException(409, "A redirect already exists for this source path")
            rule = next((rule for rule in item["redirects"] if rule.get("id") == redirect_id), None) if redirect_id else None
            if rule is None:
                rule = {"id": str(uuid.uuid4())}
                item["redirects"].append(rule)
            rule.update({"source_path": source, "target": target, "code": payload.code, "keep_path": payload.keep_path, "enabled": payload.enabled, "updated_at": now})
            self._write(entries)
            return rule

    def delete_redirect(self, domain: str, redirect_id: str) -> None:
        self._site(domain)
        with self._lock:
            entries = self._read()
            item = next((entry for entry in entries if entry.get("domain") == domain), None)
            if item is None or not any(rule.get("id") == redirect_id for rule in item.get("redirects", [])):
                raise HTTPException(404, "Redirect not found")
            item["redirects"] = [rule for rule in item.get("redirects", []) if rule.get("id") != redirect_id]
            self._write(entries)

    def cloudflare_status(self) -> dict:
        config = self._read_cloudflare()
        return {"connected": bool(config.get("token")), "account": config.get("account", ""), "zone": config.get("zone", ""), "zones": config.get("zones", []), "settings": {key: value for key, value in config.items() if key in {"proxy", "ssl", "waf", "rate_limit", "cache", "trusted_proxies"}}}

    def bind9_config(self) -> dict:
        defaults = {"serverName": "ns1.example.com", "listen": "0.0.0.0", "port": 53, "recursion": False, "dnssec": True, "transfers": "none", "dynamicUpdates": False, "queryLogging": False, "forwarders": "1.1.1.1, 8.8.8.8", "zoneRoot": "/opt/server-engine/services/bind9/data/zones"}
        path = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine")) / "bind9.json"
        if path.exists():
            try:
                defaults.update(json.loads(path.read_text()))
            except (OSError, json.JSONDecodeError):
                pass
        return defaults

    def save_bind9_config(self, values: dict) -> dict:
        config = self.bind9_config()
        config.update(values)
        if not isinstance(config.get("port"), int) or not 1 <= config["port"] <= 65535:
            raise HTTPException(422, "DNS port must be between 1 and 65535")
        if config.get("transfers") not in {"none", "trusted", "any"}:
            raise HTTPException(422, "Zone transfer policy is invalid")
        path = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine")) / "bind9.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(config, indent=2) + "\n")
        root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "bind9"
        conf = root / "conf/named.conf"
        conf.parent.mkdir(parents=True, exist_ok=True)
        zones = config["zoneRoot"]
        recursion = "yes" if config["recursion"] else "no"
        allow_transfer = "any;" if config["transfers"] == "any" else "none;"
        (root / "data").mkdir(parents=True, exist_ok=True)
        Path(zones).mkdir(parents=True, exist_ok=True)
        Path(zones, "zones.conf").touch(exist_ok=True)
        named = f'''// Server Engine BIND 9 configuration\noptions {{\n    directory "{root / 'data'}";\n    listen-on port {config["port"]} {{ {config["listen"]}; }};\n    listen-on-v6 {{ none; }};\n    recursion {recursion};\n    allow-transfer {{ {allow_transfer} }};\n    dnssec-validation {"yes" if config["dnssec"] else "no"};\n    querylog {"yes" if config["queryLogging"] else "no"};\n}};\ninclude "{zones}/zones.conf";\n'''
        conf.write_text(named)
        return config

    def unbound_config(self) -> dict:
        defaults = {"listen": "127.0.0.1", "port": 5335, "access": "127.0.0.0/8, ::1", "dnssec": True, "forwarding": True, "forwarders": "1.1.1.1@853, 8.8.8.8@853", "cacheSize": "64 MB", "prefetch": True, "privacy": True, "logging": False, "tlsUpstream": True}
        path = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine")) / "unbound.json"
        if path.exists():
            try:
                defaults.update(json.loads(path.read_text()))
            except (OSError, json.JSONDecodeError):
                pass
        return defaults

    def save_unbound_config(self, values: dict) -> dict:
        config = self.unbound_config()
        config.update(values)
        if not isinstance(config.get("port"), int) or not 1 <= config["port"] <= 65535:
            raise HTTPException(422, "Resolver port must be between 1 and 65535")
        if not str(config.get("listen", "")).strip():
            raise HTTPException(422, "Listen address is required")
        path = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine")) / "unbound.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(config, indent=2) + "\n")
        root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "unbound"
        conf = root / "conf/unbound.conf"
        conf.parent.mkdir(parents=True, exist_ok=True)
        access = [item.strip() for item in str(config["access"]).replace("\n", ",").split(",") if item.strip()]
        cache_value = str(config.get("cacheSize", "64 MB")).split()[0]
        try:
            cache_mb = max(1, int(cache_value))
        except ValueError:
            raise HTTPException(422, "Cache size must be a whole number of megabytes")
        lines = ["# Server Engine Unbound configuration", "server:", f"    interface: {config['listen']}", f"    port: {config['port']}", "    do-ip6: no", *[f"    access-control: {network} allow" for network in access], f"    msg-cache-size: {cache_mb}m", f"    rrset-cache-size: {max(1, cache_mb // 2)}m", f"    harden-dnssec-stripped: {'yes' if config['dnssec'] else 'no'}", f"    prefetch: {'yes' if config['prefetch'] else 'no'}", f"    hide-identity: {'yes' if config['privacy'] else 'no'}", f"    hide-version: {'yes' if config['privacy'] else 'no'}", f"    verbosity: {1 if config['logging'] else 0}"]
        if config["forwarding"]:
            lines.extend(["", "forward-zone:", '    name: "."'])
            for forwarder in str(config["forwarders"]).replace("\n", ",").split(","):
                forwarder = forwarder.strip()
                if forwarder:
                    lines.append(f"    forward-addr: {forwarder}")
            lines.append(f"    forward-tls-upstream: {'yes' if config['tlsUpstream'] else 'no'}")
        conf.write_text("\n".join(lines) + "\n")
        return config

    def save_cloudflare(self, payload: CloudflareSettingsRequest) -> dict:
        config = self._read_cloudflare()
        token = payload.token.strip() or config.get("token", "")
        if not token:
            raise HTTPException(422, "Enter a Cloudflare API token")
        zones = config.get("zones", [])
        if payload.token.strip() or not zones:
            verify = self._cloudflare_request("/user/tokens/verify", token)
            if not verify.get("success"):
                raise HTTPException(422, self._cloudflare_error(verify, "Cloudflare rejected this API token"))
            zone_response = self._cloudflare_request("/zones?per_page=100", token)
            if not zone_response.get("success"):
                raise HTTPException(422, self._cloudflare_error(zone_response, "Cloudflare could not list zones; grant the token Zone:Read permission"))
            zones = [{"id": zone.get("id"), "name": zone.get("name"), "status": zone.get("status"), "plan": (zone.get("plan") or {}).get("name", "")} for zone in zone_response.get("result", [])]
        if payload.zone and zones and not any(zone.get("name") == payload.zone for zone in zones):
            raise HTTPException(422, "The selected zone is not available to this Cloudflare token")
        saved = {"token": token, "account": payload.account.strip(), "zone": payload.zone.strip(), "zones": zones, "proxy": payload.proxy, "ssl": payload.ssl, "waf": payload.waf, "rate_limit": payload.rate_limit, "cache": payload.cache, "trusted_proxies": payload.trusted_proxies}
        self.cloudflare_path.parent.mkdir(parents=True, exist_ok=True)
        self.cloudflare_path.write_text(json.dumps(saved, indent=2) + "\n")
        try:
            os.chmod(self.cloudflare_path, 0o600)
        except OSError:
            pass
        return self.cloudflare_status()

    def _read_cloudflare(self) -> dict:
        if not self.cloudflare_path.exists():
            return {}
        try:
            data = json.loads(self.cloudflare_path.read_text())
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    @staticmethod
    def _cloudflare_request(path: str, token: str) -> dict:
        request = urllib.request.Request(f"https://api.cloudflare.com/client/v4{path}", headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": "Server-Engine-Control-Panel"})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            try:
                return json.loads(error.read().decode("utf-8"))
            except (OSError, json.JSONDecodeError):
                return {"success": False, "errors": [{"message": f"Cloudflare returned HTTP {error.code}"}]}
        except (OSError, json.JSONDecodeError) as error:
            return {"success": False, "errors": [{"message": f"Cloudflare connection failed: {error}"}]}

    @staticmethod
    def _cloudflare_error(response: dict, fallback: str) -> str:
        errors = response.get("errors") or []
        return errors[0].get("message", fallback) if errors else fallback

    def certificates(self) -> list[dict]:
        cert_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "certbot/config/live"
        result = []
        for item in self.list():
            certificate_path = cert_root / item["domain"] / "fullchain.pem"
            certificate = {"status": "missing", "expires_at": None, "path": str(certificate_path)}
            if certificate_path.is_file():
                try:
                    decoded = ssl._ssl._test_decode_cert(str(certificate_path))
                    expires_at = decoded.get("notAfter")
                    certificate = {"status": "issued", "expires_at": expires_at, "path": str(certificate_path)}
                    if expires_at:
                        from datetime import datetime
                        if datetime.strptime(expires_at, "%b %d %H:%M:%S %Y %Z") <= datetime.utcnow():
                            certificate["status"] = "expired"
                except (OSError, ValueError, ssl.SSLError):
                    certificate["status"] = "invalid"
            result.append({"domain": item["domain"], "website_id": item["website_id"], "tls_enabled": item["tls"] == "Active", "certificate": certificate})
        return result

    def _read(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text())
            return data if isinstance(data, list) else []
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(500, f"Domain registry is unreadable: {exc}")

    def _write(self, entries: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix="domains.", suffix=".tmp", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(entries, stream, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def _next_record_id(self) -> int:
        return max((record.get("id", 0) for item in self._read() for record in item.get("records", [])), default=0) + 1

    @staticmethod
    def _validate_record(payload: DomainRecordRequest) -> None:
        name = payload.name.strip()
        value = payload.value.strip()
        if name != "@" and not re.fullmatch(r"[a-z0-9_*.-]+", name, re.I):
            raise HTTPException(422, "Record name may contain letters, numbers, dots, hyphens, or @")
        if payload.record_type == "A":
            try:
                if ipaddress.ip_address(value).version != 4:
                    raise ValueError
            except ValueError as error:
                raise HTTPException(422, "A records require an IPv4 address") from error
        if payload.record_type == "AAAA":
            try:
                if ipaddress.ip_address(value).version != 6:
                    raise ValueError
            except ValueError as error:
                raise HTTPException(422, "AAAA records require an IPv6 address") from error


domain_service = DomainService()
