from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import require_user
from app.models.job import JobSummary
from app.services.job_service import job_store

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.get("", response_model=list[JobSummary])
def list_jobs(user=Depends(require_user)):
    return job_store.list()


@router.post("/{job_id}/cancel", response_model=JobSummary)
def cancel_job(job_id: str, user=Depends(require_user)):
    job = job_store.cancel(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
