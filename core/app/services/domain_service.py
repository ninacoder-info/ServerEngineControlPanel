from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from threading import RLock

from fastapi import HTTPException

from app.models.domain import DomainCreateRequest, DomainRecordRequest
from app.models.website import WebsiteCreateRequest
from app.services.website_service import website_service


_DOMAIN = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$", re.I)


class DomainService:
    def __init__(self):
        state = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.path = Path(os.getenv("SE_DOMAINS_PATH", str(state / "domains.json")))
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
        return {
            "id": site.id,
            "domain": site.domain,
            "type": metadata.get("domain_type", "Primary domain"),
            "root": site.document_root,
            "dns": "Not configured",
            "tls": "Active" if site.ssl_enabled else "Off",
            "records": len(records),
            "website_id": site.id,
            "server_type": site.server_type,
        }

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


domain_service = DomainService()
