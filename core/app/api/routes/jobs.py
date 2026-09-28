import asyncio

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from app.auth import SESSION_COOKIE
from app.api.dependencies import require_user
from app.models.job import JobSummary
from app.services.job_service import job_store

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.websocket("/ws")
async def jobs_socket(websocket: WebSocket):
    session = websocket.cookies.get(SESSION_COOKIE)
    user = websocket.app.state.auth_service.current_user(session)
    if user is None:
        await websocket.close(code=1008, reason="Authentication required")
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
