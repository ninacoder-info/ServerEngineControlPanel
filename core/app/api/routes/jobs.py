import asyncio
import ipaddress

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from app.auth import SESSION_COOKIE
from app.api.dependencies import require_user
from app.models.job import JobSummary
from app.services.job_service import job_store
from app.services.settings_service import settings_service

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.websocket("/ws")
async def jobs_socket(websocket: WebSocket):
    session = websocket.cookies.get(SESSION_COOKIE)
    user = websocket.app.state.auth_service.current_user(session)
    authorization = websocket.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        api_settings = settings_service.read()
        if not api_settings.get("api_enabled", True):
            await websocket.close(code=1008, reason="External API access is disabled")
            return
        if api_settings.get("api_auth_mode") == "session":
            await websocket.close(code=1008, reason="Bearer token access is disabled")
            return
        user = websocket.app.state.auth_service.store.user_for_api_token(
            authorization[7:].strip(), request=websocket
        )
    if user is None:
        await websocket.close(code=1008, reason="Authentication required")
        return
    allowed = settings_service.read().get("security_authorized_ips", [])
    if allowed:
        client_ip = websocket.client.host if websocket.client else ""
        try:
            address = ipaddress.ip_address(client_ip)
            permitted = any(
                address in ipaddress.ip_network(entry.strip(), strict=False)
                for entry in allowed
            )
        except ValueError:
            permitted = False
        if not permitted:
            await websocket.close(code=1008, reason="Client IP is not authorized")
            return
    await websocket.accept()
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    job_store.subscribe(loop, queue)
    try:
        await websocket.send_json({"type": "snapshot", "jobs": job_store.snapshot()})
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=30)
                await websocket.send_json(message)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except (WebSocketDisconnect, RuntimeError, OSError):
        pass
    finally:
        job_store.unsubscribe(loop, queue)


@router.get("", response_model=list[JobSummary])
def list_jobs(user=Depends(require_user)):
    return job_store.list()


@router.post("/{job_id}/cancel", response_model=JobSummary)
def cancel_job(job_id: str, user=Depends(require_user)):
    job = job_store.cancel(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
