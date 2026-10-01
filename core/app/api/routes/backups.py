from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pathlib import Path

from app.api.dependencies import require_user
from app.services.backup_service import backup_service
from app.services import cron_service as cron_service_module
from app.models.cron import CronJobRequest
from app.services.cron_service import validate_schedule

router = APIRouter(prefix="/api/v1/backups", tags=["backups"])


def _backup_config_for_job(job: dict) -> dict | None:
    config = backup_service.schedule_config(job["command"])
    if config is not None:
        return config
    # Keep database schedules created by older panel versions visible and
    # manageable after they move into the Backup workspace.
    prefix = "Backup database: "
    if job.get("group") == "Backup" and job.get("name", "").startswith(prefix):
        database_name = job["name"][len(prefix):]
        return {"scope": "database", "destination": "local", "compression": "balanced", "target_type": "database", "target_id": database_name}
    return None


@router.get("")
def list_backups(user=Depends(require_user)):
    return backup_service.list()


@router.get("/config")
def get_backup_config(user=Depends(require_user)):
    return backup_service.read_config()


@router.put("/config")
def update_backup_config(payload: dict, user=Depends(require_user)):
    try:
        return {"saved": True, "config": backup_service.save_config(payload)}
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.post("/config/test")
def test_backup_destination(payload: dict, user=Depends(require_user)):
    try:
        return backup_service.test_destination(payload)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.post("")
def create_backup(payload: dict, user=Depends(require_user)):
    try:
        return backup_service.create(
            payload.get("scope", "websites"),
            payload.get("destination", "local"),
            payload.get("compression", "balanced"),
            payload.get("target_type", "all"),
            payload.get("target_id"),
        )
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.get("/{backup_id}/download")
def download_backup(backup_id: str, user=Depends(require_user)):
    entry = next((item for item in backup_service.list() if item.get("id") == backup_id), None)
    if entry is None:
        raise HTTPException(404, "Backup not found")
    if entry.get("status") != "Verified" or not entry.get("verified"):
        raise HTTPException(409, "Only verified backups can be downloaded")
    root = backup_service.root.resolve()
    archive = Path(entry.get("archive_path", "")).resolve()
    if root not in archive.parents or not archive.is_file():
        raise HTTPException(404, "Backup archive is no longer available")
    return FileResponse(
        archive,
        media_type="application/gzip",
        filename=archive.name,
        headers={"Cache-Control": "private, no-store"},
    )


@router.delete("/{backup_id}")
def delete_backup(backup_id: str, user=Depends(require_user)):
    if not backup_service.delete(backup_id):
        raise HTTPException(404, "Backup archive not found")
    return {"deleted": True}


@router.get("/schedules")
def list_backup_schedules(user=Depends(require_user)):
    if cron_service_module.cron_service is None:
        raise HTTPException(503, "Cron scheduler is not ready")
    return [
        {**job, "backup": _backup_config_for_job(job)}
        for job in cron_service_module.cron_service.list()
        if _backup_config_for_job(job) is not None
    ]


@router.post("/schedules", status_code=status.HTTP_201_CREATED)
def create_backup_schedule(payload: dict, user=Depends(require_user)):
    scheduler = cron_service_module.cron_service
    if scheduler is None:
        raise HTTPException(503, "Cron scheduler is not ready")
    config = {
        "scope": payload.get("scope", "websites"),
        "destination": "local",
        "compression": payload.get("compression", "balanced"),
        "target_type": payload.get("target_type", "all"),
        "target_id": payload.get("target_id"),
    }
    try:
        backup_service._resolve_target(config["scope"], config["target_type"], config["target_id"])
        values = {
            "name": payload.get("name", "Scheduled backup"),
            "group": "Backup",
            "owner": "serverengine",
            "minute": payload.get("minute", "0"),
            "hour": payload.get("hour", "2"),
            "day": payload.get("day", "*"),
            "month": payload.get("month", "*"),
            "weekday": payload.get("weekday", "*"),
            "command": backup_service._schedule_command(config),
            "email": payload.get("email", ""),
            "enabled": payload.get("enabled", True),
        }
        validate_schedule(values)
        return scheduler.create(CronJobRequest(**values))
    except (ValueError, TypeError) as error:
        raise HTTPException(422, str(error)) from error


@router.post("/schedules/{job_id}/toggle")
def toggle_backup_schedule(job_id: str, payload: dict, user=Depends(require_user)):
    scheduler = cron_service_module.cron_service
    if scheduler is None:
        raise HTTPException(503, "Cron scheduler is not ready")
    job = scheduler.get(job_id)
    if not job or _backup_config_for_job(job) is None:
        raise HTTPException(404, "Backup schedule not found")
    updated = scheduler.toggle(job_id, bool(payload.get("enabled", True)))
    return {**updated, "backup": backup_service.schedule_config(updated["command"])}


@router.delete("/schedules/{job_id}")
def delete_backup_schedule(job_id: str, user=Depends(require_user)):
    scheduler = cron_service_module.cron_service
    if scheduler is None:
        raise HTTPException(503, "Cron scheduler is not ready")
    job = scheduler.get(job_id)
    if not job or _backup_config_for_job(job) is None:
        raise HTTPException(404, "Backup schedule not found")
    scheduler.delete(job_id)
    return {"deleted": True}
