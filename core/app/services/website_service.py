from __future__ import annotations

import json
import os
import pwd
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
            sites = [Website.model_validate(item) for item in self._read()]
            # Repair records created by older releases that persisted the
            # registry before generating the provider configuration.
            for site in sites:
                generated = self.configuration(site.id)
                provider_path = Path(generated["config_path"])
                if not provider_path.exists():
                    provider_path.parent.mkdir(parents=True, exist_ok=True)
                    provider_path.write_text(generated["content"])
            return sites

    def get(self, website_id: str) -> Website | None:
        return next((site for site in self.list() if site.id == website_id), None)

    def configuration(self, website_id: str | Website) -> dict:
        # Creation generates the provider file before the registry is committed,
        # so it must be able to render from the in-memory site as well as from
        # an already persisted ID used by the configuration API.
        if isinstance(website_id, Website):
            site = website_id
        else:
            site = next((Website.model_validate(item) for item in self._read() if item.get("id") == website_id), None)
            if site is None:
                raise HTTPException(404, "Website not found")
        config_id = self._configuration_id(site)
        names = " ".join([site.domain, *site.aliases])
        index = "index.php index.html index.htm default.php default.htm default.html"
        root = site.document_root
        socket = self.service_root / "php" / "versions" / site.php_version / "run" / "php-fpm.sock"
        if site.server_type == "apache":
            service_root = self.service_root / "apache"
            config_path = service_root / "conf" / "sites" / f"{config_id}.conf"
            lines = [
                f"<VirtualHost *:80>",
                f"    ServerName {site.domain}",
                *[f"    ServerAlias {alias}" for alias in site.aliases],
                f"    DocumentRoot \"{root}\"",
                f"    DirectoryIndex {index}",
                f"    ErrorLog \"{service_root}/logs/sites/{config_id}.error.log\"",
                f"    CustomLog \"{service_root}/logs/sites/{config_id}.access.log\" combined",
                f"    <Directory \"{root}\">",
                "        AllowOverride All",
                "        Require all granted",
                "    </Directory>",
            ]
            if site.php_version:
                lines.extend([
                    "    <FilesMatch \\\"\\\\.php$\\\">",
                    f"        SetHandler \"proxy:unix:{socket}|fcgi://localhost/\"",
                    "    </FilesMatch>",
                ])
            lines.extend(["</VirtualHost>", ""])
        elif site.server_type == "caddy":
            service_root = self.service_root / "caddy"
            config_path = service_root / "conf" / "sites" / f"{config_id}.caddy"
            lines = [f"{names} {{", f"    root * {root}", "    encode zstd gzip", "    file_server"]
            if site.php_version:
                lines.append(f"    php_fastcgi unix/{socket}")
            lines.extend(["    log {", f"        output file {service_root}/logs/sites/{config_id}.access.log", "    }", "}", ""])
        elif site.server_type == "openlitespeed":
            service_root = self.service_root / "openlitespeed"
            config_path = service_root / "conf" / "vhosts" / config_id / "vhost.conf"
            lines = [
                f"docRoot                   {root}",
                f"vhDomain                  {names}",
                "enableGzip                1",
                "index  {",
                f"  indexFiles {index.replace(' ', ',')}",
                "}",
                "context / {",
                "  type                    static",
                f"  location                {root}",
                "  allowBrowse             1",
                "}",
            ]
            if site.php_version:
                lines.extend(["scriptHandler {"])
                lines.extend([f"  add                     lsapi:php-{site.php_version} php", "}"])
            lines.append("")
        else:
            service_root = self.service_root / "nginx"
            config_path = service_root / "conf" / "sites" / f"{config_id}.conf"
            lines = [
                "server {",
                "    listen 80;",
                f"    server_name {names};",
                f"    index {index};",
                f"    root {root};",
                f"    access_log {service_root}/logs/sites/{config_id}.access.log;",
                f"    error_log {service_root}/logs/sites/{config_id}.error.log;",
                "",
                "    location / {",
                "        try_files $uri $uri/ /index.php?$query_string;",
                "    }",
            ]
            if site.php_version:
                lines.extend(["", "    location ~ \\.php$ {", f"        fastcgi_pass unix:{socket};", "        include fastcgi_params;", "        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;", "    }"])
            lines.extend(["", "    location ~ /\\. {", "        deny all;", "    }", "}", ""])
        return {"website_id": site.id, "server_type": site.server_type, "config_path": str(config_path), "content": "\n".join(lines)}

    def create(self, payload: WebsiteCreateRequest) -> Website:
        with self._lock:
            sites = [Website.model_validate(item) for item in self._read()]
            domain, aliases = self._domains(payload.domain, payload.aliases)
            self._ensure_domains_free(sites, [domain, *aliases])
            requested_project_path = payload.project_path.strip() or str(self.web_root / domain)
            project = self._safe_project_path(requested_project_path)
            web_root = self._normalize_web_root(payload.web_root)
            if payload.database_enabled and not payload.database_name.strip():
                raise HTTPException(400, "Database name is required when database integration is enabled")
            project_created = not project.exists()
            project.mkdir(parents=True, exist_ok=True)
            self._set_hosting_owner(project)
            now = self._now()
            site_id = str(uuid.uuid4())
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
            try:
                self._write_site(site, sites + [site])
            except Exception:
                if project_created:
                    try:
                        project.rmdir()
                    except OSError:
                        pass
                raise
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
            if "project_path" in changes:
                project = self._safe_project_path(changes["project_path"])
                if not project.exists() or not project.is_dir():
                    raise HTTPException(400, "Project folder must be an existing directory")
                changes["project_path"] = str(project)
                self._set_hosting_owner(project)
            if "web_root" in changes:
                changes["web_root"] = self._normalize_web_root(changes["web_root"])
            for key, value in changes.items():
                if key in {"name", "php_version", "database_name", "database_user", "notes"} and isinstance(value, str):
                    value = value.strip()
                if key == "tags": value = self._tags(value)
                if hasattr(site, key): setattr(site, key, value)
            site.domain, site.aliases = domain, aliases
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

    def mark_error(self, website_id: str) -> Website | None:
        """Mark a deployment as unhealthy without deleting its recoverable files."""
        with self._lock:
            sites = [Website.model_validate(item) for item in self._read()]
            site = next((item for item in sites if item.id == website_id), None)
            if site is None:
                return None
            site.status = "error"
            site.updated_at = self._now()
            self._write_site(site, sites)
            return site

    def directories(self, path: str | None = None, recursive: bool = False) -> dict:
        current = self._safe_project_path(path or str(self.web_root))
        if not current.exists():
            raise HTTPException(400, "That folder does not exist")
        try:
            if recursive:
                folders = sorted(
                    ({"name": item.name, "path": str(item)} for item in current.rglob("*") if item.is_dir() and not any(part.startswith(".") for part in item.relative_to(current).parts)),
                    key=lambda item: item["path"].lower(),
                )
            else:
                folders = sorted(
                    ({"name": item.name, "path": str(item)} for item in current.iterdir() if item.is_dir() and not item.name.startswith(".")),
                    key=lambda item: item["name"].lower(),
                )
        except OSError as exc:
            raise HTTPException(400, f"This folder cannot be read: {exc}")
        parent = str(current.parent) if current != self.web_root else None
        return {"path": str(current), "parent": parent, "root": str(self.web_root), "directories": folders}

    def project_path_status(self, path: str) -> dict:
        target = self._safe_project_path(path)
        exists = target.exists()
        return {
            "path": str(target),
            "exists": exists,
            "is_directory": target.is_dir() if exists else False,
            "is_empty": target.is_dir() and not any(target.iterdir()) if exists else True,
        }

    def create_directory(self, path: str, name: str) -> dict:
        if "/" in name or "\\" in name or name in {".", ".."}:
            raise HTTPException(400, "Folder name contains unsupported characters")
        parent = self._safe_project_path(path)
        if not parent.is_dir():
            raise HTTPException(400, "Choose an existing parent folder")
        target = self._safe_project_path(str(parent / name))
        target.mkdir(parents=False, exist_ok=False)
        self._set_hosting_owner(target)
        return {"name": target.name, "path": str(target)}

    @staticmethod
    def _set_hosting_owner(path: Path) -> None:
        """Keep website project directories writable by the managed web user."""
        try:
            owner = pwd.getpwnam("serverengine")
            os.chown(path, owner.pw_uid, owner.pw_gid)
        except (KeyError, OSError):
            # Development images may not have the production account yet.
            # The production installer always creates it before the panel starts.
            pass

    @staticmethod
    def _configuration_id(site: Website) -> str:
        """Return a stable, standard UUID for generated service filenames."""
        try:
            return str(uuid.UUID(site.id))
        except ValueError:
            # Older websites used short IDs. Keep their identity stable while
            # upgrading generated filenames to the standard UUID format.
            return str(uuid.uuid5(uuid.NAMESPACE_URL, f"server-engine:website:{site.id}"))

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
        generated = self.configuration(site) if site is not None else None
        target = Path(site.config_path) if site is not None else None
        provider_path = Path(generated["config_path"]) if generated else None
        previous_registry = self.path.read_bytes() if self.path.exists() else None
        previous_target = target.read_bytes() if target and target.exists() else None
        previous_provider = provider_path.read_bytes() if provider_path and provider_path.exists() else None
        fd, tmp = tempfile.mkstemp(prefix="websites.", suffix=".tmp", dir=self.path.parent)
        try:
            if target:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(json.dumps(site.model_dump(mode="json"), indent=2) + "\n")
            if provider_path:
                provider_path.parent.mkdir(parents=True, exist_ok=True)
                provider_path.write_text(generated["content"])
            with os.fdopen(fd, "w") as stream:
                json.dump(values, stream, indent=2); stream.write("\n"); stream.flush(); os.fsync(stream.fileno())
            os.replace(tmp, self.path)
        except Exception:
            if previous_registry is None:
                self.path.unlink(missing_ok=True)
            else:
                self.path.write_bytes(previous_registry)
            if target:
                if previous_target is None:
                    target.unlink(missing_ok=True)
                else:
                    target.write_bytes(previous_target)
            if provider_path:
                if previous_provider is None:
                    provider_path.unlink(missing_ok=True)
                else:
                    provider_path.write_bytes(previous_provider)
            raise
        finally:
            if os.path.exists(tmp): os.unlink(tmp)

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
