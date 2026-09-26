import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import require_user
from app.models.database import DatabaseCreateRequest
from app.services.service_runtime import binary_path, service_root

router = APIRouter(prefix="/api/v1/databases", tags=["databases"])

ENGINE_SERVICES = {
    "mysql": {"name": "MySQL", "description": "Relational database for common PHP and web applications.", "service_id": "mysql"},
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


def _mysql_query(sql: str) -> list[list[str]]:
    client, socket, library_root = _mysql_paths()
    if not client.exists():
        raise RuntimeError("MySQL is not installed")
    if not socket.exists():
        raise RuntimeError("MySQL is installed but stopped")
    result = subprocess.run([str(client), "--protocol=SOCKET", f"--socket={socket}", "-uroot", "--batch", "--raw", "--skip-column-names", "-e", sql], capture_output=True, text=True, check=False, env=_mysql_environment(library_root), timeout=8)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout).strip() or "MySQL query failed")
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
    if selected not in {"all", "mysql"}:
        return {"engine": selected, "engine_state": states[selected], "databases": []}
    if not states["mysql"]["installed"] or not states["mysql"]["running"]:
        return {"engine": selected, "engine_state": states["mysql"], "databases": []}
    try:
        rows = _mysql_query("SELECT s.SCHEMA_NAME, COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) FROM INFORMATION_SCHEMA.SCHEMATA s LEFT JOIN INFORMATION_SCHEMA.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME WHERE s.SCHEMA_NAME NOT IN ('information_schema','mysql','performance_schema','sys') GROUP BY s.SCHEMA_NAME ORDER BY s.SCHEMA_NAME")
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        return {"engine": selected, "engine_state": states["mysql"], "databases": [], "error": str(error)}
    databases = [{"id": f"mysql:{row[0]}", "name": row[0], "engine": "mysql", "username": "—", "backup": "manual", "status": "Ready", "size": int(row[1] or 0), "location": "localhost"} for row in rows]
    return {"engine": selected, "engine_state": states["mysql"], "databases": databases}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_database(payload: DatabaseCreateRequest, user=Depends(require_user)):
    if payload.engine != "mysql":
        raise HTTPException(status_code=400, detail="Database creation currently supports installed MySQL only")
    state = _engine_state("mysql")
    if not state["installed"]:
        raise HTTPException(status_code=400, detail="MySQL is not installed")
    if not state["running"]:
        raise HTTPException(status_code=400, detail="MySQL is installed but stopped")
    database = payload.name.replace("`", "``")
    username = payload.username.replace("`", "``")
    password = payload.password.replace("'", "''")
    _mysql_query(f"CREATE DATABASE IF NOT EXISTS `{database}`; CREATE USER IF NOT EXISTS '{username}'@'localhost' IDENTIFIED BY '{password}'; ALTER USER '{username}'@'localhost' IDENTIFIED BY '{password}'; GRANT ALL PRIVILEGES ON `{database}`.* TO '{username}'@'localhost'; FLUSH PRIVILEGES;")
    return {"created": True, "database": {"id": f"mysql:{payload.name}", "name": payload.name, "engine": "mysql", "username": payload.username, "backup": payload.backup, "status": "Ready", "size": 0, "location": "localhost"}}
