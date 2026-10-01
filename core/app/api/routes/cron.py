from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import require_user
from app.models.cron import CronJobRequest, CronJobToggle
from app.services import cron_service as cron_service_module

router = APIRouter(prefix="/api/v1/cron", tags=["cron"])


def store():
    if cron_service_module.cron_service is None:
        raise HTTPException(503, "Cron scheduler is not ready")
    return cron_service_module.cron_service


@router.get("/jobs")
def list_jobs(user=Depends(require_user)):
    return store().list()


@router.get("/scheduler")
def scheduler_status(user=Depends(require_user)):
    return store().status()


@router.post("/scheduler")
def scheduler_action(payload: dict, user=Depends(require_user)):
    action = payload.get("action")
    scheduler = store()
    if action == "start":
        scheduler.start()
    elif action == "stop":
        scheduler.stop()
    elif action == "restart":
        scheduler.restart()
    elif action == "enable_at_boot":
        return scheduler.set_enabled(bool(payload.get("enabled", True)))
    else:
        raise HTTPException(422, "Unsupported scheduler action")
    return scheduler.status()


@router.post("/jobs", status_code=status.HTTP_201_CREATED)
def create_job(payload: CronJobRequest, user=Depends(require_user)):
    try:
        return store().create(payload)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.put("/jobs/{job_id}")
def update_job(job_id: str, payload: CronJobRequest, user=Depends(require_user)):
    try:
        job = store().update(job_id, payload)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    if job is None:
        raise HTTPException(404, "Cron job not found")
    return job


@router.delete("/jobs/{job_id}")
def delete_job(job_id: str, user=Depends(require_user)):
    if not store().delete(job_id):
        raise HTTPException(404, "Cron job not found")
    return {"deleted": True}


@router.get("/jobs/{job_id}")
def get_job(job_id: str, user=Depends(require_user)):
    job = store().get(job_id)
    if not job:
        raise HTTPException(404, "Cron job not found")
    return job


@router.get("/jobs/{job_id}/logs")
def job_logs(job_id: str, limit: int = 50, user=Depends(require_user)):
    if not store().get(job_id):
        raise HTTPException(404, "Cron job not found")
    return store().logs(job_id, limit)


@router.post("/jobs/{job_id}/toggle")
def toggle_job(job_id: str, payload: CronJobToggle, user=Depends(require_user)):
    job = store().toggle(job_id, payload.enabled)
    if not job:
        raise HTTPException(404, "Cron job not found")
    return job


@router.post("/jobs/{job_id}/run")
def run_job(job_id: str, user=Depends(require_user)):
    job = store().run(job_id)
    if not job:
        raise HTTPException(404, "Cron job not found")
    return {"queued": True, "job": job}
