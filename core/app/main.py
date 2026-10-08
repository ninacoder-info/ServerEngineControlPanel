import os
import secrets
import asyncio
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from starlette.requests import Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from app.api.dependencies import require_user
from app.api.routes import accounts, activity, api_access, application_shield, auth, backups, cron, databases, domains, docker_files, email, file_manager, firewall, ftp, jobs, logs, malware, plans, projects, servers, services, settings, system, terminal, users, websites
from app.auth import AuthStore, SESSION_COOKIE
from app.services.auth_service import AuthService
from app.services.job_service import enqueue_startup_services
from app.api.routes.system import start_metrics_collector, stop_metrics_collector
from app.services.log_rotation_service import log_rotation_service
from app.services.job_service import job_store
from app.services.service_runtime import service_root
from app.services.database_credentials import database_credentials
from app.services.cron_service import configure_cron_service
from app.version import APP_VERSION

DB_PATH = os.getenv("SE_DB_PATH", "/var/lib/server-engine/control.db")
BOOTSTRAP_USER = os.getenv("SE_ADMIN_USER", "admin")
BOOTSTRAP_PASSWORD = os.getenv("SE_ADMIN_PASSWORD") or secrets.token_urlsafe(18)


@asynccontextmanager
async def lifespan(application: FastAPI):
    store = AuthStore(DB_PATH, BOOTSTRAP_USER, BOOTSTRAP_PASSWORD)
    application.state.auth_service = AuthService(store)
    bootstrap_file = os.getenv("SE_BOOTSTRAP_CREDENTIALS_FILE")
    if bootstrap_file:
        try:
            Path(bootstrap_file).unlink(missing_ok=True)
        except OSError:
            pass
    if not os.getenv("SE_ADMIN_PASSWORD"):
        print(f"Server Engine administrator account ready for {BOOTSTRAP_USER}", flush=True)
    enqueue_startup_services()
    log_rotation_service.start()
    scheduler = configure_cron_service(DB_PATH)
    if scheduler.enabled:
        scheduler.start()
    start_metrics_collector()
    yield
    stop_metrics_collector()
    scheduler.stop()
    log_rotation_service.stop()


app = FastAPI(title="Server Engine Control Panel API", version=APP_VERSION, lifespan=lifespan)
app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(plans.router)
app.include_router(users.router)
app.include_router(api_access.router)
app.include_router(domains.router)
app.include_router(databases.router)
app.include_router(backups.router)
app.include_router(ftp.router)
app.include_router(email.router)
app.include_router(firewall.router)
app.include_router(application_shield.router)
app.include_router(system.router)
app.include_router(servers.router)
app.include_router(jobs.router)
app.include_router(malware.router)
app.include_router(cron.router)
app.include_router(activity.router)
app.include_router(logs.router)
app.include_router(services.router)
app.include_router(file_manager.router)
app.include_router(settings.router)
app.include_router(websites.router)
app.include_router(projects.router)
app.include_router(terminal.router)
app.include_router(docker_files.router)


def _audit_category(path: str) -> str:
    if any(value in path for value in ("auth", "users", "accounts", "api-access")):
        return "access"
    if any(value in path for value in ("websites", "domains", "projects")):
        return "websites"
    if any(value in path for value in ("databases", "email", "ftp", "plans")):
        return "hosting"
    if any(value in path for value in ("firewall", "application-shield", "malware", "audit")):
        return "security"
    if any(value in path for value in ("services", "jobs", "cron", "supervisor", "backups")):
        return "services"
    return "system"


@app.middleware("http")
async def audit_mutations(request: Request, call_next):
    response = await call_next(request)
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return response
    path = request.url.path
    explicit_success_paths = (
        path.startswith("/api/v1/auth/logout")
        or path.startswith("/api/v1/auth/passkey")
        or path.startswith("/api/v1/api-access")
        or path.startswith("/api/v1/plans")
        or path.startswith("/api/v1/users")
        or path.startswith("/api/v1/accounts")
    )
    if path in {"/api/v1/auth/login", "/api/v1/auth/mobile-login"} or path.startswith("/api/v1/activity") or (explicit_success_paths and response.status_code < 400):
        return response
    auth_service = getattr(request.app.state, "auth_service", None)
    if not auth_service:
        return response
    user = auth_service.current_user(request.cookies.get(SESSION_COOKIE))
    authorization = request.headers.get("authorization", "")
    if not user and authorization.lower().startswith("bearer "):
        user = auth_service.store.user_for_api_token(authorization[7:].strip(), request=request)
    actor = user.get("username", "anonymous") if user else "anonymous"
    status = "success" if response.status_code < 400 else "error"
    event = auth_service.store.record_activity(
        _audit_category(path),
        f"{request.method.lower()} {path}",
        actor,
        path,
        f"{request.method} {path} returned HTTP {response.status_code}.",
        status,
        metadata={"HTTP status": response.status_code},
        actor_user_id=user.get("id") if user else None,
        source_ip=request.client.host if request.client else None,
    )
    job_store.publish({"type": "activity", "event": event})
    return response


@app.get("/services/php/{version}/info", include_in_schema=False)
def php_info_page(version: str, user=Depends(require_user)):
    """Serve a real phpinfo document at the convenient browser URL."""
    return services.render_php_runtime_info(version, user)


@app.api_route("/phpmyadmin", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
@app.api_route("/phpmyadmin/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
async def phpmyadmin_proxy(request: Request, path: str = "", user=Depends(require_user)):
    """Proxy the isolated PHP built-in phpMyAdmin server without Nginx."""
    root = service_root("phpmyadmin")
    pid_file = root / "run/phpmyadmin.pid"
    try:
        running = pid_file.exists() and (Path("/proc") / pid_file.read_text().strip()).exists()
    except OSError:
        running = False
    if not (root / "index.php").exists():
        return Response("phpMyAdmin is not installed.", status_code=404, media_type="text/plain")
    if not running:
        return Response("phpMyAdmin is installed but stopped. Start it from Services.", status_code=503, media_type="text/plain")
    target = "http://127.0.0.1:2525/" + path.lstrip("/")
    if request.url.query:
        target += "?" + request.url.query
    body = await request.body()
    headers = {}
    for name in ("accept", "content-type", "cookie", "user-agent"):
        value = request.headers.get(name)
        if value:
            headers[name] = value
    query = request.query_params
    database_name = query.get("db")
    if database_name:
        credentials = database_credentials.secret_for(query.get("engine", "mysql"), database_name)
        if credentials:
            def php_string(value: str) -> str:
                return str(value).replace("\\", "\\\\").replace("'", "\\'")

            config_path = root / "config.inc.php"
            temp_dir = root / "tmp"
            config_path.write_text(
                "<?php\n"
                "$cfg['blowfish_secret'] = 'server-engine-managed-phpmyadmin-secret';\n"
                "$i = 1;\n"
                "$cfg['Servers'][$i]['auth_type'] = 'config';\n"
                f"$cfg['Servers'][$i]['user'] = '{php_string(credentials['username'])}';\n"
                f"$cfg['Servers'][$i]['password'] = '{php_string(credentials['password'])}';\n"
                "$cfg['Servers'][$i]['host'] = '127.0.0.1';\n"
                "$cfg['Servers'][$i]['port'] = '3306';\n"
                "$cfg['Servers'][$i]['AllowNoPassword'] = false;\n"
                "$cfg['PmaAbsoluteUri'] = '/phpmyadmin/';\n"
                f"$cfg['TempDir'] = '{php_string(str(temp_dir))}';\n"
            )
            try:
                config_path.chmod(0o600)
            except OSError:
                pass

    upstream_request = urllib.request.Request(target, data=body or None, headers=headers, method=request.method)

    def fetch():
        try:
            upstream_context = urllib.request.urlopen(upstream_request, timeout=30)
            with upstream_context as upstream:
                return upstream.status, dict(upstream.headers.items()), upstream.read()
        except urllib.error.HTTPError as error:
            return error.code, dict(error.headers.items()), error.read()

    status_code, upstream_headers, content = await asyncio.to_thread(fetch)
    response_headers = {
        name: value
        for name, value in upstream_headers.items()
        if name.lower() in {"content-type", "cache-control", "expires", "location", "set-cookie"}
    }
    location = response_headers.get("Location") or response_headers.get("location")
    if location and location.startswith("http://127.0.0.1:2525"):
        response_headers["Location"] = "/phpmyadmin" + location.removeprefix("http://127.0.0.1:2525")
    return Response(content, status_code=status_code, headers=response_headers)

WEB_DIST_VALUE = os.getenv("SE_WEB_DIST")
WEB_DIST = Path(WEB_DIST_VALUE).resolve() if WEB_DIST_VALUE else None
if WEB_DIST and (WEB_DIST / "index.html").is_file() and (WEB_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str = ""):
        requested = (WEB_DIST / path).resolve()
        if requested.is_file() and WEB_DIST.resolve() in requested.parents:
            return FileResponse(requested)
        return FileResponse(WEB_DIST / "index.html")
