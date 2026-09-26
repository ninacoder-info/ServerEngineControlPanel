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

from app.models.website import Website, WebsiteCreateRequest, WebsiteUpdateRequest


_DOMAIN = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$", re.I)


class WebsiteService:
    def __init__(self):
        state = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.path = Path(os.getenv("SE_WEBSITES_PATH", str(state / "websites.json")))
        self.web_root = Path(os.getenv("SE_WEB_ROOT", "/server-engine/www")).resolve()
        self.service_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services"))
        self._lock = RLock()

    def list(self) -> list[Website]:
        with self._lock:
            return [Website.model_validate(item) for item in self._read()]

    def get(self, website_id: str) -> Website | None:
        return next((site for site in self.list() if site.id == website_id), None)

    def create(self, payload: WebsiteCreateRequest) -> Website:
        with self._lock:
            sites = [Website.model_validate(item) for item in self._read()]
            domain, aliases = self._domains(payload.domain, payload.aliases)
            self._ensure_domains_free(sites, [domain, *aliases])
            project = self._safe_project_path(payload.project_path)
            web_root = self._normalize_web_root(payload.web_root)
            if payload.database_enabled and not payload.database_name.strip():
                raise HTTPException(400, "Database name is required when database integration is enabled")
            project.mkdir(parents=True, exist_ok=True)
            now = self._now()
            site_id = uuid.uuid4().hex[:12]
            config_path = self.service_root / "websites" / f"{site_id}.json"
            site = Website(id=site_id, name=payload.name.strip(), domain=domain, aliases=aliases,
                project_path=str(project), web_root=web_root,
                document_root=str(project if web_root == "." else project / web_root),
                php_version=payload.php_version.strip(), framework=payload.framework,
                server_type=payload.server_type, ssl_enabled=payload.ssl_enabled,
                ssl_enforce_tls=payload.ssl_enforce_tls, ssl_allow_http=payload.ssl_allow_http,
                database_enabled=payload.database_enabled, database_name=payload.database_name.strip(),
                database_user=payload.database_user.strip(), notes=payload.notes.strip(),
                tags=self._tags(payload.tags), status="ready", enabled=True,
                created_at=now, updated_at=now, config_path=str(config_path))
            self._write_site(site, sites + [site])
            return site

    def update(self, website_id: str, payload: WebsiteUpdateRequest) -> Website:
        with self._lock:
            sites = [Website.model_validate(item) for item in self._read()]
            site = next((item for item in sites if item.id == website_id), None)
            if site is None:
                raise HTTPException(404, "Website not found")
            changes = payload.model_dump(exclude_unset=True)
            domain, aliases = self._domains(changes.get("domain", site.domain), changes.get("aliases", site.aliases))
            self._ensure_domains_free(sites, [domain, *aliases], website_id)
            for key, value in changes.items():
                if key in {"name", "php_version", "database_name", "database_user", "notes"} and isinstance(value, str):
                    value = value.strip()
                if key == "tags": value = self._tags(value)
                if hasattr(site, key): setattr(site, key, value)
            site.domain, site.aliases = domain, aliases
            if "web_root" in changes: site.web_root = self._normalize_web_root(site.web_root)
            site.document_root = str(Path(site.project_path) if site.web_root == "." else Path(site.project_path) / site.web_root)
            site.updated_at = self._now()
            self._write_site(site, sites)
            return site

    def action(self, website_id: str, action: str) -> Website:
        with self._lock:
            sites = [Website.model_validate(item) for item in self._read()]
            site = next((item for item in sites if item.id == website_id), None)
            if site is None: raise HTTPException(404, "Website not found")
            site.enabled = action == "enable"
            site.status = "ready" if site.enabled else "disabled"
            site.updated_at = self._now()
            self._write_site(site, sites)
            return site

    def delete(self, website_id: str, remove_files: bool = False) -> None:
        with self._lock:
            sites = [Website.model_validate(item) for item in self._read()]
            site = next((item for item in sites if item.id == website_id), None)
            if site is None: raise HTTPException(404, "Website not found")
            if remove_files:
                project = self._safe_project_path(site.project_path)
                if project.exists():
                    import shutil
                    shutil.rmtree(project)
            self._write_site(None, [item for item in sites if item.id != website_id])

    def _read(self):
        if not self.path.exists(): return []
        try:
            data = json.loads(self.path.read_text())
            return data if isinstance(data, list) else []
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(500, f"Website registry is unreadable: {exc}")

    def _write_site(self, site, sites):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.service_root.joinpath("websites").mkdir(parents=True, exist_ok=True)
        values = [item.model_dump(mode="json") for item in sites]
        fd, tmp = tempfile.mkstemp(prefix="websites.", suffix=".tmp", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(values, stream, indent=2); stream.write("\n"); stream.flush(); os.fsync(stream.fileno())
            os.replace(tmp, self.path)
        finally:
            if os.path.exists(tmp): os.unlink(tmp)
        if site is not None:
            target = Path(site.config_path); target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(site.model_dump(mode="json"), indent=2) + "\n")

    def _safe_project_path(self, raw: str) -> Path:
        path = Path(raw).expanduser()
        if not path.is_absolute(): raise HTTPException(400, "Project path must be absolute")
        resolved = path.resolve()
        try: resolved.relative_to(self.web_root)
        except ValueError: raise HTTPException(400, f"Project path must be inside {self.web_root}")
        return resolved

    @staticmethod
    def _normalize_web_root(value: str) -> str:
        value = value.strip().strip("/")
        return "." if value in {"", "."} else value

    @staticmethod
    def _domains(domain: str, aliases: list[str]) -> tuple[str, list[str]]:
        values = [domain, *aliases]
        cleaned = []
        for value in values:
            value = value.strip().lower()
            if not _DOMAIN.fullmatch(value): raise HTTPException(400, f"Invalid domain: {value}")
            if value not in cleaned: cleaned.append(value)
        return cleaned[0], cleaned[1:]

    @staticmethod
    def _ensure_domains_free(sites, domains, exclude=None):
        occupied = {domain for site in sites if site.id != exclude for domain in [site.domain, *site.aliases]}
        conflict = next((domain for domain in domains if domain in occupied), None)
        if conflict: raise HTTPException(409, f"Website domain already exists: {conflict}")
        if len(set(domains)) != len(domains): raise HTTPException(409, "A domain cannot be repeated")

    @staticmethod
    def _tags(values):
        return list(dict.fromkeys(item.strip() for item in values if item.strip()))

    @staticmethod
    def _now(): return datetime.now(timezone.utc).isoformat()


website_service = WebsiteService()
