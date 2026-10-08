from __future__ import annotations

import json
import crypt
import html
import ipaddress
import os
import pwd
import re
import ssl
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from html.parser import HTMLParser

from fastapi import HTTPException

from app.models.website import Website, WebsiteCreateRequest, WebsiteUpdateRequest
from app.services.service_runtime import managed_library_environment, nginx_paths, service_root


_DOMAIN = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$", re.I)


class _MaintenanceHtmlParser(HTMLParser):
    """Keep maintenance messages formatted without allowing active content."""

    allowed_tags = {"p", "br", "strong", "b", "em", "i", "u", "h1", "h2", "h3", "ul", "ol", "li", "a"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.output: list[str] = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag not in self.allowed_tags:
            return
        if tag == "a":
            href = next((value for key, value in attrs if key.lower() == "href"), "")
            if href and re.match(r"^(?:https?://|mailto:)", href, re.I):
                self.output.append(f'<a href="{html.escape(href, quote=True)}" target="_blank" rel="noopener noreferrer">')
            else:
                self.output.append("<a>")
        elif tag == "br":
            self.output.append("<br>")
        else:
            self.output.append(f"<{tag}>")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in self.allowed_tags and tag != "br":
            self.output.append(f"</{tag}>")

    def handle_data(self, data):
        self.output.append(html.escape(data))


def _maintenance_html(value: str) -> str:
    parser = _MaintenanceHtmlParser()
    parser.feed(value or "We'll be back shortly.")
    parser.close()
    content = "".join(parser.output).strip()
    return content or "We'll be back shortly."


class WebsiteService:
    def __init__(self):
        state = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.path = Path(os.getenv("SE_WEBSITES_PATH", str(state / "websites.json")))
        self.web_root = Path(os.getenv("SE_WEB_ROOT", "/server-engine/www")).resolve()
        self.service_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services"))
        self.log_root = Path(os.getenv("SE_LOG_ROOT", "/server-engine/logs")).resolve()
        self.auth_root = state / "website-auth"
        self.config_backup_root = state / "website-config-backups"
        self.certificate_root = state / "website-certificates"
        self._lock = RLock()
        if (self.service_root / "nginx").exists():
            self.ensure_nginx_default_server()

    @property
    def nginx_port_path(self) -> Path:
        return self.path.parent / "nginx-settings.json"

    def nginx_http_port(self) -> int:
        try:
            value = json.loads(self.nginx_port_path.read_text()).get("http_port", 80)
            port = int(value)
            return port if 1 <= port <= 65535 else 80
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return 80

    def nginx_default_website_id(self) -> str:
        try:
            value = json.loads(self.nginx_port_path.read_text()).get("default_website_id", "")
            return str(value or "").strip()
        except (OSError, TypeError, json.JSONDecodeError):
            return ""

    def _nginx_settings(self) -> dict:
        try:
            value = json.loads(self.nginx_port_path.read_text())
            return value if isinstance(value, dict) else {}
        except (OSError, TypeError, json.JSONDecodeError):
            return {}

    def ensure_nginx_default_server(self) -> None:
        """Create the first-match guard so unknown hosts never hit a site."""
        sites_dir = self.service_root / "nginx" / "conf" / "sites"
        try:
            sites_dir.mkdir(parents=True, exist_ok=True)
            port = self.nginx_http_port()
            default_id = self.nginx_default_website_id()
            sites = self.list_without_nginx_guard()
            selected = next((site for site in sites if site.id == default_id), None) if default_id else None
            selected_certificate = self.certificate_paths(selected)[0] if selected else None
            selected_private_key = self.certificate_paths(selected)[1] if selected else None
            selected_tls = bool(
                selected
                and selected.ssl_enabled
                and selected_certificate
                and selected_private_key
                and selected_certificate.is_file()
                and selected_private_key.is_file()
            )
            fallback_certificate = selected_certificate if selected_tls else None
            fallback_private_key = selected_private_key if selected_tls else None
            if not fallback_certificate:
                for candidate in sites:
                    certificate, private_key = self.certificate_paths(candidate)
                    if candidate.ssl_enabled and certificate.is_file() and private_key.is_file():
                        fallback_certificate, fallback_private_key = certificate, private_key
                        break
            lines = [
                "# Managed by Server Engine. Unknown hosts must not fall through to a website.",
                "server {",
                f"    listen {port} default_server;",
                "    server_name _;",
            ]
            if selected:
                lines.extend([
                    f"    root {selected.document_root};",
                    "    index index.php index.html index.htm;",
                    "    location / {",
                    "        try_files $uri $uri/ /index.php?$query_string;",
                    "    }",
                    "    location ~ \\.php$ {",
                    f"        fastcgi_pass unix:{self.service_root / 'php' / 'versions' / selected.php_version / 'run' / 'php-fpm.sock'};",
                    f"        include {nginx_paths()['root'] / 'etc/nginx/fastcgi_params'};",
                    "        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;",
                    "    }",
                ])
            else:
                lines.append("    return 404;")
            lines.extend(["}", "", "server {"])
            if fallback_certificate and fallback_private_key:
                lines.extend([
                    "    listen 443 ssl default_server;",
                    f"    ssl_certificate {fallback_certificate};",
                    f"    ssl_certificate_key {fallback_private_key};",
                ])
            else:
                # A `listen ... ssl` socket is invalid without certificates.
                # Keep the HTTPS fallback plain until a certificate exists;
                # TLS requests will be rejected rather than reaching a site.
                lines.append("    listen 443 default_server;")
            lines.extend(["    server_name _;", "    return 444;", "}", ""])
            (sites_dir / "000-server-engine-default.conf").write_text("\n".join(lines))
        except OSError:
            return

    def list_without_nginx_guard(self) -> list[Website]:
        try:
            return [Website.model_validate(item) for item in self._read()]
        except (OSError, ValueError):
            return []

    def certificate_paths(self, site: Website) -> tuple[Path, Path]:
        if site.certificate_path and site.private_key_path:
            return Path(site.certificate_path), Path(site.private_key_path)
        base = self.certificate_root / self._configuration_id(site)
        return base / "fullchain.pem", base / "privkey.pem"

    def certificate_info(self, site: Website) -> dict:
        certificate, private_key = self.certificate_paths(site)
        available = certificate.is_file() and private_key.is_file()
        expires_at = site.certificate_expires_at
        if available and certificate.is_file():
            try:
                decoded = ssl._ssl._test_decode_cert(str(certificate))
                not_after = decoded.get("notAfter", "")
                if not_after:
                    expires_at = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc).isoformat()
            except (OSError, ValueError, ssl.SSLError):
                pass
        status = site.certificate_status
        if available and expires_at:
            try:
                expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=timezone.utc)
                status = "expired" if expiry <= datetime.now(timezone.utc) else "issued"
            except ValueError:
                pass
        return {"status": status, "source": site.certificate_source, "certificate_path": str(certificate), "private_key_path": str(private_key), "expires_at": expires_at, "available": available}

    def store_certificate(self, website_id: str, certificate: str, private_key: str, source: str = "upload", expires_at: str = "") -> Website:
        if "BEGIN CERTIFICATE" not in certificate or "END CERTIFICATE" not in certificate:
            raise HTTPException(400, "Certificate must be PEM encoded.")
        if "BEGIN" not in private_key or "PRIVATE KEY" not in private_key or "END" not in private_key:
            raise HTTPException(400, "Private key must be PEM encoded.")
        with self._lock:
            sites = [Website.model_validate(item) for item in self._read()]
            site = next((item for item in sites if item.id == website_id), None)
            if site is None:
                raise HTTPException(404, "Website not found")
            certificate_path, private_key_path = self.certificate_paths(site)
            certificate_path.parent.mkdir(parents=True, exist_ok=True)
            certificate_path.write_text(certificate.strip() + "\n")
            private_key_path.write_text(private_key.strip() + "\n")
            certificate_path.chmod(0o644)
            private_key_path.chmod(0o600)
            site.ssl_enabled = True
            site.certificate_status = "issued"
            site.certificate_source = source
            site.certificate_path = str(certificate_path)
            site.private_key_path = str(private_key_path)
            site.certificate_expires_at = expires_at
            site.updated_at = self._now()
            self._write_site(site, sites)
            return site

    def mark_certificate_failed(self, website_id: str) -> None:
        with self._lock:
            sites = [Website.model_validate(item) for item in self._read()]
            site = next((item for item in sites if item.id == website_id), None)
            if site is not None:
                site.certificate_status = "failed"
                site.updated_at = self._now()
                self._write_site(site, sites)

    def installed_web_servers(self) -> list[str]:
        """Return installed managed web-server providers in stable order."""
        binaries = {
            "nginx": ("bin/nginx", "usr/sbin/nginx"),
            "apache": ("bin/httpd",),
            "openlitespeed": ("usr/local/lsws/bin/lshttpd", "bin/lshttpd"),
            "caddy": ("bin/caddy", "usr/bin/caddy"),
        }
        installed = []
        for provider, candidates in binaries.items():
            root = service_root(provider)
            if any((root / candidate).is_file() for candidate in candidates):
                installed.append(provider)
        return installed

    def set_nginx_http_port(self, port: int) -> int:
        if not 1 <= port <= 65535:
            raise HTTPException(400, "Nginx HTTP port must be between 1 and 65535")
        with self._lock:
            self.nginx_port_path.parent.mkdir(parents=True, exist_ok=True)
            settings = self._nginx_settings()
            settings["http_port"] = port
            self.nginx_port_path.write_text(json.dumps(settings, indent=2) + "\n")
            for site in [Website.model_validate(item) for item in self._read() if item.get("server_type") == "nginx"]:
                generated = self.configuration(site)
                provider_path = Path(generated["config_path"])
                if self._custom_marker(site, "nginx").exists():
                    continue
                provider_path.parent.mkdir(parents=True, exist_ok=True)
                provider_path.write_text(generated["content"])
            # Migrate managed site files from older releases as well. This
            # covers sites that are no longer present in the registry and
            # prevents an orphaned `listen 80;` block from keeping port 80
            # bound after the panel setting changes.
            sites_dir = self.service_root / "nginx" / "conf" / "sites"
            if sites_dir.is_dir():
                for provider_path in sites_dir.glob("*.conf"):
                    if provider_path.name == "000-server-engine-default.conf":
                        continue
                    try:
                        content = provider_path.read_text(errors="replace")
                    except OSError:
                        continue
                    migrated = re.sub(
                        r"(?m)^(\s*listen\s+)(\[::\]:)?\d+(\s*;.*)$",
                        rf"\g<1>\g<2>{port}\g<3>",
                        content,
                    )
                    if migrated != content:
                        provider_path.write_text(migrated)
            self.ensure_nginx_default_server()
        return port

    def set_nginx_default_website(self, website_id: str) -> str:
        website_id = str(website_id or "").strip()
        if website_id and not any(item.id == website_id for item in self.list_without_nginx_guard()):
            raise HTTPException(404, "That website does not exist")
        with self._lock:
            settings = self._nginx_settings()
            settings["http_port"] = self.nginx_http_port()
            settings["default_website_id"] = website_id
            self.nginx_port_path.parent.mkdir(parents=True, exist_ok=True)
            self.nginx_port_path.write_text(json.dumps(settings, indent=2) + "\n")
            self.ensure_nginx_default_server()
        return website_id

    def list(self) -> list[Website]:
        with self._lock:
            sites = [Website.model_validate(item) for item in self._read()]
            # Repair records created by older releases that persisted the
            # registry before generating the provider configuration.
            for site in sites:
                for generated in self.provider_configurations(site):
                    provider_path = Path(generated["config_path"])
                    if self._custom_marker(site, generated["server_type"]).exists():
                        continue
                    existing = provider_path.read_text(errors="replace") if provider_path.exists() else ""
                    legacy_log_root = str(self.service_root / generated["server_type"] / "logs")
                    if not provider_path.exists() or legacy_log_root in existing:
                        provider_path.parent.mkdir(parents=True, exist_ok=True)
                        provider_path.write_text(generated["content"])
            self.ensure_nginx_default_server()
            return sites

    def get(self, website_id: str) -> Website | None:
        return next((site for site in self.list() if site.id == website_id), None)

    def refresh_scheduled_maintenance(self) -> list[Website]:
        """Apply maintenance windows that changed since the last provider render."""
        changed = []
        with self._lock:
            for site in [Website.model_validate(item) for item in self._read()]:
                provider_changed = False
                for generated in self.provider_configurations(site):
                    provider_path = Path(generated["config_path"])
                    if self._custom_marker(site, generated["server_type"]).exists():
                        continue
                    content = generated["content"]
                    existing = provider_path.read_text(errors="replace") if provider_path.exists() else None
                    if existing != content:
                        provider_path.parent.mkdir(parents=True, exist_ok=True)
                        provider_path.write_text(content)
                        provider_changed = True
                if provider_changed:
                    changed.append(site)
        return changed

    def save_provider_configuration(self, website_id: str, provider: str, content: str) -> dict:
        site = self.get(website_id)
        if site is None:
            raise HTTPException(404, "Website not found")
        generated = self.configuration(site, provider)
        path = Path(generated["config_path"])
        path.parent.mkdir(parents=True, exist_ok=True)
        backup = self.config_backup_root / self._configuration_id(site) / f"{provider}.previous"
        backup.parent.mkdir(parents=True, exist_ok=True)
        previous_content = path.read_text(errors="replace") if path.exists() else None
        if path.exists():
            backup.write_text(previous_content)
        path.write_text(content)
        try:
            if provider == "nginx":
                self._validate_nginx_configuration(path, content)
        except Exception:
            if previous_content is None:
                path.unlink(missing_ok=True)
            else:
                path.write_text(previous_content)
            raise
        self._custom_marker(site, provider).parent.mkdir(parents=True, exist_ok=True)
        self._custom_marker(site, provider).touch()
        return {"website_id": site.id, "server_type": provider, "config_path": str(path), "content": content}

    def restore_provider_configuration(self, website_id: str, provider: str, restore: str) -> dict:
        site = self.get(website_id)
        if site is None:
            raise HTTPException(404, "Website not found")
        generated = self.configuration(site, provider)
        path = Path(generated["config_path"])
        backup = self.config_backup_root / self._configuration_id(site) / f"{provider}.previous"
        if restore == "previous":
            if not backup.exists():
                raise HTTPException(404, "No previous edit exists for this configuration")
            content = backup.read_text(errors="replace")
        elif restore == "original":
            content = generated["content"]
        else:
            raise HTTPException(400, "Unknown configuration restore target")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        try:
            if provider == "nginx":
                self._validate_nginx_configuration(path, content)
        except Exception:
            path.write_text(backup.read_text(errors="replace") if backup.exists() else generated["content"])
            raise
        marker = self._custom_marker(site, provider)
        if restore == "original":
            marker.unlink(missing_ok=True)
        else:
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.touch()
        return {"website_id": site.id, "server_type": provider, "config_path": str(path), "content": content}

    @staticmethod
    def _validate_nginx_configuration(path: Path, content: str) -> None:
        if content.count("{") != content.count("}"):
            raise HTTPException(400, "Nginx configuration has unbalanced braces")
        nginx = nginx_paths()
        if not nginx["binary"].exists() or not nginx["config"].exists():
            return
        # Validate the complete active configuration, including this site,
        # before replacing the live file. The managed library environment is
        # required when the ModSecurity connector is installed.
        check = subprocess.run([str(nginx["binary"]), "-p", str(nginx["root"]), "-c", str(nginx["config"]), "-t"], capture_output=True, text=True, check=False, env=managed_library_environment(nginx["root"], service_root("modsecurity")))
        if check.returncode != 0:
            raise HTTPException(400, (check.stderr or check.stdout).strip() or "Nginx configuration validation failed")

    def provider_configurations(self, site: Website) -> list[dict]:
        providers = self.installed_web_servers()
        if site.server_type not in providers:
            providers.insert(0, site.server_type)
        return [self.configuration(site, provider) for provider in providers]

    def configuration(self, website_id: str | Website, provider: str | None = None) -> dict:
        # Creation generates the provider file before the registry is committed,
        # so it must be able to render from the in-memory site as well as from
        # an already persisted ID used by the configuration API.
        if isinstance(website_id, Website):
            site = website_id
        else:
            site = next((Website.model_validate(item) for item in self._read() if item.get("id") == website_id), None)
            if site is None:
                raise HTTPException(404, "Website not found")
        server_type = provider or site.server_type
        if server_type not in {"nginx", "apache", "openlitespeed", "caddy"}:
            raise HTTPException(400, "Unsupported web-server provider")
        config_id = self._configuration_id(site)
        all_names = [site.domain, *site.aliases]
        canonical_host = site.canonical_domain if site.canonical_domain in all_names else ""
        names = " ".join([canonical_host] if canonical_host and server_type == "nginx" else all_names)
        index = "index.php index.html index.htm default.php default.htm default.html"
        root = site.document_root
        socket = self.service_root / "php" / "versions" / site.php_version / "run" / "php-fpm.sock"
        site_log_root = self.log_root / server_type / "sites"
        site_log_root.mkdir(parents=True, exist_ok=True)
        maintenance = self._maintenance_active(site)
        bypass = self._maintenance_bypass(site.maintenance_bypass)
        access_ips = self._access_ips(site.access_allowed_ips)
        auth_file = self.auth_root / f"{self._configuration_id(site)}.htpasswd"
        certificate_path, private_key_path = self.certificate_paths(site)
        tls_ready = site.ssl_enabled and certificate_path.is_file() and private_key_path.is_file()
        if server_type == "apache":
            service_root = self.service_root / "apache"
            config_path = service_root / "conf" / "sites" / f"{config_id}.conf"
            if access_ips and site.access_auth_enabled:
                access_requirements = ["        <RequireAll", *[f"          Require ip {value}" for value in access_ips], "          Require valid-user", "        </RequireAll>"]
            elif access_ips:
                access_requirements = ["        <RequireAny", *[f"          Require ip {value}" for value in access_ips], "        </RequireAny>"]
            elif site.access_auth_enabled:
                access_requirements = ["        AuthType Basic", f"        AuthName \"{self._config_text(site.domain)}\"", f"        AuthUserFile \"{auth_file}\"", "        Require valid-user"]
            else:
                access_requirements = ["        Require all granted"]
            lines = [
                f"<VirtualHost *:80>",
                f"    ServerName {site.domain}",
                *[f"    ServerAlias {alias}" for alias in site.aliases],
                f"    DocumentRoot \"{root}\"",
                f"    DirectoryIndex {index}",
                f"    ErrorLog \"{site_log_root / f'{config_id}.error.log'}\"" if site.error_log_enabled else "    ErrorLog /dev/null",
                f"    CustomLog \"{site_log_root / f'{config_id}.access.log'}\" combined" if site.access_log_enabled else "    CustomLog /dev/null combined",
                f"    <Directory \"{root}\">",
                "        AllowOverride All",
                *access_requirements,
                "    </Directory>",
            ]
            if site.redirects:
                lines.extend(["    RewriteEngine On", *[f"    Redirect {item['code']} {item['source_path']} {item['target']}" for item in site.redirects]])
            for item in site.proxies:
                lines.extend([f"    ProxyPass {item['path']} {item['target']}{'/' if item['path'] != '/' else ''}", f"    ProxyPassReverse {item['path']} {item['target']}{'/' if item['path'] != '/' else ''}"])
            if maintenance:
                lines.extend(["    RewriteEngine On"])
                for value in bypass:
                    lines.append(f"    RewriteCond expr \"! -R '{value}'\"")
                lines.extend([f"    RewriteRule ^ - [R={site.maintenance_response_code},L]", f"    ErrorDocument {site.maintenance_response_code} \"{self._config_text(site.maintenance_message)}\""])
            if site.php_version:
                lines.extend([
                    "    <FilesMatch \\\"\\\\.php$\\\">",
                    f"        SetHandler \"proxy:unix:{socket}|fcgi://localhost/\"",
                    "    </FilesMatch>",
                ])
            lines.extend(["</VirtualHost>", ""])
        elif server_type == "caddy":
            service_root = self.service_root / "caddy"
            config_path = service_root / "conf" / "sites" / f"{config_id}.caddy"
            lines = [f"{names} {{", f"    root * {root}", "    encode zstd gzip"]
            lines.extend([f"    redir {item['source_path']} {item['target']} {item['code']}" for item in site.redirects])
            for item in site.proxies:
                lines.extend([f"    handle_path {item['path']}* {{", f"        reverse_proxy {item['target']} {{", f"            transport http {{", f"                read_timeout {item['timeout']}s", "            }", "        }", "    }"])
            if access_ips:
                lines.extend([f"    @server_engine_access_denied not remote_ip {' '.join(access_ips)}", "    respond @server_engine_access_denied 403"])
            if maintenance:
                matcher = " ".join(bypass) if bypass else "0.0.0.0/0"
                lines.extend([f"    @server_engine_maintenance not remote_ip {matcher}", f"    respond @server_engine_maintenance {self._caddy_text(site.maintenance_message)} {site.maintenance_response_code}"])
            lines.append("    file_server")
            if site.php_version:
                lines.append(f"    php_fastcgi unix/{socket}")
            if site.access_log_enabled:
                lines.extend(["    log {", f"        output file {site_log_root / f'{config_id}.access.log'}", "    }"])
            lines.extend(["}", ""])
        elif server_type == "openlitespeed":
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
            if maintenance:
                lines.extend(["rewrite  {", "  enable                  1", f"  rules                   RewriteRule ^(.*)$ - [R={site.maintenance_response_code},L]", "}"])
            if site.redirects:
                lines.extend(["rewrite  {", "  enable                  1", *[f"  rules                   RewriteRule ^{item['source_path'].lstrip('/')}$ {item['target']} [R={item['code']},L]" for item in site.redirects], "}"])
            for item in site.proxies:
                lines.extend(["context /" + item["path"].lstrip("/") + " {", "  type                    proxy", f"  handler                 {item['target']}", "}"])
            lines.append("")
        else:
            service_root = self.service_root / "nginx"
            config_path = service_root / "conf" / "sites" / f"{config_id}.conf"
            fastcgi_params = nginx_paths()["root"] / "etc/nginx/fastcgi_params"
            lines = [
                "server {",
                f"    listen {self.nginx_http_port()};",
                *(["    listen 443 ssl;", f"    ssl_certificate {certificate_path};", f"    ssl_certificate_key {private_key_path};"] if tls_ready else []),
                f"    server_name {names};",
                f"    index {index};",
                f"    root {root};",
                f"    access_log {site_log_root / f'{config_id}.access.log'};" if site.access_log_enabled else "    access_log off;",
                f"    error_log {site_log_root / f'{config_id}.error.log'};" if site.error_log_enabled else "    error_log off;",
                "",
            ]
            redirect_hosts = [host for host in all_names if canonical_host and host != canonical_host]
            if redirect_hosts:
                redirect_scheme = "https" if tls_ready else "http"
                redirect_lines = []
                for host in redirect_hosts:
                    redirect_lines.extend([
                        "server {",
                        f"    listen {self.nginx_http_port()};",
                        *(["    listen 443 ssl;", f"    ssl_certificate {certificate_path};", f"    ssl_certificate_key {private_key_path};"] if tls_ready else []),
                        f"    server_name {host};",
                        f"    return 301 {redirect_scheme}://{canonical_host}$request_uri;",
                        "}",
                        "",
                    ])
                lines = redirect_lines + lines
            if tls_ready and site.ssl_enforce_tls:
                lines.extend(["    if ($scheme = http) {", "        return 301 https://$host$request_uri;", "    }", ""])
            if site.access_auth_enabled:
                lines.extend(["    auth_basic \"Restricted website\";", f"    auth_basic_user_file {auth_file};", ""])
            for item in site.redirects:
                suffix = "$request_uri" if item["keep_path"] and item["source_path"] == "/" else "$is_args$args"
                lines.extend([f"    location = {item['source_path']} {{", f"        return {item['code']} {item['target']}{suffix};", "    }"])
            for item in site.proxies:
                location = item["path"] if item["path"] == "/" else item["path"] + "/"
                lines.extend([f"    location {location} {{", f"        proxy_pass {item['target']};", "        proxy_set_header Host $host;", "        proxy_set_header X-Real-IP $remote_addr;", "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;", "        proxy_set_header X-Forwarded-Proto $scheme;", f"        proxy_read_timeout {item['timeout']}s;", f"        proxy_buffering {'on' if item['buffering'] else 'off'};"])
                if item["websockets"]:
                    lines.extend(["        proxy_http_version 1.1;", "        proxy_set_header Upgrade $http_upgrade;", "        proxy_set_header Connection \"upgrade\";"])
                lines.append("    }")
            if site.hotlink.get("enabled"):
                extensions = "|".join(re.escape(item) for item in site.hotlink["extensions"])
                referers = (["none"] if site.hotlink["allow_empty"] else []) + ["blocked", "server_names", *site.hotlink["domains"], site.domain, *site.aliases]
                lines.extend([f"    location ~* \\.(?:{extensions})$ {{", f"        valid_referers {' '.join(referers)};"])
                if site.hotlink["action"] == "redirect":
                    lines.append(f"        if ($invalid_referer) {{ return 302 {site.hotlink['redirect']}; }}")
                else:
                    lines.append("        if ($invalid_referer) { return 403; }")
                lines.append("    }")
            lines.append("    location ^~ /.well-known/acme-challenge/ {")
            lines.extend([f"        root {root};", "        try_files $uri =404;", "    }"])
            if not any(item["path"] == "/" for item in site.proxies):
                lines.append("    location / {")
                if maintenance:
                    lines.extend(self._nginx_maintenance_body(site, list(dict.fromkeys(access_ips + bypass))))
                elif access_ips:
                    lines.extend(self._nginx_access_body(access_ips))
                lines.extend([*(f"        {rule}" for rule in self._rewrite_rules(site.rewrite_rules)), "    }"])
            if site.php_version:
                lines.extend(["", "    location ~ \\.php$ {"])
                if maintenance:
                    lines.extend(self._nginx_maintenance_body(site, list(dict.fromkeys(access_ips + bypass))))
                elif access_ips:
                    lines.extend(self._nginx_access_body(access_ips))
                lines.extend(["        try_files $uri =404;", f"        fastcgi_pass unix:{socket};", f"        include {fastcgi_params};", "        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;", "    }"])
            if maintenance:
                lines.extend(["", f"    location @server_engine_maintenance_{site.id.replace('-', '_')} {{", "        default_type text/html;", "        charset utf-8;", f"        return {site.maintenance_response_code} \"{self._config_text(_maintenance_html(site.maintenance_message))}\\n\";", "    }"])
            lines.extend(["", "    location ~ /\\.(?!well-known) {", "        deny all;", "    }", "}", ""])
        return {"website_id": site.id, "server_type": server_type, "config_path": str(config_path), "content": "\n".join(lines)}

    @staticmethod
    def _config_text(value: str) -> str:
        return str(value or "We’ll be back shortly.").replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")

    @staticmethod
    def _caddy_text(value: str) -> str:
        return '"' + WebsiteService._config_text(value) + '"'

    @staticmethod
    def _maintenance_bypass(values: list[str]) -> list[str]:
        result = []
        for raw in values or []:
            value = str(raw).strip()
            if "*" in value:
                parts = value.split(".")
                first_wildcard = next((index for index, part in enumerate(parts) if part == "*"), -1)
                if len(parts) != 4 or first_wildcard < 0 or any(part != "*" for part in parts[first_wildcard:]):
                    raise HTTPException(400, f"Invalid maintenance bypass wildcard: {value}. Use formats such as 230.*.*.*")
                try:
                    octets = [int(part) for part in parts[:first_wildcard]] + [0] * (4 - first_wildcard)
                    if any(octet < 0 or octet > 255 for octet in octets):
                        raise ValueError
                except ValueError as exc:
                    raise HTTPException(400, f"Invalid maintenance bypass address: {value}") from exc
                value = f"{'.'.join(str(octet) for octet in octets)}/{first_wildcard * 8}"
            try:
                ipaddress.ip_network(value, strict=False)
            except ValueError as exc:
                raise HTTPException(400, f"Invalid maintenance bypass address: {value}") from exc
            result.append(value)
        return list(dict.fromkeys(result))

    @staticmethod
    def _access_ips(values: list[str]) -> list[str]:
        result = []
        for raw in values or []:
            value = str(raw).strip()
            if "*" in value:
                parts = value.split(".")
                first_wildcard = next((index for index, part in enumerate(parts) if part == "*"), -1)
                if len(parts) != 4 or first_wildcard < 0 or any(part != "*" for part in parts[first_wildcard:]):
                    raise HTTPException(400, f"Invalid allowed IP wildcard: {value}. Use formats such as 230.*.*.*")
                try:
                    octets = [int(part) for part in parts[:first_wildcard]] + [0] * (4 - first_wildcard)
                    if any(octet < 0 or octet > 255 for octet in octets):
                        raise ValueError
                except ValueError as exc:
                    raise HTTPException(400, f"Invalid allowed IP address: {value}") from exc
                value = f"{'.'.join(str(octet) for octet in octets)}/{first_wildcard * 8}"
            try:
                ipaddress.ip_network(value, strict=False)
            except ValueError as exc:
                raise HTTPException(400, f"Invalid allowed IP address: {value}") from exc
            result.append(value)
        return list(dict.fromkeys(result))

    @staticmethod
    def _rewrite_rules(value: str) -> list[str]:
        rules = [line.strip() for line in str(value or "").splitlines() if line.strip()]
        if not rules:
            return []
        if any(re.search(r"\b(?:http|server|location|events|upstream)\s*\{", line, re.I) for line in rules):
            raise HTTPException(400, "URL rewrite rules may only contain directives inside the website location")
        if any(";" not in line and not line.endswith("{") and not line.endswith("}") for line in rules):
            raise HTTPException(400, "Each URL rewrite directive must end with a semicolon")
        return rules

    @staticmethod
    def _redirects(values: list[dict] | None) -> list[dict]:
        result = []
        for item in values or []:
            source = str(item.get("source_path", "")).strip()
            target = str(item.get("target", "")).strip()
            code = str(item.get("code", "301")).strip()
            if not source.startswith("/") or any(char in source for char in ("\n", "\r", "{", "}", '"')):
                raise HTTPException(400, "Redirect source must be a local path beginning with '/'")
            if not target or any(char in target for char in ("\n", "\r", "{", "}", '"')):
                raise HTTPException(400, "Redirect destination is invalid")
            if code not in {"301", "302", "307", "308"}:
                raise HTTPException(400, "Redirect status must be 301, 302, 307, or 308")
            source = source if source == "/" else source.rstrip("/")
            if any(existing["source_path"] == source for existing in result):
                raise HTTPException(409, f"A redirect already exists for {source}")
            result.append({"source_path": source, "target": target, "code": code, "keep_path": bool(item.get("keep_path", True))})
        return result

    @staticmethod
    def _proxies(values: list[dict] | None) -> list[dict]:
        result = []
        for item in values or []:
            target = str(item.get("target", "")).strip().rstrip("/")
            path = str(item.get("path", "/")).strip() or "/"
            timeout = str(item.get("timeout", "60")).strip()
            if not re.fullmatch(r"https?://[^\s/]+(?::\d{1,5})?(?:/[^\s]*)?", target):
                raise HTTPException(400, "Proxy upstream must be an HTTP or HTTPS URL")
            if not path.startswith("/") or any(char in path for char in ("\n", "\r", "{", "}", '"')):
                raise HTTPException(400, "Proxy path must begin with '/'")
            if not timeout.isdigit() or not 1 <= int(timeout) <= 3600:
                raise HTTPException(400, "Proxy timeout must be between 1 and 3600 seconds")
            if any(existing["path"] == path for existing in result):
                raise HTTPException(409, f"A proxy already exists for {path}")
            result.append({"target": target, "path": path if path == "/" else path.rstrip("/"), "timeout": timeout, "websockets": bool(item.get("websockets", True)), "buffering": bool(item.get("buffering", True))})
        return result

    @staticmethod
    def _hotlink(value: dict | None) -> dict:
        value = value or {}
        enabled = bool(value.get("enabled", False))
        extensions = []
        for raw in str(value.get("extensions", "jpg, jpeg, png, gif, webp, svg")).split(","):
            extension = raw.strip().lower().lstrip(".")
            if extension and re.fullmatch(r"[a-z0-9]+", extension):
                extensions.append(extension)
        if enabled and not extensions:
            raise HTTPException(400, "Add at least one protected file extension")
        domains = []
        for raw in value.get("domains", []) if isinstance(value.get("domains", []), list) else str(value.get("domains", "")).split(","):
            domain = str(raw).strip().lower()
            if domain and re.fullmatch(r"[a-z0-9.*-]+", domain):
                domains.append(domain)
        action = str(value.get("action", "403"))
        if action not in {"403", "redirect"}:
            raise HTTPException(400, "Hotlink action must be 403 or redirect")
        redirect = str(value.get("redirect", "")).strip()
        if action == "redirect" and not re.fullmatch(r"https?://[^\s]+", redirect):
            raise HTTPException(400, "Hotlink redirect must be an HTTP or HTTPS URL")
        return {"enabled": enabled, "extensions": list(dict.fromkeys(extensions)), "domains": list(dict.fromkeys(domains)), "allow_empty": bool(value.get("allow_empty", True)), "action": action, "redirect": redirect}

    def _write_auth_file(self, site: Website, username: str, password: str | None = None) -> None:
        target = self.auth_root / f"{self._configuration_id(site)}.htpasswd"
        if not site.access_auth_enabled:
            target.unlink(missing_ok=True)
            return
        if password:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(f"{username}:{crypt.crypt(password, crypt.mksalt(crypt.METHOD_SHA512))}\n")
            target.chmod(0o600)
        elif not target.exists():
            raise HTTPException(400, "Enter an HTTP authentication password before enabling authentication")

    @staticmethod
    def _validate_maintenance_schedule(start: str, end: str) -> None:
        try:
            start_at = datetime.fromisoformat(start.replace("Z", "+00:00")) if start else None
            end_at = datetime.fromisoformat(end.replace("Z", "+00:00")) if end else None
            if start_at and start_at.tzinfo is None:
                start_at = start_at.replace(tzinfo=timezone.utc)
            if end_at and end_at.tzinfo is None:
                end_at = end_at.replace(tzinfo=timezone.utc)
        except ValueError as exc:
            raise HTTPException(400, "Maintenance schedule must use a valid date and time") from exc
        if start_at and end_at and end_at <= start_at:
            raise HTTPException(400, "Maintenance end must be later than maintenance start")

    @staticmethod
    def _maintenance_active(site: Website) -> bool:
        if not site.maintenance_enabled:
            return False
        now = datetime.now(timezone.utc)
        try:
            start = datetime.fromisoformat(site.maintenance_start.replace("Z", "+00:00")) if site.maintenance_start else None
            end = datetime.fromisoformat(site.maintenance_end.replace("Z", "+00:00")) if site.maintenance_end else None
            if start and start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            if end and end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
        except ValueError as exc:
            raise HTTPException(400, "Maintenance schedule must use a valid date and time") from exc
        return not (start and now < start) and not (end and now >= end)

    @staticmethod
    def _nginx_maintenance_body(site: Website, bypass: list[str]) -> list[str]:
        lines = [f"        allow {value};" for value in bypass]
        lines.extend(["        deny all;", f"        error_page 403 = @server_engine_maintenance_{site.id.replace('-', '_')};"])
        return lines

    @staticmethod
    def _nginx_access_body(allowed: list[str]) -> list[str]:
        return [*(f"        allow {value};" for value in allowed), "        deny all;"]

    def create(self, payload: WebsiteCreateRequest) -> Website:
        with self._lock:
            sites = [Website.model_validate(item) for item in self._read()]
            domain, aliases = self._domains(payload.domain, payload.aliases)
            self._ensure_domains_free(sites, [domain, *aliases])
            canonical_domain = payload.canonical_domain.strip().lower()
            if canonical_domain and canonical_domain not in [domain, *aliases]:
                raise HTTPException(400, "Canonical host must be one of the website domains or aliases")
            requested_project_path = payload.project_path.strip() or str(self.web_root / domain)
            project = self._safe_project_path(requested_project_path)
            web_root = self._normalize_web_root(payload.web_root)
            self._validate_maintenance_schedule(payload.maintenance_start.strip(), payload.maintenance_end.strip())
            access_ips = self._access_ips(payload.access_allowed_ips)
            if payload.access_auth_enabled and not payload.access_auth_username.strip():
                raise HTTPException(400, "Enter an HTTP authentication username")
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
                access_allowed_ips=access_ips,
                access_auth_enabled=payload.access_auth_enabled,
                access_auth_username=payload.access_auth_username.strip(),
                rewrite_rules="\n".join(self._rewrite_rules(payload.rewrite_rules)),
                canonical_domain=canonical_domain,
                redirects=self._redirects(payload.redirects),
                proxies=self._proxies(payload.proxies),
                hotlink=self._hotlink(payload.hotlink),
                maintenance_enabled=payload.maintenance_enabled,
                maintenance_response_code=payload.maintenance_response_code,
                maintenance_message=payload.maintenance_message.strip() or "We'll be back shortly.",
                maintenance_bypass=self._maintenance_bypass(payload.maintenance_bypass),
                maintenance_start=payload.maintenance_start.strip(), maintenance_end=payload.maintenance_end.strip(),
                database_enabled=payload.database_enabled, database_name=payload.database_name.strip(),
                database_user=payload.database_user.strip(), notes=payload.notes.strip(),
                tags=self._tags(payload.tags), status="ready", enabled=True,
                created_at=now, updated_at=now, config_path=str(config_path))
            try:
                self._write_auth_file(site, site.access_auth_username, payload.access_auth_password)
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
            auth_password = changes.pop("access_auth_password", None)
            domain, aliases = self._domains(changes.get("domain", site.domain), changes.get("aliases", site.aliases))
            self._ensure_domains_free(sites, [domain, *aliases], website_id)
            canonical_domain = str(changes.get("canonical_domain", site.canonical_domain)).strip().lower()
            if canonical_domain and canonical_domain not in [domain, *aliases]:
                raise HTTPException(400, "Canonical host must be one of the website domains or aliases")
            changes["canonical_domain"] = canonical_domain
            if "project_path" in changes:
                project = self._safe_project_path(changes["project_path"])
                if not project.exists() or not project.is_dir():
                    raise HTTPException(400, "Project folder must be an existing directory")
                changes["project_path"] = str(project)
                self._set_hosting_owner(project)
            if "web_root" in changes:
                changes["web_root"] = self._normalize_web_root(changes["web_root"])
            if "maintenance_bypass" in changes:
                changes["maintenance_bypass"] = self._maintenance_bypass(changes["maintenance_bypass"])
            if "access_allowed_ips" in changes:
                changes["access_allowed_ips"] = self._access_ips(changes["access_allowed_ips"])
            if "rewrite_rules" in changes:
                changes["rewrite_rules"] = "\n".join(self._rewrite_rules(changes["rewrite_rules"]))
            if "redirects" in changes:
                changes["redirects"] = self._redirects(changes["redirects"])
            if "proxies" in changes:
                changes["proxies"] = self._proxies(changes["proxies"])
            if "hotlink" in changes:
                changes["hotlink"] = self._hotlink(changes["hotlink"])
            if "maintenance_message" in changes:
                changes["maintenance_message"] = changes["maintenance_message"].strip() or "We'll be back shortly."
            for key in ("maintenance_start", "maintenance_end"):
                if key in changes:
                    changes[key] = changes[key].strip()
            self._validate_maintenance_schedule(changes.get("maintenance_start", site.maintenance_start), changes.get("maintenance_end", site.maintenance_end))
            if changes.get("access_auth_enabled", site.access_auth_enabled) and not changes.get("access_auth_username", site.access_auth_username).strip():
                raise HTTPException(400, "Enter an HTTP authentication username")
            for key, value in changes.items():
                if key in {"name", "php_version", "database_name", "database_user", "notes"} and isinstance(value, str):
                    value = value.strip()
                if key == "tags": value = self._tags(value)
                if hasattr(site, key): setattr(site, key, value)
            site.domain, site.aliases = domain, aliases
            site.document_root = str(Path(site.project_path) if site.web_root == "." else Path(site.project_path) / site.web_root)
            site.updated_at = self._now()
            if {"access_log_enabled", "error_log_enabled"}.intersection(changes) and self._custom_marker(site, "nginx").exists():
                self._apply_custom_nginx_log_settings(site)
            self._write_auth_file(site, site.access_auth_username, auth_password)
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

    def _custom_marker(self, site: Website, provider: str) -> Path:
        return self.config_backup_root / self._configuration_id(site) / f"{provider}.custom"

    def _apply_custom_nginx_log_settings(self, site: Website) -> None:
        """Apply managed log switches without replacing a custom site config."""
        generated = self.configuration(site, "nginx")
        path = Path(generated["config_path"])
        if not path.is_file():
            return
        content = path.read_text(errors="replace")
        config_id = self._configuration_id(site)
        log_root = self.log_root / "nginx" / "sites"
        directives = {
            "access_log": f"    access_log {log_root / f'{config_id}.access.log'};" if site.access_log_enabled else "    access_log off;",
            "error_log": f"    error_log {log_root / f'{config_id}.error.log'};" if site.error_log_enabled else "    error_log off;",
        }
        for directive, replacement in directives.items():
            pattern = rf"(?m)^([ \t]{{4}}){directive}\s+[^;]+;\s*$"
            content, count = re.subn(pattern, replacement, content, count=1)
            if count == 0:
                insertion = content.rfind("\n}")
                if insertion < 0:
                    raise HTTPException(400, f"Custom Nginx configuration has no server block for {directive}")
                content = content[:insertion] + f"\n{replacement}" + content[insertion:]
        path.write_text(content)

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
            # Removing a website must also remove the app-owned registry
            # metadata and every provider configuration generated for it.
            # The project directory is intentionally preserved unless the
            # caller explicitly requests remove_files.
            config_id = self._configuration_id(site)
            artifacts = [
                self.service_root / "websites" / f"{site.id}.json",
                self.service_root / "nginx" / "conf" / "sites" / f"{config_id}.conf",
                self.service_root / "apache" / "conf" / "sites" / f"{config_id}.conf",
                self.service_root / "caddy" / "conf" / "sites" / f"{config_id}.caddy",
                self.service_root / "openlitespeed" / "conf" / "vhosts" / config_id / "vhost.conf",
                self.auth_root / f"{config_id}.htpasswd",
                self.config_backup_root / config_id / "nginx.custom",
                self.config_backup_root / config_id / "apache.custom",
                self.config_backup_root / config_id / "caddy.custom",
                self.config_backup_root / config_id / "openlitespeed.custom",
            ]
            stored_metadata = Path(site.config_path)
            metadata_root = (self.service_root / "websites").resolve()
            try:
                if stored_metadata.resolve().parent == metadata_root:
                    artifacts.append(stored_metadata)
            except OSError:
                pass
            self._write_site(None, [item for item in sites if item.id != website_id])
            for artifact in artifacts:
                try:
                    artifact.unlink(missing_ok=True)
                except OSError:
                    # Registry deletion has already completed; a stale
                    # provider file must not make the website undeletable.
                    continue
            provider_directory = self.service_root / "openlitespeed" / "conf" / "vhosts" / config_id
            try:
                provider_directory.rmdir()
            except OSError:
                pass

    def _read(self):
        if not self.path.exists(): return []
        try:
            data = json.loads(self.path.read_text())
            if not isinstance(data, list):
                return []
            return data
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(500, f"Website registry is unreadable: {exc}")

    def _write_site(self, site, sites):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.service_root.joinpath("websites").mkdir(parents=True, exist_ok=True)
        values = [item.model_dump(mode="json") for item in sites]
        generated_configs = self.provider_configurations(site) if site is not None else []
        target = Path(site.config_path) if site is not None else None
        provider_paths = {Path(item["config_path"]): item["content"] for item in generated_configs}
        previous_registry = self.path.read_bytes() if self.path.exists() else None
        previous_target = target.read_bytes() if target and target.exists() else None
        previous_providers = {path: path.read_bytes() for path in provider_paths if path.exists()}
        fd, tmp = tempfile.mkstemp(prefix="websites.", suffix=".tmp", dir=self.path.parent)
        try:
            if target:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(json.dumps(site.model_dump(mode="json"), indent=2) + "\n")
            for provider_path, content in provider_paths.items():
                provider = next((item["server_type"] for item in generated_configs if Path(item["config_path"]) == provider_path), None)
                if provider and self._custom_marker(site, provider).exists():
                    continue
                provider_path.parent.mkdir(parents=True, exist_ok=True)
                provider_path.write_text(content)
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
            for provider_path in provider_paths:
                previous_provider = previous_providers.get(provider_path)
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
