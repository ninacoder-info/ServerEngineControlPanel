from __future__ import annotations

import json
import os
import pwd
import re
import base64
import shutil
import subprocess
import tarfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock, Thread

from app.services.job_service import job_store
from app.services.website_service import website_service


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class BackupService:
    def __init__(self) -> None:
        state = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        self.state_path = state / "backups.json"
        self.root = Path(os.getenv("SE_BACKUP_ROOT", "/server-engine/backups"))
        self.config_path = state / "backup-config.json"
        self._lock = RLock()
        self._migrate_legacy_root()

    def _migrate_legacy_root(self) -> None:
        """Keep older installations usable after the fixed backup path change."""
        legacy = Path("/var/lib/server-engine/backups")
        if legacy == self.root or not legacy.exists():
            return
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            for item in legacy.iterdir():
                target = self.root / item.name
                if target.exists():
                    continue
                shutil.move(str(item), str(target))
        except OSError:
            # The panel can still operate with the new location if migration
            # is temporarily blocked by permissions or a read-only disk.
            return

    def _read(self) -> list[dict]:
        if not self.state_path.exists():
            return []
        try:
            value = json.loads(self.state_path.read_text())
            return value if isinstance(value, list) else []
        except (OSError, json.JSONDecodeError):
            return []

    def _write(self, entries: list[dict]) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(entries, indent=2) + "\n")
        self._chown_path(temporary)
        temporary.replace(self.state_path)
        self._chown_path(self.state_path)

    def list(self) -> list[dict]:
        with self._lock:
            return self._read()

    def read_config(self) -> dict:
        default = {
            "local_root": str(self.root),
            "compression": "balanced",
            "retain_local": True,
            "destinations": [],
        }
        if not self.config_path.exists():
            return default
        try:
            stored = json.loads(self.config_path.read_text())
            return {**default, **stored, "local_root": str(self.root), "destinations": stored.get("destinations", [])}
        except (OSError, json.JSONDecodeError):
            return default

    def save_config(self, payload: dict) -> dict:
        compression = payload.get("compression", "balanced")
        if compression not in {"fast", "balanced", "maximum"}:
            raise ValueError("Unsupported compression profile")
        local_root = str(self.root)
        destinations = payload.get("destinations", [])
        if not isinstance(destinations, list) or len(destinations) > 20:
            raise ValueError("Backup destinations are invalid")
        clean = {"local_root": local_root, "compression": compression, "retain_local": bool(payload.get("retain_local", True)), "destinations": []}
        existing = {
            item.get("id"): item
            for item in self.read_config().get("destinations", [])
            if item.get("id")
        }
        for item in destinations:
            if not isinstance(item, dict) or item.get("type") not in {"s3", "sftp"}:
                raise ValueError("Unsupported backup destination")
            profile = {key: str(item.get(key, "")).strip() for key in ("id", "name", "type", "endpoint", "region", "bucket", "prefix", "access_key_id", "secret_access_key", "host", "port", "username", "remote_path", "private_key")}
            previous = existing.get(profile["id"], {})
            for secret in ("secret_access_key", "private_key"):
                if not profile[secret]:
                    profile[secret] = str(previous.get(secret, ""))
            if not profile["id"] or not profile["name"]:
                raise ValueError("Each destination needs a name")
            if profile["type"] == "s3" and not all(profile[key] for key in ("endpoint", "region", "bucket", "access_key_id", "secret_access_key")):
                raise ValueError("S3 destination requires endpoint, region, bucket, access key, and secret key")
            if profile["type"] == "sftp" and not all(profile[key] for key in ("host", "port", "username", "remote_path", "private_key")):
                raise ValueError("SFTP destination requires host, port, username, remote path, and private key")
            clean["destinations"].append(profile)
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.config_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(clean, indent=2) + "\n")
        self._chown_path(temporary)
        os.chmod(temporary, 0o600)
        temporary.replace(self.config_path)
        self._chown_path(self.config_path)
        os.chmod(self.config_path, 0o600)
        return self._public_config(clean)

    @staticmethod
    def _public_config(config: dict) -> dict:
        destinations = []
        for item in config.get("destinations", []):
            destinations.append({key: value for key, value in item.items() if key not in {"secret_access_key", "private_key"}})
        return {**config, "destinations": destinations}

    def test_destination(self, payload: dict) -> dict:
        destination = payload if payload.get("type") else next((item for item in self.read_config()["destinations"] if item.get("id") == payload.get("id")), None)
        if not destination:
            raise ValueError("Backup destination was not found")
        if destination.get("type") == "s3":
            try:
                import boto3
                client = boto3.client("s3", endpoint_url=destination["endpoint"], region_name=destination["region"], aws_access_key_id=destination["access_key_id"], aws_secret_access_key=destination["secret_access_key"])
                client.head_bucket(Bucket=destination["bucket"])
            except Exception as error:
                raise ValueError(f"S3 connection failed: {str(error)[:500]}") from error
            return {"ok": True, "message": "S3 bucket connection verified."}
        if destination.get("type") == "sftp":
            if not shutil.which("sftp"):
                raise ValueError("The sftp client is not installed on this server")
            private_key = destination.get("private_key", "")
            temporary_key = None
            try:
                if "BEGIN " in private_key:
                    temporary_key = Path(f"/tmp/server-engine-sftp-{uuid.uuid4().hex}")
                    temporary_key.write_text(private_key)
                    os.chmod(temporary_key, 0o600)
                    key_path = str(temporary_key)
                else:
                    key_path = private_key
                target = f"{destination['username']}@{destination['host']}:{destination['remote_path']}"
                result = subprocess.run(
                    ["sftp", "-q", "-oBatchMode=yes", "-oStrictHostKeyChecking=accept-new", "-oConnectTimeout=15", "-i", key_path, "-P", destination["port"], target],
                    input="pwd\n",
                    capture_output=True,
                    text=True,
                    timeout=20,
                    check=False,
                )
                if result.returncode:
                    detail = (result.stderr or result.stdout or "connection failed").strip()
                    raise ValueError(f"SFTP connection failed: {detail[:500]}")
            except subprocess.TimeoutExpired as error:
                raise ValueError("SFTP connection timed out") from error
            finally:
                if temporary_key:
                    temporary_key.unlink(missing_ok=True)
            return {"ok": True, "message": "SFTP destination connection verified."}
        raise ValueError("Unsupported backup destination")

    def delete(self, backup_id: str) -> bool:
        with self._lock:
            entries = self._read()
            entry = next((item for item in entries if item.get("id") == backup_id), None)
            if entry is None:
                return False
            archive_path = Path(entry.get("archive_path", ""))
            if archive_path:
                resolved = archive_path.resolve()
                root = self.root.resolve()
                if root in resolved.parents and resolved.is_file():
                    resolved.unlink()
            self._write([item for item in entries if item.get("id") != backup_id])
            return True

    @staticmethod
    def _account() -> tuple[int, int]:
        try:
            account = pwd.getpwnam("serverengine")
        except KeyError as error:
            raise RuntimeError("The serverengine service account is required for backups") from error
        return account.pw_uid, account.pw_gid

    def _chown_path(self, path: Path) -> None:
        if path.is_symlink():
            return
        uid, gid = self._account()
        os.chown(path, uid, gid)

    def _chown_tree(self, root: Path) -> None:
        self._chown_path(root)
        for directory, directories, files in os.walk(root, followlinks=False):
            for name in (*directories, *files):
                self._chown_path(Path(directory) / name)

    def create(
        self,
        scope: str,
        destination: str,
        compression: str,
        target_type: str = "all",
        target_id: str | None = None,
        asynchronous: bool = True,
    ) -> dict:
        if destination != "local":
            raise ValueError("Only local backup storage is available in the Overview tab")
        if scope not in {"server", "websites", "panel", "database"}:
            raise ValueError("Unsupported backup scope")
        if compression not in {"fast", "balanced", "maximum"}:
            raise ValueError("Unsupported compression profile")
        target = self._resolve_target(scope, target_type, target_id)
        backup_id = str(uuid.uuid4())
        target_label = target.get("name", "server")
        entry = {
            "id": backup_id,
            "name": f"{target_label}-backup-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
            "scope": scope,
            "target_type": target["type"],
            "target_id": target.get("id"),
            "target_name": target_label,
            "target_path": target.get("path", ""),
            "database_name": target.get("database_name", ""),
            "destination": "Local storage",
            "size": 0,
            "created": _now(),
            "status": "Queued",
            "verified": False,
            "archive_path": "",
            "job_id": backup_id,
            "logs": [],
        }
        with self._lock:
            entries = self._read()
            self._write([entry, *entries])
        job_store.create(backup_id, f"Create {target_label} backup")
        if asynchronous:
            Thread(target=job_store._run_serialized, args=(self._run, backup_id, entry, compression), daemon=True).start()
        else:
            job_store._run_serialized(self._run, backup_id, entry, compression)
        return entry

    @staticmethod
    def _schedule_command(config: dict) -> str:
        encoded = base64.urlsafe_b64encode(json.dumps(config, separators=(",", ":")).encode()).decode()
        return f"serverengine-backup://{encoded}"

    @staticmethod
    def schedule_config(command: str) -> dict | None:
        prefix = "serverengine-backup://"
        if not command.startswith(prefix):
            return None
        try:
            return json.loads(base64.urlsafe_b64decode(command[len(prefix):]).decode())
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            return None

    def run_scheduled(self, config: dict) -> dict:
        entry = self.create(
            config.get("scope", "websites"),
            config.get("destination", "local"),
            config.get("compression", "balanced"),
            config.get("target_type", "all"),
            config.get("target_id"),
            asynchronous=False,
        )
        return next(item for item in self.list() if item["id"] == entry["id"])

    def _resolve_target(self, scope: str, target_type: str, target_id: str | None) -> dict:
        if target_type in {"all", "server"}:
            return {"type": "all", "name": scope}
        if target_type == "website":
            if scope != "websites" or not target_id:
                raise ValueError("A website backup requires a website target")
            site = website_service.get(target_id)
            if site is None:
                raise ValueError("Website target was not found")
            database_name = site.database_name if site.database_enabled else ""
            if database_name and not re.fullmatch(r"[A-Za-z0-9_$-]{1,64}", database_name):
                raise ValueError("The website database name is invalid")
            return {
                "type": "website",
                "id": site.id,
                "name": site.domain,
                "path": site.project_path or site.document_root,
                "database_name": database_name,
            }
        if target_type == "database":
            if scope != "database" or not target_id or not re.fullmatch(r"[A-Za-z0-9_$-]{1,64}", target_id):
                raise ValueError("A database backup requires a valid database name")
            return {"type": "database", "id": target_id, "name": target_id, "database_name": target_id}
        raise ValueError("Unsupported backup target")

    def _update_entry(self, backup_id: str, **changes) -> dict:
        with self._lock:
            entries = self._read()
            current = next(item for item in entries if item["id"] == backup_id)
            current.update(changes)
            self._write(entries)
            return current

    def _log(self, backup_id: str, message: str) -> None:
        with self._lock:
            entries = self._read()
            current = next(item for item in entries if item["id"] == backup_id)
            current.setdefault("logs", []).append(f"{_now()} {message}")
            self._write(entries)
        job_store._update(backup_id, log=[message])

    def _sources(self, scope: str, entry: dict) -> list[tuple[Path, str]]:
        state = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine"))
        web_root = Path(os.getenv("SE_WEB_ROOT", "/server-engine/www"))
        if scope == "websites" and entry.get("target_type") == "website":
            return [(Path(entry["target_path"]), f"websites/{entry['target_name']}")]
        if scope == "websites":
            return [(web_root, "websites")]
        if scope == "panel":
            return [(state, "panel-state")]
        if scope == "server":
            return [(web_root, "websites"), (state, "panel-state")]
        return []

    def _database_dump(
        self,
        staging: Path,
        backup_id: str,
        database_name: str = "",
        best_effort: bool = False,
    ) -> list[tuple[Path, str]]:
        """Dump available engines independently; full backups are best-effort."""
        dumps: list[tuple[Path, str]] = []
        service_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services"))
        database_dir = staging / "databases"
        database_dir.mkdir(parents=True, exist_ok=True)

        mysql_candidates = (
            ("MySQL", service_root / "mysql/bin/mysqldump", service_root / "mysql/run/mysql.sock"),
            ("MariaDB", service_root / "mariadb/bin/mariadb-dump", service_root / "mariadb/run/mariadb.sock"),
            ("MySQL", Path("/usr/bin/mysqldump"), Path("/var/run/mysqld/mysqld.sock")),
            ("MariaDB", Path("/usr/bin/mariadb-dump"), Path("/run/mysqld/mysqld.sock")),
        )
        if database_name:
            # A named database belongs to one engine. Do not continue through
            # unrelated MariaDB/MySQL candidates after dumping it; a stopped
            # second engine must not turn a successful targeted backup into a
            # failure.
            selected = next((candidate for candidate in mysql_candidates if candidate[1].exists()), None)
            mysql_candidates = (selected,) if selected else ()
        seen = set()
        for engine, binary, socket in mysql_candidates:
            if not binary.exists() or (str(binary), str(socket)) in seen:
                continue
            seen.add((str(binary), str(socket)))
            if not socket.exists():
                if best_effort:
                    self._log(backup_id, f"Skipped {engine} backup: socket {socket} was not found (the service may be stopped)")
                    continue
                raise RuntimeError(f"{engine} backup could not connect: socket {socket} was not found")
            if database_name:
                database_names = [database_name]
            else:
                client_candidates = (
                    service_root / ("mysql/bin/mysql" if engine == "MySQL" else "mariadb/bin/mariadb"),
                    service_root / ("mysql/bin/mariadb" if engine == "MySQL" else "mariadb/bin/mysql"),
                    Path("/usr/bin/mysql" if engine == "MySQL" else "/usr/bin/mariadb"),
                )
                client = next((candidate for candidate in client_candidates if candidate.exists()), None)
                if client is None:
                    message = "the database client was not found to enumerate databases"
                    if not best_effort:
                        raise RuntimeError(f"{engine} backup failed: {message}")
                    self._log(backup_id, f"Skipped {engine} backup: {message}")
                    continue
                self._log(backup_id, f"$ {client} --socket={socket} -uroot -e 'SHOW DATABASES'")
                result = subprocess.run([str(client), f"--socket={socket}", "-uroot", "--batch", "--skip-column-names", "-e", "SHOW DATABASES"], capture_output=True, text=True, check=False, timeout=60)
                if result.returncode != 0:
                    message = result.stderr.strip()[-1000:] or "the database service did not return an error message"
                    if not best_effort:
                        raise RuntimeError(f"{engine} database listing failed: {message}")
                    self._log(backup_id, f"Skipped {engine} backup: could not list databases ({message})")
                    continue
                database_names = [
                    name.strip()
                    for name in result.stdout.splitlines()
                    if re.fullmatch(r"[A-Za-z0-9_$-]{1,64}", name.strip())
                    and name.strip().lower() not in {"information_schema", "mysql", "performance_schema", "sys"}
                ]
            if not database_names:
                self._log(backup_id, f"Skipped {engine} backup: no application databases were found")
                continue
            engine_directory = database_dir / engine.lower()
            engine_directory.mkdir(parents=True, exist_ok=True)
            for name in database_names:
                output = engine_directory / f"{name}.sql"
                database_args = ["--databases", name]
                self._log(backup_id, f"$ {binary} --socket={socket} --databases {name} --single-transaction --routines --triggers --events")
                with output.open("w") as stream:
                    result = subprocess.run([str(binary), f"--socket={socket}", "-uroot", *database_args, "--single-transaction", "--routines", "--triggers", "--events"], stdout=stream, stderr=subprocess.PIPE, text=True, check=False, timeout=1800)
                if result.returncode == 0:
                    dumps.append((output, f"databases/{engine.lower()}/{name}.sql"))
                    continue
                output.unlink(missing_ok=True)
                message = result.stderr.strip()[-1000:] or "the database service did not return an error message"
                if not best_effort:
                    raise RuntimeError(f"{engine} database {name} dump failed: {message}")
                self._log(backup_id, f"Skipped {engine} database {name}: could not connect ({message})")

        pg_dumpall = next((candidate for candidate in (service_root / "postgresql/bin/pg_dumpall", Path("/usr/bin/pg_dumpall")) if candidate.exists()), None)
        if pg_dumpall and not database_name:
            output = database_dir / "postgresql-all.sql"
            self._log(backup_id, f"$ {pg_dumpall} --clean --if-exists")
            with output.open("w") as stream:
                result = subprocess.run([str(pg_dumpall), "--clean", "--if-exists"], stdout=stream, stderr=subprocess.PIPE, text=True, check=False, timeout=1800)
            if result.returncode == 0:
                dumps.append((output, "databases/postgresql-all.sql"))
            else:
                output.unlink(missing_ok=True)
                message = result.stderr.strip()[-1000:] or "the database service did not return an error message"
                if not best_effort:
                    raise RuntimeError(f"PostgreSQL dump failed: {message}")
                self._log(backup_id, f"Skipped PostgreSQL backup: could not connect ({message})")

        if not database_name:
            mongodb = next((candidate for candidate in (service_root / "mongodb/bin/mongodump", Path("/usr/bin/mongodump")) if candidate.exists()), None)
            if mongodb:
                output = database_dir / "mongodb.archive.gz"
                self._log(backup_id, f"$ {mongodb} --host 127.0.0.1 --port 27017 --archive={output} --gzip")
                result = subprocess.run([str(mongodb), "--host", "127.0.0.1", "--port", "27017", f"--archive={output}", "--gzip"], capture_output=True, text=True, check=False, timeout=1800)
                if result.returncode == 0:
                    dumps.append((output, "databases/mongodb.archive.gz"))
                else:
                    output.unlink(missing_ok=True)
                    message = (result.stderr or result.stdout).strip()[-1000:] or "the database service did not return an error message"
                    if not best_effort:
                        raise RuntimeError(f"MongoDB dump failed: {message}")
                    self._log(backup_id, f"Skipped MongoDB backup: could not connect ({message})")

            redis = next((candidate for candidate in (service_root / "redis/bin/redis-cli", service_root / "valkey/bin/valkey-cli", Path("/usr/bin/redis-cli"), Path("/usr/bin/valkey-cli")) if candidate.exists()), None)
            if redis:
                output = database_dir / "redis.rdb"
                self._log(backup_id, f"$ {redis} -h 127.0.0.1 -p 6379 --rdb {output}")
                result = subprocess.run([str(redis), "-h", "127.0.0.1", "-p", "6379", "--rdb", str(output)], capture_output=True, text=True, check=False, timeout=1800)
                if result.returncode == 0:
                    dumps.append((output, "databases/redis.rdb"))
                else:
                    output.unlink(missing_ok=True)
                    message = (result.stderr or result.stdout).strip()[-1000:] or "the database service did not return an error message"
                    if not best_effort:
                        raise RuntimeError(f"Redis backup failed: {message}")
                    self._log(backup_id, f"Skipped Redis backup: could not connect ({message})")

        if not dumps and not best_effort:
            raise RuntimeError("No usable MySQL, MariaDB, or PostgreSQL backup CLI was found")
        if not dumps and best_effort:
            self._log(backup_id, "No supported database service was available; continuing without database dumps")
        return dumps

    def _copy_source(self, source: Path, destination: Path) -> None:
        """Copy a source tree without copying the backup directory into itself."""
        backup_root = self.root.resolve()

        def ignore_backup_tree(directory: str, names: list[str]) -> list[str]:
            ignored = []
            current = Path(directory)
            for name in names:
                candidate = (current / name).resolve()
                if candidate == backup_root or backup_root in candidate.parents:
                    ignored.append(name)
            return ignored

        shutil.copytree(source, destination, dirs_exist_ok=True, ignore=ignore_backup_tree)

    def _run(self, job_id: str, entry: dict, compression: str) -> None:
        staging = self.root / f".staging-{job_id}"
        archive = self.root / f"{entry['name']}.tar.gz"
        try:
            self._update_entry(job_id, status="Running")
            job_store._update(job_id, status="running", progress=5, message="Preparing local backup…")
            self.root.mkdir(parents=True, exist_ok=True)
            self._chown_path(self.root)
            staging.mkdir(parents=True, exist_ok=False)
            self._chown_path(staging)
            self._log(job_id, f"Backup scope: {entry['scope']}")
            sources = self._sources(entry["scope"], entry)
            if entry["scope"] == "database":
                self._database_dump(staging, job_id, entry.get("database_name", ""), best_effort=False)
            else:
                for source, label in sources:
                    if not source.exists():
                        raise RuntimeError(f"Backup source does not exist: {source}")
                    self._log(job_id, f"Including {label}: {source}")
                    destination = staging / label
                    self._copy_source(source, destination)
                if entry["scope"] in {"websites", "server"}:
                    try:
                        self._database_dump(staging, job_id, entry.get("database_name", ""), best_effort=True)
                    except RuntimeError:
                        raise
            manifest = staging / "manifest.json"
            manifest.write_text(json.dumps({"name": entry["name"], "scope": entry["scope"], "created": entry["created"]}, indent=2) + "\n")
            self._chown_tree(staging)
            level = {"fast": 1, "balanced": 6, "maximum": 9}[compression]
            job_store._update(job_id, progress=45, message="Writing compressed archive…")
            self._log(job_id, f"$ tar -czf {archive} (gzip level {level})")
            with tarfile.open(archive, mode="w:gz", compresslevel=level) as tar:
                for item in staging.iterdir():
                    tar.add(item, arcname=item.name, recursive=True)
            self._chown_path(archive)
            self._log(job_id, "Verifying archive contents")
            with tarfile.open(archive, mode="r:gz") as tar:
                if not tar.getmembers():
                    raise RuntimeError("Backup archive is empty")
            size = archive.stat().st_size
            self._update_entry(job_id, size=size, status="Verified", verified=True, archive_path=str(archive), completed=_now())
            job_store._update(job_id, status="succeeded", progress=100, message=f"Backup verified: {archive} ({size} bytes)")
        except Exception as error:
            message = str(error)
            if len(message) > 4000:
                message = message[:4000] + "…"
            self._update_entry(job_id, status="Failed", verified=False, error=message, completed=_now())
            job_store._update(job_id, status="failed", message=message, progress=100)
        finally:
            shutil.rmtree(staging, ignore_errors=True)


backup_service = BackupService()
