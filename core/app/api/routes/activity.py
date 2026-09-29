from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import require_user
from app.services.job_service import job_store

router = APIRouter(prefix="/api/v1/activity", tags=["activity"])


def _category(job_type: str) -> str:
    value = job_type.lower()
    if any(word in value for word in ("ssl", "firewall", "fail2ban", "cert", "security")):
        return "security"
    if any(word in value for word in ("website", "domain", "php", "node", "composer", "wp-cli")):
        return "websites"
    if any(word in value for word in ("install", "start", "stop", "restart", "service", "database", "mysql", "redis")):
        return "services"
    return "system"


def _event(job):
    status = {"succeeded": "success", "failed": "error", "cancelled": "warning"}.get(job.status, "info")
    timestamp = job.updated_at or job.created_at
    return {
        "id": f"job-{job.id}",
        "category": _category(job.type),
        "type": job.type,
        "actor": "server-engine",
        "target": job.type,
        "detail": job.message or "A managed operation is in progress.",
        "time": timestamp.isoformat() if timestamp else None,
        "status": status,
        "metadata": {
            "Status": job.status,
            "Job": job.id,
            "Progress": f"{job.progress}%" if job.progress is not None else "—",
            "Details": job.message or "No additional details",
        },
    }


@router.get("")
def list_activity(
    range: str = Query(default="24h", pattern="^(24h|7d|30d|all)$"),
    user=Depends(require_user),
):
    events = [_event(job) for job in job_store.list()]
    if range != "all":
        hours = {"24h": 24, "7d": 24 * 7, "30d": 24 * 30}[range]
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        events = [event for event in events if not event["time"] or datetime.fromisoformat(event["time"]) >= cutoff]
    return events
