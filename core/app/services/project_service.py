from __future__ import annotations

import json
import os
import pwd
import re
import shlex
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from urllib.parse import urlparse

from fastapi import HTTPException

from app.models.projects import NodeProject, NodeProjectCreateRequest, ProxyRoute, ProxyRouteCreateRequest
from app.services.website_service import website_service
from app.services.service_runtime import service_root


DOMAIN = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$", re.I)


class ProjectService:
    def __init__(self):
        state = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.node_path = state / "node-projects.json"
        self.proxy_path = state / "proxy-routes.json"
        self._lock = RLock()

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _read(path: Path) -> list[dict]:
        try:
            value = json.loads(path.read_text())
            return value if isinstance(value, list) else []
        except (FileNotFoundError, OSError, json.JSONDecodeError):
            return []

    @staticmethod
    def _write(path: Path, value: list[dict]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        temporary.write_text(json.dumps(value, indent=2) + "\n")
        os.replace(temporary, path)

    @staticmethod
    def _set_owner(path: Path) -> None:
        try:
            owner = pwd.getpwnam("serverengine")
        except KeyError:
            return
        try:
            os.chown(path, owner.pw_uid, owner.pw_gid)
        except OSError:
            pass

    @staticmethod
    def _domain(value: str) -> str:
        value = value.strip().lower().rstrip(".")
        if not DOMAIN.fullmatch(value):
            raise HTTPException(422, "Enter a valid domain such as app.example.com.")
        return value

    def _ensure_domain_free(self, domain: str, current_id: str | None = None) -> None:
        if any(site.domain == domain or domain in site.aliases for site in website_service.list()):
            raise HTTPException(409, f"The domain {domain} is already used by a website.")
        for item in self._read(self.node_path):
            if item.get("domain") == domain and item.get("id") != current_id:
                raise HTTPException(409, f"The domain {domain} is already used by a Node.js project.")
        for item in self._read(self.proxy_path):
            if item.get("domain") == domain and item.get("id") != current_id:
                raise HTTPException(409, f"The domain {domain} is already used by a proxy route.")

    @staticmethod
    def _provider_root(provider: str) -> Path:
        return Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / provider

    def _write_provider_config(self, item: NodeProject | ProxyRoute) -> str:
        provider = item.server_type
        root = self._provider_root(provider)
        config_id = str(uuid.UUID(item.id))
        if isinstance(item, NodeProject):
            target = f"http://127.0.0.1:{item.port}"
            domain = item.domain
            path = "/"
            websocket = True
            timeout = 60
            send_host = "$host"
        else:
            target = item.target
            domain = item.domain
            path = item.path
            websocket = item.websocket
            timeout = item.timeout
            send_host = item.send_host

        if provider == "apache":
            config_path = root / "conf/sites" / f"{config_id}.conf"
            if target.startswith("unix:"):
                upstream = target.removeprefix("unix:")
                lines = [f"<VirtualHost *:80>", f"    ServerName {domain}", f"    ProxyPass / unix:{upstream}|http://localhost/", "    ProxyPassReverse / http://localhost/", "</VirtualHost>"]
            else:
                lines = [f"<VirtualHost *:80>", f"    ServerName {domain}", "    ProxyPreserveHost On", f"    ProxyPass / {target}/", f"    ProxyPassReverse / {target}/", "</VirtualHost>"]
        elif provider == "caddy":
            config_path = root / "conf/sites" / f"{config_id}.caddy"
            lines = [f"{domain} {{", f"    reverse_proxy {target}", "}"]
        elif provider == "openlitespeed":
            config_path = root / "conf/vhosts" / config_id / "vhost.conf"
            lines = [f"vhDomain {domain}", "context / {", "  type proxy", f"  uri {path}", f"  handler {target}", "}"]
        else:
            config_path = root / "conf/sites" / f"{config_id}.conf"
            lines = ["server {", "    listen 80;", f"    server_name {domain};", "", f"    location {path} {{", f"        proxy_pass {target};", f"        proxy_connect_timeout {timeout}s;", f"        proxy_read_timeout {timeout}s;", f"        proxy_set_header Host {send_host};", "        proxy_set_header X-Real-IP $remote_addr;", "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;", "        proxy_set_header X-Forwarded-Proto $scheme;"]
            if websocket:
                lines.extend(["        proxy_set_header Upgrade $http_upgrade;", '        proxy_set_header Connection "upgrade";'])
            lines.extend(["    }", "}"])
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text("\n".join(lines) + "\n")
        return str(config_path)

    @staticmethod
    def _shell_quote(value: str) -> str:
        return "'" + value.replace("'", "'\\''") + "'"

    def _write_node_process_config(self, project: NodeProject) -> str:
        if project.process_manager == "none":
            return ""
        if project.process_manager == "pm2":
            directory = self._provider_root("pm2") / "projects"
            path = directory / f"{uuid.UUID(project.id)}.config.cjs"
            node_bin = service_root("nodejs", project.node_version) / "bin"
            content = "module.exports = { apps: [{\n" + \
                f"  name: {project.name!r},\n  cwd: {str(Path(project.project_path))!r},\n" + \
                f"  script: 'sh',\n  args: {json.dumps(['-lc', 'exec ' + project.run_command])},\n  interpreter: 'none',\n" + \
                "  env: { NODE_ENV: 'production', PORT: " + repr(str(project.port)) + ", PATH: " + repr(f"{node_bin}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin") + " },\n" + \
                "  autorestart: true,\n  time: true\n}]};\n"
        else:
            directory = self._provider_root("supervisor") / "conf/programs"
            path = directory / f"{uuid.UUID(project.id)}.conf"
            node_bin = service_root("nodejs", project.node_version) / "bin"
            command = "/bin/sh -lc " + shlex.quote("exec " + project.run_command)
            content = "[program:" + project.name + "]\n" + \
                f"directory={project.project_path}\ncommand={command}\n" + \
                "user=serverengine\nautostart=true\nautorestart=true\n" + \
                f"environment=NODE_ENV=production,PORT=\"{project.port}\",PATH=\"{node_bin}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\"\n" + \
                f"stdout_logfile=/server-engine/logs/node/{project.name}.out.log\n" + \
                f"stderr_logfile=/server-engine/logs/node/{project.name}.err.log\n"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return str(path)

    def configuration(self, kind: str, item_id: str) -> dict:
        entries = self._read(self.node_path if kind == "node" else self.proxy_path)
        item = next((entry for entry in entries if entry.get("id") == item_id), None)
        if item is None:
            raise HTTPException(404, "Project not found")
        config_path = Path(item.get("config_path", ""))
        if not config_path.exists():
            raise HTTPException(404, "Generated provider configuration is not available")
        result = {"id": item_id, "kind": kind, "path": str(config_path), "content": config_path.read_text(errors="replace")}
        if kind == "node":
            result["process_config_path"] = item.get("process_config_path", "")
        return result

    def list_node(self) -> list[NodeProject]:
        return [NodeProject.model_validate(item) for item in self._read(self.node_path)]

    def get_node(self, project_id: str) -> NodeProject:
        project = next((item for item in self.list_node() if item.id == project_id), None)
        if project is None:
            raise HTTPException(404, "Node.js project not found")
        return project

    def set_node_status(self, project_id: str, status: str) -> NodeProject:
        with self._lock:
            entries = self._read(self.node_path)
            item = next((entry for entry in entries if entry.get("id") == project_id), None)
            if item is None:
                raise HTTPException(404, "Node.js project not found")
            item["status"] = status
            item["updated_at"] = self._now()
            self._write(self.node_path, entries)
            return NodeProject.model_validate(item)

    def create_node(self, payload: NodeProjectCreateRequest) -> NodeProject:
        domain = self._domain(payload.domain)
        path = Path(payload.project_path).expanduser().resolve()
        if website_service.web_root not in path.parents and path != website_service.web_root:
            raise HTTPException(400, "Node.js projects must stay inside the Server Engine website root.")
        with self._lock:
            self._ensure_domain_free(domain)
            if path.exists() and any(path.iterdir()):
                raise HTTPException(409, "The project folder is not empty. Choose an existing project or an empty folder.")
            path.mkdir(parents=True, exist_ok=True)
            self._set_owner(path)
            now = self._now()
            project = NodeProject(id=str(uuid.uuid4()), name=payload.name.strip(), domain=domain,
                project_path=str(path), document_root=str(path if payload.document_root == "." else path / payload.document_root),
                node_version=payload.node_version.strip(), package_manager=payload.package_manager,
                template_id=payload.template_id,
                install_command=payload.install_command.strip(), build_command=payload.build_command.strip(),
                run_command=payload.run_command.strip(), process_manager=payload.process_manager, port=payload.port,
                server_type=payload.server_type, ssl_enabled=payload.ssl_enabled, created_at=now, updated_at=now)
            project.config_path = self._write_provider_config(project)
            project.process_config_path = self._write_node_process_config(project)
            entries = self._read(self.node_path)
            entries.append(project.model_dump(mode="json"))
            self._write(self.node_path, entries)
            return project

    def list_proxy(self) -> list[ProxyRoute]:
        return [ProxyRoute.model_validate(item) for item in self._read(self.proxy_path)]

    def create_proxy(self, payload: ProxyRouteCreateRequest) -> ProxyRoute:
        domain = self._domain(payload.domain)
        target = payload.target.strip()
        if not (target.startswith("unix:/") or urlparse(target).scheme in {"http", "https"}):
            raise HTTPException(422, "Target must be an http(s) URL or an absolute unix socket path.")
        if not payload.path.startswith("/"):
            raise HTTPException(422, "Proxy path must start with /.")
        with self._lock:
            self._ensure_domain_free(domain)
            now = self._now()
            route = ProxyRoute(id=str(uuid.uuid4()), name=payload.name.strip(), domain=domain, target=target,
                path=payload.path.strip(), send_host=payload.send_host.strip(), websocket=payload.websocket,
                timeout=payload.timeout, server_type=payload.server_type, ssl_enabled=payload.ssl_enabled,
                created_at=now, updated_at=now)
            route.config_path = self._write_provider_config(route)
            entries = self._read(self.proxy_path)
            entries.append(route.model_dump(mode="json"))
            self._write(self.proxy_path, entries)
            return route


project_service = ProjectService()
