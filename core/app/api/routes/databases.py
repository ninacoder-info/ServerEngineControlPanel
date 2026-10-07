import os
import re
import subprocess
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api.dependencies import require_user
from app.services.account_isolation import account_isolation
from app.models.database import DatabaseCreateRequest
from app.models.cron import CronJobRequest
from app.services.service_runtime import binary_path, prepare_mysql_runtime, service_root
from app.services import cron_service as cron_service_module
from app.services.backup_service import backup_service
from app.services.database_credentials import database_credentials
from app.services.job_service import job_store

router = APIRouter(prefix="/api/v1/databases", tags=["databases"])

ENGINE_SERVICES = {
    "mysql": {"name": "MySQL", "description": "Relational database for common PHP and web applications.", "service_id": "mysql"},
    "mariadb": {"name": "MariaDB", "description": "MySQL-compatible relational database for web applications.", "service_id": "mariadb"},
    "postgresql": {"name": "PostgreSQL", "description": "Advanced relational database with strong SQL features.", "service_id": "postgresql"},
    "mongodb": {"name": "MongoDB", "description": "Document database for flexible application data.", "service_id": "mongodb"},
    "redis": {"name": "Redis", "description": "Fast in-memory store for cache, queues, and sessions.", "service_id": "redis"},
    "sqlserver": {"name": "SQL Server", "description": "Microsoft relational database engine.", "service_id": "sqlserver"},
}


def _running(pid_file: Path) -> bool:
    if not pid_file.exists():
        return False
    try:
        os.kill(int(pid_file.read_text().strip()), 0)
        return True
    except (OSError, ValueError):
        return False


def _engine_state(engine_id: str) -> dict:
    definition = ENGINE_SERVICES[engine_id]
    service_id = definition["service_id"]
    if service_id == "mysql":
        root = service_root("mysql")
        installed = (root / "bin/mysqld").exists()
        running = _running(root / "run/mysqld.pid")
    elif service_id == "mariadb":
        root = service_root("mariadb")
        installed = any((root / path).exists() for path in ("bin/mariadbd", "sbin/mariadbd", "usr/sbin/mariadbd"))
        running = _running(root / "run/mariadbd.pid") or _running(root / "run/mysqld.pid")
    elif service_id == "mongodb":
        root = service_root("mongodb")
        installed = (root / "bin/mongod").exists()
        running = _running(root / "run/mongod.pid")
    elif service_id == "redis":
        root = service_root("redis")
        installed = (root / "usr/bin/redis-server").exists() or (root / "bin/redis-server").exists()
        running = _running(root / "run/redis.pid")
    else:
        binary = binary_path(service_id)
        installed = binary.exists()
        running = False
    return {"id": engine_id, **definition, "installed": installed, "running": running, "status": "running" if running else "stopped" if installed else "not-installed"}


def _mysql_paths() -> tuple[Path, Path, Path]:
    root = service_root("mysql")
    return root / "bin/mysql", root / "run/mysql.sock", root / ".runtime-libraries"


def _mysql_environment(library_root: Path) -> dict[str, str]:
    environment = os.environ.copy()
    if library_root.exists():
        directories = [library_root, *[path for path in library_root.rglob("*") if path.is_dir()]]
        environment["LD_LIBRARY_PATH"] = ":".join(str(path) for path in directories)
    return environment


def _database_backup_frequency(database_name: str) -> str:
    scheduler = cron_service_module.cron_service
    if scheduler is None:
        return "manual"
    job = next((item for item in scheduler.list() if item.get("name") == f"Backup database: {database_name}" and item.get("enabled")), None)
    if not job:
        return "manual"
    return "weekly" if job.get("weekday") == "0" else "daily"


def _mysql_query(sql: str) -> list[list[str]]:
    client, socket, library_root = _mysql_paths()
    if not client.exists():
        raise RuntimeError("MySQL is not installed")
    if not socket.exists():
        raise RuntimeError("MySQL is installed but stopped")
    result = subprocess.run([str(client), "--protocol=SOCKET", f"--socket={socket}", "-uroot", "--batch", "--raw", "--skip-column-names", "-e", sql], capture_output=True, text=True, check=False, env=prepare_mysql_runtime(service_root("mysql")), timeout=8)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout).strip() or "MySQL query failed")
    return [line.split("\t") for line in result.stdout.splitlines() if line.strip()]


def _mariadb_query(sql: str) -> list[list[str]]:
    root = service_root("mariadb")
    client = next((candidate for candidate in (root / "bin/mariadb", root / "bin/mysql", root / "usr/bin/mariadb") if candidate.exists()), None)
    socket = next((candidate for candidate in (root / "run/mariadb.sock", root / "run/mysqld.sock") if candidate.exists()), root / "run/mariadb.sock")
    if client is None:
        raise RuntimeError("MariaDB is not installed")
    if not socket.exists():
        raise RuntimeError("MariaDB is installed but stopped")
    result = subprocess.run([str(client), "--protocol=SOCKET", f"--socket={socket}", "-uroot", "--batch", "--raw", "--skip-column-names", "-e", sql], capture_output=True, text=True, check=False, env=prepare_mysql_runtime(root), timeout=8)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout).strip() or "MariaDB query failed")
    return [line.split("\t") for line in result.stdout.splitlines() if line.strip()]


@router.get("/engines")
def engines(user=Depends(require_user)):
    return [_engine_state(engine_id) for engine_id in ENGINE_SERVICES]


@router.get("")
def list_databases(engine: str | None = None, user=Depends(require_user)):
    selected = engine or "all"
    states = {item["id"] if "id" in item else item["service_id"]: item for item in [_engine_state(engine_id) for engine_id in ENGINE_SERVICES]}
    if selected != "all" and selected not in ENGINE_SERVICES:
        raise HTTPException(status_code=404, detail="Database engine is not supported")
    if selected != "all" and not states[selected]["installed"]:
        return {"engine": selected, "engine_state": states[selected], "databases": []}
    if selected not in {"all", "mysql", "mariadb"}:
        return {"engine": selected, "engine_state": states[selected], "databases": []}
    active_engine = selected if selected in {"mysql", "mariadb"} else "mysql"
    if not states[active_engine]["installed"] or not states[active_engine]["running"]:
        return {"engine": selected, "engine_state": states[active_engine], "databases": []}
    try:
        query = "SELECT s.SCHEMA_NAME, COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) FROM INFORMATION_SCHEMA.SCHEMATA s LEFT JOIN INFORMATION_SCHEMA.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME WHERE s.SCHEMA_NAME NOT IN ('information_schema','mysql','performance_schema','sys') GROUP BY s.SCHEMA_NAME ORDER BY s.SCHEMA_NAME"
        rows = _mysql_query(query) if active_engine == "mysql" else _mariadb_query(query)
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        return {"engine": selected, "engine_state": states[active_engine], "databases": [], "error": str(error)}
    databases = []
    for row in rows:
        saved = database_credentials.public_for(active_engine, row[0])
        database = {
            "id": f"{active_engine}:{row[0]}",
            "name": row[0],
            "engine": active_engine,
            "username": saved["username"] if saved else "—",
            "credentials_saved": bool(saved),
            "backup": _database_backup_frequency(row[0]),
            "status": "Ready",
            "size": int(row[1] or 0),
            "location": "localhost",
        }
        resource_id = f"{active_engine}:{row[0]}"
        owned = account_isolation.filter_owned(user, "database", [resource_id])
        if owned is None or resource_id in owned:
            databases.append(database)
    return {"engine": selected, "engine_state": states[active_engine], "databases": databases}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_database(payload: DatabaseCreateRequest, user=Depends(require_user)):
    account_isolation.assert_quota(user, "database")
    account = account_isolation.account_for_user(user)
    if account:
        prefix = f"{account['username']}_"
        if not payload.name.startswith(prefix) or not payload.username.startswith(prefix):
            raise HTTPException(status_code=422, detail=f"Database and database user names must start with {prefix} for this hosting account.")
    if payload.engine not in {"mysql", "mariadb"}:
        raise HTTPException(status_code=400, detail="Database creation currently supports MySQL and MariaDB")
    state = _engine_state(payload.engine)
    if not state["installed"]:
        raise HTTPException(status_code=400, detail=f"{ENGINE_SERVICES[payload.engine]['name']} is not installed")
    if not state["running"]:
        raise HTTPException(status_code=400, detail=f"{ENGINE_SERVICES[payload.engine]['name']} is installed but stopped")
    if payload.backup != "manual" and cron_service_module.cron_service is None:
        raise HTTPException(status_code=503, detail="Cron scheduler is not ready")
    if payload.backup != "manual":
        account_isolation.assert_quota(user, "cron")
    database = payload.name.replace("`", "``")
    username = payload.username.replace("`", "``")
    password = payload.password.replace("'", "''")
    query = f"CREATE DATABASE IF NOT EXISTS `{database}` CHARACTER SET {payload.charset}; CREATE USER IF NOT EXISTS '{username}'@'localhost' IDENTIFIED BY '{password}'; ALTER USER '{username}'@'localhost' IDENTIFIED BY '{password}'; GRANT ALL PRIVILEGES ON `{database}`.* TO '{username}'@'localhost'; FLUSH PRIVILEGES;"
    (_mysql_query if payload.engine == "mysql" else _mariadb_query)(query)
    database_credentials.save(payload.engine, payload.name, payload.username, payload.password)
    account_isolation.claim(user, "database", f"{payload.engine}:{payload.name}", check_quota=False)
    backup_job = _ensure_database_backup_job(payload.name, payload.backup) if payload.engine == "mysql" else None
    if backup_job:
        account_isolation.claim(user, "cron", backup_job["id"], check_quota=False)
    return {"created": True, "database": {"id": f"{payload.engine}:{payload.name}", "name": payload.name, "engine": payload.engine, "username": payload.username, "backup": payload.backup, "status": "Ready", "size": 0, "location": "localhost"}, "backup_job": backup_job}


@router.post("/{engine}/import", status_code=status.HTTP_202_ACCEPTED)
async def import_database(
    engine: str,
    file: UploadFile = File(...),
    target_database: str = Form(""),
    user=Depends(require_user),
):
    if engine not in ENGINE_SERVICES:
        raise HTTPException(status_code=404, detail="Database engine is not supported")
    if engine != "mysql":
        raise HTTPException(status_code=400, detail=f"{ENGINE_SERVICES[engine]['name']} imports are not available yet.")
    if target_database and not re.fullmatch(r"[A-Za-z0-9_$-]{1,64}", target_database):
        raise HTTPException(status_code=422, detail="The target database name is invalid.")
    if user.get("role") == "hosting_account":
        if not target_database:
            raise HTTPException(status_code=422, detail="A hosting account must choose one of its owned databases for import.")
        account_isolation.assert_access(user, "database", f"{engine}:{target_database}")
    original_name = Path(file.filename or "database.sql").name
    extension = original_name.lower()
    supported = (".sql", ".sql.gz", ".zip", ".tar", ".tar.gz", ".tgz")
    if not extension.endswith(supported):
        raise HTTPException(status_code=422, detail="MySQL imports accept .sql, .sql.gz, .zip, .tar, .tar.gz, and .tgz files.")
    import_root = Path(os.getenv("SE_BACKUP_ROOT", "/server-engine/backups")) / "imports"
    import_root.mkdir(parents=True, exist_ok=True)
    try:
        account = __import__("pwd").getpwnam("serverengine")
        os.chown(import_root, account.pw_uid, account.pw_gid)
    except (KeyError, OSError):
        pass
    job_id = f"database-import-{uuid.uuid4().hex}"
    source = import_root / f"{job_id}-{original_name}"
    try:
        with source.open("wb") as destination:
            shutil.copyfileobj(file.file, destination)
        try:
            account = __import__("pwd").getpwnam("serverengine")
            os.chown(source, account.pw_uid, account.pw_gid)
        except (KeyError, OSError):
            pass
    finally:
        await file.close()
    job = job_store.enqueue_database_import(job_id, engine, source, original_name, target_database)
    return {"queued": True, "job": job.model_dump(mode="json")}


@router.get("/{engine}/{database_name}/credentials")
def database_credentials_for_copy(engine: str, database_name: str, user=Depends(require_user)):
    if engine not in {"mysql", "mariadb"}:
        raise HTTPException(status_code=400, detail="Credential copy currently supports MySQL and MariaDB only")
    account_isolation.assert_access(user, "database", f"{engine}:{database_name}")
    saved = database_credentials.secret_for(engine, database_name)
    if not saved:
        raise HTTPException(status_code=404, detail="No saved panel credentials exist for this database")
    return {"engine": engine, "database": database_name, **saved}


def _ensure_database_backup_job(database_name: str, frequency: str):
    scheduler = cron_service_module.cron_service
    if frequency == "manual" or scheduler is None:
        return None
    command = backup_service._schedule_command({
        "scope": "database",
        "destination": "local",
        "compression": "balanced",
        "target_type": "database",
        "target_id": database_name,
    })
    job_name = f"Backup database: {database_name}"
    values = {
        "name": job_name,
        "group": "Backup",
        "owner": "serverengine",
        "minute": "0",
        "hour": "2",
        "day": "*",
        "month": "*",
        "weekday": "0" if frequency == "weekly" else "*",
        "command": command,
        "enabled": True,
    }
    existing = next((job for job in scheduler.list() if job["name"] == job_name), None)
    if existing:
        return scheduler.update(existing["id"], CronJobRequest(**values))
    return scheduler.create(CronJobRequest(**values))


@router.post("/{engine}/{database_name}/backup-job")
def create_backup_job(engine: str, database_name: str, user=Depends(require_user)):
    account_isolation.assert_access(user, "database", f"{engine}:{database_name}")
    if engine != "mysql":
        raise HTTPException(status_code=400, detail="MariaDB backup schedules are not available yet; use a manual backup from the Backup page.")
    if cron_service_module.cron_service is None:
        raise HTTPException(status_code=503, detail="Cron scheduler is not ready")
    job = _ensure_database_backup_job(database_name, "daily")
    return {"created": True, "job": job}
