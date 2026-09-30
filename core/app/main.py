import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.dependencies import require_user
from app.api.routes import activity, api_access, application_shield, auth, cron, databases, domains, file_manager, firewall, ftp, jobs, servers, services, settings, system, terminal, websites
from app.auth import AuthStore
from app.services.auth_service import AuthService
from app.services.job_service import enqueue_startup_services
from app.services.log_rotation_service import log_rotation_service
from app.services.cron_service import configure_cron_service
from app.version import APP_VERSION

DB_PATH = os.getenv("SE_DB_PATH", "/var/lib/server-engine/control.db")
BOOTSTRAP_USER = os.getenv("SE_ADMIN_USER", "admin")
BOOTSTRAP_PASSWORD = os.getenv("SE_ADMIN_PASSWORD") or secrets.token_urlsafe(18)


@asynccontextmanager
async def lifespan(application: FastAPI):
    store = AuthStore(DB_PATH, BOOTSTRAP_USER, BOOTSTRAP_PASSWORD)
    application.state.auth_service = AuthService(store)
    if not os.getenv("SE_ADMIN_PASSWORD"):
        print(f"Server Engine bootstrap password for {BOOTSTRAP_USER}: {BOOTSTRAP_PASSWORD}", flush=True)
    enqueue_startup_services()
    log_rotation_service.start()
    scheduler = configure_cron_service(DB_PATH)
    if scheduler.enabled:
        scheduler.start()
    yield
    scheduler.stop()
    log_rotation_service.stop()


app = FastAPI(title="Server Engine Control Panel API", version=APP_VERSION, lifespan=lifespan)
app.include_router(auth.router)
app.include_router(api_access.router)
app.include_router(domains.router)
app.include_router(databases.router)
app.include_router(ftp.router)
app.include_router(firewall.router)
app.include_router(application_shield.router)
app.include_router(system.router)
app.include_router(servers.router)
app.include_router(jobs.router)
app.include_router(cron.router)
app.include_router(activity.router)
app.include_router(services.router)
app.include_router(file_manager.router)
app.include_router(settings.router)
app.include_router(websites.router)
app.include_router(terminal.router)


@app.get("/services/php/{version}/info", include_in_schema=False)
def php_info_page(version: str, user=Depends(require_user)):
    """Serve a real phpinfo document at the convenient browser URL."""
    return services.render_php_runtime_info(version, user)

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
