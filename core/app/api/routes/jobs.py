from fastapi import APIRouter, Depends

from app.api.dependencies import require_user
from app.models.job import JobSummary
from app.services.job_service import job_store

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.get("", response_model=list[JobSummary])
def list_jobs(user=Depends(require_user)):
    return job_store.list()
