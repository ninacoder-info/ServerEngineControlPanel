import re
import shlex
import os
import sqlite3
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.models.cron import CronJobRequest


FIELDS = ("minute", "hour", "day", "month", "weekday")
RANGES = {"minute": (0, 59), "hour": (0, 23), "day": (1, 31), "month": (1, 12), "weekday": (0, 7)}


def _now():
    return datetime.now(timezone.utc)


def _valid_part(value: str, low: int, high: int) -> bool:
    if value == "*":
        return True
    for item in value.split(","):
        base, _, step = item.partition("/")
        if step and (not step.isdigit() or int(step) < 1):
            return False
        if base == "*":
            continue
        if "-" in base:
            pieces = base.split("-")
            if len(pieces) != 2 or not all(piece.isdigit() for piece in pieces):
                return False
            numbers = [int(piece) for piece in pieces]
            if numbers[0] > numbers[1] or not all(low <= number <= high for number in numbers):
                return False
        elif base.isdigit() and low <= int(base) <= high:
            continue
        else:
            return False
    return True


def validate_schedule(values: dict) -> None:
    for field in FIELDS:
        value = str(values[field]).strip()
        if not value or not _valid_part(value, *RANGES[field]):
            raise ValueError(f"Invalid cron {field} field")


def schedule_text(job: dict) -> str:
    if job["minute"] == "*" and job["hour"] == "*":
        return "Every minute"
    if job["minute"].isdigit() and job["hour"] == "*" and job["day"] == "*" and job["month"] == "*" and job["weekday"] == "*":
        return f"Every hour at :{int(job['minute']):02d}"
    if job["minute"].isdigit() and job["hour"].isdigit() and job["day"] == "*" and job["month"] == "*" and job["weekday"] == "*":
        return f"Every day at {int(job['hour']):02d}:{int(job['minute']):02d}"
    if job["weekday"].isdigit() and job["minute"].isdigit() and job["hour"].isdigit():
        days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        return f"Every {days[int(job['weekday']) % 7]} at {int(job['hour']):02d}:{int(job['minute']):02d}"
    return "Custom schedule"


class CronService:
    def __init__(self, db_path: str):
        self.path = Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._execution_lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None
        self._setup()

    def connection(self):
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        return connection

    def _setup(self):
        with self.connection() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS cron_jobs (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, group_name TEXT NOT NULL,
                owner TEXT NOT NULL, minute TEXT NOT NULL, hour TEXT NOT NULL,
                day TEXT NOT NULL, month TEXT NOT NULL, weekday TEXT NOT NULL,
                command TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
                last_run_at TEXT, next_run_at TEXT, result TEXT NOT NULL DEFAULT 'success', last_output TEXT NOT NULL DEFAULT ''
            )""")
            db.execute("CREATE TABLE IF NOT EXISTS cron_scheduler_settings (id INTEGER PRIMARY KEY CHECK (id = 1), enabled INTEGER NOT NULL DEFAULT 1)")
            db.execute("INSERT OR IGNORE INTO cron_scheduler_settings(id, enabled) VALUES (1, 1)")
            db.execute("""CREATE TABLE IF NOT EXISTS cron_job_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL REFERENCES cron_jobs(id) ON DELETE CASCADE,
                started_at TEXT NOT NULL, finished_at TEXT NOT NULL, status TEXT NOT NULL,
                exit_code INTEGER, output TEXT NOT NULL DEFAULT ''
            )""")
            certbot = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "certbot/venv/bin/certbot"
            certbot_command = f"if [ ! -x {certbot} ]; then echo 'Certbot is not installed. Install Certbot before enabling certificate renewal.'; exit 127; fi; {certbot} renew --non-interactive"
            if db.execute("SELECT 1 FROM cron_jobs WHERE id = 'builtin-letsencrypt-renew'").fetchone() is None:
                db.execute("INSERT INTO cron_jobs (id,name,group_name,owner,minute,hour,day,month,weekday,command,email,enabled,result) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", ("builtin-letsencrypt-renew", "Renew Let's Encrypt certificates", "Security", "root", "0", "3", "*", "*", "*", certbot_command, "", 0, "success"))
            else:
                db.execute("UPDATE cron_jobs SET command = ? WHERE id = 'builtin-letsencrypt-renew'", (certbot_command,))

    @property
    def enabled(self):
        with self.connection() as db:
            row = db.execute("SELECT enabled FROM cron_scheduler_settings WHERE id = 1").fetchone()
        return bool(row["enabled"]) if row else True

    @property
    def running(self):
        return bool(self._thread and self._thread.is_alive() and not self._stop.is_set())

    def status(self):
        return {"running": self.running, "enabled_at_boot": self.enabled, "interval_seconds": 20}

    def set_enabled(self, enabled):
        with self.connection() as db:
            db.execute("UPDATE cron_scheduler_settings SET enabled = ? WHERE id = 1", (int(enabled),))
        if enabled and not self.running:
            self.start()
        if not enabled and self.running:
            self.stop()
        return self.status()

    def restart(self):
        self.stop()
        self.start()
        return self.status()

    def _row(self, row):
        if not row:
            return None
        item = dict(row)
        item["enabled"] = bool(item["enabled"])
        item["group"] = item.pop("group_name")
        item["schedule"] = " ".join(item[field] for field in FIELDS)
        item["human"] = schedule_text(item)
        item["last"] = item["last_run_at"] or "Never"
        item["next"] = item["next_run_at"] or ("Pending" if item["enabled"] else "Paused")
        return item

    def list(self):
        with self.connection() as db:
            return [self._row(row) for row in db.execute("SELECT * FROM cron_jobs ORDER BY name COLLATE NOCASE")]

    def get(self, job_id):
        with self.connection() as db:
            return self._row(db.execute("SELECT * FROM cron_jobs WHERE id = ?", (job_id,)).fetchone())

    def logs(self, job_id, limit=50):
        with self.connection() as db:
            rows = db.execute("SELECT id, job_id, started_at, finished_at, status, exit_code, output FROM cron_job_logs WHERE job_id = ? ORDER BY id DESC LIMIT ?", (job_id, min(max(int(limit), 1), 200))).fetchall()
        return [dict(row) for row in rows]

    def create(self, payload: CronJobRequest):
        values = payload.model_dump()
        validate_schedule(values)
        job_id = str(uuid.uuid4())
        with self.connection() as db:
            db.execute("INSERT INTO cron_jobs (id,name,group_name,owner,minute,hour,day,month,weekday,command,email,enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (job_id, values["name"], values["group"], values["owner"], *(values[field] for field in FIELDS), values["command"], values["email"], int(values["enabled"])))
        return self.get(job_id)

    def update(self, job_id, payload: CronJobRequest):
        values = payload.model_dump()
        validate_schedule(values)
        with self.connection() as db:
            cursor = db.execute("UPDATE cron_jobs SET name=?,group_name=?,owner=?,minute=?,hour=?,day=?,month=?,weekday=?,command=?,email=?,enabled=? WHERE id=?", (values["name"], values["group"], values["owner"], *(values[field] for field in FIELDS), values["command"], values["email"], int(values["enabled"]), job_id))
            if cursor.rowcount == 0:
                return None
        return self.get(job_id)

    def delete(self, job_id):
        with self.connection() as db:
            cursor = db.execute("DELETE FROM cron_jobs WHERE id = ?", (job_id,))
        return cursor.rowcount > 0

    def toggle(self, job_id, enabled):
        with self.connection() as db:
            cursor = db.execute("UPDATE cron_jobs SET enabled=? WHERE id=?", (int(enabled), job_id))
        return cursor.rowcount > 0 and self.get(job_id)

    def run(self, job_id):
        job = self.get(job_id)
        if not job:
            return None
        threading.Thread(target=self._execute, args=(job_id,), daemon=True).start()
        return job

    def _execute(self, job_id):
        # Cron commands share the same serialized execution policy as panel jobs.
        # This prevents a manual run and a scheduled run from consuming the host
        # at the same time.
        with self._execution_lock:
            job = self.get(job_id)
            if not job:
                return
            started = _now().isoformat(timespec="seconds")
            try:
                from app.services.backup_service import backup_service

                backup_config = backup_service.schedule_config(job["command"])
                if backup_config is None and job.get("group") == "Backup" and job.get("name", "").startswith("Backup database: "):
                    # Migrate schedules created before database backups used
                    # the panel backup engine. Those shell commands could
                    # hide a failed mysqldump behind a successful chown.
                    database_name = job["name"][len("Backup database: "):]
                    backup_config = {
                        "scope": "database",
                        "destination": "local",
                        "compression": "balanced",
                        "target_type": "database",
                        "target_id": database_name,
                    }
                malware_target = None
                if job["command"].startswith("server-engine-malware-scan --target="):
                    malware_target = job["command"].split("=", 1)[1].strip()
                if malware_target in {"websites", "backups", "mail"}:
                    from app.services.job_service import job_store

                    malware_job = job_store.enqueue_malware_scan(f"malware-scheduled-{job_id}-{uuid.uuid4().hex[:8]}", malware_target)
                    output = f"Queued ClamAV scan job {malware_job.id} for {malware_target}."
                    process = None
                    exit_code = 0
                    result = "success"
                elif backup_config is not None:
                    backup = backup_service.run_scheduled(backup_config)
                    output = "\n".join(backup.get("logs", []))[-12000:]
                    if backup.get("error"):
                        output = f"{output}\n{backup['error']}".strip()
                    process = None
                    exit_code = 0 if backup.get("status") == "Verified" else 1
                    result = "success" if exit_code == 0 else "warning"
                else:
                    command = ["/bin/sh", "-lc", job["command"]]
                    if job["owner"] != "root":
                        command = ["/usr/sbin/runuser", "-u", job["owner"], "--", *command]
                    process = subprocess.run(command, capture_output=True, text=True, timeout=3600, check=False)
                    output = (process.stdout + process.stderr).strip()[-12000:]
                    exit_code = process.returncode
                    result = "success" if exit_code == 0 else "warning"
            except Exception as error:
                output = str(error)
                result = "warning"
                exit_code = None
            with self.connection() as db:
                db.execute("UPDATE cron_jobs SET last_run_at=?, result=?, last_output=? WHERE id=?", (started, result, output, job_id))
                db.execute("INSERT INTO cron_job_logs(job_id, started_at, finished_at, status, exit_code, output) VALUES (?, ?, ?, ?, ?, ?)", (job_id, started, _now().isoformat(timespec="seconds"), result, exit_code, output))
            try:
                from app.services.job_service import job_store
                job_store.publish({"type": "malware-schedule", "schedule_id": job_id})
            except Exception:
                pass

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="server-engine-cron", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        thread = self._thread
        if thread and thread is not threading.current_thread():
            thread.join(timeout=2)

    def _loop(self):
        seen = set()
        while not self._stop.wait(20):
            now = datetime.now()
            stamp = now.strftime("%Y-%m-%d %H:%M")
            for job in self.list():
                if job["enabled"] and stamp not in seen and self._matches(job, now):
                    self._execute(job["id"])
            seen = {stamp}

    @staticmethod
    def _matches(job, now):
        values = {"minute": now.minute, "hour": now.hour, "day": now.day, "month": now.month, "weekday": (now.weekday() + 1) % 7}
        for field in FIELDS:
            value = job[field]
            if value == "*":
                continue
            allowed = set()
            for item in value.split(","):
                base, _, step = item.partition("/")
                step = int(step or 1)
                if base == "*":
                    start, end = RANGES[field]
                elif "-" in base:
                    start, end = map(int, base.split("-"))
                else:
                    start = end = int(base)
                allowed.update(range(start, end + 1, step))
            if values[field] not in allowed:
                return False
        return True


cron_service = None


def configure_cron_service(db_path: str):
    global cron_service
    cron_service = CronService(db_path)
    return cron_service
