import asyncio
from datetime import datetime, timezone
import gzip
import json
import os
import pwd
import platform
import secrets
import tarfile
import urllib.error
import urllib.request
import re
import shutil
import shlex
import signal
import socket
import subprocess
import tempfile
import time
import uuid
import zipfile
from pathlib import Path
from threading import Event, Thread
from threading import Lock

from app.models.job import JobSummary
from app.models.website import Website, WebsiteUpdateRequest
from app.models.projects import NodeProject
from app.services.website_service import website_service
from app.services.service_catalog import apache_source_for, bind9_source_for, certbot_source_for, caddy_source_for, clamav_source_for, dovecot_source_for, ffmpeg_source_for, git_source_for, haproxy_source_for, imagemagick_source_for, lynis_source_for, mariadb_source_for, memcached_source_for, mongodb_prebuilt_for, mongodb_source_for, mysql_release_for, nginx_source_for, opensearch_source_for, openlitespeed_prebuilt_for, openlitespeed_source_for, openssl_source_for, php_source_for, postfix_source_for, powerdns_source_for, postgresql_source_for, prebuilt_package_for, python_asset_for, python_source_for, rabbitmq_source_for, redis_source_for, refresh_service_versions, rspamd_source_for, ruby_source_for, stalwart_prebuilt_for, stalwart_source_for, supervisor_source_for, unbound_source_for, valkey_source_for, vsftpd_source_for, wpcli_source_for
from app.services.service_runtime import PHP_BASELINE_MODULES, PHP_REQUIRED_EXTENSIONS, SERVICE_PACKAGES, binary_path, composer_path, enable_php_baseline_extensions, ensure_composer_cache, ensure_nginx_layout, ensure_node_runtime, ensure_php_fpm_layout, ensure_php_runtime_configuration, ensure_php_runtime_launcher, managed_library_environment, nginx_paths, normalize_php_runtime_layout, package_for, php_cli_path, php_fpm_paths, php_runtime_library_path, prepare_mongodb_runtime, prepare_mysql_runtime, prepare_postgresql_runtime, prepare_powerdns_runtime, service_root, startup_enabled, version_sort_key
from app.services.database_credentials import database_credentials


class InstallCancelled(Exception):
    pass


def _sanitize_apache_configuration(content: str) -> str:
    """Keep modules compiled into Apache out of generated configuration."""
    return re.sub(r"(?mi)^\s*LoadModule\s+unixd_module\s+[^\n]*(?:\n|$)", "", content)


def _persist_shared_library_tree(source: Path, service_id: str) -> None:
    """Keep runtime libraries required by dynamically loaded connectors."""
    target = service_root(service_id) / ".runtime-libraries"
    target.mkdir(parents=True, exist_ok=True)
    for directory in (source / "lib", source / "lib64", source / "usr/lib"):
        if directory.exists():
            destination = target / directory.relative_to(source)
            destination.mkdir(parents=True, exist_ok=True)
            # `copytree(..., dirs_exist_ok=True, symlinks=True)` still raises
            # when a repeated package extraction tries to recreate an
            # existing library symlink. Merge entries explicitly so connector
            # preparation is safe to repeat and can refresh an older library.
            for entry in directory.rglob("*"):
                relative = entry.relative_to(directory)
                output = destination / relative
                if entry.is_dir() and not entry.is_symlink():
                    output.mkdir(parents=True, exist_ok=True)
                    continue
                output.parent.mkdir(parents=True, exist_ok=True)
                if entry.is_symlink():
                    link_target = os.readlink(entry)
                    if output.is_symlink() and os.readlink(output) == link_target:
                        continue
                    if output.is_dir() and not output.is_symlink():
                        shutil.rmtree(output)
                    else:
                        output.unlink(missing_ok=True)
                    output.symlink_to(link_target)
                else:
                    if output.is_symlink():
                        output.unlink()
                    elif output.is_dir():
                        shutil.rmtree(output)
                    shutil.copy2(entry, output)


class JobStore:
    """Background installer queue for the local privileged control-plane process."""

    def __init__(self):
        self._jobs: dict[str, JobSummary] = {}
        self._cancel_events: dict[str, Event] = {}
        self._subscribers: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()
        self._lock = Lock()
        self._active_processes: dict[str, subprocess.Popen] = {}
        self._job_processes: dict[str, set[subprocess.Popen]] = {}
        # Installations, builds, package extraction, and service actions are
        # deliberately serialized. Running multiple privileged jobs at once
        # can corrupt the package database or exhaust the server while source
        # builds compete for CPU, memory, and disk.
        self._task_lock = Lock()
        self._extension_install_lock = Lock()

    def snapshot(self) -> list[dict]:
        with self._lock:
            return [job.model_dump(mode="json") for job in sorted(self._jobs.values(), key=lambda item: item.created_at, reverse=True)]

    def subscribe(self, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue):
        with self._lock:
            self._subscribers.add((loop, queue))

    def unsubscribe(self, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue):
        with self._lock:
            self._subscribers.discard((loop, queue))

    def _broadcast(self, job: JobSummary | None = None):
        payload = {"type": "job", "job": job.model_dump(mode="json")} if job else {"type": "snapshot", "jobs": self.snapshot()}
        with self._lock:
            subscribers = list(self._subscribers)
        for loop, queue in subscribers:
            loop.call_soon_threadsafe(queue.put_nowait, payload)

    def _broadcast_service_status(self, service_id: str, action: str, status: str, message: str = ""):
        payload = {
            "type": "service-status",
            "serviceId": service_id,
            "action": action,
            "status": status,
            "running": status == "succeeded" and action in {"start", "restart"},
            "message": message,
        }
        with self._lock:
            subscribers = list(self._subscribers)
        for loop, queue in subscribers:
            loop.call_soon_threadsafe(queue.put_nowait, payload)

    def publish(self, payload: dict):
        """Publish a small authenticated state event on the shared jobs socket."""
        with self._lock:
            subscribers = list(self._subscribers)
        for loop, queue in subscribers:
            loop.call_soon_threadsafe(queue.put_nowait, payload)

    def create(self, job_id: str, job_type: str) -> JobSummary:
        job = JobSummary(id=job_id, type=job_type, status="queued", created_at=datetime.now(timezone.utc))
        with self._lock:
            self._jobs[job_id] = job
            self._cancel_events[job_id] = Event()
        self._broadcast(job)
        return job

    def cancel(self, job_id: str) -> JobSummary | None:
        active_processes: list[subprocess.Popen] = []
        with self._lock:
            current = self._jobs.get(job_id)
            if current is None:
                return None
            if current.status in {"succeeded", "failed", "cancelled"}:
                return current
            event = self._cancel_events.get(job_id)
            if event:
                event.set()
            active_processes = list(self._job_processes.get(job_id, set()))
            if not active_processes:
                active_process = self._active_processes.get(job_id)
                if active_process is not None:
                    active_processes = [active_process]
            cancelled = current.model_copy(update={
                "status": "cancelled",
                "message": "Cancellation requested.",
                "updated_at": datetime.now(timezone.utc),
            })
            self._jobs[job_id] = cancelled
        for process in active_processes:
            self._terminate_process(process)
        self._broadcast(cancelled)
        return cancelled

    def _track_process(self, job_id: str, process: subprocess.Popen):
        with self._lock:
            self._job_processes.setdefault(job_id, set()).add(process)
            self._active_processes[job_id] = process

    def _untrack_process(self, job_id: str, process: subprocess.Popen):
        with self._lock:
            processes = self._job_processes.get(job_id)
            if processes is not None:
                processes.discard(process)
                if not processes:
                    self._job_processes.pop(job_id, None)
            if self._active_processes.get(job_id) is process:
                self._active_processes.pop(job_id, None)

    def _run_cancellable(self, job_id: str, command, **kwargs) -> subprocess.CompletedProcess:
        """Run a foreground command that can be stopped by job cancellation.

        A normal ``subprocess.run`` cannot be interrupted by ``cancel()``.
        Package-manager commands are deliberately started in their own process
        group so cancellation cannot leave apt/dpkg holding the serialized
        operation lock indefinitely.
        """
        check = kwargs.pop("check", False)
        kwargs.setdefault("stdout", subprocess.PIPE)
        kwargs.setdefault("stderr", subprocess.STDOUT)
        kwargs.setdefault("text", True)
        kwargs.setdefault("start_new_session", True)
        process = subprocess.Popen(command, **kwargs)
        self._track_process(job_id, process)
        try:
            output, _ = process.communicate()
        finally:
            self._untrack_process(job_id, process)
        self._raise_if_cancelled(job_id)
        result = subprocess.CompletedProcess(command, process.returncode, output, None)
        if check and result.returncode:
            raise subprocess.CalledProcessError(result.returncode, command, output=output)
        return result

    @staticmethod
    def _terminate_process(process: subprocess.Popen):
        """Stop a cancellable job process and its child process group."""
        if process.poll() is not None:
            return
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            try:
                process.terminate()
            except (ProcessLookupError, PermissionError, OSError):
                return
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                try:
                    process.kill()
                except (ProcessLookupError, PermissionError, OSError):
                    pass

    def _is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            event = self._cancel_events.get(job_id)
            return bool(event and event.is_set())

    def _raise_if_cancelled(self, job_id: str):
        if self._is_cancelled(job_id):
            raise InstallCancelled()

    def enqueue_install(self, job_id: str, service_id: str, requested_version: str, install_method: str = "prebuilt", php_version: str | None = None, composer_version: str | None = None) -> JobSummary:
        method_label = "Prebuilt package" if install_method == "prebuilt" else ("Official release" if service_id == "wp-cli" else "Build from source")
        job = self.create(job_id, f"Install {service_id} {requested_version} · {method_label}")
        Thread(target=self._run_serialized, args=(self._run_install, job_id, service_id, requested_version, install_method, php_version, composer_version), daemon=True).start()
        return job

    def enqueue_action(self, job_id: str, service_id: str, action: str, version: str | None = None) -> JobSummary:
        job = self.create(job_id, f"{action.title()} {service_id}" + (f" {version}" if version else ""))
        Thread(target=self._run_serialized, args=(self._run_action, job_id, service_id, action, version), daemon=True).start()
        return job

    def enqueue_email_mailbox_create(self, job_id: str, payload: dict) -> JobSummary:
        job = self.create(job_id, f"Create mailbox {payload.get('address', '')}".strip())
        Thread(target=self._run_serialized, args=(self._run_email_mailbox_create, job_id, payload), daemon=True).start()
        return job

    def enqueue_email_mailbox_delete(self, job_id: str, mailbox_id: str) -> JobSummary:
        job = self.create(job_id, "Delete email mailbox")
        Thread(target=self._run_serialized, args=(self._run_email_mailbox_delete, job_id, mailbox_id), daemon=True).start()
        return job

    def enqueue_email_domain_sync(self, job_id: str, domain: str) -> JobSummary:
        job = self.create(job_id, f"Sync email domain {domain}")
        Thread(target=self._run_serialized, args=(self._run_email_domain_sync, job_id, domain), daemon=True).start()
        return job

    def _run_email_mailbox_create(self, job_id: str, payload: dict):
        from app.models.email import MailboxRequest
        from app.services.email_service import email_service

        try:
            self._update(job_id, status="running", progress=15, message="Validating the mailbox and domain…")
            mailbox = email_service.create_mailbox(MailboxRequest(**payload))
            self.publish({"type": "email-updated", "action": "mailbox-created", "mailbox": mailbox})
            self._update(job_id, status="succeeded", progress=100, message=f"Mailbox {mailbox['address']} is ready.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_email_mailbox_delete(self, job_id: str, mailbox_id: str):
        from app.services.email_service import email_service

        try:
            self._update(job_id, status="running", progress=20, message="Removing the mailbox…")
            if not email_service.delete_mailbox(mailbox_id):
                raise RuntimeError("Mailbox not found")
            self.publish({"type": "email-updated", "action": "mailbox-deleted", "mailboxId": mailbox_id})
            self._update(job_id, status="succeeded", progress=100, message="Mailbox deleted.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_email_domain_sync(self, job_id: str, domain: str):
        from app.services.stalwart_provider import stalwart_provider

        try:
            self._update(job_id, status="running", progress=20, message=f"Provisioning {domain} in Stalwart…")
            stalwart_provider.ensure_domain(domain)
            self.publish({"type": "email-domain-updated", "action": "domain-synced", "domain": domain, "status": "ready"})
            self._update(job_id, status="succeeded", progress=100, message=f"Email domain {domain} is ready.")
        except Exception as error:
            self.publish({"type": "email-domain-updated", "action": "domain-sync-failed", "domain": domain, "status": "error", "message": str(error)})
            self._update(job_id, status="failed", message=str(error))

    def enqueue_certificate(self, job_id: str, website_id: str, method: str, email: str = "", staging: bool = False, certificate: str = "", private_key: str = "", chain: str = "") -> JobSummary:
        label = "Issue ACME certificate" if method == "acme" else "Install uploaded certificate"
        job = self.create(job_id, f"{label} for website {website_id[:8]}")
        Thread(target=self._run_serialized, args=(self._run_certificate, job_id, website_id, method, email, staging, certificate, private_key, chain), daemon=True).start()
        return job

    def _run_certificate(self, job_id: str, website_id: str, method: str, email: str, staging: bool, certificate: str, private_key: str, chain: str):
        try:
            site = website_service.get(website_id)
            if site is None:
                raise RuntimeError("Website not found.")
            if method == "upload":
                self._update(job_id, status="running", progress=20, message="Validating the uploaded certificate…")
                fullchain = certificate.strip() + ("\n" + chain.strip() if chain.strip() else "")
                website_service.store_certificate(website_id, fullchain, private_key, "upload")
                self._update(job_id, progress=80, message="Reloading the active web server…")
                self.enqueue_action(f"certificate-reload-{website_id}-{uuid.uuid4().hex[:8]}", site.server_type, "restart")
                self._update(job_id, status="succeeded", progress=100, message="Uploaded certificate installed and the web server reload was queued.")
                return
            if method != "acme":
                raise RuntimeError("Unsupported certificate method.")
            # Request one certificate containing the primary domain and every
            # configured alias as SANs. WebsiteService already normalizes
            # these values, but deduplicate here as a safety measure for older
            # persisted website records.
            domains = list(dict.fromkeys(domain.strip().lower() for domain in [site.domain, *site.aliases] if domain.strip()))
            if not domains:
                raise RuntimeError("No domains are configured for this website.")
            certbot_candidates = [
                service_root("certbot") / "venv/bin/certbot",
                service_root("certbot") / "usr/bin/certbot",
                service_root("certbot") / "bin/certbot",
                Path("/usr/bin/certbot"),
            ]
            certbot = None
            for candidate in certbot_candidates:
                if not candidate.exists():
                    continue
                check = subprocess.run([str(candidate), "--version"], capture_output=True, text=True, check=False, timeout=30)
                if check.returncode == 0:
                    certbot = candidate
                    break
            if certbot is None:
                discovered = shutil.which("certbot")
                if discovered:
                    check = subprocess.run([discovered, "--version"], capture_output=True, text=True, check=False, timeout=30)
                    if check.returncode == 0:
                        certbot = Path(discovered)
            if certbot is None:
                raise RuntimeError("No working Certbot runtime was found. Reinstall Certbot so its Python package and launcher are installed together.")
            cert_root = website_service.certificate_root / "certbot"
            webroot = Path(site.document_root)
            webroot.mkdir(parents=True, exist_ok=True)
            command = [str(certbot), "certonly", "--webroot", "-w", str(webroot), "--config-dir", str(cert_root / "config"), "--work-dir", str(cert_root / "work"), "--logs-dir", str(cert_root / "logs"), "--cert-name", site.domain, "--agree-tos", "--non-interactive", "--keep-until-expiring"]
            if email.strip():
                command.extend(["--email", email.strip()])
            else:
                command.append("--register-unsafely-without-email")
            if staging:
                command.append("--staging")
            for domain in domains:
                command.extend(["-d", domain])
            self._update(job_id, status="running", progress=5, message=f"Requesting an ACME certificate for {', '.join(domains)}…", log=["Domains: " + ", ".join(domains), "$ " + " ".join(shlex.quote(item) for item in command)])
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
            self._track_process(job_id, process)
            assert process.stdout is not None
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    self._update(job_id, progress=50, message="Validating domain ownership…", log=[line])
            return_code = process.wait()
            self._untrack_process(job_id, process)
            if return_code != 0:
                website_service.mark_certificate_failed(website_id)
                raise RuntimeError("ACME certificate issuance failed; see the job output for Certbot details.")
            lineage = cert_root / "config" / "live" / site.domain
            certificate_path = lineage / "fullchain.pem"
            key_path = lineage / "privkey.pem"
            if not certificate_path.is_file() or not key_path.is_file():
                raise RuntimeError("Certbot completed but did not produce a certificate and private key.")
            website_service.store_certificate(website_id, certificate_path.read_text(), key_path.read_text(), "acme")
            self._update(job_id, progress=90, message="Certificate issued; reloading the active web server…")
            self.enqueue_action(f"certificate-reload-{website_id}-{uuid.uuid4().hex[:8]}", site.server_type, "restart")
            self._update(job_id, status="succeeded", progress=100, message="ACME certificate issued and the web server reload was queued.")
        except InstallCancelled:
            self._update(job_id, status="cancelled", message="Certificate operation cancelled.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def enqueue_docker_action(self, job_id: str, container_id: str, action: str) -> JobSummary:
        job = self.create(job_id, f"{action.title()} docker container {container_id[:12]}")
        Thread(target=self._run_serialized, args=(self._run_docker_container_action, job_id, container_id, action), daemon=True).start()
        return job

    def enqueue_docker_compose(self, job_id: str, project_dir: Path, filename: str, content: str) -> JobSummary:
        job = self.create(job_id, f"Create Docker Compose app {project_dir.name}")
        Thread(target=self._run_serialized, args=(self._run_docker_compose, job_id, project_dir, filename, content), daemon=True).start()
        return job

    def enqueue_extension(self, job_id: str, version: str, extension: str) -> JobSummary:
        job = self.create(job_id, f"Install PHP {version} extension {extension}")
        Thread(target=self._run_serialized, args=(self._run_extension_install, job_id, version, extension), daemon=True).start()
        return job

    def enqueue_database_import(self, job_id: str, engine: str, source: Path, original_name: str, target_database: str = "") -> JobSummary:
        job = self.create(job_id, f"Import {engine} database · {original_name}")
        Thread(
            target=self._run_serialized,
            args=(self._run_database_import, job_id, engine, source, original_name, target_database),
            daemon=True,
        ).start()
        return job

    @staticmethod
    def _safe_extract_import_archive(source: Path, destination: Path) -> None:
        destination.mkdir(parents=True, exist_ok=True)
        if zipfile.is_zipfile(source):
            with zipfile.ZipFile(source) as archive:
                for member in archive.infolist():
                    target = (destination / member.filename).resolve()
                    if destination.resolve() not in target.parents and target != destination.resolve():
                        raise RuntimeError("The import archive contains an unsafe path.")
                    if member.is_dir():
                        target.mkdir(parents=True, exist_ok=True)
                    else:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with archive.open(member) as source_stream, target.open("wb") as target_stream:
                            shutil.copyfileobj(source_stream, target_stream)
            return
        try:
            with tarfile.open(source, "r:*") as archive:
                for member in archive.getmembers():
                    target = (destination / member.name).resolve()
                    if destination.resolve() not in target.parents and target != destination.resolve():
                        raise RuntimeError("The import archive contains an unsafe path.")
                    if member.isdir():
                        target.mkdir(parents=True, exist_ok=True)
                    elif member.isfile():
                        target.parent.mkdir(parents=True, exist_ok=True)
                        stream = archive.extractfile(member)
                        if stream is not None:
                            with stream, target.open("wb") as target_stream:
                                shutil.copyfileobj(stream, target_stream)
        except (tarfile.ReadError, OSError) as error:
            raise RuntimeError("The selected archive is not a supported SQL import file.") from error

    def _run_database_import(self, job_id: str, engine: str, source: Path, original_name: str, target_database: str = ""):
        work = source.parent / f".{job_id}-extract"
        try:
            work.mkdir(parents=True, exist_ok=True)
            self._prepare_service_runtime(work.parent, work.name)
            if engine != "mysql":
                raise RuntimeError(f"{engine.title()} imports are not available yet. Choose MySQL for SQL imports.")
            if target_database and not re.fullmatch(r"[A-Za-z0-9_$-]{1,64}", target_database):
                raise RuntimeError("The target database name is invalid.")
            root = service_root("mysql")
            client = root / "bin/mysql"
            socket = root / "run/mysql.sock"
            if not client.exists():
                raise RuntimeError("MySQL is not installed.")
            if not socket.exists():
                raise RuntimeError("MySQL is installed but stopped.")
            self._update(job_id, status="running", progress=8, message=f"Preparing {original_name} for MySQL import…", log=[f"Source: {source}"])
            self._raise_if_cancelled(job_id)

            sql_file = source
            if zipfile.is_zipfile(source) or tarfile.is_tarfile(source):
                self._update(job_id, progress=20, message="Extracting the SQL archive…")
                self._safe_extract_import_archive(source, work)
                candidates = sorted(work.rglob("*.sql"))
                if not candidates:
                    raise RuntimeError("The archive does not contain a .sql file.")
                sql_file = candidates[0]
            elif source.name.lower().endswith(".gz"):
                self._update(job_id, progress=20, message="Decompressing the SQL dump…")
                sql_file = work / source.with_suffix("").name
                work.mkdir(parents=True, exist_ok=True)
                with gzip.open(source, "rb") as compressed, sql_file.open("wb") as decompressed:
                    shutil.copyfileobj(compressed, decompressed)
            elif source.suffix.lower() != ".sql":
                raise RuntimeError("MySQL imports accept .sql, .sql.gz, .zip, .tar, .tar.gz, and .tgz files.")

            command = [str(client), "--protocol=SOCKET", f"--socket={socket}", "-uroot", "--binary-mode"]
            if target_database:
                command.append(target_database)
            self._update(job_id, progress=35, message="Importing the SQL dump…", log=[f"$ {' '.join(command)} < {sql_file.name}"])
            with sql_file.open("rb") as sql_stream:
                result = subprocess.run(
                    command,
                    stdin=sql_stream,
                    capture_output=True,
                    text=True,
                    check=False,
                    env=prepare_mysql_runtime(root),
                    timeout=3600,
                )
            if result.returncode != 0:
                raise RuntimeError((result.stderr or result.stdout).strip() or "MySQL rejected the import.")
            self._update(job_id, status="succeeded", progress=100, message=f"Imported {original_name} into MySQL successfully.", log=["Import completed successfully."])
        finally:
            source.unlink(missing_ok=True)
            shutil.rmtree(work, ignore_errors=True)

    def enqueue_application_shield(self, job_id: str) -> JobSummary:
        """Install the managed WAF engine and CRS as one serialized operation."""
        job = self.create(job_id, "Install Application Shield bundle")
        Thread(target=self._run_serialized, args=(self._run_application_shield, job_id), daemon=True).start()
        return job

    def enqueue_nginx_shield_connector(self, job_id: str) -> JobSummary:
        job = self.create(job_id, "Build Nginx ModSecurity connector")
        Thread(target=self._run_serialized, args=(self._run_nginx_shield_connector, job_id), daemon=True).start()
        return job

    def enqueue_provider_shield_connector(self, job_id: str, provider: str) -> JobSummary:
        job = self.create(job_id, f"Prepare {provider.title()} Application Shield connector")
        Thread(target=self._run_serialized, args=(self._run_provider_shield_connector, job_id, provider), daemon=True).start()
        return job

    def enqueue_malware_scan(self, job_id: str, target: str) -> JobSummary:
        job = self.create(job_id, f"Scan {target} with ClamAV")
        Thread(target=self._run_serialized, args=(self._run_malware_scan, job_id, target), daemon=True).start()
        return job

    def enqueue_malware_quarantine(self, job_id: str, source: str, detection_id: str) -> JobSummary:
        job = self.create(job_id, "Quarantine malware detection")
        Thread(target=self._run_serialized, args=(self._run_malware_quarantine, job_id, source, detection_id), daemon=True).start()
        return job

    def _run_malware_quarantine(self, job_id: str, source: str, detection_id: str):
        source_path = Path(source).resolve()
        allowed_roots = [
            Path(os.getenv("SE_WEB_ROOT", "/server-engine/www")).resolve(),
            Path(os.getenv("SE_BACKUP_ROOT", "/server-engine/backups")).resolve(),
            Path(os.getenv("SE_MAIL_ROOT", "/server-engine/mail")).resolve(),
        ]
        if not any(source_path == root or root in source_path.parents for root in allowed_roots):
            raise RuntimeError("Only managed website, backup, and mail files can be quarantined.")
        if not source_path.is_file():
            raise RuntimeError("The detected file no longer exists or is not a regular file.")
        quarantine = service_root("clamav") / "data/quarantine"
        quarantine.mkdir(parents=True, exist_ok=True)
        destination = quarantine / f"{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}-{source_path.name}"
        self._update(job_id, status="running", progress=20, message=f"Moving {source_path.name} to quarantine…", log=[f"Source: {source_path}", f"Destination: {destination}"])
        shutil.move(str(source_path), str(destination))
        manifest_file = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine")) / "malware/quarantine.json"
        manifest_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else []
            if not isinstance(manifest, list):
                manifest = []
        except (OSError, json.JSONDecodeError):
            manifest = []
        timestamp = datetime.now(timezone.utc).isoformat()
        manifest.insert(0, {"id": detection_id, "source": str(source_path), "quarantine_path": str(destination), "quarantined_at": timestamp})
        manifest_file.write_text(json.dumps(manifest[:500], indent=2) + "\n")
        try:
            owner = pwd.getpwnam("serverengine")
            os.chown(destination, owner.pw_uid, owner.pw_gid)
            os.chown(manifest_file, owner.pw_uid, owner.pw_gid)
        except (KeyError, OSError):
            pass
        self._update(job_id, status="succeeded", progress=100, message=f"Moved {source_path.name} to quarantine.", log=[f"Quarantined: {destination}"])

    def _run_malware_scan(self, job_id: str, target: str):
        """Prepare the managed ClamAV runtime and scan one supported area."""
        root = service_root("clamav")
        scanner = next((candidate for candidate in (root / "bin/clamscan", root / "usr/bin/clamscan") if candidate.exists()), None)
        freshclam = next((candidate for candidate in (root / "bin/freshclam", root / "usr/bin/freshclam") if candidate.exists()), None)
        if scanner is None:
            raise RuntimeError("ClamAV is installed but clamscan is missing. Reinstall ClamAV, then try again.")
        runtime_env = managed_library_environment(root)
        targets = {
            "websites": Path(os.getenv("SE_WEB_ROOT", "/server-engine/www")),
            "backups": Path(os.getenv("SE_BACKUP_ROOT", "/server-engine/backups")),
            "mail": Path(os.getenv("SE_MAIL_ROOT", "/server-engine/mail")),
        }
        scan_path = targets.get(target)
        if scan_path is None:
            raise RuntimeError("Choose a supported scan target.")
        if not scan_path.exists():
            raise RuntimeError(f"The selected scan folder does not exist: {scan_path}")
        database = root / "data/database"
        logs = Path(os.getenv("SE_LOG_ROOT", "/server-engine/logs")) / "clamav"
        run = root / "run"
        quarantine = root / "data/quarantine"
        certs = root / "etc/certs"
        conf = root / "conf"
        for directory in (database, logs, run, quarantine, certs, conf):
            directory.mkdir(parents=True, exist_ok=True)
        try:
            owner = pwd.getpwnam("serverengine")
            for directory in (database, logs, run, quarantine, certs, conf):
                os.chown(directory, owner.pw_uid, owner.pw_gid)
        except (KeyError, OSError):
            pass
        if not any(certs.iterdir()):
            for candidate in root.rglob("*"):
                if candidate.parent == certs or not candidate.is_file() or candidate.suffix.lower() not in {".crt", ".pem"}:
                    continue
                try:
                    shutil.copy2(candidate, certs / candidate.name)
                except OSError:
                    pass
        if not any(certs.iterdir()):
            certificate_url = "https://raw.githubusercontent.com/Cisco-Talos/clamav/main/certs/clamav.crt"
            certificate = certs / "clamav.crt"
            try:
                with urllib.request.urlopen(certificate_url, timeout=60) as response:
                    content = response.read()
                if b"BEGIN CERTIFICATE" not in content:
                    raise RuntimeError("The downloaded ClamAV certificate was not valid PEM data.")
                certificate.write_bytes(content)
            except Exception as error:
                raise RuntimeError(f"ClamAV certificate setup failed: {error}") from error
        freshclam_config = conf / "freshclam.conf"
        freshclam_config.write_text(
            "DatabaseDirectory " + str(database) + "\n"
            + "CVDCertsDirectory " + str(certs) + "\n"
            + "DatabaseMirror database.clamav.net\n"
            + "UpdateLogFile " + str(logs / "freshclam.log") + "\n"
            + "LogTime yes\n"
            + "DatabaseOwner serverengine\n"
        )
        log_path = logs / "scanner.log"
        runtime_env["CVD_CERTS_DIR"] = str(certs)
        self._update(job_id, status="running", progress=5, message="Preparing ClamAV scan controls…", log=[f"ClamAV root: {root}", f"Scanner: {scanner}", f"Target: {scan_path}"])
        signature_files = [item for pattern in ("*.cvd", "*.cld", "*.cud") for item in database.glob(pattern)]
        signatures = bool(signature_files)
        newest_signature = max((item.stat().st_mtime for item in signature_files), default=0)
        signatures_current = signatures and (time.time() - newest_signature) < 86400
        if freshclam and not signatures_current:
            self._update(job_id, progress=18, message="Refreshing ClamAV virus signatures…", log=[f"$ {freshclam} --config-file={freshclam_config} --cvdcertsdir={certs}"])
            update = subprocess.run([str(freshclam), f"--config-file={freshclam_config}", f"--cvdcertsdir={certs}"], capture_output=True, text=True, check=False, timeout=900, env=runtime_env)
            output = (update.stdout or "") + (update.stderr or "")
            if output.strip():
                self._update(job_id, log=output.splitlines()[-80:])
            signatures = any(database.glob(pattern) for pattern in ("*.cvd", "*.cld", "*.cud"))
            if update.returncode != 0 and not signatures:
                raise RuntimeError("ClamAV could not download virus signatures. Open the job output and check network access to the signature mirror.")
            try:
                owner = pwd.getpwnam("serverengine")
                for item in database.iterdir():
                    os.chown(item, owner.pw_uid, owner.pw_gid)
            except (KeyError, OSError):
                pass
        elif signatures_current:
            self._update(job_id, progress=18, message="Using the current ClamAV virus signatures.", log=[f"Signature database: {database}", "FreshClam refresh skipped; signatures are less than 24 hours old."])
        if not signatures:
            raise RuntimeError(f"No usable ClamAV virus signatures were found in {database}. FreshClam must complete before scanning.")
        # Keep CVD certificate verification inside the managed runtime rather
        # than allowing libclamav to fall back to the host configuration.
        total_files = 0
        for current, _directories, files in os.walk(scan_path):
            total_files += len(files)
        command = [str(scanner), "--database", str(database), "--cvdcertsdir", str(certs), "--recursive", "--infected", "--verbose", f"--log={log_path}", str(scan_path)]
        self._update(job_id, progress=30, message=f"Scanning {scan_path}… {total_files:,} files found", log=[f"Indexed {total_files:,} files under {scan_path}", f"$ {' '.join(shlex.quote(item) for item in command)}"])
        output = []
        scanned_files = 0
        reported_files = None
        threats_found = 0
        detections = []
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=runtime_env) as process:
            for line in process.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    if len(output) > 1000:
                        del output[:-1000]
                    if not line.startswith(("-----------", "Known viruses:", "Engine version:", "Scanned directories:", "Scanned files:", "Infected files:", "Data scanned:", "Data read:", "Time:", "Start Date:", "End Date:")):
                        scanned_files += 1
                    if line.startswith("Scanned files:"):
                        try:
                            reported_files = int(line.split(":", 1)[1].strip().replace(",", ""))
                        except (IndexError, ValueError):
                            pass
                    if " FOUND" in line:
                        threats_found += 1
                        detection_line = line.strip()
                        if detection_line not in detections:
                            detections.append(detection_line)
                    progress = min(95, 30 + round((scanned_files / max(total_files, 1)) * 65))
                    if scanned_files == 1 or scanned_files % 25 == 0 or "FOUND" in line:
                        self._update(job_id, progress=progress, message=f"Scanning {scan_path}… {min(scanned_files, total_files):,}/{total_files:,} files", log=output[-120:])
            return_code = process.wait()
        try:
            owner = pwd.getpwnam("serverengine")
            if log_path.exists():
                os.chown(log_path, owner.pw_uid, owner.pw_gid)
        except (KeyError, OSError):
            pass
        result_file = Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine")) / "malware" / "latest.json"
        result_file.parent.mkdir(parents=True, exist_ok=True)
        files_scanned = reported_files if reported_files is not None else total_files
        completed_at = datetime.now(timezone.utc).isoformat()
        result = {"target": target, "path": str(scan_path), "return_code": return_code, "files_found": total_files, "files_scanned": files_scanned, "files_reported": scanned_files, "threats_found": threats_found, "detections": detections[-500:], "completed_at": completed_at, "log": output[-1000:]}
        result_file.write_text(json.dumps(result, indent=2) + "\n")
        history_file = result_file.with_name("history.json")
        try:
            history = json.loads(history_file.read_text()) if history_file.exists() else []
            if not isinstance(history, list):
                history = []
        except (OSError, json.JSONDecodeError):
            history = []
        history = [item for item in history if item.get("id") != job_id]
        history.insert(0, {"id": job_id, "target": target, "path": str(scan_path), "status": "succeeded" if return_code <= 1 else "failed", "return_code": return_code, "files_scanned": files_scanned, "threats_found": threats_found, "created_at": completed_at, "updated_at": completed_at, "message": "Scan completed with detections." if threats_found else "Scan completed cleanly."})
        history_file.write_text(json.dumps(history[:100], indent=2) + "\n")
        try:
            owner = pwd.getpwnam("serverengine")
            os.chown(result_file, owner.pw_uid, owner.pw_gid)
            os.chown(history_file, owner.pw_uid, owner.pw_gid)
        except (KeyError, OSError):
            pass
        if return_code > 1:
            raise RuntimeError(output[-1] if output else "ClamAV scan failed.")
        message = f"ClamAV scan completed cleanly. Scanned {total_files:,} files." if return_code == 0 else f"ClamAV scan completed and found one or more threats after scanning {total_files:,} files. Review the scan output before quarantine."
        self._update(job_id, status="succeeded", progress=100, message=message, log=[message])

    def enqueue_application_deploy(self, job_id: str, site: Website, template: str, database_engine: str = "", database_password: str = "", wordpress_version: str = "latest", wordpress_admin_user: str = "", wordpress_admin_password: str = "", wordpress_database_prefix: str = "wp_", wordpress_site_title: str = "", laravel_version: str = "") -> JobSummary:
        job = self.create(job_id, f"Deploy {template.title()} · {site.domain}")
        Thread(target=self._run_serialized, args=(self._run_application_deploy, job_id, site, template, database_engine, database_password, wordpress_version, wordpress_admin_user, wordpress_admin_password, wordpress_database_prefix, wordpress_site_title, laravel_version), daemon=True).start()
        return job

    def enqueue_node_project_action(self, job_id: str, project: NodeProject, action: str) -> JobSummary:
        job = self.create(job_id, f"{action.title()} Node.js project · {project.domain}")
        Thread(target=self._run_serialized, args=(self._run_node_project_action, job_id, project, action), daemon=True).start()
        return job

    def enqueue_node_project_setup(self, job_id: str, project: NodeProject) -> JobSummary:
        job = self.create(job_id, f"Prepare Node.js project · {project.domain}")
        Thread(target=self._run_serialized, args=(self._run_node_project_setup, job_id, project), daemon=True).start()
        return job

    def _run_node_project_setup(self, job_id: str, project: NodeProject):
        try:
            node_root = service_root("nodejs", project.node_version)
            node_bin = node_root / "bin"
            npm = node_bin / ("npm.cmd" if os.name == "nt" else "npm")
            if not npm.exists():
                npm = node_bin / "npm"
            if not npm.exists():
                raise RuntimeError(f"Node.js {project.node_version} does not contain npm.")
            env = {**os.environ, "PATH": f"{node_bin}:{os.environ.get('PATH', '')}", "NODE_ENV": "production", "PORT": str(project.port)}
            project_path = Path(project.project_path)
            project_path.mkdir(parents=True, exist_ok=True)
            self._update(job_id, status="running", progress=5, message=f"Preparing {project.template_id} project…", log=[f"Project: {project_path}", f"Node.js: {node_root}"])
            scaffold = {
                "react": [str(npm), "create", "vite@latest", ".", "--", "--template", "react"],
                "vue": [str(npm), "create", "vite@latest", ".", "--", "--template", "vue"],
                "svelte": [str(npm), "create", "vite@latest", ".", "--", "--template", "svelte"],
                "express": [str(npm), "init", "-y"],
                "nextjs": [str(npm), "exec", "create-next-app@latest", ".", "--", "--use-npm", "--yes"],
                "nestjs": [str(npm), "exec", "@nestjs/cli", "new", ".", "--package-manager", "npm", "--skip-git", "--language", "TS"],
            }.get(project.template_id)
            if scaffold and not (project_path / "package.json").exists():
                self._run_project_command(job_id, scaffold, project_path, env, 10, 40, "Creating project files")
            package_json = project_path / "package.json"
            if not package_json.exists():
                raise RuntimeError("The project template did not create package.json.")
            install = shlex.split(project.install_command)
            if install and install[0] in {"npm", "pnpm", "yarn"}:
                install[0] = str(node_bin / install[0])
            self._run_project_command(job_id, install, project_path, env, 45, 75, "Installing Node.js dependencies")
            if project.build_command.strip():
                build = shlex.split(project.build_command)
                if build and build[0] in {"npm", "pnpm", "yarn"}:
                    build[0] = str(node_bin / build[0])
                self._run_project_command(job_id, build, project_path, env, 80, 95, "Building the Node.js project")
            self._set_application_owner(project_path)
            project_service = __import__("app.services.project_service", fromlist=["project_service"]).project_service
            project_service.set_node_status(project.id, "disabled")
            self.enqueue_action(f"provider-reload-node-{project.id}-{uuid.uuid4().hex[:8]}", project.server_type, "restart")
            self._update(job_id, status="succeeded", progress=100, message=f"Node.js project {project.domain} is ready. Start it from the project list.", log=["Node.js project setup completed successfully."])
        except Exception as error:
            from app.services.project_service import project_service
            project_service.set_node_status(project.id, "error")
            self._update(job_id, status="failed", message=str(error))

    def _run_project_command(self, job_id: str, command: list[str], cwd: Path, env: dict[str, str], start: int, end: int, message: str):
        if not command:
            return
        self._update(job_id, progress=start, message=message, log=[f"$ {' '.join(shlex.quote(item) for item in command)}"])
        process = subprocess.Popen(command, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        output = []
        for line in process.stdout or []:
            output.append(line.rstrip())
            self._update(job_id, progress=min(end, start + max(1, len(output) // 4)), message=message, log=output[-80:])
        if process.wait() != 0:
            raise RuntimeError(output[-1] if output else f"{message} failed.")

    def _run_node_project_action(self, job_id: str, project: NodeProject, action: str):
        from app.services.project_service import project_service
        try:
            if project.process_manager == "none":
                raise RuntimeError("This project is configured for manual process management.")
            config = Path(project.process_config_path)
            if not config.exists():
                raise RuntimeError("The process definition is missing. Recreate the project configuration first.")
            if project.process_manager == "pm2":
                manager = binary_path("pm2")
                command = [str(manager), action if action != "restart" else "restart", project.name if action != "start" else str(config)]
            else:
                root = service_root("supervisor")
                manager = root / "venv/bin/supervisorctl"
                if not manager.exists():
                    manager = root / "bin/supervisorctl"
                command = [str(manager), "-c", str(root / "conf/supervisord.conf"), action, project.name]
            self._update(job_id, status="running", progress=20, message=f"{action.title()}ing {project.domain}…", log=[f"$ {' '.join(shlex.quote(item) for item in command)}"])
            result = subprocess.run(command, cwd=project.project_path, capture_output=True, text=True, check=False, timeout=60)
            output = (result.stdout + result.stderr).strip()
            if result.returncode != 0:
                raise RuntimeError(output or f"The {project.process_manager} action failed.")
            status = "running" if action in {"start", "restart"} else "disabled"
            project_service.set_node_status(project.id, status)
            self._update(job_id, status="succeeded", progress=100, message=f"Node.js project {action} completed.", log=[output] if output else [])
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    @staticmethod
    def _safe_extract_tarball(archive: Path, destination: Path) -> None:
        destination = destination.resolve()
        with tarfile.open(archive, "r:gz") as package:
            for member in package.getmembers():
                target = (destination / member.name).resolve()
                if destination not in target.parents and target != destination:
                    raise RuntimeError("The application archive contains an unsafe path.")
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    stream = package.extractfile(member)
                    if stream is not None:
                        with stream, target.open("wb") as output:
                            shutil.copyfileobj(stream, output)

    @staticmethod
    def _set_application_owner(path: Path) -> None:
        try:
            owner = pwd.getpwnam("serverengine")
        except KeyError:
            return
        for item in [path, *path.rglob("*")]:
            try:
                os.chown(item, owner.pw_uid, owner.pw_gid)
            except OSError:
                pass

    def _provision_mysql_database(self, job_id: str, site: Website, database_name: str, database_user: str, database_password: str) -> tuple[str, str, str]:
        if not re.fullmatch(r"[A-Za-z0-9_$-]{1,64}", database_name or ""):
            raise RuntimeError("The application database name is invalid.")
        if not re.fullmatch(r"[A-Za-z0-9_$-]{1,32}", database_user or ""):
            raise RuntimeError("The application database user is invalid.")
        root = service_root("mysql")
        client = root / "bin/mysql"
        socket = root / "run/mysql.sock"
        if not client.exists() or not socket.exists():
            raise RuntimeError("MySQL must be installed and running before database provisioning.")
        password = database_password or secrets.token_urlsafe(18)
        escaped_name = database_name.replace("`", "``")
        escaped_user = database_user.replace("'", "''")
        escaped_password = password.replace("\\", "\\\\").replace("'", "\\'")
        sql = (
            f"CREATE DATABASE IF NOT EXISTS `{escaped_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; "
            f"CREATE USER IF NOT EXISTS '{escaped_user}'@'localhost' IDENTIFIED BY '{escaped_password}'; "
            f"ALTER USER '{escaped_user}'@'localhost' IDENTIFIED BY '{escaped_password}'; "
            f"GRANT ALL PRIVILEGES ON `{escaped_name}`.* TO '{escaped_user}'@'localhost'; FLUSH PRIVILEGES;"
        )
        self._update(job_id, progress=88, message=f"Creating the MySQL database {database_name}…", log=[f"$ {client} --socket={socket} -uroot -e 'provision application database'"])
        result = subprocess.run(
            [str(client), "--protocol=SOCKET", f"--socket={socket}", "-uroot", "--batch", "--skip-column-names", "-e", sql],
            capture_output=True,
            text=True,
            check=False,
            env=prepare_mysql_runtime(root),
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout).strip() or "MySQL rejected the application database setup.")
        database_credentials.save("mysql", database_name, database_user, password)
        return database_name, database_user, password

    @staticmethod
    def _write_application_database_config(site: Website, template: str, credentials: tuple[str, str, str] | None, wordpress_database_prefix: str = "wp_") -> None:
        project = Path(site.project_path)
        if template == "laravel":
            env_file = project / ".env"
            if not env_file.exists():
                return
            if credentials:
                database_name, database_user, database_password = credentials
                values = {"DB_CONNECTION": "mysql", "DB_HOST": "127.0.0.1", "DB_PORT": "3306", "DB_DATABASE": database_name, "DB_USERNAME": database_user, "DB_PASSWORD": database_password}
            else:
                sqlite_file = project / "database/database.sqlite"
                sqlite_file.parent.mkdir(parents=True, exist_ok=True)
                sqlite_file.touch(exist_ok=True)
                values = {"DB_CONNECTION": "sqlite", "DB_HOST": "", "DB_PORT": "", "DB_DATABASE": str(sqlite_file), "DB_USERNAME": "", "DB_PASSWORD": "", "SESSION_DRIVER": "file", "QUEUE_CONNECTION": "sync", "CACHE_STORE": "file"}
            values["APP_URL"] = f"{'https' if site.ssl_enabled else 'http'}://{site.domain}"
            lines = env_file.read_text(errors="replace").splitlines()
            for key, value in values.items():
                pattern = re.compile(rf"^{re.escape(key)}=")
                replacement = f"{key}={value}"
                for index, line in enumerate(lines):
                    if pattern.match(line):
                        lines[index] = replacement
                        break
                else:
                    lines.append(replacement)
            env_file.write_text("\n".join(lines) + "\n")
        elif template == "wordpress" and credentials:
            database_name, database_user, database_password = credentials
            sample = project / "wp-config-sample.php"
            if not sample.exists() or (project / "wp-config.php").exists():
                return
            content = sample.read_text(errors="replace")
            replacements = {
                "database_name_here": database_name,
                "username_here": database_user,
                "password_here": database_password,
                "localhost": "127.0.0.1",
            }
            for old, new in replacements.items():
                content = content.replace(old, new.replace("\\", "\\\\").replace("'", "\\'"))
            content = re.sub(r"\$table_prefix\s*=\s*'[^']*';", f"$table_prefix = '{wordpress_database_prefix}';", content)
            (project / "wp-config.php").write_text(content)

    def _finalize_laravel(self, job_id: str, site: Website) -> None:
        artisan = Path(site.project_path) / "artisan"
        if not artisan.exists():
            raise RuntimeError("Laravel was downloaded, but its artisan file is missing.")
        php = php_cli_path(site.php_version) if site.php_version else None
        if not php or not php.exists():
            raise RuntimeError("Laravel was installed, but the selected PHP CLI runtime is unavailable.")
        php_root = service_root("php", site.php_version)
        ensure_php_runtime_configuration(site.php_version)
        command = [str(php), str(artisan), "key:generate", "--force", "--no-interaction"]
        self._update(job_id, progress=86, message="Generating the Laravel application key…", log=[f"$ {' '.join(shlex.quote(item) for item in command)}"])
        result = subprocess.run(
            command,
            cwd=site.project_path,
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
            env={
                **os.environ,
                "LD_LIBRARY_PATH": php_runtime_library_path(php_root),
                "PHP_INI_SCAN_DIR": str(php_root / "conf/conf.d"),
            },
        )
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout).strip() or "Laravel could not generate its application key.")

    def _install_wordpress_core(self, job_id: str, site: Website, admin_user: str, admin_password: str, site_title: str, credentials: tuple[str, str, str] | None) -> None:
        if not credentials:
            raise RuntimeError("WordPress deployment requires a database before the administrator account can be created.")
        php = php_cli_path(site.php_version) if site.php_version else None
        if not php or not php.exists():
            raise RuntimeError("WordPress was downloaded, but the selected PHP CLI runtime is unavailable.")
        wp_root = service_root("wp-cli") / "versions"
        candidates = sorted([*wp_root.glob("*/bin/wp"), *wp_root.glob("*/wp-cli.phar")], key=lambda path: version_sort_key(path.parent.parent.name if path.parent.name == "bin" else path.parent.name), reverse=True)
        if not candidates:
            raise RuntimeError("Install WP-CLI before deploying WordPress so Server Engine can create the administrator account.")
        wp = candidates[0]
        scheme = "https" if site.ssl_enabled else "http"
        command = [str(php), str(wp), "core", "install", f"--path={site.project_path}", f"--url={scheme}://{site.domain}", f"--title={site_title.strip() or site.domain}", f"--admin_user={admin_user}", f"--admin_password={admin_password}", f"--admin_email=admin@{site.domain}", "--skip-email", "--quiet", "--allow-root"]
        php_root = service_root("php", site.php_version)
        ensure_php_runtime_configuration(site.php_version)
        display_command = ["--admin_password=********" if item.startswith("--admin_password=") else item for item in command]
        self._update(job_id, progress=96, message="Creating the WordPress administrator account…", log=[f"$ {' '.join(shlex.quote(item) for item in display_command)}"])
        result = subprocess.run(command, cwd=site.project_path, capture_output=True, text=True, check=False, timeout=120, env={**os.environ, "LD_LIBRARY_PATH": php_runtime_library_path(php_root), "PHP_INI_SCAN_DIR": str(php_root / "conf/conf.d")})
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout).strip() or "WP-CLI could not complete the WordPress installation.")
        description = site.notes.strip()
        if description:
            description_command = [str(php), str(wp), "option", "update", "blogdescription", description, f"--path={site.project_path}", "--quiet", "--allow-root"]
            self._update(job_id, progress=97, message="Saving the WordPress site description…", log=[f"$ {' '.join(shlex.quote(item) for item in description_command)}"])
            description_result = subprocess.run(description_command, cwd=site.project_path, capture_output=True, text=True, check=False, timeout=60, env={**os.environ, "LD_LIBRARY_PATH": php_runtime_library_path(php_root), "PHP_INI_SCAN_DIR": str(php_root / "conf/conf.d")})
            if description_result.returncode != 0:
                raise RuntimeError((description_result.stderr or description_result.stdout).strip() or "WP-CLI could not save the WordPress site description.")

    @staticmethod
    def _verify_application_layout(site: Website, template: str) -> None:
        project = Path(site.project_path)
        if template == "wordpress":
            required = [project / "index.php", project / "wp-admin", project / "wp-includes"]
        else:
            required = [project / "vendor"]
            if template == "laravel":
                required.append(project / "artisan")
            else:
                roots = {"drupal": "web", "yii": "web", "symfony": "public", "cakephp": "webroot", "codeigniter4": "public", "slim": "public", "laminas": "public"}
                required.append(project / roots.get(template, "public") / "index.php")
        missing = [str(item.relative_to(project)) for item in required if not item.exists()]
        if missing:
            raise RuntimeError(f"{template.title()} deployment is incomplete; missing {', '.join(missing)}.")
        if site.web_root != "." and not (project / site.web_root).is_dir():
            raise RuntimeError(f"The configured document root {site.web_root} does not exist.")

    def _run_application_deploy(self, job_id: str, site: Website, template: str, database_engine: str = "", database_password: str = "", wordpress_version: str = "latest", wordpress_admin_user: str = "", wordpress_admin_password: str = "", wordpress_database_prefix: str = "wp_", wordpress_site_title: str = "", laravel_version: str = ""):
        project = Path(site.project_path)
        staging = project.parent / f".server-engine-{template}-{job_id}-staging"
        archive = staging / "application.tar.gz"
        try:
            staging.mkdir(parents=True, exist_ok=True)
            project.mkdir(parents=True, exist_ok=True)
            self._update(job_id, status="running", progress=5, message=f"Preparing {template.title()} for {site.domain}…", log=[f"Project: {project}"])
            self._raise_if_cancelled(job_id)
            if template == "wordpress":
                requested_version = wordpress_version.strip() or "latest"
                url = "https://wordpress.org/latest.tar.gz" if requested_version.lower() == "latest" else f"https://wordpress.org/wordpress-{requested_version}.tar.gz"
                self._update(job_id, progress=15, message="Downloading the current WordPress release…", log=[f"$ curl -fL {url} -o {archive}"])
                request = urllib.request.Request(url, headers={"User-Agent": "Server-Engine-Control-Panel"})
                with urllib.request.urlopen(request, timeout=180) as response, archive.open("wb") as output:
                    shutil.copyfileobj(response, output)
                self._update(job_id, progress=45, message="Extracting WordPress into the project folder…")
                self._safe_extract_tarball(archive, staging / "extracted")
                source = staging / "extracted" / "wordpress"
                for item in source.iterdir():
                    target = project / item.name
                    if target.exists():
                        raise RuntimeError(f"The project folder already contains {item.name}; deployment stopped to avoid overwriting it.")
                    shutil.move(str(item), str(target))
            elif template in {"laravel", "drupal", "symfony", "cakephp", "codeigniter4", "yii", "slim", "laminas"}:
                composer = composer_path()
                if not composer.exists():
                    raise RuntimeError("This PHP application requires Composer. Install Composer, then retry.")
                if any(project.iterdir()):
                    raise RuntimeError(f"{template.title()} deployment requires an empty project folder to protect existing files.")
                packages = {"laravel": "laravel/laravel", "drupal": "drupal/recommended-project", "symfony": "symfony/skeleton", "cakephp": "cakephp/app", "codeigniter4": "codeigniter4/appstarter", "yii": "yiisoft/yii2-app-basic", "slim": "slim/slim-skeleton", "laminas": "laminas/laminas-mvc-skeleton"}
                command = [str(composer), "create-project", packages[template], str(project)]
                if template == "laravel" and laravel_version.strip():
                    command.append(laravel_version.strip())
                command.extend(["--no-interaction", "--prefer-dist"])
                self._update(job_id, progress=15, message=f"Installing {template.title()} with the managed Composer runtime…", log=[f"$ {' '.join(shlex.quote(item) for item in command)}"])
                process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env={**os.environ, "COMPOSER_MEMORY_LIMIT": "-1"})
                output = []
                for line in process.stdout or []:
                    output.append(line.rstrip())
                    self._update(job_id, progress=min(85, 20 + len(output) // 2), message=f"Installing {template.title()} dependencies…", log=output[-80:])
                if process.wait() != 0:
                    raise RuntimeError(output[-1] if output else "Composer could not install Laravel.")
                if template == "laravel":
                    self._write_application_database_config(site, template, None)
                    self._finalize_laravel(job_id, site)
            else:
                raise RuntimeError(f"Unsupported application template: {template}")
            credentials = None
            if site.database_enabled:
                if database_engine != "mysql":
                    raise RuntimeError("One-click database provisioning currently supports running MySQL. Choose MySQL or deploy without a database.")
                database_user = site.database_user or re.sub(r"[^A-Za-z0-9_$-]", "_", site.domain.split(".")[0])[:32]
                credentials = self._provision_mysql_database(job_id, site, site.database_name, database_user, database_password)
                if database_user != site.database_user:
                    website_service.update(site.id, WebsiteUpdateRequest(database_user=database_user))
                self._write_application_database_config(site, template, credentials, wordpress_database_prefix)
                if template == "wordpress":
                    self._install_wordpress_core(job_id, site, wordpress_admin_user, wordpress_admin_password, wordpress_site_title, credentials)
                self._update(job_id, progress=94, message=f"Database {credentials[0]} is ready and application credentials were saved securely.")
            else:
                self._update(job_id, progress=90, message="Application files are ready. No database was requested.")
            self._set_application_owner(project)
            self._verify_application_layout(site, template)
            self._update(job_id, progress=97, message="Verifying application files and document root…")
            self.enqueue_action(f"provider-reload-site-{site.id}-{uuid.uuid4().hex[:8]}", site.server_type, "restart")
            self._update(job_id, status="succeeded", progress=100, message=f"{template.title()} is ready at {project}.", log=["Application deployment completed successfully."])
        except Exception as error:
            website_service.mark_error(site.id)
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_serialized(self, runner, job_id: str, *args):
        """Run exactly one privileged job at a time.

        Jobs are still created immediately so the UI can show them as queued,
        but package operations, source builds, and service actions cannot
        overlap. This protects APT/dpkg and prevents concurrent builds from
        exhausting the host.
        """
        self._update(job_id, message="Waiting for the next available operation…", log=["Queued behind another operation; execution will start automatically."])
        with self._task_lock:
            try:
                if self._is_cancelled(job_id):
                    return
                runner(job_id, *args)
            except InstallCancelled:
                self._update(job_id, status="cancelled", message="Job cancelled.")
            except Exception as error:
                self._update(job_id, status="failed", message=str(error))
            finally:
                # A runner should normally untrack every process in its own
                # finally block. Clear any defensive leftovers here so a
                # completed/cancelled job can never be targeted by a later
                # cancellation request.
                with self._lock:
                    self._job_processes.pop(job_id, None)
                    self._active_processes.pop(job_id, None)
                    self._cancel_events.pop(job_id, None)
                # Service inventories are cached because they perform many
                # filesystem, process, and package checks. A completed or
                # cancelled serialized operation is the authoritative point
                # at which those cached inventories must be refreshed.
                try:
                    from app.api.routes.services import invalidate_service_inventory_cache
                    invalidate_service_inventory_cache()
                except ImportError:
                    pass

    def _run_extension_install(self, job_id: str, version: str, extension: str):
        minor = ".".join(version.removeprefix("php").split(".")[:2])
        package = f"php{minor}-{extension}"
        # APT is process-global. Serialize extension jobs so they cannot
        # compete over the package database or run multiple updates at once.
        with self._extension_install_lock:
            self._run_isolated_package(job_id, "php", version, package_override=package)
        with self._lock:
            job = self._jobs.get(job_id)
        if not job or job.status != "succeeded":
            return
        root = service_root("php", version)
        module_names = PHP_BASELINE_MODULES.get(extension, (extension,))
        module_files = []
        for module_root in (
            root / "usr/lib/php",
            root / "lib/php",
            root / "lib64/php",
        ):
            if module_root.exists():
                module_files.extend(module_root.rglob("*.so"))
        shared_object = next(
            (
                candidate
                for name in module_names
                for candidate in module_files
                if candidate.name == f"{name}.so"
            ),
            None,
        )
        if not shared_object:
            self._update(job_id, status="failed", message=f"Package {package} installed but its PHP module was not found.")
            return
        ini = ensure_php_fpm_layout(version)["ini"]
        directive = "zend_extension" if extension == "opcache" else "extension"
        line = f"{directive}={shared_object}\n"
        content = ini.read_text(errors="replace")
        if line not in content:
            ini.write_text(content.rstrip() + "\n" + line)
        self._update(job_id, status="succeeded", message=f"PHP {version} extension {extension} installed and enabled in php.ini. Restart PHP-FPM {version} to load it.")

    def _run_application_shield(self, job_id: str):
        """Stage ModSecurity and CRS without changing the host package database."""
        providers = ("nginx", "apache", "openlitespeed", "caddy")
        installed = [provider for provider in providers if binary_path(provider).exists() or (service_root(provider) / ".serverengine-version").exists()]
        if not installed:
            raise RuntimeError("Install a web server before installing Application Shield.")
        # Nginx and Apache connectors are compiled against the exact managed
        # server ABI, so both prebuilt and source-built runtimes are supported.
        # Caddy/OpenLiteSpeed still require their supported prebuilt path.
        non_prebuilt = [
            provider
            for provider in installed
            if provider in {"caddy", "openlitespeed"}
            and (not (service_root(provider) / ".serverengine-install-method").exists()
                 or (service_root(provider) / ".serverengine-install-method").read_text(errors="replace").strip() != "prebuilt")
        ]
        if non_prebuilt:
            names = ", ".join(provider.title() for provider in non_prebuilt)
            raise RuntimeError(f"Application Shield currently supports prebuilt runtimes only. Install or reinstall {names} using the Prebuilt package method, then install Shield again.")
        self._update(job_id, status="running", progress=3, message="Preparing Application Shield for the installed web server(s)…", log=[f"Providers detected: {', '.join(installed)}"])
        self._raise_if_cancelled(job_id)

        # Reuse the same isolated Debian extraction path as the normal service
        # installer. It never calls dpkg -i or registers a host service.
        self._run_debian_prebuilt(job_id, "modsecurity", "system")
        with self._lock:
            current = self._jobs.get(job_id)
        if not current or current.status != "succeeded":
            return
        self._update(job_id, status="running", progress=72, message="Installing OWASP Core Rule Set into the managed shield root…")
        self._install_application_shield_crs(job_id)
        self._raise_if_cancelled(job_id)
        # Geo controls are optional. A DB-IP outage, DNS failure, or changed
        # download page must never make the WAF bundle fail after CRS is ready.
        self._update(job_id, status="running", progress=84, message="Preparing optional country database for Geo controls…")
        from app.services.geoip_service import geoip_service
        geoip_result = geoip_service.install_latest_country_database()
        if geoip_result.get("installed"):
            self._update(job_id, progress=86, message="Optional DB-IP country database is ready.", log=[str(geoip_result.get("url", ""))])
        else:
            self._update(job_id, progress=86, message="GeoIP database unavailable; continuing without Geo controls.", log=[f"Warning: optional GeoIP setup skipped: {geoip_result.get('message', 'unknown error')}"])
        root = service_root("modsecurity")
        from app.services.application_shield_service import application_shield_service
        application_shield_service.ensure_engine_config()
        provider_warnings = []
        if "apache" in installed:
            self._install_application_shield_apache_connector(job_id)
        if "caddy" in installed and application_shield_service._connector_module("caddy", service_root("caddy")) is None:
            caddy_marker = service_root("caddy") / ".serverengine-version"
            caddy_version = caddy_marker.read_text(errors="replace").strip() if caddy_marker.exists() else "2.9.1"
            caddy_method = (service_root("caddy") / ".serverengine-install-method").read_text(errors="replace").strip() if (service_root("caddy") / ".serverengine-install-method").exists() else "source"
            if caddy_method != "prebuilt":
                raise RuntimeError("Application Shield can currently attach to prebuilt Caddy only. Reinstall Caddy using the Prebuilt package method, then attach Shield again.")
            if re.match(r"^2\.6\.2(?:$|[-+])", caddy_version):
                raise RuntimeError("Caddy 2.6.2 is prebuilt but too old for the available Go toolchain's Shield build. Install a newer prebuilt Caddy release, then attach Application Shield again.")
            # A stock Caddy binary cannot load Coraza dynamically. The Caddy
            # connector is compiled into a managed binary with xcaddy, so
            # prepare the Go toolchain before attempting that build. This was
            # previously skipped for the Application Shield path, which made
            # an installed Caddy look broken even though its normal runtime
            # worked.
            try:
                self._ensure_source_build_dependencies(job_id, "caddy")
                self._run_caddy_binary(job_id, caddy_version)
                with self._lock:
                    caddy_job = self._jobs.get(job_id)
                if not caddy_job or caddy_job.status != "succeeded":
                    provider_warnings.append("Caddy connector was skipped because its Coraza build did not complete")
                    self._update(job_id, status="running", progress=90, message="Caddy connector skipped; continuing Application Shield setup for the available providers…")
            except Exception as error:
                provider_warnings.append(f"Caddy connector was skipped: {error}")
                self._update(job_id, status="running", progress=90, message="Caddy connector skipped; continuing Application Shield setup for the available providers…", log=[f"Warning: {error}"])
        policy_dir = root / "conf"
        policy_dir.mkdir(parents=True, exist_ok=True)
        # These files are intentionally disabled until a compatible native
        # provider connector is validated. This makes the one-click bundle
        # safe on custom Nginx/Apache builds and gives the UI a real config.
        for provider in installed:
            provider_root = service_root(provider)
            config = provider_root / ("conf/application-shield.caddy" if provider == "caddy" else "conf/modsecurity.conf")
            config.parent.mkdir(parents=True, exist_ok=True)
            config.write_text("# Managed by Server Engine Application Shield\n# Connector staged; activation is disabled until provider compatibility is validated.\n")
            (provider_root / ".serverengine-application-shield-ready").write_text("disabled\n")
        (root / ".serverengine-bundle-version").write_text("modsecurity3+owasp-crs\n")
        # Installation stages the engine and provider connectors, but never
        # changes live web-server configuration automatically. Operators must
        # explicitly attach each provider from the Connectors tab so an
        # unrelated installed server (for example OpenLiteSpeed) cannot start
        # receiving WAF configuration unexpectedly.
        message = f"Application Shield engine and CRS installed for {', '.join(installed)}. Review each provider in Connectors and attach protection explicitly."
        if provider_warnings:
            message += " " + "; ".join(provider_warnings) + "."
        self._update(job_id, status="succeeded", progress=100, message=message)

    def _run_nginx_shield_connector(self, job_id: str, attach: bool = True, finish_job: bool = True):
        """Compile ModSecurity-nginx against the installed managed Nginx."""
        root = service_root("nginx")
        marker = root / ".serverengine-version"
        requested = marker.read_text(errors="replace").strip() if marker.exists() else ""
        match = re.match(r"(\d+\.\d+\.\d+)", requested)
        version = match.group(1) if match else requested
        source_url = nginx_source_for(version)
        if not source_url and match:
            source_url = f"https://nginx.org/download/nginx-{version}.tar.gz"
        if not source_url:
            raise RuntimeError(f"Nginx source {version or 'version'} is unavailable for the connector build.")
        apt = shutil.which("apt")
        dpkg_deb = shutil.which("dpkg-deb")
        make = shutil.which("make")
        compiler = shutil.which("cc") or shutil.which("gcc")
        if not all((apt, dpkg_deb, make, compiler)):
            raise RuntimeError("Building the Nginx ModSecurity connector requires apt, dpkg-deb, make, and a C compiler.")
        staging = root.parent / f".nginx-modsecurity-build-{job_id}"
        archive = staging / f"nginx-{version}.tar.gz"
        connector_archive = staging / "modsecurity-nginx.tar.gz"
        try:
            staging.mkdir(parents=True, exist_ok=True)
            self._update(job_id, status="running", progress=5, message=f"Downloading Nginx {version} source for the connector…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=60) as response, archive.open("wb") as output:
                output.write(response.read())
            connector_url = "https://github.com/owasp-modsecurity/ModSecurity-nginx/archive/refs/heads/master.tar.gz"
            with urllib.request.urlopen(urllib.request.Request(connector_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=60) as response, connector_archive.open("wb") as output:
                output.write(response.read())
            nginx_source_root = staging / "nginx-source"
            connector_root = staging / "connector-source"
            nginx_source_root.mkdir()
            connector_root.mkdir()
            with tarfile.open(archive, "r:gz") as package:
                package.extractall(nginx_source_root, filter="data")
            with tarfile.open(connector_archive, "r:gz") as package:
                package.extractall(connector_root, filter="data")
            nginx_source = next(item for item in nginx_source_root.iterdir() if item.is_dir())
            connector_source = next(item for item in connector_root.iterdir() if item.is_dir())
            dependencies = staging / "dependencies"
            dependencies.mkdir()
            self._update(job_id, progress=20, message="Staging ModSecurity development headers…", log=["$ apt download libmodsecurity-dev"])
            dependency = subprocess.run([apt, "download", "libmodsecurity-dev"], cwd=dependencies, capture_output=True, text=True, check=False, timeout=180)
            package = next(iter(sorted(dependencies.glob("libmodsecurity-dev_*.deb"))), None)
            if dependency.returncode or not package:
                raise RuntimeError((dependency.stderr or dependency.stdout).strip() or "The libmodsecurity development package is unavailable for this host.")
            dependency_root = dependencies / "root"
            extracted = subprocess.run([dpkg_deb, "-x", str(package), str(dependency_root)], capture_output=True, text=True, check=False)
            if extracted.returncode:
                raise RuntimeError((extracted.stderr or extracted.stdout).strip() or "Unable to extract ModSecurity development headers.")
            # Ubuntu's -dev package deliberately depends on the runtime
            # package and only contains a symlink to its soname. Download and
            # extract that runtime package into the same staging tree; never
            # install either package into the host system.
            runtime_package = None
            for runtime_name in ("libmodsecurity3t64", "libmodsecurity3"):
                runtime_result = subprocess.run([apt, "download", runtime_name], cwd=dependencies, capture_output=True, text=True, check=False, timeout=180)
                runtime_package = next(iter(sorted(dependencies.glob(f"{runtime_name}_*.deb"))), None)
                if runtime_result.returncode == 0 and runtime_package:
                    break
            if runtime_package:
                extracted_runtime = subprocess.run([dpkg_deb, "-x", str(runtime_package), str(dependency_root)], capture_output=True, text=True, check=False)
                if extracted_runtime.returncode:
                    raise RuntimeError((extracted_runtime.stderr or extracted_runtime.stdout).strip() or "Unable to stage the ModSecurity runtime library.")
            # libmodsecurity links against these optional providers on Ubuntu
            # builds. Stage their runtime and development names as well so
            # the connector never depends on whatever happens to be installed
            # globally on the host.
            for support_name in (
                "libgeoip1t64", "libgeoip-dev",
                "liblua5.3-0", "liblua5.3-dev",
                "libmaxminddb0", "libmaxminddb-dev",
                "libyajl2", "libyajl-dev",
                "libpcre2-8-0", "libpcre2-dev",
                "libcurl4t64", "libcurl4-openssl-dev",
                "libxml2", "libxml2-dev",
                "zlib1g", "zlib1g-dev",
                "libstdc++6", "libgcc-s1",
            ):
                support_result = subprocess.run([apt, "download", support_name], cwd=dependencies, capture_output=True, text=True, check=False, timeout=180)
                support_package = next(iter(sorted(dependencies.glob(f"{support_name}_*.deb"))), None)
                if support_result.returncode or not support_package:
                    continue
                extracted_support = subprocess.run([dpkg_deb, "-x", str(support_package), str(dependency_root)], capture_output=True, text=True, check=False)
                if extracted_support.returncode:
                    raise RuntimeError((extracted_support.stderr or extracted_support.stdout).strip() or f"Unable to stage the {support_name} library.")
            # The connector includes <modsecurity/modsecurity.h>, therefore
            # MODSECURITY_INC must be the include root, not the modsecurity
            # subdirectory itself.
            include = next(
                (
                    path.parent.parent
                    for path in dependency_root.rglob("*")
                    if path.is_file() and path.as_posix().lower().endswith("/modsecurity/modsecurity.h")
                ),
                None,
            )
            # Ubuntu/Debian package names are inconsistent by release:
            # some ship libmodsecurity.so.3 while others ship
            # libModSecurity.so.3. The linker/configure probe is not
            # case-insensitive, so discover either spelling and expose both
            # conventional names inside the staging tree only.
            library = next(
                (
                    path.parent
                    for path in dependency_root.rglob("*")
                    if path.is_file() or path.is_symlink()
                    if path.name.lower().startswith("libmodsecurity.so")
                ),
                None,
            )
            if not include or not library:
                raise RuntimeError("The ModSecurity development package did not provide headers and a shared library.")
            # Some distro packages expose only the soname (for example
            # libmodsecurity.so.3.0.12).  The connector configure test links
            # with -lmodsecurity, so provide the normal development name in
            # the staged tree instead of relying on a host-wide -dev package.
            candidates = sorted(
                path
                for path in library.iterdir()
                if path.name.lower().startswith("libmodsecurity.so.")
            )
            if not candidates:
                raise RuntimeError("The staged ModSecurity library has no linkable libmodsecurity.so file.")
            versioned_library = candidates[0]
            for linker_name in (library / "libmodsecurity.so", library / "libModSecurity.so"):
                if linker_name.is_symlink() or linker_name.exists():
                    linker_name.unlink()
                if not linker_name.exists():
                    linker_name.symlink_to(versioned_library.name)
            if not (library / "libmodsecurity.so").exists() or not (library / "libModSecurity.so").exists():
                raise RuntimeError("The staged ModSecurity library could not expose both libModSecurity.so and libmodsecurity.so.")
            library_dirs = sorted(
                {
                    path.parent
                    for path in dependency_root.rglob("*")
                    if (path.is_file() or path.is_symlink())
                    and path.name.lower().startswith("lib")
                    and ".so" in path.name.lower()
                }
            )
            library_flags = " ".join(f"-L{path}" for path in library_dirs)
            runtime_paths = ":".join(str(path) for path in library_dirs)
            private_library_flags = ""
            for pkgconfig in dependency_root.rglob("modsecurity.pc"):
                for line in pkgconfig.read_text(errors="replace").splitlines():
                    if line.startswith(("Libs:", "Libs.private:")):
                        private_library_flags += " " + line.split(":", 1)[1].strip()
            # Debian's pkg-config file uses ${prefix}; Nginx configure does
            # not expand it when it is embedded in --with-ld-opt. Resolve it
            # to the staged /usr tree so the host is never consulted.
            private_library_flags = (
                private_library_flags
                .replace("${prefix}", str(dependency_root / "usr"))
                .replace("${exec_prefix}", str(dependency_root / "usr"))
                .replace("${libdir}", str(library))
                .strip()
            )
            # libxml2's static fallback requires zlib explicitly. Keep this
            # in the staged link command even when the distro pkg-config file
            # omits Libs.private.
            if " -lz" not in f" {private_library_flags}":
                private_library_flags = f"{private_library_flags} -lz".strip()
            include_root = dependency_root / "usr/include"
            include_dirs = [include_root] + ([path for path in include_root.iterdir() if path.is_dir()] if include_root.exists() else [])
            include_flags = " ".join(f"-I{path}" for path in include_dirs)
            self._update(
                job_id,
                progress=35,
                message=f"Compiling the ModSecurity connector for Nginx {version}…",
                log=[
                    f"ModSecurity headers: {include}",
                    f"ModSecurity library: {versioned_library}",
                    f"Link aliases: {library / 'libmodsecurity.so'}, {library / 'libModSecurity.so'}",
                    f"Library paths: {runtime_paths}",
                    f"ModSecurity link dependencies: {private_library_flags or 'package defaults'}",
                ],
            )
            # Read the exact profile from the installed binary. Nginx's
            # --with-compat option is not retroactive: a module built with it
            # is still incompatible with a target binary that was built
            # without it. Reusing nginx -V also preserves distro/custom build
            # options for older and newer managed runtimes.
            profile = []
            target_binary = root / "bin/nginx"
            if target_binary.exists():
                version_output = subprocess.run([str(target_binary), "-V"], capture_output=True, text=True, check=False, timeout=10)
                configure_line = next((line for line in (version_output.stderr + version_output.stdout).splitlines() if "configure arguments:" in line), "")
                if configure_line:
                    profile = [argument for argument in shlex.split(configure_line.split("configure arguments:", 1)[1].strip()) if not argument.startswith("--add-module=") and not argument.startswith("--add-dynamic-module=")]
            if not profile:
                profile = [
                    f"--prefix={root}", f"--sbin-path={root / 'bin/nginx'}",
                    f"--conf-path={root / 'conf/nginx.conf'}", f"--pid-path={root / 'run/nginx.pid'}",
                    f"--error-log-path={root / 'logs/error.log'}", f"--http-log-path={root / 'logs/access.log'}",
                    f"--http-client-body-temp-path={root / 'data/client_temp'}", f"--http-proxy-temp-path={root / 'data/proxy_temp'}",
                    f"--http-fastcgi-temp-path={root / 'data/fastcgi_temp'}", "--with-compat",
                    "--with-http_ssl_module", "--with-http_v2_module", "--with-http_gzip_static_module",
                    "--with-threads", "--with-stream",
                ]
            configure = [
                str(nginx_source / "configure"),
                *profile,
                f"--add-dynamic-module={connector_source}",
                f"--with-cc-opt={include_flags} -I{include}",
                f"--with-ld-opt={library_flags} {private_library_flags} -Wl,-rpath,{runtime_paths}",
            ]
            connector_env = {
                **os.environ,
                # ModSecurity-nginx's configure script uses these variables
                # before it falls back to system paths. Set both historical
                # spellings because connector releases differ here.
                "MODSECURITY_INC": str(include),
                "MODSECURITY_LIB": str(library),
                "MOD_SECURITY_INC": str(include),
                "MOD_SECURITY_LIB": str(library),
                "LD_LIBRARY_PATH": f"{runtime_paths}:{os.environ.get('LD_LIBRARY_PATH', '')}",
                "LIBRARY_PATH": f"{runtime_paths}:{os.environ.get('LIBRARY_PATH', '')}",
                "PKG_CONFIG_PATH": f"{dependency_root / 'usr/lib/pkgconfig'}:{dependency_root / 'usr/share/pkgconfig'}:{os.environ.get('PKG_CONFIG_PATH', '')}",
                "CFLAGS": f"{include_flags} -I{include} {os.environ.get('CFLAGS', '')}".strip(),
                "CPPFLAGS": f"{include_flags} -I{include} {os.environ.get('CPPFLAGS', '')}".strip(),
                "LDFLAGS": f"{library_flags} -Wl,-rpath,{runtime_paths} {os.environ.get('LDFLAGS', '')}".strip(),
                "LIBS": f"-lmodsecurity {private_library_flags} {os.environ.get('LIBS', '')}".strip(),
            }
            configured = subprocess.run(configure, cwd=nginx_source, env=connector_env, capture_output=True, text=True, check=False, timeout=180)
            self._update(job_id, progress=45, message=f"Configuring the Nginx {version} connector…", log=(configured.stdout + configured.stderr).splitlines()[-80:])
            if configured.returncode:
                diagnostics = []
                for diagnostic_name in ("objs/autoconf.err", "objs/autoconf.log", "config.log"):
                    diagnostic = nginx_source / diagnostic_name
                    if diagnostic.exists():
                        diagnostics.extend(diagnostic.read_text(errors="replace").splitlines()[-80:])
                detail = "\n".join(diagnostics) or (configured.stderr or configured.stdout).strip()
                raise RuntimeError(detail[-4000:] or "Nginx connector configure failed.")
            build_command = [make, "-j2", "modules"]
            self._update(job_id, progress=55, message=f"Compiling the Nginx {version} connector…", log=[f"$ {' '.join(build_command)}"])
            build_output = []
            with subprocess.Popen(build_command, cwd=nginx_source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1) as build:
                for line in build.stdout or []:
                    if line.strip():
                        build_output.append(line.rstrip())
                        if len(build_output) > 1000:
                            del build_output[:-1000]
                        if len(build_output) == 1 or len(build_output) % 5 == 0:
                            self._update(job_id, progress=80, message=f"Compiling the Nginx {version} connector…", log=[f"$ {' '.join(build_command)}", *build_output[-999:]])
                build_code = build.wait()
            if build_code:
                raise RuntimeError("\n".join(build_output[-30:])[-1600:] or "Nginx ModSecurity connector build failed.")
            module = next(nginx_source.rglob("ngx_http_modsecurity_module.so"), None)
            if not module:
                raise RuntimeError("The connector build completed without producing ngx_http_modsecurity_module.so.")
            target = root / "usr/lib/nginx/modules/ngx_http_modsecurity_module.so"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(module, target)
            if attach:
                from app.services.application_shield_service import application_shield_service
                application_shield_service.attach("nginx")
                message = f"Nginx ModSecurity connector was compiled for Nginx {version} and attached successfully."
            else:
                (root / ".serverengine-application-shield-ready").write_text("ready\n")
                message = f"Nginx ModSecurity connector was compiled for Nginx {version} and staged for the next Shield attach."
            if finish_job:
                self._update(job_id, status="succeeded", progress=100, message=message, log=[str(target)])
            else:
                self._update(job_id, progress=98, message=message, log=[str(target)])
        except Exception as error:
            if finish_job:
                self._update(job_id, status="failed", message=str(error))
            else:
                raise
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _run_provider_shield_connector(self, job_id: str, provider: str):
        try:
            if provider in {"nginx", "apache", "openlitespeed", "caddy"} and provider in {"openlitespeed", "caddy"}:
                marker = service_root(provider) / ".serverengine-install-method"
                method = marker.read_text(errors="replace").strip() if marker.exists() else "source"
                if method != "prebuilt":
                    raise RuntimeError(f"Application Shield currently supports prebuilt {provider.title()} runtimes only. Install or reinstall {provider.title()} using the Prebuilt package method, then attach Shield again.")
            if provider == "nginx":
                install_method = (service_root("nginx") / ".serverengine-install-method").read_text(errors="replace").strip() if (service_root("nginx") / ".serverengine-install-method").exists() else "source"
                if install_method == "prebuilt" and self._install_application_shield_nginx_connector(job_id):
                    return
                if install_method == "prebuilt":
                    self._update(job_id, progress=8, message="No exact prebuilt Nginx connector is available; compiling a matching connector…", log=["Prebuilt Nginx/ModSecurity module pair was not published for this version."])
                self._run_nginx_shield_connector(job_id)
                return
            from app.services.application_shield_service import application_shield_service
            if provider == "apache":
                self._stage_apache_runtime_libraries(job_id)
                self._install_application_shield_apache_connector(job_id)
            elif provider == "caddy":
                root = service_root("caddy")
                marker = root / ".serverengine-version"
                version = marker.read_text(errors="replace").strip() if marker.exists() else "2.9.1"
                method_marker = root / ".serverengine-install-method"
                method = method_marker.read_text(errors="replace").strip() if method_marker.exists() else "source"
                if method != "prebuilt":
                    raise RuntimeError("Application Shield can currently attach to prebuilt Caddy only. Reinstall Caddy using the Prebuilt package method, then attach Shield again.")
                if re.match(r"^2\.6\.2(?:$|[-+])", version):
                    raise RuntimeError("Caddy 2.6.2 is prebuilt but too old for the available Go toolchain's Shield build. Install a newer prebuilt Caddy release, then attach Application Shield again.")
                self._ensure_source_build_dependencies(job_id, "caddy")
                self._run_caddy_binary(job_id, version)
                with self._lock:
                    current = self._jobs.get(job_id)
                if not current or current.status != "succeeded":
                    return
            elif provider == "openlitespeed":
                self._ensure_source_build_dependencies(job_id, "openlitespeed")
                raise RuntimeError("OpenLiteSpeed is installed, but its ModSecurity connector is not available in this managed build yet.")
            else:
                raise RuntimeError(f"No Application Shield connector preparer exists for {provider}.")
            application_shield_service.attach(provider)
            self._update(job_id, status="succeeded", progress=100, message=f"{provider.title()} Application Shield connector prepared, validated, and attached.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _merge_managed_tree(self, source: Path, target: Path):
        """Merge extracted connector files without failing on existing links."""
        if source.is_symlink():
            if target.is_dir() and not target.is_symlink():
                shutil.rmtree(target)
            else:
                target.unlink(missing_ok=True)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.symlink_to(os.readlink(source), target_is_directory=source.is_dir())
            return
        if source.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            for child in source.iterdir():
                self._merge_managed_tree(child, target / child.name)
            return
        if target.is_dir() and not target.is_symlink():
            shutil.rmtree(target)
        else:
            target.unlink(missing_ok=True)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    def _stage_apache_runtime_libraries(self, job_id: str):
        """Stage Apache and ModSecurity runtime libraries without host installs."""
        root = service_root("apache")
        library_root = root / ".runtime-libraries"
        apt = shutil.which("apt")
        dpkg_deb = shutil.which("dpkg-deb")
        if not apt or not dpkg_deb:
            raise RuntimeError("Apache runtime libraries are missing, but the isolated package tools are unavailable.")
        library_root.mkdir(parents=True, exist_ok=True)
        required = {
            "libpcre3": "libpcre.so.3",
            "liblua5.1-0": "liblua5.1.so.0",
            "libyajl2": "libyajl.so.2",
            "libapr1t64": "libapr-1.so.0",
            "libaprutil1t64": "libaprutil-1.so.0",
        }
        missing = [package for package, library in required.items() if not any(library_root.rglob(library)) and not any((root / "lib").rglob(library))]
        if not missing:
            return
        self._update(job_id, progress=95, message="Preparing Apache and ModSecurity runtime libraries…", log=[f"$ apt download {' '.join(missing)}"])
        for package_name in missing:
            result = subprocess.run([apt, "download", package_name], cwd=library_root, capture_output=True, text=True, check=False, timeout=180)
            archive = next(iter(sorted(library_root.glob(f"{package_name}_*.deb"))), None)
            if result.returncode or not archive:
                raise RuntimeError((result.stderr or result.stdout).strip() or f"Unable to download Apache runtime library package {package_name}.")
            extracted = subprocess.run([dpkg_deb, "-x", str(archive), str(library_root)], capture_output=True, text=True, check=False)
            archive.unlink(missing_ok=True)
            if extracted.returncode or not any(library_root.rglob(required[package_name])):
                raise RuntimeError((extracted.stderr or extracted.stdout).strip() or f"Unable to stage Apache runtime library {required[package_name]}.")

    def _install_application_shield_nginx_connector(self, job_id: str) -> bool:
        """Use Ubuntu's module only when its package version matches Nginx exactly."""
        apt = shutil.which("apt")
        dpkg_deb = shutil.which("dpkg-deb")
        if not apt or not dpkg_deb:
            return False
        provider_root = service_root("nginx")
        staging = provider_root.parent / f".nginx-modsecurity-{job_id}"
        try:
            packages = staging / "packages"
            extracted = staging / "root"
            packages.mkdir(parents=True, exist_ok=True)
            extracted.mkdir(parents=True, exist_ok=True)
            nginx_marker = provider_root / ".serverengine-version"
            nginx_version = nginx_marker.read_text(errors="replace").strip() if nginx_marker.exists() else ""
            if not nginx_version:
                return False
            module_package = "libnginx-mod-http-modsecurity"
            apt_cache = shutil.which("apt-cache")
            module_version = None
            module_abi = None
            if apt_cache:
                metadata = subprocess.run(
                    [apt_cache, "show", module_package],
                    capture_output=True,
                    text=True,
                    check=False,
                    timeout=8,
                )
                depends = next(
                    (line.split(":", 1)[1].strip() for line in metadata.stdout.splitlines() if line.startswith("Depends:")),
                    "",
                )
                abi_match = re.search(r"nginx-abi-([0-9]+\.[0-9]+\.[0-9]+)-", depends)
                module_abi = abi_match.group(1) if abi_match else None
                active_abi = re.match(r"([0-9]+\.[0-9]+\.[0-9]+)", nginx_version)
                catalog = subprocess.run(
                    [apt_cache, "madison", module_package],
                    capture_output=True,
                    text=True,
                    check=False,
                    timeout=8,
                )
                if module_abi and active_abi and module_abi == active_abi.group(1):
                    for line in catalog.stdout.splitlines():
                        parts = [part.strip() for part in line.split("|")]
                        if len(parts) >= 2 and parts[1]:
                            module_version = parts[1]
                            break
            # Module package versions differ from Nginx package versions;
            # the declared nginx-abi dependency is the compatibility key.
            if not module_version:
                return False
            package_request = f"{module_package}={module_version}"
            ndk_package = "libnginx-mod-http-ndk"
            self._update(job_id, progress=18, message=f"Using the prebuilt ModSecurity connector for Nginx ABI {module_abi}…", log=[f"$ apt download {package_request} {ndk_package}"])
            result = subprocess.run([apt, "download", package_request, ndk_package], cwd=packages, capture_output=True, text=True, check=False, timeout=180)
            archives = sorted(packages.glob("*.deb"))
            if result.returncode or not archives:
                return False
            for archive in archives:
                unpacked = subprocess.run([dpkg_deb, "-x", str(archive), str(extracted)], capture_output=True, text=True, check=False)
                if unpacked.returncode:
                    return False
            if not any(extracted.rglob("libGeoIP.so.1")):
                for geoip_package in ("libgeoip1t64", "libgeoip1"):
                    geoip_result = subprocess.run([apt, "download", geoip_package], cwd=packages, capture_output=True, text=True, check=False, timeout=180)
                    geoip_archive = next(iter(sorted(packages.glob(f"{geoip_package}_*.deb"))), None)
                    if geoip_result.returncode == 0 and geoip_archive:
                        unpacked = subprocess.run([dpkg_deb, "-x", str(geoip_archive), str(extracted)], capture_output=True, text=True, check=False)
                        if unpacked.returncode == 0:
                            break
            _persist_shared_library_tree(extracted, "modsecurity")
            module = next(extracted.rglob("ngx_http_modsecurity_module.so"), None)
            if not module:
                return False
            target = provider_root / "usr/lib/nginx/modules/ngx_http_modsecurity_module.so"
            target.parent.mkdir(parents=True, exist_ok=True)
            previous = target.read_bytes() if target.exists() else None
            shutil.copy2(module, target)
            try:
                from app.services.application_shield_service import application_shield_service
                application_shield_service.attach("nginx")
            except Exception:
                if previous is None:
                    target.unlink(missing_ok=True)
                else:
                    target.write_bytes(previous)
                raise
            self._update(job_id, status="succeeded", progress=100, message=f"The prebuilt Nginx ModSecurity connector for {nginx_version} was validated and attached.", log=[str(target)])
            return True
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _install_application_shield_apache_connector(self, job_id: str):
        """Stage Apache's managed ModSecurity module without touching host dpkg."""
        apt = shutil.which("apt")
        dpkg_deb = shutil.which("dpkg-deb")
        if not apt or not dpkg_deb:
            raise RuntimeError("The isolated package tools are unavailable; cannot install the Apache Application Shield connector.")
        provider_root = service_root("apache")
        # Older managed Apache installs generated this directive even though
        # Ubuntu's Apache binary already contains unixd_module. Clean it
        # before the connector validation/startup path reaches httpd.
        apache_config = provider_root / "conf/httpd.conf"
        if apache_config.exists():
            current_config = apache_config.read_text(errors="replace")
            sanitized_config = _sanitize_apache_configuration(current_config)
            if sanitized_config != current_config:
                apache_config.write_text(sanitized_config)
        install_method = (provider_root / ".serverengine-install-method").read_text(errors="replace").strip() if (provider_root / ".serverengine-install-method").exists() else "source"
        if install_method != "prebuilt":
            self._build_application_shield_apache_connector(job_id)
            return
        staging = provider_root.parent / f".apache-modsecurity-{job_id}"
        try:
            self._stage_apache_runtime_libraries(job_id)
            packages = staging / "packages"
            extracted = staging / "root"
            packages.mkdir(parents=True, exist_ok=True)
            extracted.mkdir(parents=True, exist_ok=True)
            self._update(job_id, progress=96, message="Installing the managed Apache Application Shield connector…", log=["$ apt download libapache2-mod-security2"])
            result = subprocess.run([apt, "download", "libapache2-mod-security2"], cwd=packages, capture_output=True, text=True, check=False, timeout=180)
            archives = sorted(packages.glob("*.deb"))
            if result.returncode or not archives:
                raise RuntimeError((result.stderr or result.stdout).strip() or "The Apache ModSecurity connector is not available for this host.")
            for archive in archives:
                unpacked = subprocess.run([dpkg_deb, "-x", str(archive), str(extracted)], capture_output=True, text=True, check=False)
                if unpacked.returncode:
                    raise RuntimeError((unpacked.stderr or unpacked.stdout).strip() or "Apache ModSecurity connector extraction failed")
            for item in extracted.iterdir():
                self._merge_managed_tree(item, provider_root / item.name)
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _build_application_shield_apache_connector(self, job_id: str):
        """Build ModSecurity 2.9 against this Apache installation's APXS."""
        root = service_root("apache")
        apxs = root / "bin/apxs"
        if not apxs.exists():
            apxs = root / "bin/apxs2"
        if not apxs.exists():
            raise RuntimeError(f"Apache's matching apxs tool was not found in {root / 'bin'}; the source Apache installation is incomplete.")
        apr_config = root / "bin/apr-1-config"
        apu_config = root / "bin/apu-1-config"
        if not apr_config.exists() or not apu_config.exists():
            raise RuntimeError(f"Apache's bundled APR/APR-util config tools were not found in {root / 'bin'}; rebuild Apache with its APR libraries first.")
        version = (root / ".serverengine-version").read_text(errors="replace").strip() if (root / ".serverengine-version").exists() else "the installed version"
        apache_match = re.match(r"^(\d+)\.(\d+)", version)
        if apache_match and (int(apache_match.group(1)), int(apache_match.group(2))) < (2, 4):
            raise RuntimeError(
                f"Apache {version} is too old for the maintained ModSecurity Apache connector. "
                "Apache 2.3 is an obsolete development branch and its module API is incompatible. "
                "Install Apache 2.4.x, then attach Application Shield again."
            )
        source_version = "2.9.14"
        source_url = f"https://github.com/SpiderLabs/ModSecurity/archive/refs/tags/v{source_version}.tar.gz"
        staging = root.parent / f".apache-modsecurity-source-{job_id}"
        archive = staging / f"modsecurity-{source_version}.tar.gz"
        try:
            self._ensure_source_build_dependencies(job_id, "apache")
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            self._update(job_id, progress=12, message=f"Downloading ModSecurity {source_version} for Apache {version}…", log=[f"$ curl -fL {source_url}"])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=180) as response, archive.open("wb") as output:
                shutil.copyfileobj(response, output)
            with tarfile.open(archive, "r:gz") as package:
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir() and item.name.startswith("ModSecurity-")), None)
            if source is None:
                raise RuntimeError("The ModSecurity source archive did not contain its expected source directory.")
            if not (source / "others/libinjection/src/libinjection_html5.c").exists():
                git = shutil.which("git")
                if not git:
                    raise RuntimeError("ModSecurity requires git to fetch its libinjection submodule.")
                git_source = staging / "ModSecurity-git"
                self._update(job_id, progress=20, message="Fetching ModSecurity source dependencies…", log=[f"$ git clone --depth 1 --branch v{source_version} --recurse-submodules https://github.com/SpiderLabs/ModSecurity.git {git_source}"])
                cloned = subprocess.run([git, "clone", "--depth", "1", "--branch", f"v{source_version}", "--recurse-submodules", "https://github.com/SpiderLabs/ModSecurity.git", str(git_source)], capture_output=True, text=True, check=False, timeout=600)
                clone_log = (cloned.stdout + cloned.stderr).splitlines()
                self._update(job_id, progress=22, message="Fetching ModSecurity source dependencies…", log=clone_log[-100:])
                if cloned.returncode:
                    raise RuntimeError((cloned.stderr or cloned.stdout).strip()[-1800:] or "Unable to fetch the ModSecurity libinjection submodule.")
                source = git_source
            autogen = source / "autogen.sh"
            if autogen.exists():
                self._update(job_id, progress=24, message="Preparing the Apache ModSecurity connector build…", log=[f"$ ./autogen.sh (cwd {source})"])
                prepared = subprocess.run(["./autogen.sh"], cwd=source, capture_output=True, text=True, check=False, timeout=180)
                prepared_log = (prepared.stdout + prepared.stderr).splitlines()
                self._update(job_id, progress=28, message="Preparing the Apache ModSecurity connector build…", log=prepared_log[-100:])
                if prepared.returncode:
                    raise RuntimeError((prepared.stderr or prepared.stdout).strip()[-1800:] or "ModSecurity configure preparation failed.")
            configure = [
                "./configure",
                f"--with-apxs={apxs}",
                f"--with-apr={apr_config}",
                f"--with-apu={apu_config}",
                "--disable-mlogc",
                "--without-ssdeep",
            ]
            self._update(job_id, progress=35, message=f"Configuring ModSecurity {source_version} for Apache {version}…", log=[f"$ {' '.join(configure)}"])
            connector_env = {
                **os.environ,
                "PATH": f"{root / 'bin'}:{os.environ.get('PATH', '')}",
                "CPPFLAGS": f"-I{root / 'include'} {os.environ.get('CPPFLAGS', '')}".strip(),
                "LDFLAGS": f"-L{root / 'lib'} -Wl,-rpath,{root / 'lib'} {os.environ.get('LDFLAGS', '')}".strip(),
                "LD_LIBRARY_PATH": f"{root / 'lib'}:{os.environ.get('LD_LIBRARY_PATH', '')}",
            }
            configured = subprocess.run(configure, cwd=source, env=connector_env, capture_output=True, text=True, check=False, timeout=300)
            configured_log = (configured.stdout + configured.stderr).splitlines()
            self._update(job_id, progress=48, message=f"Configuring ModSecurity {source_version} for Apache {version}…", log=configured_log[-120:])
            if configured.returncode:
                raise RuntimeError((configured.stderr or configured.stdout).strip()[-2200:] or "ModSecurity Apache connector configuration failed.")
            self._update(job_id, progress=52, message=f"Compiling ModSecurity {source_version} against Apache {version}…", log=["$ make -j2"])
            build_command = ["make", "-j2"]
            build_log = []
            with subprocess.Popen(build_command, cwd=source, env=connector_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1) as built:
                for line in built.stdout or []:
                    if line.strip():
                        build_log.append(line.rstrip())
                        if len(build_log) > 1000:
                            del build_log[:-1000]
                        if len(build_log) == 1 or len(build_log) % 5 == 0:
                            self._update(job_id, progress=82, message=f"Compiling ModSecurity {source_version} against Apache {version}…", log=[f"$ {' '.join(build_command)}", *build_log[-999:]])
                build_code = built.wait()
            if build_code:
                raise RuntimeError("\n".join(build_log[-30:])[-2400:] or "ModSecurity Apache connector compilation failed.")
            module = next(source.rglob("mod_security2.so"), None)
            if module is None:
                raise RuntimeError("The ModSecurity Apache build completed without producing mod_security2.so.")
            target = root / "modules/mod_security2.so"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(module, target)
            _persist_shared_library_tree(dependency_root, "modsecurity")
            (root / ".serverengine-apache-connector-method").write_text("source\n")
            self._update(job_id, progress=94, message=f"ModSecurity connector compiled for Apache {version}; validating attachment…", log=[f"$ apxs: {apxs}", f"$ module: {target}"])
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _install_application_shield_crs(self, job_id: str):
        apt = shutil.which("apt")
        dpkg_deb = shutil.which("dpkg-deb")
        if not apt or not dpkg_deb:
            raise RuntimeError("The isolated package tools are unavailable; cannot install OWASP CRS.")
        root = service_root("modsecurity")
        staging = root.parent / f".modsecurity-crs-{job_id}"
        try:
            packages = staging / "packages"
            extracted = staging / "root"
            packages.mkdir(parents=True, exist_ok=True)
            extracted.mkdir(parents=True, exist_ok=True)
            self._update(job_id, progress=76, message="Downloading OWASP CRS package…", log=["$ apt download modsecurity-crs"])
            result = subprocess.run([apt, "download", "modsecurity-crs"], cwd=packages, capture_output=True, text=True, check=False, timeout=180)
            if result.returncode != 0:
                raise RuntimeError((result.stderr or result.stdout).strip() or "OWASP CRS package is not available for this host")
            archives = sorted(packages.glob("*.deb"))
            if not archives:
                raise RuntimeError("The OWASP CRS package provider returned no archive")
            for archive in archives:
                unpacked = subprocess.run([dpkg_deb, "-x", str(archive), str(extracted)], capture_output=True, text=True, check=False)
                if unpacked.returncode:
                    raise RuntimeError((unpacked.stderr or unpacked.stdout).strip() or "OWASP CRS extraction failed")
            source = extracted / "usr/share/modsecurity-crs"
            target = root / "crs"
            if target.exists():
                shutil.rmtree(target)
            if source.exists():
                shutil.copytree(source, target, symlinks=True)
            else:
                target.mkdir(parents=True, exist_ok=True)
                for item in extracted.rglob("*"):
                    if item.is_file():
                        destination = target / item.name
                        shutil.copy2(item, destination)
            (target / ".serverengine-version").write_text("installed\n")
            self._update(job_id, progress=92, message="OWASP CRS is ready in the managed shield root.", log=[f"CRS root: {target}"])
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _run_docker_container_action(self, job_id: str, container_id: str, action: str):
        docker = shutil.which("docker")
        if not docker:
            raise RuntimeError("Docker Engine is not installed or available.")
        if action not in {"start", "stop", "restart", "pause", "delete"}:
            raise RuntimeError(f"Unsupported Docker container action: {action}")
        self._update(job_id, status="running", progress=20, message=f"{action.title()}ing Docker container {container_id[:12]}…", log=[])
        command = [docker, "rm", "-f", container_id] if action == "delete" else [docker, action, container_id]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        output = (result.stdout or result.stderr or "").strip()
        if result.returncode != 0:
            raise RuntimeError(output or f"Docker could not {action} the container.")
        command_text = "$ " + " ".join(command)
        self._update(job_id, status="succeeded", progress=100, message=f"Docker container {action} completed.", log=[command_text, output] if output else [command_text])

    def _run_sqlserver_action(self, job_id: str, action: str):
        """Control the isolated SQL Server container without touching host Docker workloads."""
        docker = shutil.which("docker")
        if not docker:
            raise RuntimeError("Docker Engine is not installed or available to Server Engine.")
        container = "server-engine-sqlserver"
        if action not in {"start", "stop", "restart"}:
            raise RuntimeError(f"Unsupported SQL Server action: {action}")
        command = [docker, action, container]
        self._update(job_id, status="running", progress=20, message=f"{action.title()}ing Microsoft SQL Server…", log=["$ " + " ".join(command)])
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        output = (result.stdout or result.stderr or "").strip()
        if result.returncode != 0:
            raise RuntimeError(output or f"Unable to {action} Microsoft SQL Server")
        self._update(job_id, status="succeeded", progress=100, message=f"Microsoft SQL Server {action} completed.", log=["$ " + " ".join(command), output] if output else ["$ " + " ".join(command)])

    def _run_docker_compose(self, job_id: str, project_dir: Path, filename: str, content: str):
        docker = shutil.which("docker")
        if not docker:
            raise RuntimeError("Docker Engine is not installed or available.")
        project_dir.mkdir(parents=True, exist_ok=True)
        compose_file = project_dir / filename
        compose_file.write_text(content.rstrip() + "\n")
        try:
            serverengine = pwd.getpwnam("serverengine")
            os.chown(project_dir, serverengine.pw_uid, serverengine.pw_gid)
            os.chown(compose_file, serverengine.pw_uid, serverengine.pw_gid)
        except (KeyError, PermissionError, OSError):
            pass
        command = [docker, "compose", "-f", filename, "up", "-d"]
        self._update(job_id, status="running", progress=15, message=f"Creating Compose project {project_dir.name}…", log=[f"$ {' '.join(command)}", f"Project directory: {project_dir}"])
        result = subprocess.run(command, cwd=project_dir, capture_output=True, text=True, check=False)
        output = (result.stdout + result.stderr).strip()
        log = output.splitlines()[-160:] if output else ["Compose returned no output."]
        if result.returncode:
            raise RuntimeError(output[-2000:] or "Docker Compose could not start the project.")
        self._update(job_id, status="succeeded", progress=100, message=f"Compose project {project_dir.name} is running.", log=log)

    def _run_action(self, job_id: str, service_id: str, action: str, version: str | None = None):
        if action == "start" and self._managed_service_process_alive(service_id, version):
            self._update(
                job_id,
                status="succeeded",
                message=f"{service_id} is already running.",
                log=[],
            )
            return
        if service_id == "docker":
            self._run_docker_container_action(job_id, version or "", action)
            return
        if service_id == "sqlserver":
            self._run_sqlserver_action(job_id, action)
            return
        if service_id in {"mysql", "mariadb"}:
            self._run_mysql_action(job_id, action, service_id)
            return
        if service_id == "mongodb":
            self._run_mongodb_action(job_id, action)
            return
        if service_id == "vsftpd":
            self._run_vsftpd_action(job_id, action)
            return
        if service_id == "powerdns":
            self._run_powerdns_action(job_id, action)
            return
        if service_id == "openlitespeed":
            self._run_openlitespeed_action(job_id, action)
            return
        if service_id == "caddy":
            self._run_caddy_action(job_id, action)
            return
        if service_id == "stalwart":
            self._run_stalwart_action(job_id, action)
            return
        if service_id == "haproxy":
            self._run_haproxy_action(job_id, action)
            return
        if service_id == "postgresql":
            self._run_postgresql_action(job_id, action)
            return
        if service_id == "redis":
            self._run_redis_action(job_id, action)
            return
        if service_id == "valkey":
            self._run_valkey_action(job_id, action)
            return
        if service_id == "fail2ban":
            self._run_fail2ban_action(job_id, action)
            return
        if service_id == "memcached":
            self._run_memcached_action(job_id, action)
            return
        if service_id == "nodejs" and action == "uninstall":
            root = service_root("nodejs", version)
            versions_root = service_root("nodejs") / "versions"
            if not version or root.parent != versions_root or not root.exists():
                self._update(job_id, status="failed", message="That Node.js runtime is not installed.")
                return
            shutil.rmtree(root)
            self._update(job_id, status="succeeded", message=f"Node.js {version} was uninstalled.")
            return
        nginx = nginx_paths()
        apache_root = service_root("apache")
        apache_binary = binary_path("apache")
        apache_config = apache_root / "conf/httpd.conf"
        if service_id == "apache" and apache_config.exists():
            apache_content = apache_config.read_text(errors="replace")
            sanitized = _sanitize_apache_configuration(apache_content)
            if sanitized != apache_content:
                apache_config.write_text(sanitized)
        commands = {
            "nginx": {"start": [str(nginx["binary"]), "-p", str(nginx["root"]), "-c", str(nginx["config"])], "stop": [str(nginx["binary"]), "-p", str(nginx["root"]), "-c", str(nginx["config"]), "-s", "stop"], "restart": [str(nginx["binary"]), "-p", str(nginx["root"]), "-c", str(nginx["config"]), "-s", "reload"]},
            "apache": {"start": [str(apache_binary), "-f", str(apache_config), "-k", "start"], "stop": [str(apache_binary), "-f", str(apache_config), "-k", "stop"], "restart": [str(apache_binary), "-f", str(apache_config), "-k", "graceful"]},
        }
        php = php_fpm_paths(version) if service_id == "php" and version else None
        if php:
            if os.geteuid() == 0:
                self._ensure_service_user()
            ensure_php_fpm_layout(version)
            if action == "uninstall":
                self._run_php_uninstall(job_id, version, php)
                return
            command = [str(php["binary"]), "--nodaemonize", "--fpm-config", str(php["config"]), "--php-ini", str(php["ini"])] if action in {"start", "restart"} else None
        else:
            command = commands.get(service_id, {}).get(action)
        if command is None:
            if php and action == "stop":
                self._stop_process_by_binary(php["binary"], php.get("pid"))
                self._update(job_id, status="succeeded", message=f"PHP-FPM {version} stopped.")
                return
            self._update(job_id, status="failed", message=f"No service controller exists for {service_id} on this host.")
            return
        try:
            if service_id == "nginx" and action == "start" and _managed_process_alive(nginx["pid"]):
                self._update(job_id, status="succeeded", message="Nginx is already running.", log=[])
                return
            if service_id == "nginx" and action in {"start", "restart"}:
                ensure_nginx_layout()
                # Migrate any older Application Shield rules file before the
                # provider parses it (older versions emitted Apache-only
                # IncludeOptional directives).
                from app.services.application_shield_service import application_shield_service
                application_shield_service.ensure_engine_config()
                runtime_env = managed_library_environment(nginx["root"], service_root("modsecurity"))
                check = subprocess.run([str(nginx["binary"]), "-p", str(nginx["root"]), "-c", str(nginx["config"]), "-t"], capture_output=True, text=True, check=False, env=runtime_env)
                check_output = (check.stdout + check.stderr).strip().splitlines()[-80:]
                self._update(job_id, log=check_output)
                if check.returncode != 0:
                    raise RuntimeError(check_output[-1] if check_output else "Nginx configuration validation failed")
            self._update(job_id, status="running", message=f"Running: {' '.join(command)}", log=[])
            if php:
                if action == "restart":
                    self._stop_process_by_binary(php["binary"], php.get("pid"))
                    import time
                    time.sleep(0.4)
                runtime_env = os.environ.copy()
                runtime_env["LD_LIBRARY_PATH"] = php_runtime_library_path(php["root"])
                runtime_env["PHP_INI_SCAN_DIR"] = str(php["root"] / "conf/conf.d")
                with php["error_log"].open("a") as log_file:
                    process = subprocess.Popen(command, stdout=log_file, stderr=subprocess.STDOUT, start_new_session=True, env=runtime_env)
                import time
                deadline = time.monotonic() + 2.0
                while time.monotonic() < deadline and not php["socket"].exists():
                    if process.poll() is not None:
                        break
                    time.sleep(0.1)
                if process.poll() is not None:
                    raise RuntimeError(f"PHP-FPM exited with code {process.returncode}; inspect {php['error_log']}")
                if not php["socket"].exists():
                    raise RuntimeError(f"PHP-FPM did not create its socket at {php['socket']}; inspect {php['error_log']}")
                self._update(job_id, status="succeeded", message=f"PHP-FPM {version} {action} completed. Socket: {php['socket']}")
                return
            runtime_env = managed_library_environment(service_root(service_id), service_root("modsecurity"))
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=runtime_env)
            output = []
            for line in process.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, log=output[-80:])
            if process.wait() != 0:
                raise RuntimeError(f"Service command failed with exit code {process.returncode}")
            self._update(job_id, status="succeeded", message=f"{service_id} {action} completed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _managed_service_process_alive(self, service_id: str, version: str | None = None) -> bool:
        """Return whether the managed executable for a service is alive.

        Start requests can arrive from an old browser tab or a startup policy
        while the service is already running. Check the actual managed process
        before dispatching to a controller so a second daemon is never created.
        """
        if service_id == "sqlserver":
            docker = shutil.which("docker")
            if not docker:
                return False
            result = subprocess.run(
                [docker, "inspect", "--format", "{{.State.Running}}", "server-engine-sqlserver"],
                capture_output=True,
                text=True,
                check=False,
            )
            return result.returncode == 0 and result.stdout.strip() == "true"
        if service_id in {"docker", "nodejs", "python", "ruby", "certbot", "git", "imagemagick", "ffmpeg", "lynis"}:
            return False
        try:
            binary = php_fpm_paths(version)["binary"] if service_id == "php" and version else binary_path(service_id)
        except (KeyError, OSError, TypeError):
            return False
        if not binary.exists():
            return False
        pgrep = shutil.which("pgrep")
        if pgrep:
            result = subprocess.run(
                [pgrep, "-f", str(binary)],
                capture_output=True,
                text=True,
                check=False,
            )
            return any(item.isdigit() for item in result.stdout.split())
        proc_root = Path("/proc")
        if not proc_root.exists():
            return False
        for command_line in proc_root.glob("[0-9]*/cmdline"):
            try:
                command = command_line.read_bytes().replace(b"\x00", b" ").decode(errors="replace")
            except OSError:
                continue
            if str(binary) in command:
                return True
        return False

    def _run_vsftpd_action(self, job_id: str, action: str):
        root = service_root("vsftpd")
        binary = binary_path("vsftpd")
        config = root / "conf/vsftpd.conf"
        pid_file = root / "run/vsftpd.pid"
        log_file = root / "logs/vsftpd.log"
        try:
            if not binary.exists():
                raise RuntimeError("vsftpd is not installed")
            self._prepare_service_runtime(root, "conf", "run", "logs", "empty")
            state_path = Path(os.getenv("SE_FTP_STATE_PATH", str(Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine")) / "ftp.json")))
            settings = {}
            if state_path.exists():
                try:
                    settings = json.loads(state_path.read_text()).get("settings", {})
                except (OSError, json.JSONDecodeError):
                    settings = {}
            control_port = int(settings.get("control_port", 21))
            passive_min = int(settings.get("passive_min", 40000))
            passive_max = int(settings.get("passive_max", 40100))
            config.write_text(
                "anonymous_enable=NO\nlocal_enable=YES\nwrite_enable=YES\n"
                f"listen=YES\nlisten_ipv6=NO\nbackground=NO\nlisten_port={control_port}\n"
                f"pasv_min_port={passive_min}\npasv_max_port={passive_max}\n"
                f"secure_chroot_dir={root / 'empty'}\n"
                "nopriv_user=serverengine\n"
                f"xferlog_file={log_file}\n"
            )
            if action in {"stop", "restart"} and pid_file.exists():
                try:
                    os.kill(int(pid_file.read_text().strip()), 15)
                except (OSError, ValueError):
                    pass
                pid_file.unlink(missing_ok=True)
            if action == "stop":
                self._update(job_id, status="succeeded", message="vsftpd stopped.", log=[])
                return
            self._update(job_id, status="running", message=f"Starting vsftpd with {config}…", log=[])
            runtime_env = os.environ.copy()
            library_paths = [root / "lib", root / "usr/lib", root / "lib/aarch64-linux-gnu", root / "usr/lib/aarch64-linux-gnu", root / "lib/x86_64-linux-gnu", root / "usr/lib/x86_64-linux-gnu"]
            runtime_env["LD_LIBRARY_PATH"] = ":".join(str(item) for item in library_paths if item.exists())
            process = subprocess.Popen([str(binary), str(config)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True, env=runtime_env)
            import time
            time.sleep(0.3)
            if process.poll() is not None:
                raise RuntimeError(f"vsftpd exited with code {process.returncode}; inspect {log_file}")
            pid_file.write_text(str(process.pid))
            self._update(job_id, status="succeeded", message=f"vsftpd {action} completed.", log=[])
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_stalwart_action(self, job_id: str, action: str):
        root = service_root("stalwart")
        binary = root / "bin/stalwart"
        config = root / "conf/config.json"
        log_file = root / "logs/stalwart.log"
        try:
            if not binary.exists():
                raise RuntimeError("Stalwart is not installed")
            self._prepare_service_runtime(root, "conf", "data", "logs", "run")
            if not config.exists():
                config.write_text(json.dumps({"@type": "RocksDb", "path": str(root / "data")}, indent=2) + "\n")
            credentials_file = root / "conf/serverengine-credentials.json"
            if not credentials_file.exists():
                credentials = {"username": "serverengine", "password": secrets.token_urlsafe(32)}
                credentials_file.write_text(json.dumps(credentials) + "\n")
                credentials_file.chmod(0o600)
            else:
                credentials = json.loads(credentials_file.read_text())
            if action in {"stop", "restart"}:
                self._stop_process_by_binary(binary)
            if action == "stop":
                self._update(job_id, status="succeeded", message="Stalwart stopped.", log=[])
                return
            self._update(job_id, status="running", progress=20, message=f"Starting Stalwart with {config}…", log=[f"$ {binary} --config {config}"])
            runtime_env = managed_library_environment(root)
            runtime_env["STALWART_RECOVERY_ADMIN"] = f"{credentials['username']}:{credentials['password']}"
            with log_file.open("a") as stream:
                process = subprocess.Popen([str(binary), "--config", str(config)], stdout=stream, stderr=subprocess.STDOUT, env=runtime_env, start_new_session=True)
            import time
            deadline = time.monotonic() + 3.0
            while time.monotonic() < deadline and process.poll() is None:
                time.sleep(0.1)
            if process.poll() is not None:
                details = log_file.read_text(errors="replace")[-3000:].strip() if log_file.exists() else ""
                raise RuntimeError(f"Stalwart exited with code {process.returncode}; {details or f'inspect {log_file}'}")
            self._update(job_id, status="succeeded", progress=100, message=f"Stalwart {action} completed.", log=[])
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_powerdns_action(self, job_id: str, action: str):
        root = service_root("powerdns")
        binary = binary_path("powerdns")
        config_dir = root / "conf"
        config = config_dir / "pdns.conf"
        log_file = root / "logs/pdns.log"
        try:
            if not binary.exists():
                raise RuntimeError("PowerDNS is not installed")
            self._prepare_service_runtime(root, "conf", "logs", "run")
            prepare_powerdns_runtime(root)
            # Build the authoritative BIND catalog from the panel registry
            # before every start/restart. This keeps PowerDNS and the Domains
            # page on the same source of truth without touching host DNS.
            from app.services.domain_service import domain_service
            domain_service._sync_powerdns(domain_service._read(), reload_powerdns=False)
            if not config.exists():
                config.write_text("launch=local\nlocal-address=0.0.0.0\nlocal-port=53\nsetuid=serverengine\nsetgid=serverengine\n")
            if action in {"stop", "restart"}:
                self._stop_process_by_binary(binary)
            if action == "stop":
                self._update(job_id, status="succeeded", message="PowerDNS stopped.", log=[])
                return
            command = [str(binary), "--daemon=no", f"--config-dir={config_dir}"]
            self._update(job_id, status="running", message=f"Starting PowerDNS with {config}…", log=[])
            runtime_env = managed_library_environment(root)
            with log_file.open("a") as stream:
                process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, env=runtime_env, start_new_session=True)
            import time
            time.sleep(0.4)
            if process.poll() is not None:
                details = ""
                try:
                    details = log_file.read_text(errors="replace")[-2000:].strip()
                except OSError:
                    pass
                raise RuntimeError(f"PowerDNS exited with code {process.returncode}; {details or f'inspect {log_file}'}")
            self._update(job_id, status="succeeded", message=f"PowerDNS {action} completed.", log=[])
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_openlitespeed_action(self, job_id: str, action: str):
        root = service_root("openlitespeed")
        binary = binary_path("openlitespeed")
        config = root / "conf/httpd_config.conf"
        if not binary.exists():
            self._update(job_id, status="failed", message="OpenLiteSpeed is not installed.")
            return
        commands = {
            "start": [str(binary), "-c", str(config)],
            "stop": [str(binary), "-c", str(config), "-s", "stop"],
            "restart": [str(binary), "-c", str(config), "-s", "restart"],
        }
        command = commands.get(action)
        if not command:
            self._update(job_id, status="failed", message=f"Unsupported OpenLiteSpeed action: {action}.")
            return
        result = subprocess.run(command, capture_output=True, text=True, check=False, timeout=30)
        if result.returncode != 0:
            self._update(job_id, status="failed", message=(result.stderr or result.stdout).strip() or "OpenLiteSpeed action failed.")
            return
        self._update(job_id, status="succeeded", message=f"OpenLiteSpeed {action} completed.", log=(result.stdout or result.stderr).splitlines()[-50:])

    def _run_caddy_action(self, job_id: str, action: str):
        root = service_root("caddy")
        binary = binary_path("caddy")
        config = root / "conf/Caddyfile"
        log_file = root / "logs/caddy.log"
        pid_file = root / "run/caddy.pid"
        try:
            if not binary.exists():
                raise RuntimeError("Caddy is not installed")
            self._prepare_service_runtime(root, "conf", "logs", "run", "data", "www")
            if action in {"stop", "restart"}:
                self._stop_process_by_binary(binary, pid_file)
            if action == "stop":
                self._update(job_id, status="succeeded", message="Caddy stopped.", log=[])
                return
            if action not in {"start", "restart"}:
                raise RuntimeError(f"Unsupported Caddy action: {action}")
            command = [str(binary), "run", "--config", str(config), "--adapter", "caddyfile", "--data-dir", str(root / "data")]
            self._update(job_id, status="running", message=f"Starting Caddy with {config}…", log=[])
            stream = log_file.open("a")
            process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True, cwd=root)
            import time
            time.sleep(0.5)
            if process.poll() is not None:
                stream.close()
                raise RuntimeError(f"Caddy exited with code {process.returncode}; inspect {log_file}")
            pid_file.write_text(str(process.pid))
            self._update(job_id, status="succeeded", message=f"Caddy {action} completed.", log=[])
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_haproxy_action(self, job_id: str, action: str):
        root = service_root("haproxy")
        binary = binary_path("haproxy")
        config = root / "conf/haproxy.cfg"
        log_file = root / "logs/haproxy.log"
        pid_file = root / "run/haproxy.pid"
        try:
            if not binary.exists():
                raise RuntimeError("HAProxy is not installed")
            self._prepare_service_runtime(root, "conf", "logs", "run")
            runtime_env = self._prepare_haproxy_runtime(root)
            if not config.exists():
                config.write_text(
                    f"global\n    daemon\n    pidfile {pid_file}\n\n"
                    "defaults\n    mode http\n    timeout connect 5s\n"
                    "    timeout client 30s\n    timeout server 30s\n\n"
                    "frontend http\n    bind 127.0.0.1:8080\n    default_backend app\n\n"
                    "backend app\n    server app1 127.0.0.1:8080 check\n"
                )
            else:
                # Migrate the original Server Engine default, which used
                # port 80 and commonly collided with Nginx or Apache.
                legacy_default = (
                    f"global\n    daemon\n    pidfile {pid_file}\n\n"
                    "defaults\n    mode http\n    timeout connect 5s\n"
                    "    timeout client 30s\n    timeout server 30s\n\n"
                    "frontend http\n    bind *:80\n    default_backend app\n\n"
                    "backend app\n    server app1 127.0.0.1:8080 check\n"
                )
                if config.read_text(errors="replace").strip() == legacy_default.strip():
                    config.write_text(legacy_default.replace("bind *:80", "bind 127.0.0.1:8080"))
            if action in {"stop", "restart"}:
                self._stop_process_by_binary(binary, pid_file)
            if action == "stop":
                self._update(job_id, status="succeeded", message="HAProxy stopped.", log=[])
                return
            if action not in {"start", "restart"}:
                raise RuntimeError(f"Unsupported HAProxy action: {action}")
            check = subprocess.run([str(binary), "-c", "-f", str(config)], capture_output=True, text=True, check=False, env=runtime_env)
            if check.returncode != 0:
                raise RuntimeError((check.stderr or check.stdout).strip() or "HAProxy configuration validation failed.")
            command = [str(binary), "-db", "-f", str(config)]
            self._update(job_id, status="running", message=f"Starting HAProxy with {config}…", log=[])
            stream = log_file.open("a")
            process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True, cwd=root, env=runtime_env)
            import time
            time.sleep(0.5)
            if process.poll() is not None:
                stream.close()
                raise RuntimeError(f"HAProxy exited with code {process.returncode}; inspect {log_file}")
            self._update(job_id, status="succeeded", message=f"HAProxy {action} completed.", log=[])
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _prepare_haproxy_runtime(self, root: Path) -> dict[str, str]:
        """Stage HAProxy's shared libraries inside its service root."""
        library_dir = root / ".runtime-libraries"
        library_dir.mkdir(parents=True, exist_ok=True)
        lua_library = next(library_dir.rglob("liblua5.4.so.0"), None)
        if lua_library is None:
            apt = shutil.which("apt")
            dpkg_deb = shutil.which("dpkg-deb")
            if not apt or not dpkg_deb:
                raise RuntimeError("HAProxy needs liblua5.4, but the isolated package tools are unavailable")
            for archive in library_dir.glob("*.deb"):
                archive.unlink(missing_ok=True)
            download = subprocess.run(
                [apt, "download", "liblua5.4-0"],
                cwd=library_dir,
                capture_output=True,
                text=True,
                check=False,
            )
            if download.returncode != 0:
                raise RuntimeError("Unable to stage HAProxy runtime library liblua5.4: " + (download.stderr or download.stdout).strip())
            archives = sorted(library_dir.glob("*.deb"))
            if not archives:
                raise RuntimeError("The HAProxy runtime library package was not downloaded")
            for archive in archives:
                extracted = subprocess.run(
                    [dpkg_deb, "-x", str(archive), str(library_dir)],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                archive.unlink(missing_ok=True)
                if extracted.returncode != 0:
                    raise RuntimeError((extracted.stderr or extracted.stdout).strip() or "Unable to extract HAProxy runtime library")
            lua_library = next(library_dir.rglob("liblua5.4.so.0"), None)
        if lua_library is None:
            raise RuntimeError("HAProxy runtime library liblua5.4.so.0 was not found after staging")
        library_paths = [library_dir, *[path for path in library_dir.rglob("*") if path.is_dir()]]
        environment = os.environ.copy()
        existing = environment.get("LD_LIBRARY_PATH", "")
        environment["LD_LIBRARY_PATH"] = ":".join(str(path) for path in library_paths if path.exists()) + ((":" + existing) if existing else "")
        return environment

    def _run_postgresql_action(self, job_id: str, action: str):
        root = service_root("postgresql")
        binary = binary_path("postgresql")
        data = root / "data"
        config_dir = root / "conf"
        config = config_dir / "postgresql.conf"
        hba = config_dir / "pg_hba.conf"
        log_file = root / "logs/postgresql.log"
        run = root / "run"
        pid_file = run / "postmaster.pid"
        try:
            if not binary.exists():
                raise RuntimeError("PostgreSQL is not installed in the managed service root")
            runtime_environment = prepare_postgresql_runtime(root)
            initdb = binary.parent / "initdb"
            user = self._ensure_service_user()
            for path in (data, config_dir, log_file.parent, pid_file.parent):
                path.mkdir(parents=True, exist_ok=True)
            if not config.exists():
                config.write_text("listen_addresses = '127.0.0.1'\nport = 5432\nlogging_collector = on\n")
            if not hba.exists():
                hba.write_text("local all all scram-sha-256\nhost all all 127.0.0.1/32 scram-sha-256\n")
            if action in {"stop", "restart"}:
                self._stop_process_by_binary(binary, pid_file)
            if action == "stop":
                self._update(job_id, status="succeeded", message="PostgreSQL stopped.", log=[])
                return
            if os.geteuid() == 0:
                subprocess.run(["chown", "-R", f"{user}:{user}", str(data)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if not (data / "PG_VERSION").exists():
                if not initdb.exists():
                    raise RuntimeError("PostgreSQL initdb was not found in the managed service root")
                saved_credentials = database_credentials.secret_for("postgresql", "postgres")
                superuser_password = saved_credentials["password"] if saved_credentials else secrets.token_urlsafe(32)
                password_file = run / ".initdb-password"
                password_file.write_text(superuser_password + "\n")
                password_file.chmod(0o600)
                if os.geteuid() == 0:
                    subprocess.run(["chown", f"{user}:{user}", str(password_file)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                initialize_command = [str(initdb), "-D", str(data), f"--pwfile={password_file}", "--auth-local=scram-sha-256", "--auth-host=scram-sha-256", "--no-locale", "--encoding=UTF8"]
                if os.geteuid() == 0 and shutil.which("runuser"):
                    initialize_command = ["runuser", "-u", user, "--", *initialize_command]
                try:
                    initialize = subprocess.run(initialize_command, capture_output=True, text=True, check=False, env=runtime_environment)
                finally:
                    password_file.unlink(missing_ok=True)
                if initialize.returncode != 0:
                    raise RuntimeError((initialize.stderr or initialize.stdout).strip() or "PostgreSQL data directory initialization failed")
                database_credentials.save("postgresql", "postgres", user, superuser_password)
            subprocess.run(["chown", "-R", f"{user}:{user}", str(data), str(config_dir), str(log_file.parent), str(run)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            command = [str(binary), "-D", str(data), "-c", f"config_file={config}", "-c", f"hba_file={hba}", "-c", "logging_collector=off", "-k", str(run)]
            if os.geteuid() == 0 and shutil.which("runuser"):
                command = ["runuser", "-u", user, "--", *command]
            self._update(job_id, status="running", message=f"Starting PostgreSQL with {config}…", log=[])
            with log_file.open("a") as stream:
                process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True, env=runtime_environment)
            pg_isready = binary.parent / "pg_isready"
            ready = False
            probe_details = ""
            import time
            for _ in range(12):
                if pg_isready.exists():
                    probe = subprocess.run([str(pg_isready), "-h", "127.0.0.1", "-p", "5432"], capture_output=True, text=True, check=False, env=runtime_environment)
                    ready = probe.returncode == 0
                    probe_details = (probe.stdout or probe.stderr).strip()
                else:
                    ready = (data / "postmaster.pid").exists()
                if ready:
                    break
                time.sleep(0.4)
            if not ready:
                details = log_file.read_text(errors="replace").splitlines()[-20:]
                suffix = f" | readiness: {probe_details}" if probe_details else ""
                raise RuntimeError(f"PostgreSQL did not become ready: {' | '.join(details) if details else process.returncode}{suffix}")
            self._update(job_id, status="succeeded", message=f"PostgreSQL {action} completed.", log=log_file.read_text(errors="replace").splitlines()[-80:])
        except Exception as error:
            details = log_file.read_text(errors="replace").splitlines()[-80:] if log_file.exists() else []
            self._update(job_id, status="failed", message=str(error), log=details)

    def _run_fail2ban_action(self, job_id: str, action: str):
        root = service_root("fail2ban")
        server = binary_path("fail2ban")
        client = root / "usr/bin/fail2ban-client"
        if not client.exists():
            client = Path(shutil.which("fail2ban-client") or str(client))
        config = root / "conf/jail.local"
        log_file = root / "logs/fail2ban.log"
        try:
            if not server.exists():
                raise RuntimeError("Fail2ban is not installed")
            self._prepare_service_runtime(root, "conf", "logs", "run")
            if action == "stop":
                result = subprocess.run([str(client), "stop"], capture_output=True, text=True, check=False)
                if result.returncode != 0:
                    self._stop_process_by_binary(server)
                self._update(job_id, status="succeeded", message="Fail2ban stopped.", log=[])
                return
            if action not in {"start", "restart"}:
                raise RuntimeError(f"Unsupported Fail2ban action: {action}")
            if action == "restart":
                subprocess.run([str(client), "reload"], capture_output=True, text=True, check=False)
                self._update(job_id, status="succeeded", message="Fail2ban reloaded.", log=[])
                return
            command = [str(server), "-xf", "start", "-c", str(root / "conf")]
            self._update(job_id, status="running", message=f"Starting Fail2ban with {config}…", log=[])
            stream = log_file.open("a")
            process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True, cwd=root)
            import time
            time.sleep(0.5)
            if process.poll() is not None:
                stream.close()
                raise RuntimeError(f"Fail2ban exited with code {process.returncode}; inspect {log_file}")
            self._update(job_id, status="succeeded", message="Fail2ban started.", log=[])
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_valkey_action(self, job_id: str, action: str):
        root = service_root("valkey")
        binary = binary_path("valkey")
        config = root / "conf/valkey.conf"
        log_file = root / "logs/valkey.log"
        pid_file = root / "run/valkey.pid"
        try:
            if not binary.exists():
                raise RuntimeError("Valkey is not installed")
            user = self._prepare_service_runtime(root, "conf", "logs", "run", "data")
            if action in {"stop", "restart"}:
                self._stop_process_by_binary(binary, pid_file)
            if action == "stop":
                self._update(job_id, status="succeeded", message="Valkey stopped.", log=[])
                return
            if action not in {"start", "restart"}:
                raise RuntimeError(f"Unsupported Valkey action: {action}")
            command = [str(binary), str(config)]
            if os.geteuid() == 0 and shutil.which("runuser"):
                command = ["runuser", "-u", user, "--", *command]
            self._update(job_id, status="running", message=f"Starting Valkey with {config}…", log=[])
            stream = log_file.open("a")
            process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True, cwd=root)
            import time
            time.sleep(0.4)
            if process.poll() is not None:
                stream.close()
                raise RuntimeError(f"Valkey exited with code {process.returncode}; inspect {log_file}")
            pid_file.write_text(str(process.pid))
            self._update(job_id, status="succeeded", message=f"Valkey {action} completed.", log=[])
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_redis_action(self, job_id: str, action: str):
        root = service_root("redis")
        binary = binary_path("redis")
        config_dir = root / "conf"
        config = config_dir / "redis.conf"
        data = root / "data"
        log_file = root / "logs/redis.log"
        pid_file = root / "run/redis.pid"
        try:
            if not binary.exists():
                raise RuntimeError("Redis is not installed in the managed service root")
            self._prepare_service_runtime(root, "conf", "data", "logs", "run")
            if not config.exists():
                config.write_text(
                    f"bind 127.0.0.1 ::1\nprotected-mode yes\nport 6379\n"
                    f"dir {data}\nlogfile {log_file}\npidfile {pid_file}\ndaemonize no\n"
                )
            user = self._ensure_service_user()
            if action in {"stop", "restart"}:
                self._stop_process_by_binary(binary, pid_file)
            if action == "stop":
                self._update(job_id, status="succeeded", message="Redis stopped.", log=[])
                return
            if action == "start":
                # A stale browser state must not create a second Redis process.
                # Confirm that the listener is Redis before treating Start as
                # idempotently complete; otherwise report a real port conflict
                # before launching another process.
                cli_candidates = [root / "usr/bin/redis-cli", root / "bin/redis-cli"]
                redis_cli = next((candidate for candidate in cli_candidates if candidate.exists()), None)
                if redis_cli:
                    ping = subprocess.run(
                        [str(redis_cli), "-h", "127.0.0.1", "-p", "6379", "ping"],
                        capture_output=True,
                        text=True,
                        check=False,
                        env=managed_library_environment(root),
                        timeout=3,
                    )
                    if ping.returncode == 0 and ping.stdout.strip().upper() == "PONG":
                        self._update(job_id, status="succeeded", message="Redis is already running on 127.0.0.1:6379.", log=[])
                        return
                try:
                    with socket.create_connection(("127.0.0.1", 6379), timeout=0.5):
                        raise RuntimeError("Redis cannot start because 127.0.0.1:6379 is already in use by another process")
                except (ConnectionRefusedError, TimeoutError, OSError):
                    pass
            subprocess.run(["chown", "-R", f"{user}:{user}", str(data), str(log_file.parent), str(pid_file.parent)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            # Redis opens its configured logfile after dropping to the
            # service account. Touch it before launch and transfer ownership;
            # otherwise the panel can recreate it as root and Redis exits
            # with a fatal "Can't open the log file" error.
            log_file.touch(exist_ok=True)
            if os.geteuid() == 0:
                subprocess.run(["chown", f"{user}:{user}", str(log_file)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            command = [str(binary), str(config)]
            if os.geteuid() == 0 and shutil.which("runuser"):
                command = ["runuser", "-u", user, "--", *command]
            self._update(job_id, status="running", message=f"Starting Redis with {config}…", log=[])
            runtime_env = managed_library_environment(root)
            with log_file.open("a") as stream:
                process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True, env=runtime_env)
            import time
            time.sleep(0.4)
            if process.poll() is not None:
                details = log_file.read_text(errors="replace").splitlines()[-20:]
                raise RuntimeError(f"Redis exited during startup: {' | '.join(details) if details else process.returncode}")
            self._update(job_id, status="succeeded", message="Redis started on its managed port and data directory.", log=log_file.read_text(errors="replace").splitlines()[-80:])
        except Exception as error:
            details = log_file.read_text(errors="replace").splitlines()[-80:] if log_file.exists() else []
            self._update(job_id, status="failed", message=str(error), log=details)

    def _run_memcached_action(self, job_id: str, action: str):
        root = service_root("memcached")
        binary = binary_path("memcached")
        config_dir = root / "conf"
        config = config_dir / "memcached.conf"
        log_file = root / "logs/memcached.log"
        pid_file = root / "run/memcached.pid"
        try:
            if not binary.exists():
                raise RuntimeError("Memcached is not installed in the managed service root")
            for path in (config_dir, log_file.parent, pid_file.parent):
                path.mkdir(parents=True, exist_ok=True)
            if not config.exists():
                config.write_text("-m 256\n-p 11211\n-l 127.0.0.1\n-c 1024\n-t 4\n-U 0\n-o modern\n")
            user = self._ensure_service_user()
            if action in {"stop", "restart"}:
                self._stop_process_by_binary(binary, pid_file)
            if action == "stop":
                self._update(job_id, status="succeeded", message="Memcached stopped.", log=[])
                return
            arguments = []
            for line in config.read_text(errors="replace").splitlines():
                stripped = line.strip()
                if stripped and not stripped.startswith("#"):
                    arguments.extend(shlex.split(stripped))
            command = [str(binary), *arguments]
            if os.geteuid() == 0 and shutil.which("runuser"):
                command = ["runuser", "-u", user, "--", *command]
            self._update(job_id, status="running", message=f"Starting Memcached with {config}…", log=[])
            with log_file.open("a") as stream:
                process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
            import time
            time.sleep(0.4)
            if process.poll() is not None:
                details = log_file.read_text(errors="replace").splitlines()[-20:]
                raise RuntimeError(f"Memcached exited during startup: {' | '.join(details) if details else process.returncode}")
            pid_file.write_text(str(process.pid))
            self._update(job_id, status="succeeded", message="Memcached started on its managed port.", log=log_file.read_text(errors="replace").splitlines()[-80:])
        except Exception as error:
            details = log_file.read_text(errors="replace").splitlines()[-80:] if log_file.exists() else []
            self._update(job_id, status="failed", message=str(error), log=details)

    def _run_php_uninstall(self, job_id: str, version: str, paths: dict[str, Path]):
        root = paths["root"].resolve()
        versions_root = service_root("php").joinpath("versions").resolve()
        if root.parent != versions_root or root == versions_root or not root.exists():
            self._update(job_id, status="failed", message=f"PHP-FPM {version} is not installed.")
            return
        self._update(job_id, status="running", message=f"Stopping PHP-FPM {version} before uninstalling…", log=[])
        if paths["pid"].exists():
            try:
                os.kill(int(paths["pid"].read_text().strip()), 15)
            except (OSError, ValueError):
                pass
        import time
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline and paths["pid"].exists():
            try:
                os.kill(int(paths["pid"].read_text().strip()), 0)
            except (OSError, ValueError):
                break
            time.sleep(0.1)
        shutil.rmtree(root)
        self._update(job_id, status="succeeded", message=f"PHP-FPM {version} was uninstalled.", log=[])

    def _run_mysql_action(self, job_id: str, action: str, service_id: str = "mysql"):
        label = "MariaDB" if service_id == "mariadb" else "MySQL"
        root = service_root(service_id)
        binary = binary_path(service_id)
        data = root / "data"
        logs = root / "logs"
        run = root / "run"
        config = root / "conf/my.cnf"
        error_log = logs / "error.log"
        pid_file = run / "mysqld.pid"
        try:
            if not binary.exists():
                raise RuntimeError(f"{label} is not installed in the managed service root")
            user = self._ensure_service_user()
            # ``service_root`` keeps a compatibility link at <service>/logs,
            # while the real files live under /server-engine/logs. Resolve the
            # target before chowning it; chowning the symlink itself leaves the
            # actual error.log owned by root and MySQL then aborts on startup.
            log_directory = logs.resolve() if logs.is_symlink() else logs
            for path in (data, log_directory, run, config.parent):
                path.mkdir(parents=True, exist_ok=True)
            subprocess.run(["chown", "-R", f"{user}:{user}", str(data), str(log_directory), str(run)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            error_log.touch(exist_ok=True)
            subprocess.run(["chown", f"{user}:{user}", str(error_log)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if not config.exists():
                config.write_text("[mysqld]\nbind-address=127.0.0.1\nport=3306\ndatadir=" + str(data) + "\nlog-error=" + str(error_log) + "\nslow_query_log=ON\nmax_connections=151\ninnodb_numa_interleave=OFF\nmysqlx=OFF\nsql_mode=STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION\n\n[client]\nport=3306\n")
            else:
                # Server Engine exposes the classic protocol only. Remove any
                # previous X Protocol or NUMA setting so stale configs cannot
                # collide with another MySQL instance in the same container.
                config_lines = [
                    line
                    for line in config.read_text(errors="replace").splitlines()
                    if not line.strip().lower().startswith(("mysqlx=", "innodb_numa_interleave="))
                ]
                config_lines.extend(["innodb_numa_interleave=OFF", "mysqlx=OFF"])
                config.write_text("\n".join(config_lines).rstrip() + "\n")
            if action == "stop":
                self._stop_mysql_process(binary, pid_file)
                self._update(job_id, status="succeeded", message=f"{label} stopped.", log=[])
                return
            # Reconcile every start with the process table so stale managed
            # mysqld instances cannot retain the isolated socket lock.
            self._stop_mysql_process(binary, pid_file)
            runtime_env = self._prepare_mysql_runtime(root)
            if not (data / "mysql").exists():
                self._update(job_id, status="running", message=f"Initializing the {label} data directory…", log=[])
                initialize = subprocess.run([str(binary), f"--basedir={root}", f"--datadir={data}", f"--log-error={error_log}", "--initialize-insecure"], capture_output=True, text=True, check=False, env=runtime_env)
                if initialize.returncode != 0:
                    details = (initialize.stderr or initialize.stdout).strip().splitlines()[-20:]
                raise RuntimeError(f"{label} initialization failed: " + (" | ".join(details) if details else f"exit code {initialize.returncode}"))
            command = [str(binary), f"--defaults-file={config}", "--mysqlx=OFF", "--innodb-numa-interleave=OFF", f"--basedir={root}", f"--datadir={data}", f"--pid-file={pid_file}", f"--socket={run / 'mysql.sock'}", f"--log-error={error_log}", f"--user={user}"]
            self._update(job_id, status="running", message=f"Starting {label} with {config}…", log=[])
            with error_log.open("a") as log_file:
                process = subprocess.Popen(command, stdout=log_file, stderr=subprocess.STDOUT, start_new_session=True, env=runtime_env)
            import time
            time.sleep(1)
            if process.poll() is not None:
                details = error_log.read_text(errors="replace").splitlines()[-20:] if error_log.exists() else []
                raise RuntimeError(f"{label} exited during startup: " + (" | ".join(details) if details else f"exit code {process.returncode}"))
            self._update(job_id, status="succeeded", message=f"{label} started on its managed port and data directory.", log=error_log.read_text(errors="replace").splitlines()[-80:])
        except Exception as error:
            details = (error_log.read_text(errors="replace").splitlines()[-80:] if error_log.exists() else [])
            self._update(job_id, status="failed", message=str(error), log=details)

    def _run_mongodb_action(self, job_id: str, action: str):
        """Control the managed MongoDB process without relying on systemd."""
        root = service_root("mongodb")
        binary = root / "bin/mongod"
        config = root / "conf/mongod.conf"
        data = root / "data"
        logs = root / "logs"
        run = root / "run"
        log_file = logs / "mongod.log"
        pid_file = run / "mongod.pid"
        try:
            if not binary.exists():
                raise RuntimeError("MongoDB is not installed in the managed service area")
            self._prepare_service_runtime(root, "conf", "data", "logs", "run")
            if not config.exists():
                config.write_text(
                    f"systemLog:\n  destination: file\n  path: {log_file}\n  logAppend: true\n"
                    f"storage:\n  dbPath: {data}\n  journal:\n    enabled: true\n"
                    "net:\n  bindIp: 127.0.0.1\n  port: 27017\n"
                    "processManagement:\n  fork: false\n"
                )
            if action == "stop":
                self._stop_process_by_binary(binary, pid_file)
                pid_file.unlink(missing_ok=True)
                self._update(job_id, status="succeeded", message="MongoDB stopped.", log=[])
                return
            runtime_environment = prepare_mongodb_runtime(root)
            self._stop_process_by_binary(binary, pid_file)
            runtime_user = self._ensure_service_user()
            # The child runs as serverengine.  Create the rotatable log before
            # launching it and explicitly transfer ownership; opening it as
            # root in the parent would otherwise leave MongoDB unable to
            # initialize its rotating log file.
            log_file.touch(exist_ok=True)
            if os.geteuid() == 0:
                subprocess.run(
                    ["chown", f"{runtime_user}:{runtime_user}", str(log_file)],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            command = [str(binary), "--config", str(config)]
            if os.geteuid() == 0 and shutil.which("runuser"):
                command = ["runuser", "-u", runtime_user, "--", *command]
            self._update(job_id, status="running", message=f"Starting MongoDB with {config}…", log=[f"$ {' '.join(command)}"])
            with log_file.open("a") as stream:
                process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True, env=runtime_environment)
            time.sleep(0.8)
            if process.poll() is not None:
                details = log_file.read_text(errors="replace").splitlines()[-30:] if log_file.exists() else []
                raise RuntimeError("MongoDB exited during startup: " + (" | ".join(details) if details else f"exit code {process.returncode}"))
            pid_file.write_text(str(process.pid))
            self._update(job_id, status="succeeded", message=f"MongoDB {action} completed on port 27017.", log=log_file.read_text(errors="replace").splitlines()[-80:])
        except Exception as error:
            details = log_file.read_text(errors="replace").splitlines()[-80:] if log_file.exists() else []
            self._update(job_id, status="failed", message=str(error), log=details)

    def _prepare_mysql_runtime(self, root: Path) -> dict[str, str]:
        """Stage shared runtime libraries without installing packages globally."""
        return prepare_mysql_runtime(root)

    def _ensure_service_user(self) -> str:
        try:
            pwd.getpwnam("serverengine")
            return "serverengine"
        except KeyError:
            if os.geteuid() != 0:
                raise RuntimeError("The serverengine service account is missing and cannot be created without root privileges")
            useradd = shutil.which("useradd")
            if not useradd:
                raise RuntimeError("The serverengine service account is missing and useradd is unavailable")
            result = subprocess.run(
                [useradd, "--system", "--user-group", "--home-dir", "/var/lib/server-engine", "--shell", "/usr/sbin/nologin", "serverengine"],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                raise RuntimeError((result.stderr or result.stdout).strip() or "Unable to create the serverengine service account")
            return "serverengine"

    def _prepare_service_runtime(self, root: Path, *relative_paths: str) -> str:
        """Create writable service paths and assign them to serverengine."""
        user = self._ensure_service_user()
        owner = pwd.getpwnam(user)
        for relative in relative_paths:
            path = root / relative
            path.mkdir(parents=True, exist_ok=True)
            if os.geteuid() == 0:
                subprocess.run(
                    ["chown", "-R", f"{user}:{user}", str(path)],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                try:
                    os.chown(path, owner.pw_uid, owner.pw_gid)
                except OSError:
                    pass
        return user

    def _ensure_php_package_source(self):
        os_release = Path("/etc/os-release").read_text(errors="replace") if Path("/etc/os-release").exists() else ""
        release_info = {}
        for line in os_release.splitlines():
            key, separator, value = line.partition("=")
            if separator:
                release_info[key] = value.strip().strip('"')
        if release_info.get("ID") == "ubuntu" and (
            release_info.get("VERSION_CODENAME") == "mantic" or release_info.get("VERSION_ID") == "23.10"
        ):
            raise RuntimeError(
                "Prebuilt PHP packages are unavailable for Ubuntu 23.10 (mantic); "
                "use a source build or upgrade the host to a supported Ubuntu release."
            )
        codename = next((line.split("=", 1)[1].strip().strip('"') for line in os_release.splitlines() if line.startswith("VERSION_CODENAME=")), "")
        if not codename:
            release = shutil.which("lsb_release")
            if release:
                result = subprocess.run([release, "-sc"], capture_output=True, text=True, check=False)
                codename = result.stdout.strip()
        if not codename:
            raise RuntimeError("Cannot determine the Debian release needed for the PHP package source")
        keyring = Path("/etc/apt/keyrings/server-engine-php.gpg")
        source_file = Path("/etc/apt/sources.list.d/server-engine-php.list")
        keyring.parent.mkdir(parents=True, exist_ok=True)
        if not keyring.exists():
            with urllib.request.urlopen("https://packages.sury.org/php/apt.gpg", timeout=30) as response:
                keyring.write_bytes(response.read())
        source_line = f"deb [signed-by={keyring}] https://packages.sury.org/php/ {codename} main\n"
        if not source_file.exists() or source_file.read_text(errors="replace") != source_line:
            source_file.write_text(source_line)
        apt = shutil.which("apt-get")
        if not apt:
            raise RuntimeError("apt-get is required to prepare the PHP package source")
        self._run_cancellable(job_id, [apt, "update"], check=True)

    def _ensure_mariadb_package_source(self, requested_version: str):
        """Configure MariaDB's official APT source for the requested release line."""
        match = re.search(r"\d+\.\d+", requested_version)
        release = match.group(0) if match else "11.8"
        bash = shutil.which("bash")
        if not bash:
            raise RuntimeError("bash is required to configure the official MariaDB package source")
        # The official helper script uses curl internally. Server Engine must
        # still work on minimal hosts where curl is not installed, so create
        # the equivalent signed APT source directly with Python's downloader.
        if not shutil.which("curl"):
            os_release = {}
            try:
                for line in Path("/etc/os-release").read_text(errors="replace").splitlines():
                    key, _, value = line.partition("=")
                    os_release[key] = value.strip().strip('"')
            except OSError as error:
                raise RuntimeError(f"Unable to determine the host distribution: {error}") from error
            distro = "ubuntu" if os_release.get("ID") in {"ubuntu", "linuxmint"} else "debian" if os_release.get("ID") == "debian" else None
            codename = os_release.get("VERSION_CODENAME")
            if not distro or not codename:
                raise RuntimeError("MariaDB's official repository does not support this host distribution")
            architecture = subprocess.run(
                ["dpkg", "--print-architecture"], capture_output=True, text=True, check=False
            ).stdout.strip() if shutil.which("dpkg") else ""
            keyring = Path("/etc/apt/keyrings/server-engine-mariadb.gpg")
            source_file = Path("/etc/apt/sources.list.d/server-engine-mariadb.sources")
            keyring.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen("https://mariadb.org/mariadb_release_signing_key.pgp", timeout=30) as response:
                keyring.write_bytes(response.read())
            source_file.write_text(
                "Types: deb\n"
                f"URIs: https://deb.mariadb.org/{release}/{distro}\n"
                f"Suites: {codename}\n"
                "Components: main\n"
                f"Architectures: {architecture}\n"
                f"Signed-By: {keyring}\n"
            )
            return
        script_path = None
        try:
            with urllib.request.urlopen("https://downloads.mariadb.com/MariaDB/mariadb_repo_setup", timeout=30) as response:
                script = response.read()
            with tempfile.NamedTemporaryFile(prefix="server-engine-mariadb-repo-", suffix=".sh", delete=False) as handle:
                handle.write(script)
                script_path = Path(handle.name)
            script_path.chmod(0o700)
            result = subprocess.run(
                [
                    bash,
                    str(script_path),
                    f"--mariadb-server-version={release}",
                    "--skip-check-installed",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                detail = (result.stderr or result.stdout).strip().splitlines()
                excerpt = " | ".join(detail[-8:]) if detail else "setup failed"
                raise RuntimeError("Unable to configure the official MariaDB repository: " + excerpt)
        except urllib.error.URLError as error:
            raise RuntimeError(f"Unable to download the official MariaDB repository setup: {error.reason}") from error
        finally:
            if script_path:
                script_path.unlink(missing_ok=True)

    def _remove_mariadb_repository_sources(self):
        """Remove the obsolete MariaDB repository override from old installs."""
        source_dir = Path("/etc/apt/sources.list.d")
        if source_dir.exists():
            for source in source_dir.iterdir():
                if source.is_file() and "mariadb" in source.name.lower():
                    source.unlink(missing_ok=True)
        Path("/etc/apt/keyrings/server-engine-mariadb.gpg").unlink(missing_ok=True)

    def _stop_process_by_binary(self, binary: Path, pid_file: Path | None = None):
        """Terminate a managed process without requiring pkill or pgrep."""
        pids = []
        if pid_file and pid_file.exists():
            try:
                pids.append(int(pid_file.read_text().strip()))
            except ValueError:
                pass
        # Reconcile the PID file with the process table. A previous failed
        # start can leave a live managed process with a stale or replaced PID
        # file, which otherwise causes socket collisions on the next start.
        pgrep = shutil.which("pgrep")
        if pgrep:
            result = subprocess.run([pgrep, "-f", str(binary)], capture_output=True, text=True, check=False)
            pids.extend(int(item) for item in result.stdout.split() if item.isdigit())
        elif Path("/proc").exists():
            for command_line in Path("/proc").glob("[0-9]*/cmdline"):
                try:
                    command = command_line.read_bytes().replace(b"\x00", b" ").decode(errors="replace")
                except OSError:
                    continue
                if str(binary) in command:
                    try:
                        pids.append(int(command_line.parent.name))
                    except ValueError:
                        pass
        for pid in set(pids):
            try:
                os.kill(pid, 15)
            except (ProcessLookupError, PermissionError):
                pass
        deadline = time.monotonic() + 2
        for pid in set(pids):
            while time.monotonic() < deadline:
                try:
                    os.kill(pid, 0)
                except (ProcessLookupError, PermissionError):
                    break
                time.sleep(0.05)

    def _force_stop_apache_runtime(self, job_id: str):
        """Stop the active managed Apache before replacing or adding a version."""
        root = service_root("apache")
        if root.exists():
            self._share_versioned_service_paths("apache", root)
        binary = binary_path("apache")
        pid_file = root / "run/httpd.pid"
        if not binary.exists() and not _managed_process_alive(pid_file):
            return
        self._update(job_id, status="running", progress=1, message="Stopping the current Apache version before installation…", log=[f"$ {binary} -f {root / 'conf/httpd.conf'} -k stop"])
        self._stop_process_by_binary(binary, pid_file)
        if pid_file.exists():
            try:
                pid = int(pid_file.read_text().strip())
                os.kill(pid, 9)
            except (OSError, ValueError):
                pass
        pid_file.unlink(missing_ok=True)
        self._broadcast_service_status("apache", "stop", "succeeded", "Apache stopped before version installation.")

    def _force_stop_nginx_runtime(self, job_id: str):
        """Stop the active managed Nginx before replacing or switching versions."""
        paths = nginx_paths()
        if not paths["binary"].exists() and not _managed_process_alive(paths["pid"]):
            return
        self._update(job_id, progress=1, message="Stopping the current Nginx version before installation…", log=[f"$ {paths['binary']} -p {paths['root']} -c {paths['config']} -s stop"])
        self._stop_process_by_binary(paths["binary"], paths["pid"])
        paths["pid"].unlink(missing_ok=True)
        self._broadcast_service_status("nginx", "stop", "succeeded", "Nginx stopped before version installation.")

    def _share_versioned_service_paths(self, service_id: str, root: Path):
        """Keep configuration, logs, and PID state shared across versions."""
        base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / service_id
        for name in ("conf", "logs", "run"):
            shared = base / name
            versioned = root / name
            if versioned == shared:
                shared.mkdir(parents=True, exist_ok=True)
                continue
            if not shared.exists() and versioned.exists() and not versioned.is_symlink():
                shared.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(versioned), str(shared))
            elif versioned.exists() or versioned.is_symlink():
                if versioned.is_dir() and not versioned.is_symlink():
                    shutil.rmtree(versioned)
                else:
                    versioned.unlink(missing_ok=True)
            shared.mkdir(parents=True, exist_ok=True)
            versioned.parent.mkdir(parents=True, exist_ok=True)
            versioned.symlink_to(Path("../..") / name, target_is_directory=True)

    def _stop_mysql_process(self, binary: Path, pid_file: Path):
        self._stop_process_by_binary(binary, pid_file)

    def _update(self, job_id: str, **changes):
        message = changes.get("message")
        if isinstance(message, str) and "HTTP Error 404" in message:
            changes["message"] = (
                "The selected release archive is not published for this host or architecture. "
                "Refresh compatible versions and choose another release."
            )
        elif isinstance(message, str) and "HTTP Error 403" in message:
            changes["message"] = "The upstream provider refused the download. Refresh compatible versions and try again."
        with self._lock:
            current = self._jobs[job_id]
            if current.status == "cancelled" and changes.get("status") != "cancelled":
                return
            if "log" in changes:
                incoming = list(changes["log"] or [])
                existing = current.log
                if incoming:
                    if existing and len(incoming) >= len(existing) and incoming[:len(existing)] == existing:
                        changes["log"] = incoming
                    else:
                        overlap = 0
                        for size in range(1, min(len(existing), len(incoming)) + 1):
                            if existing[-size:] == incoming[:size]:
                                overlap = size
                        changes["log"] = existing + incoming[overlap:]
                    # Keep the browser payload and in-memory job state bounded
                    # even when a scan or build emits millions of lines.
                    changes["log"] = changes["log"][-1000:]
            updated = current.model_copy(update={"updated_at": datetime.now(timezone.utc), **changes})
            self._jobs[job_id] = updated
        self._broadcast(updated)

    def _run_install(self, job_id: str, service_id: str, requested_version: str, install_method: str = "prebuilt", php_version: str | None = None, composer_version: str | None = None):
        if service_id == "docker":
            self._run_docker_host_install(job_id)
            return
        if service_id == "php" and install_method == "source":
            self._run_php_source_binary(job_id, requested_version)
            return
        if service_id == "openssl":
            self._run_openssl_compatibility_runtime(job_id, requested_version)
            return
        if service_id == "python" and install_method == "source":
            self._run_python_source_binary(job_id, requested_version)
            return
        if service_id == "composer":
            self._run_composer_binary(job_id, requested_version, php_version)
            return
        if service_id == "wp-cli":
            self._run_wpcli_binary(job_id, requested_version, php_version)
            return
        if service_id == "mongodb" and install_method == "prebuilt":
            self._run_mongodb_prebuilt(job_id, requested_version)
            return
        if service_id == "openlitespeed" and install_method == "prebuilt":
            self._run_openlitespeed_prebuilt(job_id, requested_version)
            return
        if service_id == "caddy" and install_method == "prebuilt":
            self._run_caddy_prebuilt(job_id, requested_version)
            return
        if service_id == "stalwart" and install_method == "prebuilt":
            self._run_stalwart_prebuilt(job_id, requested_version)
            return
        if install_method == "prebuilt" and prebuilt_package_for(service_id):
            if service_id == "redis":
                self._run_redis_prebuilt(job_id, requested_version)
            else:
                self._run_debian_prebuilt(job_id, service_id, requested_version)
            return
        self._run_isolated_package(job_id, service_id, requested_version)

    def _run_docker_host_install(self, job_id: str):
        apt = shutil.which("apt-get")
        if not apt:
            raise RuntimeError("Docker installation currently requires an apt-based Linux host.")
        self._update(job_id, status="running", progress=5, message="Refreshing host package metadata for Docker Engine…", log=["$ apt-get update"])
        metadata = subprocess.run([apt, "update"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
        self._update(job_id, log=[line for line in metadata.stdout.splitlines() if line.strip()][-40:])
        if metadata.returncode:
            raise RuntimeError("Unable to refresh the host package catalog for Docker Engine.")
        self._raise_if_cancelled(job_id)
        self._update(job_id, progress=45, message="Installing Docker Engine on the host…", log=["$ apt-get install -y docker.io docker-compose-v2"])
        installed = subprocess.run([apt, "install", "-y", "docker.io", "docker-compose-v2"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=False)
        self._update(job_id, log=[line for line in installed.stdout.splitlines() if line.strip()][-80:])
        if installed.returncode:
            raise RuntimeError("Docker Engine host installation failed.")
        docker = shutil.which("docker")
        version = subprocess.run([docker, "--version"], capture_output=True, text=True, check=False).stdout.strip() if docker else "Docker Engine"
        self._update(job_id, status="succeeded", progress=100, message=f"{version} is installed on the host.", log=[f"$ {version}"])

    def _resolve_apt_version(self, package: str, requested_version: str) -> str:
        """Resolve the UI's epoch-free version to the exact APT version."""
        apt_cache = shutil.which("apt-cache")
        if not apt_cache:
            return requested_version
        result = subprocess.run(
            [apt_cache, "madison", package],
            capture_output=True,
            text=True,
            check=False,
            timeout=8,
        )
        for line in result.stdout.splitlines():
            parts = [part.strip() for part in line.split("|")]
            if len(parts) < 2 or not parts[1]:
                continue
            full_version = parts[1]
            if requested_version in {"", "system", "latest"}:
                return full_version
            if full_version == requested_version or full_version.split(":", 1)[-1] == requested_version:
                return full_version
        if requested_version in {"", "system", "latest"}:
            policy = subprocess.run([apt_cache, "policy", package], capture_output=True, text=True, check=False, timeout=8)
            for line in policy.stdout.splitlines():
                if line.strip().startswith("Candidate:"):
                    candidate = line.split(":", 1)[1].strip()
                    if candidate and candidate != "(none)":
                        return candidate
        return requested_version

    def _run_debian_prebuilt(self, job_id: str, service_id: str, requested_version: str):
        """Extract an exact Debian package into a managed service root."""
        package = prebuilt_package_for(service_id)
        apt = shutil.which("apt-get")
        dpkg_deb = shutil.which("dpkg-deb")
        if not package or not apt or not dpkg_deb:
            self._update(job_id, status="failed", message=f"No compatible prebuilt {service_id} package provider is available on this host. Choose source build instead.")
            return
        # Ubuntu 24.04 renamed the runtime package because of the time_t
        # transition. Keep Debian-family installs portable by selecting the
        # package name that actually has a candidate on this architecture.
        if service_id == "modsecurity":
            apt_cache = shutil.which("apt-cache")
            candidates = [package, "libmodsecurity3t64", "libmodsecurity3"]
            if apt_cache:
                for candidate in candidates:
                    policy = subprocess.run([apt_cache, "policy", candidate], capture_output=True, text=True, check=False, timeout=8)
                    if any(line.strip().startswith("Candidate:") and line.split(":", 1)[1].strip() not in {"", "(none)"} for line in policy.stdout.splitlines()):
                        package = candidate
                        break
        services_root = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services"))
        # The control plane is intentionally unprivileged.  The installer owns
        # this directory for serverengine, but prepare it here as well for
        # upgrades from older releases and non-installer deployments.
        services_root.mkdir(parents=True, exist_ok=True)
        base_root = services_root / service_id
        if not base_root.exists():
            base_root.mkdir(parents=True, exist_ok=True)
        root = service_root(service_id, requested_version) if service_id in {"nginx", "apache", "openlitespeed"} else service_root(service_id)
        nginx_shield_was_attached = False
        if service_id == "nginx":
            # Preserve the operator's Shield choice across a version swap.
            # The connector itself is rebuilt below against the newly
            # extracted Nginx binary; we never carry an ABI-specific module
            # from the previous version into the new runtime.
            active_root = service_root("nginx")
            nginx_shield_was_attached = any(
                marker.exists()
                for marker in (
                    base_root / ".serverengine-application-shield-attached",
                    active_root / ".serverengine-application-shield-attached",
                )
            )
            self._force_stop_nginx_runtime(job_id)
        # Keep staging beside the service root.  For non-versioned services
        # the final extraction below replaces ``base_root``; placing staging
        # inside it would delete the staged package before it is copied.
        staging = services_root / f".{service_id}-{job_id}-prebuilt"
        package_dir = staging / "packages"
        try:
            shutil.rmtree(staging, ignore_errors=True)
            package_dir.mkdir(parents=True, exist_ok=True)
            if service_id == "mariadb":
                # MariaDB prebuilt versions come only from the host's current
                # package catalog. The selected package is still extracted
                # into Server Engine; the host package is never installed.
                self._remove_mariadb_repository_sources()
                self._update(
                    job_id,
                    status="running",
                    progress=2,
                    message=f"Checking the host-compatible MariaDB package catalog for {requested_version}…",
                    log=["$ apt-get update"],
                )
                metadata = subprocess.run(
                    [apt, "update"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    check=False,
                )
                if metadata.returncode:
                    metadata_log = [line.strip() for line in metadata.stdout.splitlines() if line.strip()][-40:]
                    raise RuntimeError(
                        "The host package catalog could not be refreshed: "
                        + (metadata_log[-1] if metadata_log else "apt update failed")
                    )
            exact_version = self._resolve_apt_version(package, requested_version)
            # Labels such as "system" are UI selectors, never valid APT
            # versions. If the repository cannot expose a concrete version,
            # let APT choose its compatible candidate rather than generating
            # the invalid package expression package=system.
            versioned_package = exact_version if exact_version not in {"", "system", "latest"} else None
            package_request = f"{package}={versioned_package}" if versioned_package else package
            self._update(job_id, status="running", progress=5, message=f"Downloading prebuilt {service_id} {requested_version}…", log=[f"$ apt download {package_request}"])
            packages = [package_request]
            apt_cache = shutil.which("apt-cache")
            if service_id == "nginx":
                # Ubuntu splits the executable into nginx-core. Downloading
                # only the metapackage can leave an apparently installed
                # runtime without a usable nginx binary.
                packages.append(f"nginx-core={versioned_package}" if versioned_package else "nginx-core")
            if service_id == "powerdns":
                # The BIND backend is a separate Ubuntu package. The
                # pdns-server executable alone cannot load libbindbackend.so.
                bind_backend = "pdns-backend-bind"
                backend_policy = subprocess.run([apt_cache, "policy", bind_backend], capture_output=True, text=True, check=False).stdout if apt_cache else ""
                backend_available = not apt_cache or any(
                    line.strip().startswith("Candidate:") and line.split(":", 1)[1].strip() not in {"", "(none)"}
                    for line in backend_policy.splitlines()
                )
                if backend_available:
                    packages.append(f"{bind_backend}={versioned_package}" if versioned_package else bind_backend)
            if apt_cache:
                pending = list(packages)
                seen = set()
                while pending:
                    dependency_package = pending.pop(0)
                    if dependency_package in seen:
                        continue
                    seen.add(dependency_package)
                    dependency_output = subprocess.run([apt_cache, "depends", "--no-recommends", "--no-suggests", dependency_package], capture_output=True, text=True, check=False).stdout
                    for line in dependency_output.splitlines():
                        match = re.match(r"\s+\|?(?:Depends|PreDepends):\s+([^\s|<>]+)", line)
                        if match and match.group(1) not in seen and match.group(1) not in packages:
                            packages.append(match.group(1))
                            pending.append(match.group(1))
            self._update(
                job_id,
                progress=12,
                message=f"Resolving {service_id} package dependencies…",
                log=[f"$ apt-get download {' '.join(packages)}"],
            )
            downloaded_process = subprocess.Popen(
                [apt, "download", *packages],
                cwd=package_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                start_new_session=True,
            )
            self._track_process(job_id, downloaded_process)
            try:
                downloaded_output, _ = downloaded_process.communicate()
                downloaded = subprocess.CompletedProcess(
                    downloaded_process.args,
                    downloaded_process.returncode,
                    stdout=downloaded_output,
                    stderr="",
                )
            finally:
                self._untrack_process(job_id, downloaded_process)
            self._raise_if_cancelled(job_id)
            download_log = (downloaded.stdout + downloaded.stderr).strip().splitlines()
            if download_log:
                self._update(job_id, progress=32, message=f"Downloaded {len(download_log)} package log entries for {service_id}.", log=download_log[-80:])
            if downloaded.returncode != 0:
                raise RuntimeError((downloaded.stderr or downloaded.stdout).strip() or f"The selected {service_id} package is not available for this host")
            archives = sorted(package_dir.glob("*.deb"))
            if not archives:
                raise RuntimeError(f"The package provider returned no {service_id} archive")
            extracted = staging / "root"
            extracted.mkdir(parents=True, exist_ok=True)
            for index, archive in enumerate(archives, start=1):
                self._update(job_id, progress=35 + round(index * 55 / len(archives)), message=f"Extracting package {index} of {len(archives)}: {archive.name}", log=[f"$ dpkg-deb -x {archive.name} {extracted}"])
                unpacked = subprocess.run([dpkg_deb, "-x", str(archive), str(extracted)], capture_output=True, text=True, check=False)
                if unpacked.returncode != 0:
                    raise RuntimeError((unpacked.stderr or unpacked.stdout).strip() or f"{service_id} package extraction failed")
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            for item in extracted.iterdir():
                target = root / item.name
                # Debian packages commonly contain absolute or dangling
                # documentation symlinks. Preserve those links instead of
                # dereferencing them with copy2(), which makes an otherwise
                # valid isolated install fail at the final copy step.
                if item.is_symlink():
                    target.symlink_to(os.readlink(item), target_is_directory=item.is_dir())
                elif item.is_dir():
                    shutil.copytree(item, target, dirs_exist_ok=True, symlinks=True)
                else:
                    shutil.copy2(item, target)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-install-method").write_text("prebuilt\n")
            for directory in (root / "conf", root / "data", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            self._prepare_service_runtime(root, "conf", "data", "logs", "run")
            if service_id == "nginx":
                nginx_binary = next((candidate for candidate in (root / "usr/sbin/nginx", root / "sbin/nginx", root / "bin/nginx") if candidate.exists()), None)
                if nginx_binary is None:
                    raise RuntimeError("The Nginx package was extracted, but it did not contain a usable nginx executable.")
                if nginx_binary != root / "bin/nginx":
                    (root / "bin").mkdir(parents=True, exist_ok=True)
                    shutil.copy2(nginx_binary, root / "bin/nginx")
                    (root / "bin/nginx").chmod((root / "bin/nginx").stat().st_mode | 0o111)
                ensure_nginx_layout(nginx_paths(requested_version))
                (base_root / ".serverengine-active-version").write_text(requested_version + "\n")
                shield_root = service_root("modsecurity")
                shield_installed = (shield_root / ".serverengine-version").exists()
                if shield_installed:
                    self._update(
                        job_id,
                        progress=90,
                        message=f"Refreshing the Nginx {requested_version} Application Shield connector…",
                        log=["$ build exact-version ModSecurity-nginx connector"],
                    )
                    self._run_nginx_shield_connector(
                        job_id,
                        attach=nginx_shield_was_attached,
                        finish_job=False,
                    )
            elif service_id == "apache":
                apache_conf = root / "conf/httpd.conf"
                if not apache_conf.exists():
                    module_root = root / "usr/lib/apache2/modules"
                    apache_conf.write_text(
                        f'ServerRoot "{root}"\nListen 80\n'
                        f'PidFile "{root / "run/httpd.pid"}"\n'
                        f'ErrorLog "{root / "logs/error.log"}"\n'
                        f"LoadModule mpm_event_module {module_root / 'mod_mpm_event.so'}\n"
                        f"LoadModule authz_core_module {module_root / 'mod_authz_core.so'}\n"
                        f"LoadModule dir_module {module_root / 'mod_dir.so'}\n"
                        f"LoadModule mime_module {module_root / 'mod_mime.so'}\n"
                        f"LoadModule rewrite_module {module_root / 'mod_rewrite.so'}\n"
                        "TypesConfig /etc/mime.types\n"
                        "DocumentRoot /server-engine/www\n"
                        "<Directory /server-engine/www>\n  AllowOverride All\n  Require all granted\n</Directory>\n"
                    )
                self._share_versioned_service_paths("apache", root)
                (base_root / ".serverengine-active-version").write_text(requested_version + "\n")
            elif service_id == "openlitespeed":
                self._share_versioned_service_paths("openlitespeed", root)
                (base_root / ".serverengine-active-version").write_text(requested_version + "\n")
            elif service_id == "php":
                self._ensure_service_user()
                ensure_php_fpm_layout(requested_version)
                ensure_php_runtime_launcher(requested_version)
                enable_php_baseline_extensions(requested_version)
            self._update(job_id, status="succeeded", progress=100, message=f"{service_id} {requested_version} was extracted into {root}; no host service was registered.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _prepare_node_runtime(self, root: Path):
        self._stage_node_runtime_libraries(root)
        node = root / "usr/bin/node"
        real_node = root / "usr/bin/node.bin"
        if not node.exists() or node.is_symlink():
            return
        if not real_node.exists() and node.is_file():
            node.rename(real_node)
        library_paths = [root / "lib", root / "usr/lib", root / ".runtime-libraries/lib", root / ".runtime-libraries/usr/lib", root / ".runtime-libraries/usr/lib/aarch64-linux-gnu", root / ".runtime-libraries/usr/lib/x86_64-linux-gnu", root / "lib/aarch64-linux-gnu", root / "usr/lib/aarch64-linux-gnu", root / "lib/x86_64-linux-gnu", root / "usr/lib/x86_64-linux-gnu"]
        paths = ":".join(str(item) for item in library_paths if item.exists())
        node.write_text(f"#!/bin/sh\nexport LD_LIBRARY_PATH=\"{paths}:$LD_LIBRARY_PATH\"\nexec \"{real_node}\" \"$@\"\n")
        node.chmod(0o755)

    def _stage_node_runtime_libraries(self, root: Path):
        """Stage Node's small native dependencies without changing the host OS."""
        library_root = root / ".runtime-libraries"
        marker = library_root / ".libatomic-ready"
        if marker.exists():
            return
        apt = shutil.which("apt")
        dpkg_deb = shutil.which("dpkg-deb")
        if not apt or not dpkg_deb:
            raise RuntimeError("Node.js needs libatomic1, but the isolated package tools are unavailable")
        library_root.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            [apt, "download", "libatomic1"],
            cwd=library_root,
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
        package = next(iter(sorted(library_root.glob("libatomic1_*.deb"))), None)
        if result.returncode != 0 or not package:
            detail = (result.stderr or result.stdout).strip()
            raise RuntimeError(f"Unable to stage Node.js dependency libatomic1{(': ' + detail) if detail else ''}")
        extracted = subprocess.run([dpkg_deb, "-x", str(package), str(library_root)], capture_output=True, text=True, check=False)
        package.unlink(missing_ok=True)
        if extracted.returncode != 0:
            raise RuntimeError((extracted.stderr or extracted.stdout).strip() or "Unable to extract Node.js dependency libatomic1")
        marker.write_text("ready\n")

    def _ensure_source_build_dependencies(self, job_id: str, service_id: str):
        """Install only the build prerequisites needed by the selected source service."""
        base = {
            "build-essential", "cmake", "pkg-config", "libssl-dev", "zlib1g-dev",
        }
        dependencies = {
            "apache": base | {
                "autoconf", "automake", "libtool", "libexpat1-dev", "libnghttp2-dev",
                "libpcre3-dev", "libpcre2-dev", "libcurl4-openssl-dev", "libxml2-dev",
                "libyajl-dev", "liblua5.1-0-dev", "zlib1g-dev", "perl", "git",
            },
            "mariadb": base | {"bison", "libaio-dev", "libcurl4-openssl-dev", "libevent-dev", "libfmt-dev", "libgcrypt20-dev", "liblz4-dev", "libncurses-dev", "libnuma-dev", "libpcre2-dev", "libsnappy-dev", "liburing-dev", "libzstd-dev"},
            "php": base | {"autoconf", "bison", "re2c", "libxml2-dev", "libcurl4-openssl-dev", "libsqlite3-dev", "libonig-dev", "libzip-dev", "libreadline-dev", "libxslt1-dev", "libjpeg-dev", "libpng-dev", "libwebp-dev", "libfreetype6-dev", "libicu-dev", "libpq-dev"},
            "python": base | {"libbz2-dev", "libffi-dev", "liblzma-dev", "libncurses-dev", "libreadline-dev", "libsqlite3-dev", "libgdbm-dev", "libnss3-dev", "libuuid1", "uuid-dev", "tk-dev"},
            # Stalwart 0.16+ uses Rust Edition 2024. The distro Cargo in
            # older Ubuntu/Debian releases can be too old. rustup is
            # bootstrapped into Server Engine's toolchain directory instead
            # of installing the conflicting distro rustup package.
            "stalwart": base | {"cargo", "rustc"},
            # MongoDB's source bootstrap imports boto3 even when it falls back
            # to its requests-based downloader. Keep both modules available so
            # the upstream Bazel bootstrap can resolve tool archives.
            "mongodb": base | {"git", "python3", "python3-boto3", "python3-requests", "python-is-python3", "libcurl4-openssl-dev", "liblzma-dev"},
            "opensearch": {"openjdk-21-jdk-headless"},
            "rspamd": base | {"libglib2.0-dev", "libgmime-3.0-dev", "liblua5.4-dev", "libsodium-dev", "libicu-dev", "libevent-dev", "libpcre2-dev", "libcurl4-openssl-dev", "libzstd-dev"},
            "bind9": base | {"libuv1-dev", "libjson-c-dev", "libidn2-dev", "libnghttp2-dev", "libcap-dev"},
            "unbound": base | {"libexpat1-dev"},
            "clamav": base | {"cargo", "rustc", "libcurl4-openssl-dev", "libjson-c-dev", "libxml2-dev", "libncurses-dev", "libpcre2-dev"},
            "postfix": base,
            "dovecot": base | {"autoconf", "automake", "libtool", "gettext", "libcap-dev", "libpam0g-dev"},
            "openlitespeed": base | {"git", "golang-go", "xz-utils", "libexpat1-dev", "libcap-dev", "libaio-dev", "autoconf", "automake", "libtool", "patch", "curl"},
            "caddy": base | {"git", "golang-go", "ca-certificates"},
        }.get(service_id)
        if not dependencies:
            return
        apt = shutil.which("apt-get")
        dnf = shutil.which("dnf")
        yum = shutil.which("yum")

        def run_logged(command: list[str], progress: int, message: str):
            self._update(job_id, progress=progress, message=message, log=[f"$ {' '.join(command)}"])
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            output = []
            for line in process.stdout or []:
                line = line.rstrip()
                if not line:
                    continue
                output.append(line)
                if len(output) == 1 or len(output) % 3 == 0:
                    self._update(job_id, progress=progress, message=message, log=output[-80:])
            return process.wait(), output

        if os.geteuid() != 0:
            helper = shutil.which("sudo")
            dependency_helper = "/usr/local/sbin/server-engine-prepare-build-deps"
            if helper and Path(dependency_helper).exists() and apt:
                install_code, install_output = run_logged(
                    [helper, "-n", dependency_helper, service_id],
                    1,
                    f"Preparing isolated build dependencies for {service_id}…",
                )
                if install_code != 0:
                    raise RuntimeError("\n".join(install_output[-30:]) or f"Unable to prepare build dependencies for {service_id}")
                self._update(job_id, progress=3, message=f"Build dependencies for {service_id} are ready.", log=install_output[-80:])
                return
            raise RuntimeError(f"Installing {service_id} requires the Server Engine build-dependency helper; update the installation first.")

        if apt:
            if service_id == "mariadb":
                self._remove_mariadb_repository_sources()
            packages = sorted(dependencies)
            update_code, update_output = run_logged(
                [apt, "update"],
                1,
                f"Refreshing package metadata for {service_id}…",
            )
            if update_code != 0:
                raise RuntimeError("\n".join(update_output[-30:]) or f"Unable to refresh APT metadata for {service_id}")
            install_code, install_output = run_logged(
                [apt, "install", "-y", *packages],
                2,
                f"Installing {len(packages)} build dependencies for {service_id}…",
            )
            install = install_code, install_output
        elif dnf or yum:
            manager = dnf or yum
            package_map = {
                "build-essential": "gcc gcc-c++ make", "libssl-dev": "openssl-devel", "zlib1g-dev": "zlib-devel",
                "pkg-config": "pkgconf", "libexpat1-dev": "expat-devel", "libcurl4-openssl-dev": "libcurl-devel",
                "libjson-c-dev": "json-c-devel", "libxml2-dev": "libxml2-devel", "libncurses-dev": "ncurses-devel",
                "libpcre2-dev": "pcre2-devel", "libpam0g-dev": "pam-devel", "libcap-dev": "libcap-devel",
                "libpcre3-dev": "pcre-devel",
                "libaio-dev": "libaio-devel", "libcurl4-openssl-dev": "libcurl-devel", "libevent-dev": "libevent-devel",
                "libfmt-dev": "fmt-devel", "libgcrypt20-dev": "libgcrypt-devel", "liblz4-dev": "lz4-devel",
                "libncurses-dev": "ncurses-devel", "libnuma-dev": "numactl-devel", "libpcre2-dev": "pcre2-devel",
                "libsnappy-dev": "snappy-devel", "liburing-dev": "liburing-devel", "libzstd-dev": "libzstd-devel",
                "golang-go": "golang", "xz-utils": "xz",
                "python-is-python3": "python3",
                "python3-boto3": "python3-boto3", "python3-requests": "python3-requests",
                "libglib2.0-dev": "glib2-devel", "libgmime-3.0-dev": "gmime30-devel", "liblua5.4-dev": "lua-devel",
                "libsodium-dev": "libsodium-devel", "libicu-dev": "libicu-devel", "liblzma-dev": "xz-devel", "libuv1-dev": "libuv-devel",
                "libidn2-dev": "libidn2-devel", "libnghttp2-dev": "libnghttp2-devel", "openjdk-21-jdk-headless": "java-21-openjdk-devel",
            }
            packages = sorted({item for package in dependencies for item in package_map.get(package, package).split()})
            install = run_logged(
                [manager, "install", "-y", *packages],
                2,
                f"Installing {len(packages)} build dependencies for {service_id}…",
            )
        else:
            raise RuntimeError(f"No supported package manager was found to prepare the {service_id} source build.")
        install_code, install_output = install
        if install_code != 0:
            raise RuntimeError("\n".join(install_output[-30:]) or f"Unable to install build dependencies for {service_id}")
        self._update(job_id, progress=3, message=f"Build dependencies for {service_id} are ready.", log=install_output[-80:])

    def _run_php_source_binary(self, job_id: str, requested_version: str):
        """Build PHP-FPM from the official source archive inside its version root."""
        source_url = php_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("php", install_method="source")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = php_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"PHP {requested_version} is not available from the official source catalog. Refresh compatible versions and try again.")
            return
        root = service_root("php", requested_version)
        staging = root.parent / f".php-{requested_version}-{job_id}-staging"
        build_dependencies = root.parent / f".php-{requested_version}-{job_id}-dependencies"
        archive = root.parent / f"php-{requested_version}.tar.gz"
        preserve_build_workspace = False
        try:
            self._ensure_source_build_dependencies(job_id, "php")
            shutil.rmtree(staging, ignore_errors=True)
            shutil.rmtree(build_dependencies, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            build_dependencies.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=5, message=f"Downloading PHP {requested_version} source…", log=[f"$ curl -L {source_url}"])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=120) as response, archive.open("wb") as output:
                shutil.copyfileobj(response, output)
            source = staging / f"php-{requested_version}"
            source.mkdir(parents=True, exist_ok=True)
            with tarfile.open(archive, "r:gz") as package:
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir() and item.name.startswith("php-")), source)
            runtime_user = self._ensure_service_user()

            # Older PHP configure scripts do not understand the PHP 7.4+
            # GD options and do not find Debian's multiarch curl headers
            # under /usr/include/<triplet>/curl. Stage a private include
            # prefix for configure instead of modifying the host filesystem.
            php_version_tuple = tuple(int(part) for part in requested_version.split(".")[:2])
            legacy_ssl_root = None
            legacy_icu_root = None
            icu_link_flags = ""
            openssl_link_flags = ""
            # PHP 7.x can use OpenSSL 1.1.1, but PHP 5.x directly accesses
            # EVP_PKEY internals that became opaque in OpenSSL 1.1. PHP 5.x
            # therefore requires the older 1.0.2 compatibility headers.
            if php_version_tuple < (8, 0):
                openssl_version = "1.0.2u" if php_version_tuple < (7, 0) else self._latest_legacy_openssl_version()
                legacy_ssl_root = self._ensure_isolated_openssl(job_id, openssl_version)
            if php_version_tuple < (7, 4):
                legacy_icu_root = self._ensure_isolated_icu(job_id, "57.1")
            curl_header = next(
                (
                    candidate
                    for candidate in (
                        Path("/usr/include/curl/easy.h"),
                        *sorted(Path("/usr/include").glob("*/curl/easy.h")),
                    )
                    if candidate.is_file()
                ),
                None,
            )
            if not curl_header:
                raise RuntimeError("PHP build dependency libcurl is missing curl/easy.h; reinstall libcurl development headers and try again.")
            curl_include = build_dependencies / "include/curl"
            curl_include.parent.mkdir(parents=True, exist_ok=True)
            curl_include.symlink_to(curl_header.parent, target_is_directory=True)
            curl_library = next(
                (
                    candidate.parent
                    for candidate in (
                        Path("/usr/lib/x86_64-linux-gnu/libcurl.so"),
                        Path("/usr/lib/aarch64-linux-gnu/libcurl.so"),
                        Path("/usr/lib/libcurl.so"),
                    )
                    if candidate.is_file()
                ),
                None,
            )
            if curl_library:
                (build_dependencies / "lib").symlink_to(curl_library, target_is_directory=True)
            configure_cppflags = f"-I{build_dependencies / 'include'} -I{curl_header.parent.parent}"
            configure_ldflags = f"-L{build_dependencies / 'lib'}" if curl_library else ""
            if php_version_tuple >= (7, 4):
                gd_options = ["--enable-gd", "--with-jpeg", "--with-webp", "--with-freetype"]
            else:
                # PHP 5.x does not use pkg-config for FreeType. Its configure
                # script searches <freetype-dir>/bin/freetype-config, so the
                # isolated dependency prefix must be passed here instead of
                # the host /usr prefix.
                gd_options = ["--with-gd", "--with-jpeg-dir=/usr", "--with-png-dir=/usr"]
                # PHP 5.x's configure script requires the removed
                # ``freetype-config`` helper. Modern Debian/Ubuntu packages
                # expose the same information only through pkg-config. Keep
                # this compatibility shim inside the temporary build area;
                # never add a host-wide command or alter the system PATH.
                freetype_tools = build_dependencies / "bin"
                freetype_tools.mkdir(parents=True, exist_ok=True)
                pkg_config = shutil.which("pkg-config") or "/usr/bin/pkg-config"
                freetype_config = freetype_tools / "freetype-config"
                freetype_config.write_text(
                    "#!/bin/sh\n"
                    f'PKG_CONFIG="{pkg_config}"\n'
                    'if [ "$1" = "--cflags" ] && [ "$2" = "--libs" ]; then\n'
                    '  exec "$PKG_CONFIG" --cflags --libs freetype2\n'
                    'fi\n'
                    'case "$1" in\n'
                    '  --cflags) exec "$PKG_CONFIG" --cflags freetype2 ;;\n'
                    '  --libs) exec "$PKG_CONFIG" --libs freetype2 ;;\n'
                    '  --version) exec "$PKG_CONFIG" --modversion freetype2 ;;\n'
                    '  --prefix) exec "$PKG_CONFIG" --variable=prefix freetype2 ;;\n'
                    '  --exec-prefix) exec "$PKG_CONFIG" --variable=exec_prefix freetype2 ;;\n'
                    '  --includedir) exec "$PKG_CONFIG" --variable=includedir freetype2 ;;\n'
                    '  --libdir) exec "$PKG_CONFIG" --variable=libdir freetype2 ;;\n'
                    '  *) exec "$PKG_CONFIG" "$@" freetype2 ;;\n'
                    'esac\n'
                )
                freetype_config.chmod(0o755)
                gd_options.append(f"--with-freetype-dir={build_dependencies}")
                icu_config = legacy_icu_root / "bin/icu-config"
                if not icu_config.is_file():
                    raise RuntimeError(f"The isolated ICU runtime did not provide icu-config: {icu_config}")
                gd_options.append(f"--with-icu-dir={legacy_icu_root}")
            configure = [
                "./configure", f"--prefix={root}", f"--with-config-file-path={root / 'conf'}",
                f"--with-config-file-scan-dir={root / 'conf/conf.d'}", "--enable-fpm", f"--with-fpm-user={runtime_user}",
                f"--with-fpm-group={runtime_user}", "--enable-mbstring", "--enable-bcmath", "--enable-opcache",
                "--enable-zip", f"--with-curl={build_dependencies}", "--with-openssl", "--with-zlib",
                "--with-mysqli=mysqlnd", "--with-pdo-mysql=mysqlnd", "--with-pdo-pgsql", "--with-sqlite3",
                "--enable-intl",
                *gd_options, "--enable-fileinfo", "--enable-soap",
            ]
            if legacy_ssl_root:
                configure.append(f"--with-openssl={legacy_ssl_root}")
            self._update(job_id, progress=25, message=f"Configuring PHP {requested_version} with FPM and web extensions…", log=[f"$ {' '.join(configure)}", f"CPPFLAGS={configure_cppflags}", f"LDFLAGS={configure_ldflags}"])
            configure_environment = {**os.environ, "CPPFLAGS": configure_cppflags}
            if legacy_ssl_root:
                configure_environment["CPPFLAGS"] = f"-I{legacy_ssl_root / 'include'} {configure_environment['CPPFLAGS']}"
                configure_environment["LDFLAGS"] = f"-L{legacy_ssl_root / 'lib'}"
                configure_environment["LIBS"] = "-ldl -lpthread"
                if php_version_tuple >= (7, 0):
                    # PHP 7.x can configure against the isolated OpenSSL
                    # headers but its generated final link rules may omit
                    # the static compatibility libraries. Keep the flags
                    # after the PHP objects so libssl/libcrypto symbols are
                    # resolved without changing the host OpenSSL runtime.
                    openssl_link_flags = " ".join([
                        f"-L{legacy_ssl_root / 'lib'}",
                        f"-Wl,-rpath,{legacy_ssl_root / 'lib'}",
                        "-Wl,--no-as-needed",
                        "-lssl",
                        "-lcrypto",
                        "-ldl",
                        "-lpthread",
                        "-Wl,--as-needed",
                    ])
                    configure_environment["LDFLAGS"] = openssl_link_flags
                    configure_environment["LIBS"] = openssl_link_flags
                    configure_environment["OPENSSL_LIBS"] = openssl_link_flags
            if legacy_icu_root:
                configure_environment["CPPFLAGS"] = f"-I{legacy_icu_root / 'include'} {configure_environment['CPPFLAGS']}"
                configure_environment["LDFLAGS"] = " ".join(
                    value for value in (configure_environment.get("LDFLAGS", ""), f"-L{legacy_icu_root / 'lib'}") if value
                )
            if php_version_tuple < (7, 4):
                configure_environment["PATH"] = f"{build_dependencies / 'bin'}:{configure_environment.get('PATH', '')}"
                # PHP 5.6's bundled configure checks both the executable name
                # and the cached Autoconf path.  Supplying both prevents it
                # from bypassing the private compatibility wrapper on hosts
                # where freetype-config is no longer installed system-wide.
                configure_environment["FREETYPE_CONFIG"] = str(freetype_config)
                configure_environment["ac_cv_path_FREETYPE_CONFIG"] = str(freetype_config)
                configure_environment["ICU_CONFIG"] = str(icu_config)
                configure_environment["PATH"] = f"{legacy_icu_root / 'bin'}:{configure_environment['PATH']}"
                configure_environment["FREETYPE_CFLAGS"] = subprocess.run(
                    [pkg_config, "--cflags", "freetype2"], capture_output=True, text=True, check=False
                ).stdout.strip()
                configure_environment["FREETYPE_LIBS"] = subprocess.run(
                    [pkg_config, "--libs", "freetype2"], capture_output=True, text=True, check=False
                ).stdout.strip()
                freetype_check = subprocess.run(
                    [str(freetype_config), "--cflags", "--libs"],
                    capture_output=True,
                    text=True,
                    check=False,
                    env=configure_environment,
                )
                if freetype_check.returncode != 0:
                    raise RuntimeError(
                        "The isolated freetype-config wrapper could not run: "
                        + (freetype_check.stderr or freetype_check.stdout).strip()
                    )
                icu_check = subprocess.run(
                    [str(icu_config), "--cflags"],
                    capture_output=True,
                    text=True,
                    check=False,
                    env=configure_environment,
                )
                if icu_check.returncode != 0:
                    raise RuntimeError(
                        "The isolated icu-config wrapper could not run: "
                        + (icu_check.stderr or icu_check.stdout).strip()
                    )
                icu_link_check = subprocess.run(
                    [str(icu_config), "--ldflags"],
                    capture_output=True,
                    text=True,
                    check=False,
                    env=configure_environment,
                )
                if icu_link_check.returncode != 0 or not icu_link_check.stdout.strip():
                    raise RuntimeError(
                        "The isolated ICU runtime did not provide linker flags: "
                        + (icu_link_check.stderr or icu_link_check.stdout).strip()
                    )
                icu_library = legacy_icu_root / "lib"
                required_icu_libraries = [
                    icu_library / "libicui18n.so",
                    icu_library / "libicuuc.so",
                    icu_library / "libicudata.so",
                ]
                missing_icu_libraries = [path.name for path in required_icu_libraries if not path.exists()]
                if missing_icu_libraries:
                    raise RuntimeError(
                        "The isolated ICU runtime is missing link libraries: "
                        + ", ".join(missing_icu_libraries)
                    )
                # PHP 5.6's configure macros can lose ICU_LIBS when they
                # generate the final FPM link command. Keep icu-config output
                # for compatibility, but append explicit ICU 57 libraries at
                # the end of LIBS so uidna/uspoof symbols resolve against the
                # isolated runtime rather than the host ICU.
                icu_link_flags = " ".join([
                    icu_link_check.stdout.strip(),
                    f"-L{icu_library}",
                    f"-Wl,-rpath,{icu_library}",
                    "-Wl,--no-as-needed",
                    str(icu_library / "libicuio.so"),
                    str(icu_library / "libicui18n.so"),
                    str(icu_library / "libicuuc.so"),
                    str(icu_library / "libicudata.so"),
                    "-Wl,--as-needed",
                ])
                configure_environment["ICU_LIBS"] = icu_link_flags
                configure_environment["LDFLAGS"] = " ".join(
                    value for value in (configure_environment.get("LDFLAGS", ""), icu_link_flags) if value
                )
                configure_environment["LIBS"] = " ".join(
                    value for value in (configure_environment.get("LIBS", ""), icu_link_flags) if value
                )
                self._update(
                    job_id,
                    message=f"Preparing FreeType compatibility for PHP {requested_version}…",
                    log=[
                        f"freetype-config: {freetype_config}",
                        f"FREETYPE_CFLAGS={configure_environment['FREETYPE_CFLAGS']}",
                        f"FREETYPE_LIBS={configure_environment['FREETYPE_LIBS']}",
                        f"icu-config: {icu_config}",
                        f"ICU_CFLAGS={icu_check.stdout.strip()}",
                        f"ICU_LIBS={icu_link_flags}",
                        f"PHP {requested_version}: using isolated ICU compatibility runtime {legacy_icu_root}",
                    ],
                )
            if php_version_tuple < (8, 0):
                # PHP 7.4 and older use OpenSSL 1.x RSA APIs. Ubuntu 24.04
                # exposes OpenSSL 3 headers, where those APIs are deprecated
                # and some parameters became const-qualified. The legacy
                # source treats these compatibility warnings as errors; keep
                # the adjustment limited to legacy PHP builds.
                # PHP 5.6/7.4 intentionally uses APIs that OpenSSL 1.1.1
                # marks deprecated, and GCC 13 warns about the old PHP zval
                # const signatures. Keep these warnings from becoming build
                # failures and keep the compiler output readable. This is
                # limited to legacy PHP source builds only.
                legacy_cflags = (
                    "-Wno-error=deprecated-declarations "
                    "-Wno-error=discarded-qualifiers "
                    "-Wno-deprecated-declarations "
                    "-Wno-discarded-qualifiers"
                )
                configure_environment["CFLAGS"] = " ".join(
                    value for value in (configure_environment.get("CFLAGS", ""), legacy_cflags) if value
                )
            if configure_ldflags:
                configure_environment["LDFLAGS"] = " ".join(
                    value for value in (configure_environment.get("LDFLAGS", ""), configure_ldflags) if value
                )
            result = subprocess.run(configure, cwd=source, capture_output=True, text=True, check=False, env=configure_environment)
            if result.returncode != 0:
                raise RuntimeError((result.stderr or result.stdout).strip()[-3000:] or "PHP configure failed")
            if legacy_icu_root and icu_link_flags:
                # PHP 5.6 can detect ICU through configure but omit ICU_LIBS
                # from the generated FPM link rule. Patch only the temporary
                # build Makefiles so the final linker always receives ICU 57
                # after the intl objects that reference uidna/uspoof symbols.
                makefile_marker = "# Server Engine isolated ICU linker flags"
                for makefile in source.rglob("Makefile"):
                    try:
                        content = makefile.read_text(errors="replace")
                    except OSError:
                        continue
                    if makefile_marker in content:
                        continue
                    # Use standalone += assignments instead of editing the
                    # existing values. PHP 5.6 emits multi-line Makefile
                    # variables; appending to their first line can place the
                    # flags inside a continuation and omit them from FPM.
                    additions = "\n".join([
                        makefile_marker,
                        # ``override`` is required because PHP's generated
                        # Makefiles reassign these variables in recursive
                        # sub-makes (notably sapi/fpm). A plain ``+=`` at the
                        # end of the parent Makefile is therefore lost before
                        # the final php-fpm link command is generated.
                        f"override EXTRA_LIBS += {icu_link_flags}",
                        f"override LIBS += {icu_link_flags}",
                        f"override INTL_SHARED_LIBADD += {icu_link_flags}",
                        "",
                    ])
                    makefile.write_text(content.rstrip() + "\n" + additions)
            if openssl_link_flags:
                # PHP 7.x uses recursive Makefiles for sapi/fpm and phpdbg.
                # Preserve the isolated OpenSSL libraries in those sub-makes
                # as well; environment LIBS alone is not sufficient because
                # the generated rules can replace it.
                makefile_marker = "# Server Engine isolated OpenSSL linker flags"
                for makefile in source.rglob("Makefile"):
                    try:
                        content = makefile.read_text(errors="replace")
                    except OSError:
                        continue
                    if makefile_marker in content:
                        continue
                    additions = "\n".join([
                        makefile_marker,
                        f"override EXTRA_LIBS += {openssl_link_flags}",
                        f"override LIBS += {openssl_link_flags}",
                        "",
                    ])
                    makefile.write_text(content.rstrip() + "\n" + additions)
            jobs = str(max(1, min(os.cpu_count() or 1, 4)))
            make_command = ["make", f"-j{jobs}"]
            self._update(job_id, progress=45, message="Compiling PHP…", log=[f"$ {' '.join(make_command)}"])
            make_output: list[str] = []
            started = time.monotonic()
            last_update = started
            build = subprocess.Popen(
                make_command,
                cwd=source,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                start_new_session=True,
                env=configure_environment,
            )
            self._track_process(job_id, build)
            try:
                for line in build.stdout or []:
                    line = line.rstrip()
                    if not line:
                        continue
                    make_output.append(line)
                    # Keep the WebSocket payload bounded while continuously
                    # exposing the compiler output instead of appearing hung.
                    if len(make_output) > 1000:
                        del make_output[:-1000]
                    now = time.monotonic()
                    if now - last_update >= 0.35:
                        elapsed = max(1, int(now - started))
                        progress = min(78, 45 + min(33, len(make_output) // 8))
                        self._update(
                            job_id,
                            progress=progress,
                            message=f"Compiling PHP… {elapsed}s elapsed",
                            log=[f"$ {' '.join(make_command)}", *make_output[-999:]],
                        )
                        last_update = now
                    self._raise_if_cancelled(job_id)
                return_code = build.wait()
            except InstallCancelled:
                # The cancellation endpoint can now terminate the compiler
                # instead of leaving this serialized worker blocked in make.
                self._terminate_process(build)
                raise
            finally:
                self._untrack_process(job_id, build)
            self._update(
                job_id,
                progress=78 if return_code == 0 else 45,
                message="PHP compilation finished; installing the isolated runtime…" if return_code == 0 else "PHP compilation failed.",
                log=[f"$ {' '.join(make_command)}", *make_output[-999:]],
            )
            if return_code != 0:
                raise RuntimeError("\n".join(make_output[-30:]) or "PHP compilation failed")
            self._update(job_id, progress=80, message="Installing PHP into the isolated Server Engine runtime…", log=["$ make install"])
            result = subprocess.run(["make", "install"], cwd=source, capture_output=True, text=True, check=False, env=configure_environment)
            if result.returncode != 0:
                raise RuntimeError((result.stderr or result.stdout).strip()[-3000:] or "PHP installation failed")
            (root / "conf").mkdir(parents=True, exist_ok=True)
            (root / "conf/conf.d").mkdir(parents=True, exist_ok=True)
            production_ini = source / "php.ini-production"
            if production_ini.exists():
                shutil.copy2(production_ini, root / "conf/php.ini")
            root, detected_version = normalize_php_runtime_layout(root)
            requested_version = detected_version or requested_version
            ensure_php_fpm_layout(requested_version)
            enable_php_baseline_extensions(requested_version)
            ensure_php_runtime_launcher(requested_version)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-install-method").write_text("source\n")
            self._update(job_id, status="succeeded", progress=100, message=f"PHP-FPM {requested_version} was built inside {root}; the host PHP installation was not changed.")
        except Exception as error:
            preserve_build_workspace = True
            workspace_message = str(error)
            workspace_message += f"\nFailed PHP build workspace preserved at {staging}"
            self._update(job_id, status="failed", message=workspace_message)
        finally:
            archive.unlink(missing_ok=True)
            if not preserve_build_workspace:
                shutil.rmtree(staging, ignore_errors=True)
                shutil.rmtree(build_dependencies, ignore_errors=True)

    def _run_isolated_package(self, job_id: str, service_id: str, requested_version: str, package_override: str | None = None):
        if service_id in {"apache", "mariadb", "stalwart", "mongodb", "opensearch", "wp-cli", "postfix", "dovecot", "rspamd", "bind9", "unbound", "clamav", "supervisor", "lynis", "openlitespeed", "caddy"}:
            self._ensure_source_build_dependencies(job_id, service_id)
        if service_id == "mysql":
            self._run_mysql_binary(job_id, requested_version)
            return
        if service_id == "sqlserver":
            self._run_sqlserver_container(job_id, requested_version)
            return
        if service_id == "nodejs":
            self._run_node_binary(job_id, requested_version)
            return
        if service_id == "python":
            self._run_python_binary(job_id, requested_version)
            return
        if service_id == "pm2":
            self._run_pm2_binary(job_id, requested_version)
            return
        if service_id == "redis":
            self._run_redis_binary(job_id, requested_version)
            return
        if service_id == "postgresql":
            self._run_postgresql_binary(job_id, requested_version)
            return
        if service_id == "nginx":
            self._run_nginx_binary(job_id, requested_version)
            return
        if service_id == "apache":
            self._run_apache_binary(job_id, requested_version)
            return
        if service_id == "stalwart":
            self._run_stalwart_binary(job_id, requested_version)
            return
        if service_id == "mongodb":
            self._run_mongodb_binary(job_id, requested_version)
            return
        if service_id == "opensearch":
            self._run_opensearch_binary(job_id, requested_version)
            return
        if service_id == "wp-cli":
            self._run_wpcli_binary(job_id, requested_version, php_version)
            return
        if service_id == "postfix":
            self._run_postfix_binary(job_id, requested_version)
            return
        if service_id == "dovecot":
            self._run_dovecot_binary(job_id, requested_version)
            return
        if service_id == "rspamd":
            self._run_rspamd_binary(job_id, requested_version)
            return
        if service_id == "bind9":
            self._run_bind9_binary(job_id, requested_version)
            return
        if service_id == "unbound":
            self._run_unbound_binary(job_id, requested_version)
            return
        if service_id == "clamav":
            self._run_clamav_binary(job_id, requested_version)
            return
        if service_id == "supervisor":
            self._run_supervisor_binary(job_id, requested_version)
            return
        if service_id == "lynis":
            self._run_lynis_binary(job_id, requested_version)
            return
        if service_id == "caddy":
            self._run_caddy_binary(job_id, requested_version)
            return
        if service_id == "mariadb":
            self._run_mariadb_binary(job_id, requested_version)
            return
        if service_id == "powerdns":
            self._run_powerdns_binary(job_id, requested_version)
            return
        if service_id == "haproxy":
            self._run_haproxy_binary(job_id, requested_version)
            return
        if service_id == "memcached":
            self._run_memcached_binary(job_id, requested_version)
            return
        if service_id == "valkey":
            self._run_valkey_binary(job_id, requested_version)
            return
        if service_id == "vsftpd":
            self._run_vsftpd_binary(job_id, requested_version)
            return
        if service_id == "certbot":
            self._run_certbot_binary(job_id, requested_version)
            return
        if service_id == "rabbitmq":
            self._run_rabbitmq_binary(job_id, requested_version)
            return
        if service_id == "git":
            self._run_git_binary(job_id, requested_version)
            return
        if service_id == "imagemagick":
            self._run_imagemagick_binary(job_id, requested_version)
            return
        if service_id == "ruby":
            self._run_ruby_binary(job_id, requested_version)
            return
        if service_id == "ffmpeg":
            self._run_ffmpeg_binary(job_id, requested_version)
            return
        if service_id == "openlitespeed":
            self._run_openlitespeed_binary(job_id, requested_version)
            return
        if service_id == "composer":
            self._run_composer_binary(job_id, requested_version, php_version)
            return
        package = package_for(service_id)
        root = service_root(service_id, requested_version if service_id == "nodejs" else None)
        packages = [package] if package else []
        if service_id == "php":
            normalized = requested_version.removeprefix("php")
            minor = ".".join(normalized.split(".")[:2])
            package = package_override or f"php{minor}-fpm"
            packages = [package, f"php{minor}-cli", f"php{minor}-common", "unzip"]
            root = service_root("php", normalized)
        if package is None:
            self._update(job_id, status="failed", message=f"No isolated package adapter exists for {service_id}; no global package was changed.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The app-root installer must run with privileges to stage the service binary.")
            return
        apt = shutil.which("apt-get")
        dpkg = shutil.which("dpkg-deb")
        if not apt or not dpkg:
            self._update(job_id, status="failed", message="The isolated package adapter currently supports Debian/Ubuntu package extraction.")
            return
        try:
            root.mkdir(parents=True, exist_ok=True)
            package_dir = root / ".packages"
            package_dir.mkdir(exist_ok=True)
            for old_archive in package_dir.glob("*.deb"):
                old_archive.unlink(missing_ok=True)
            if service_id == "mariadb":
                self._update(job_id, status="running", progress=3, message=f"Preparing the official MariaDB {requested_version} repository…", log=[])
                try:
                    self._ensure_mariadb_package_source(requested_version)
                except RuntimeError as error:
                    self._update(job_id, progress=4, message=f"Official MariaDB repository unavailable; using the operating system repository. {error}")
            else:
                self._update(job_id, status="running", progress=2, message=f"Preparing {service_id} {requested_version}…", log=[])
            metadata = self._run_cancellable(job_id, [apt, "update"], check=False)
            metadata_log = [line.strip() for line in metadata.stdout.splitlines() if line.strip()][-20:]
            if metadata.returncode:
                self._update(
                    job_id,
                    progress=8,
                    message="Package metadata refresh reported a warning; checking the available package cache…",
                    log=metadata_log,
                )
            else:
                self._update(job_id, progress=8, message="Package metadata is ready. Resolving runtime dependencies…", log=metadata_log)
            apt_cache = shutil.which("apt-cache")
            packages = [item for item in packages if item]
            if apt_cache and package and requested_version not in {"latest", "managed"} and service_id not in {"php", "nodejs", "python", "mysql", "sqlserver", "composer"}:
                # Never silently install the repository's newest package when
                # the user selected an older release. Resolve the exact
                # package build first, then download it for extraction.
                candidates = subprocess.run(
                    [apt_cache, "madison", package],
                    capture_output=True,
                    text=True,
                    check=False,
                ).stdout.splitlines()
                selected_package_version = None
                for line in candidates:
                    parts = [part.strip() for part in line.split("|")]
                    if len(parts) < 2 or not parts[1]:
                        continue
                    full_version = parts[1]
                    comparable = full_version.split(":", 1)[-1]
                    if comparable == requested_version or comparable.startswith(f"{requested_version}."):
                        selected_package_version = full_version
                        break
                if not selected_package_version:
                    available = ", ".join(
                        parts[1].split(":", 1)[-1]
                        for line in candidates
                        for parts in [[part.strip() for part in line.split("|")]]
                        if len(parts) >= 2 and parts[1]
                    ) or "none"
                    raise RuntimeError(
                        f"{service_id} {requested_version} is not available from this server's configured repositories. "
                        f"Available versions: {available}. Refresh compatible versions before installing."
                    )
                packages[0] = f"{package}={selected_package_version}"
            if apt_cache and service_id == "mariadb" and requested_version not in {"latest", "managed"}:
                available_versions = subprocess.run(
                    [apt_cache, "madison", package],
                    capture_output=True,
                    text=True,
                    check=False,
                ).stdout.splitlines()
                requested_prefix = requested_version.removeprefix("mariadb-")
                matches = []
                for line in available_versions:
                    parts = [part.strip() for part in line.split("|")]
                    if len(parts) < 2:
                        continue
                    candidate = parts[1].split(":", 1)[-1]
                    if candidate == requested_prefix or candidate.startswith(f"{requested_prefix}."):
                        matches.append(candidate)
                if not matches:
                    available = ", ".join(
                        part[1].strip().split(":", 1)[-1]
                        for line in available_versions
                        for part in [[item.strip() for item in line.split("|")]]
                        if len(part) >= 2 and part[1]
                    ) or "none"
                    raise RuntimeError(
                        f"MariaDB {requested_version} is not available from this server's configured repositories. "
                        f"Available versions: {available}. Refresh compatible versions or configure the official MariaDB repository."
                    )
            if service_id == "php" and apt_cache:
                if not package_override and len(normalized.split(".")) >= 3:
                    candidates = subprocess.run(
                        [apt_cache, "madison", package],
                        capture_output=True,
                        text=True,
                        check=False,
                    ).stdout.splitlines()
                    exact_package = next(
                        (
                            parts[1]
                            for line in candidates
                            for parts in [[part.strip() for part in line.split("|")]]
                            if len(parts) >= 2
                            and parts[1].split(":", 1)[-1].startswith(f"{normalized}-")
                        ),
                        None,
                    )
                    if exact_package:
                        packages[0] = f"{package}={exact_package}"
                available = subprocess.run([apt_cache, "show", package], capture_output=True, text=True, check=False)
                if available.returncode != 0 or "Package:" not in available.stdout:
                    self._update(job_id, message=f"PHP {normalized} is not in the current Debian repositories. Adding the PHP runtime source and retrying…")
                    self._ensure_php_package_source()
            if apt_cache:
                self._update(job_id, progress=12, message="Resolving required packages and PHP extensions…")
                pending = list(packages)
                checked = set()
                while pending:
                    dependency_package = pending.pop(0)
                    if dependency_package in checked:
                        continue
                    checked.add(dependency_package)
                    dependency_output = subprocess.run([apt_cache, "depends", "--no-recommends", "--no-suggests", dependency_package], capture_output=True, text=True, check=False).stdout
                    for line in dependency_output.splitlines():
                        match = re.match(r"\s+\|?(?:Depends|PreDepends):\s+([^\s|<>]+)", line)
                        if match and match.group(1) not in packages:
                            packages.append(match.group(1))
                            pending.append(match.group(1))
                if service_id == "php":
                    normalized = requested_version.removeprefix("php")
                    common_modules = ("cli", *PHP_REQUIRED_EXTENSIONS, "xml", "gd", "intl", "bcmath", "opcache", "igbinary", "redis")
                    minor = ".".join(normalized.split(".")[:2])
                    for module in common_modules:
                        candidate = f"php{minor}-{module}"
                        available = subprocess.run([apt_cache, "show", candidate], capture_output=True, text=True, check=False)
                        if available.returncode == 0 and "Package:" in available.stdout and candidate not in packages:
                            packages.append(candidate)
                    # Resolve dependencies for the PHP modules added above as
                    # well. In particular, php*-zip needs libzip5; resolving
                    # only the original PHP package omits that runtime library.
                    pending = [item for item in packages if item not in checked]
                    while pending:
                        dependency_package = pending.pop(0)
                        if dependency_package in checked:
                            continue
                        checked.add(dependency_package)
                        dependency_output = subprocess.run([apt_cache, "depends", "--no-recommends", "--no-suggests", dependency_package], capture_output=True, text=True, check=False).stdout
                        for line in dependency_output.splitlines():
                            match = re.match(r"\s+\|?(?:Depends|PreDepends):\s+([^\s|<>]+)", line)
                            if match and match.group(1) not in packages:
                                packages.append(match.group(1))
                                pending.append(match.group(1))
            self._update(job_id, progress=25, message=f"Downloading {len(packages)} package archives for {service_id}…")
            process = subprocess.Popen(
                [apt, "download", *packages],
                cwd=package_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                start_new_session=True,
            )
            self._track_process(job_id, process)
            output = []
            try:
                for line in process.stdout or []:
                    if line.strip():
                        output.append(line.rstrip())
                        self._update(job_id, progress=min(65, 25 + len(output)), message=f"Downloading {service_id} packages…", log=output[-80:])
                if process.wait() != 0:
                    self._raise_if_cancelled(job_id)
                    raise RuntimeError(f"Unable to download isolated package {package}")
            finally:
                self._untrack_process(job_id, process)
            debs = sorted(package_dir.glob("*.deb"))
            if not debs:
                raise RuntimeError(f"Package archive {package} was not downloaded")
            self._update(job_id, progress=68, message=f"Downloaded {len(debs)} archives. Extracting {service_id} into its managed directory…")
            for index, deb in enumerate(debs):
                subprocess.run([dpkg, "-x", str(deb), str(root)], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                self._update(job_id, progress=min(88, 68 + round((index + 1) * 20 / len(debs))), message=f"Extracting {service_id} package {index + 1} of {len(debs)}…")
            if service_id == "nodejs":
                self._prepare_node_runtime(root)
            for deb in debs:
                deb.unlink(missing_ok=True)
            package_dir.rmdir()
            if service_id == "php":
                root, detected_version = normalize_php_runtime_layout(root)
                normalized = detected_version or normalized
            (root / ".serverengine-version").write_text(
                (normalized if service_id == "php" else requested_version) + "\n"
            )
            self._update(job_id, progress=92, message=f"Configuring {service_id} runtime files and default extensions…")
            if service_id == "nginx":
                ensure_nginx_layout()
            if service_id == "openlitespeed":
                config_dir = root / "conf"
                (config_dir / "vhosts/default").mkdir(parents=True, exist_ok=True)
                (root / "www").mkdir(parents=True, exist_ok=True)
                config = config_dir / "httpd_config.conf"
                vhost = config_dir / "vhosts/default/vhost.conf"
                if not config.exists():
                    config.write_text(
                        f"serverName ServerEngine\nuser serverengine\ngroup serverengine\nautoRestart 1\n"
                        f"enableGzip 1\nenableBr 1\nlistener HTTP {{\n  address *:80\n  secure 0\n  map default *\n}}\n"
                        f"virtualHost default {{\n  vhRoot {root / 'www'}\n  configFile {vhost}\n  allowSymbolLink 1\n  enableScript 1\n}}\n"
                        f"errorlog {root / 'logs/error.log'} {{ logLevel NOTICE rollingSize 10M keepDays 30 }}\n"
                        f"accesslog {root / 'logs/access.log'} {{ logFormat \"%h %l %u %t \\\"%r\\\" %>s %b\" rollingSize 10M keepDays 30 }}\n"
                    )
                if not vhost.exists():
                    vhost.write_text("docRoot $VH_ROOT/www\nindex {\n  useServer 0\n  indexFiles index.php, index.html\n}\nrewrite {\n  enable 1\n  autoLoadHtaccess 1\n}\n")
            if service_id == "caddy":
                config_dir = root / "conf"
                config_dir.mkdir(parents=True, exist_ok=True)
                for directory in (root / "data", root / "www", root / "logs", root / "run"):
                    directory.mkdir(parents=True, exist_ok=True)
                config = config_dir / "Caddyfile"
                if not config.exists():
                    config.write_text(
                        f"{{\n    email admin@example.com\n    admin 127.0.0.1:2019\n    storage file-system {root / 'data'}\n}}\n\n"
                        f"import {root / 'conf/sites/*.caddy'}\n\n"
                        f":80 {{\n    root * {root / 'www'}\n    encode zstd gzip\n    file_server\n    log {{ output file {root / 'logs/access.log'} }}\n}}\n"
                    )
            if service_id == "haproxy":
                config_dir = root / "conf"
                config_dir.mkdir(parents=True, exist_ok=True)
                for directory in (root / "logs", root / "run"):
                    directory.mkdir(parents=True, exist_ok=True)
                config = config_dir / "haproxy.cfg"
                if not config.exists():
                    config.write_text(
                        f"global\n    log stdout format raw local0\n    stats socket {root / 'run/admin.sock'} mode 660 level admin\n    maxconn 4096\n\n"
                        "defaults\n    mode http\n    log global\n    option httplog\n    timeout connect 5s\n    timeout client 30s\n    timeout server 30s\n\n"
                        "frontend http_front\n    bind *:80\n    default_backend web_back\n\n"
                        "backend web_back\n    balance roundrobin\n    option httpchk GET /health\n    server app1 127.0.0.1:8080 check\n"
                    )
            if service_id == "powerdns":
                config = root / "conf/pdns.conf"
                config.parent.mkdir(parents=True, exist_ok=True)
                if not config.exists():
                    config.write_text(
                        "# Server Engine PowerDNS Authoritative baseline\n"
                        f"launch=bind\nbind-config={root / 'conf/named.conf'}\nprimary=yes\n"
                        f"socket-dir={root / 'run'}\nlocal-address=0.0.0.0\nlocal-port=53\n"
                        "default-ttl=3600\napi=yes\nwebserver=yes\n"
                        "webserver-address=127.0.0.1\nwebserver-port=8081\n"
                        "webserver-allow-from=127.0.0.1,::1\n"
                    )
                prepare_powerdns_runtime(root)
            if service_id == "postgresql":
                config_dir = root / "conf"
                config_dir.mkdir(parents=True, exist_ok=True)
                config = config_dir / "postgresql.conf"
                hba = config_dir / "pg_hba.conf"
                if not config.exists():
                    config.write_text("listen_addresses = '127.0.0.1'\nport = 5432\nlogging_collector = on\n")
                if not hba.exists():
                    hba.write_text("local all all scram-sha-256\nhost all all 127.0.0.1/32 scram-sha-256\n")
            if service_id == "redis":
                config_dir = root / "conf"
                config_dir.mkdir(parents=True, exist_ok=True)
                config = config_dir / "redis.conf"
                if not config.exists():
                    config.write_text(
                        f"bind 127.0.0.1 ::1\nprotected-mode yes\nport 6379\n"
                        f"dir {root / 'data'}\nlogfile {root / 'logs/redis.log'}\n"
                        f"pidfile {root / 'run/redis.pid'}\ndaemonize no\n"
                    )
            if service_id == "valkey":
                config_dir = root / "conf"
                config_dir.mkdir(parents=True, exist_ok=True)
                for directory in (root / "data", root / "logs", root / "run"):
                    directory.mkdir(parents=True, exist_ok=True)
                config = config_dir / "valkey.conf"
                if not config.exists():
                    config.write_text(
                        f"bind 127.0.0.1 ::1\nprotected-mode yes\nport 6379\n"
                        f"dir {root / 'data'}\nappendonly no\nmaxmemory 256mb\n"
                        f"maxmemory-policy allkeys-lru\nlogfile {root / 'logs/valkey.log'}\n"
                        f"pidfile {root / 'run/valkey.pid'}\ndaemonize no\n"
                    )
            if service_id == "fail2ban":
                config_dir = root / "conf"
                config_dir.mkdir(parents=True, exist_ok=True)
                for directory in (root / "logs", root / "run"):
                    directory.mkdir(parents=True, exist_ok=True)
                config = config_dir / "jail.local"
                if not config.exists():
                    config.write_text(
                        "[DEFAULT]\nignoreip = 127.0.0.1/8 ::1\nbantime = 1h\n"
                        "findtime = 10m\nmaxretry = 5\nbackend = auto\n"
                        "banaction = nftables-multiport\naction = %(action_)s\n\n"
                        f"[sshd]\nenabled = true\nport = ssh\nlogpath = {root / 'logs/sshd.log'}\n"
                    )
            if service_id == "memcached":
                config_dir = root / "conf"
                config_dir.mkdir(parents=True, exist_ok=True)
                config = config_dir / "memcached.conf"
                if not config.exists():
                    config.write_text("-m 256\n-p 11211\n-l 127.0.0.1\n-c 1024\n-t 4\n-U 0\n-o modern\n")
            if service_id == "certbot":
                config_dir = root / "conf"
                config_dir.mkdir(parents=True, exist_ok=True)
                config = config_dir / "cli.ini"
                if not config.exists():
                    config.write_text(
                        "# Server Engine Certbot defaults\n"
                        "agree-tos = true\nnon-interactive = true\n"
                        "preferred-challenges = http\n"
                        f"config-dir = {root / 'config'}\n"
                        f"work-dir = {root / 'work'}\n"
                        f"logs-dir = {root / 'logs'}\n"
                    )
            if service_id == "php":
                self._ensure_service_user()
                ensure_php_fpm_layout(normalized)
                enabled = enable_php_baseline_extensions(normalized)
                self._update(job_id, message=f"PHP {normalized} installed with ready-to-use web modules: {', '.join(enabled) or 'core runtime only'}.")
            (root / "logs").mkdir(exist_ok=True)
            (root / "run").mkdir(exist_ok=True)
            (root / "data").mkdir(exist_ok=True)
            self._update(job_id, status="succeeded", progress=100, message=f"{service_id} {requested_version} is installed and ready in {root}.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_openlitespeed_binary(self, job_id: str, requested_version: str):
        """Build OpenLiteSpeed with its upstream source build script."""
        source_url = openlitespeed_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("openlitespeed")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = openlitespeed_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"OpenLiteSpeed {requested_version} is not available from the official source repository. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated OpenLiteSpeed installer must run with privileges to stage the runtime.")
            return
        missing = [tool for tool in ("make", "cmake", "cc", "git", "go", "xz") if not shutil.which(tool)]
        if missing:
            self._update(job_id, status="failed", message=f"OpenLiteSpeed source builds require these build tools: {', '.join(missing)}. Install the Server Engine build dependencies, then retry.")
            return
        service_base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "openlitespeed"
        active_root = service_root("openlitespeed")
        if active_root.exists():
            self._share_versioned_service_paths("openlitespeed", active_root)
        root = service_root("openlitespeed", requested_version)
        staging = service_base / f".openlitespeed-{job_id}-staging"
        archive = service_base / f"openlitespeed-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=2, message=f"Downloading OpenLiteSpeed {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=90) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 4 + round(downloaded * 26 / total) if total else 12
                    self._update(job_id, progress=min(30, progress), message=f"Downloading OpenLiteSpeed {requested_version} source…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The OpenLiteSpeed archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            self._update(job_id, progress=34, message="Building OpenLiteSpeed from source with the upstream build script…", log=["$ ./build.sh"])
            process = subprocess.Popen(["./build.sh"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=source)
            assert process.stdout is not None
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    self._update(job_id, log=[line])
            if process.wait() != 0:
                raise RuntimeError("OpenLiteSpeed source build failed; see the job output for the compiler or dependency error.")
            dist = source / "dist"
            if not (dist / "bin/openlitespeed").exists():
                raise RuntimeError("OpenLiteSpeed completed its build but did not produce dist/bin/openlitespeed.")
            if root.exists():
                shutil.rmtree(root)
            shutil.copytree(dist, root)
            for directory in (root / "conf/vhosts/default", root / "www", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            config = root / "conf/httpd_config.conf"
            if not config.exists():
                config.write_text(
                    f"serverName ServerEngine\nuser serverengine\ngroup serverengine\nautoRestart 1\n"
                    f"enableGzip 1\nenableBr 1\nlistener HTTP {{\n  address *:80\n  secure 0\n  map default *\n}}\n"
                    f"virtualHost default {{\n  vhRoot {root / 'www'}\n  configFile {root / 'conf/vhosts/default/vhost.conf'}\n  allowSymbolLink 1\n  enableScript 1\n}}\n"
                    f"errorlog {root / 'logs/error.log'} {{ logLevel NOTICE rollingSize 10M keepDays 30 }}\n"
                    f"accesslog {root / 'logs/access.log'} {{ rollingSize 10M keepDays 30 }}\n"
                )
            vhost = root / "conf/vhosts/default/vhost.conf"
            if not vhost.exists():
                vhost.write_text("docRoot $VH_ROOT/www\nindex {\n  useServer 0\n  indexFiles index.php, index.html\n}\n")
            self._share_versioned_service_paths("openlitespeed", root)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root.parent.parent / ".serverengine-active-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"OpenLiteSpeed {requested_version} was built from source in {root}; no host OpenLiteSpeed package was changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)
            archive.unlink(missing_ok=True)

    def _run_openlitespeed_prebuilt(self, job_id: str, requested_version: str):
        """Extract LiteSpeed's official architecture-specific binary package."""
        archive_url = openlitespeed_prebuilt_for(requested_version)
        if not archive_url:
            try:
                definition, _, _ = refresh_service_versions("openlitespeed", force=True, install_method="prebuilt")
                if any(item.version == requested_version for item in definition.versions):
                    archive_url = openlitespeed_prebuilt_for(requested_version)
            except Exception:
                archive_url = None
        if not archive_url:
            self._update(job_id, status="failed", message=f"OpenLiteSpeed {requested_version} has no official prebuilt binary for this OS and architecture. Choose source build instead.")
            return
        service_base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "openlitespeed"
        active_root = service_root("openlitespeed")
        if active_root.exists():
            self._share_versioned_service_paths("openlitespeed", active_root)
        root = service_root("openlitespeed", requested_version)
        staging = service_base / f".openlitespeed-{job_id}-prebuilt"
        archive = staging / "openlitespeed.tgz"
        try:
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            self._update(job_id, status="running", progress=5, message=f"Downloading prebuilt OpenLiteSpeed {requested_version}…", log=[f"$ curl -fL {archive_url}"])
            request = urllib.request.Request(archive_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=180) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 5 + round(downloaded * 35 / total) if total else 20
                    self._update(job_id, progress=min(40, progress), message=f"Downloading prebuilt OpenLiteSpeed {requested_version}…")
            extracted = staging / "root"
            extracted.mkdir()
            self._update(job_id, progress=45, message=f"Extracting OpenLiteSpeed {requested_version} into the Server Engine service area…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The OpenLiteSpeed archive contains an unsafe path")
                package.extractall(extracted)
            package_root = next((item for item in extracted.iterdir() if item.is_dir()), extracted)
            distribution = package_root
            if not (distribution / "bin/openlitespeed").exists():
                raise RuntimeError("The OpenLiteSpeed binary package did not contain bin/openlitespeed.")
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            for item in distribution.iterdir():
                target = root / item.name
                if item.is_symlink():
                    target.symlink_to(os.readlink(item), target_is_directory=item.is_dir())
                elif item.is_dir():
                    shutil.copytree(item, target, dirs_exist_ok=True, symlinks=True)
                else:
                    shutil.copy2(item, target)
            binary = root / "bin/openlitespeed"
            binary.chmod(binary.stat().st_mode | 0o111)
            lshttpd = root / "bin/lshttpd"
            if not lshttpd.exists():
                lshttpd.symlink_to("./openlitespeed")
            for directory in (root / "conf/vhosts/default", root / "www", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            config = root / "conf/httpd_config.conf"
            config.write_text(
                f"serverName ServerEngine\nuser serverengine\ngroup serverengine\nautoRestart 1\n"
                f"enableGzip 1\nenableBr 1\nlistener HTTP {{\n  address *:80\n  secure 0\n  map default *\n}}\n"
                f"virtualHost default {{\n  vhRoot {root / 'www'}\n  configFile {root / 'conf/vhosts/default/vhost.conf'}\n  allowSymbolLink 1\n  enableScript 1\n}}\n"
                f"errorlog {root / 'logs/error.log'} {{ logLevel NOTICE rollingSize 10M keepDays 30 }}\n"
                f"accesslog {root / 'logs/access.log'} {{ rollingSize 10M keepDays 30 }}\n"
            )
            vhost = root / "conf/vhosts/default/vhost.conf"
            vhost.write_text("docRoot $VH_ROOT/www\nindex {\n  useServer 0\n  indexFiles index.php, index.html\n}\n")
            self._prepare_service_runtime(root, "conf", "logs", "run", "www")
            self._share_versioned_service_paths("openlitespeed", root)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-install-method").write_text("prebuilt\n")
            (root.parent.parent / ".serverengine-active-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"OpenLiteSpeed {requested_version} was installed from the official prebuilt archive in {root}; no host OpenLiteSpeed package was changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_ruby_binary(self, job_id: str, requested_version: str):
        """Build MRI Ruby from the official source archive into its own root."""
        source_url = ruby_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("ruby")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = ruby_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"Ruby {requested_version} is not available from the official source archive. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated Ruby installer must run with privileges to stage the runtime.")
            return
        missing = [tool for tool in ("make", "cc", "xz") if not shutil.which(tool)]
        if missing:
            self._update(job_id, status="failed", message=f"Ruby source builds require these build tools: {', '.join(missing)}. Install the Server Engine build dependencies, then retry.")
            return
        root = service_root("ruby")
        staging = root.parent / f".ruby-{job_id}-staging"
        archive = root.parent / f"ruby-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=2, message=f"Downloading Ruby {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=90) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 4 + round(downloaded * 26 / total) if total else 12
                    self._update(job_id, progress=min(30, progress), message=f"Downloading Ruby {requested_version} source…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The Ruby archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            if root.exists():
                shutil.rmtree(root)
            configure = ["./configure", f"--prefix={root}", "--disable-install-doc", "--enable-shared"]
            self._update(job_id, progress=34, message="Configuring Ruby for this server…", log=["$ " + " ".join(configure)])
            configured = subprocess.run(configure, cwd=source, capture_output=True, text=True, check=False)
            config_output = (configured.stdout + configured.stderr).splitlines()
            if config_output:
                self._update(job_id, log=config_output[-100:])
            if configured.returncode != 0:
                raise RuntimeError("Ruby configuration failed; see the job output for the missing library or compiler error.")
            command = ["make", f"-j{max(2, os.cpu_count() or 2)}"]
            self._update(job_id, progress=48, message="Building Ruby from source…", log=["$ " + " ".join(command)])
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=source)
            assert process.stdout is not None
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    self._update(job_id, log=[line])
            if process.wait() != 0:
                raise RuntimeError("Ruby source build failed; see the job output for the compiler error.")
            install = ["make", "install"]
            self._update(job_id, progress=84, message="Installing the isolated Ruby runtime…", log=["$ " + " ".join(install)])
            result = subprocess.run(install, cwd=source, capture_output=True, text=True, check=False)
            output = (result.stdout + result.stderr).splitlines()
            if output:
                self._update(job_id, log=output[-100:])
            if result.returncode != 0:
                raise RuntimeError("Ruby source installation failed; see the job output for the install error.")
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Ruby {requested_version} was built from source in {root}; no host Ruby package was changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)
            archive.unlink(missing_ok=True)

    def _run_ffmpeg_binary(self, job_id: str, requested_version: str):
        """Build FFmpeg from the official source archive into its own root."""
        source_url = ffmpeg_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("ffmpeg")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = ffmpeg_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"FFmpeg {requested_version} is not available from the official source archive. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated FFmpeg installer must run with privileges to stage the runtime.")
            return
        missing = [tool for tool in ("make", "cc", "pkg-config", "xz") if not shutil.which(tool)]
        if missing:
            self._update(job_id, status="failed", message=f"FFmpeg source builds require these build tools: {', '.join(missing)}. Install the Server Engine build dependencies, then retry.")
            return
        root = service_root("ffmpeg")
        staging = root.parent / f".ffmpeg-{job_id}-staging"
        archive = root.parent / f"ffmpeg-{requested_version}.tar.xz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=2, message=f"Downloading FFmpeg {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=90) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 4 + round(downloaded * 26 / total) if total else 12
                    self._update(job_id, progress=min(30, progress), message=f"Downloading FFmpeg {requested_version} source…")
            with tarfile.open(archive, "r:xz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The FFmpeg archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            if root.exists():
                shutil.rmtree(root)
            configure = ["./configure", f"--prefix={root}", "--disable-debug", "--disable-doc", "--disable-static", "--enable-shared"]
            self._update(job_id, progress=34, message="Configuring FFmpeg for this server…", log=["$ " + " ".join(configure)])
            configured = subprocess.run(configure, cwd=source, capture_output=True, text=True, check=False)
            config_output = (configured.stdout + configured.stderr).splitlines()
            if config_output:
                self._update(job_id, log=config_output[-100:])
            if configured.returncode != 0:
                raise RuntimeError("FFmpeg configuration failed; see the job output for the missing library or compiler error.")
            command = ["make", f"-j{max(2, os.cpu_count() or 2)}"]
            self._update(job_id, progress=48, message="Building FFmpeg from source…", log=["$ " + " ".join(command)])
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=source)
            assert process.stdout is not None
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    self._update(job_id, log=[line])
            if process.wait() != 0:
                raise RuntimeError("FFmpeg source build failed; see the job output for the compiler error.")
            install = ["make", "install"]
            self._update(job_id, progress=84, message="Installing the isolated FFmpeg runtime…", log=["$ " + " ".join(install)])
            result = subprocess.run(install, cwd=source, capture_output=True, text=True, check=False)
            output = (result.stdout + result.stderr).splitlines()
            if output:
                self._update(job_id, log=output[-100:])
            if result.returncode != 0:
                raise RuntimeError("FFmpeg source installation failed; see the job output for the install error.")
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"FFmpeg {requested_version} was built from source in {root}; no host FFmpeg package was changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)
            archive.unlink(missing_ok=True)

    def _run_git_binary(self, job_id: str, requested_version: str):
        """Build Git from the official source archive into its own service root."""
        source_url = git_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("git")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = git_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"Git {requested_version} is not available from the official source archive. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated Git installer must run with privileges to stage the runtime.")
            return
        missing = [tool for tool in ("make", "cc", "xz") if not shutil.which(tool)]
        if missing:
            self._update(job_id, status="failed", message=f"Git source builds require these build tools: {', '.join(missing)}. Install the Server Engine build dependencies, then retry.")
            return
        root = service_root("git")
        staging = root.parent / f".git-{job_id}-staging"
        archive = root.parent / f"git-{requested_version}.tar.xz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=2, message=f"Downloading Git {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=90) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 4 + round(downloaded * 26 / total) if total else 12
                    self._update(job_id, progress=min(30, progress), message=f"Downloading Git {requested_version} source…")
            with tarfile.open(archive, "r:xz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The Git archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            if root.exists():
                shutil.rmtree(root)
            command = ["make", f"prefix={root}", "NO_TCLTK=YesPlease", "all"]
            self._update(job_id, progress=34, message="Building Git from source…", log=["$ " + " ".join(command)])
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=source)
            assert process.stdout is not None
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    self._update(job_id, log=[line])
            if process.wait() != 0:
                raise RuntimeError("Git source build failed; see the job output for the compiler error.")
            install = ["make", f"prefix={root}", "NO_TCLTK=YesPlease", "install"]
            self._update(job_id, progress=78, message="Installing the isolated Git runtime…", log=["$ " + " ".join(install)])
            result = subprocess.run(install, cwd=source, capture_output=True, text=True, check=False)
            output = (result.stdout + result.stderr).splitlines()
            if output:
                self._update(job_id, log=output[-100:])
            if result.returncode != 0:
                raise RuntimeError("Git source installation failed; see the job output for the install error.")
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Git {requested_version} was built from source in {root}; no host Git package was changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)
            archive.unlink(missing_ok=True)

    def _run_imagemagick_binary(self, job_id: str, requested_version: str):
        """Build ImageMagick from its official source archive into its own root."""
        source_url = imagemagick_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("imagemagick")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = imagemagick_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"ImageMagick {requested_version} is not available from the official source archive. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated ImageMagick installer must run with privileges to stage the runtime.")
            return
        missing = [tool for tool in ("make", "cc", "pkg-config", "xz") if not shutil.which(tool)]
        if missing:
            self._update(job_id, status="failed", message=f"ImageMagick source builds require these build tools: {', '.join(missing)}. Install the Server Engine build dependencies, then retry.")
            return
        root = service_root("imagemagick")
        staging = root.parent / f".imagemagick-{job_id}-staging"
        archive = root.parent / f"ImageMagick-{requested_version}.tar.xz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=2, message=f"Downloading ImageMagick {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=90) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 4 + round(downloaded * 26 / total) if total else 12
                    self._update(job_id, progress=min(30, progress), message=f"Downloading ImageMagick {requested_version} source…")
            with tarfile.open(archive, "r:xz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The ImageMagick archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            if root.exists():
                shutil.rmtree(root)
            configure = ["./configure", f"--prefix={root}", "--with-modules", "--disable-static", "--without-perl"]
            self._update(job_id, progress=34, message="Configuring ImageMagick for this server…", log=["$ " + " ".join(configure)])
            configured = subprocess.run(configure, cwd=source, capture_output=True, text=True, check=False)
            config_output = (configured.stdout + configured.stderr).splitlines()
            if config_output:
                self._update(job_id, log=config_output[-100:])
            if configured.returncode != 0:
                raise RuntimeError("ImageMagick configuration failed; see the job output for the missing library or compiler error.")
            command = ["make", f"-j{max(2, os.cpu_count() or 2)}"]
            self._update(job_id, progress=48, message="Building ImageMagick from source…", log=["$ " + " ".join(command)])
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=source)
            assert process.stdout is not None
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    self._update(job_id, log=[line])
            if process.wait() != 0:
                raise RuntimeError("ImageMagick source build failed; see the job output for the compiler error.")
            install = ["make", "install"]
            self._update(job_id, progress=84, message="Installing the isolated ImageMagick runtime…", log=["$ " + " ".join(install)])
            result = subprocess.run(install, cwd=source, capture_output=True, text=True, check=False)
            output = (result.stdout + result.stderr).splitlines()
            if output:
                self._update(job_id, log=output[-100:])
            if result.returncode != 0:
                raise RuntimeError("ImageMagick source installation failed; see the job output for the install error.")
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"ImageMagick {requested_version} was built from source in {root}; no host ImageMagick package was changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)
            archive.unlink(missing_ok=True)

    def _run_certbot_binary(self, job_id: str, requested_version: str):
        """Build Certbot from its official source distribution in its own venv."""
        source_url = certbot_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("certbot")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = certbot_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"Certbot {requested_version} is not available from the official Python source index. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated Certbot installer must run with privileges to stage the runtime.")
            return
        python = shutil.which("python3") or shutil.which("python")
        if not python:
            self._update(job_id, status="failed", message="Certbot source installation requires Python 3 and the venv module.")
            return
        root = service_root("certbot")
        staging = root.parent / f".certbot-{job_id}-staging"
        archive = root.parent / f"certbot-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=2, message=f"Downloading Certbot {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=60) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 4 + round(downloaded * 26 / total) if total else 12
                    self._update(job_id, progress=min(30, progress), message=f"Downloading Certbot {requested_version} source…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The Certbot archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            venv = root / "venv"
            self._update(job_id, progress=35, message="Creating the isolated Certbot Python environment…")
            subprocess.run([python, "-m", "venv", str(venv)], check=True, capture_output=True, text=True)
            pip = venv / "bin/pip"
            command = [str(pip), "install", "--disable-pip-version-check", "--no-cache-dir", "--no-binary", ":all:", str(source)]
            self._update(job_id, progress=42, message="Building Certbot and its Python dependencies from source…", log=["$ " + " ".join(shlex.quote(item) for item in command)])
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=staging)
            output = []
            assert process.stdout is not None
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    output.append(line)
                    self._update(job_id, log=[line])
            if process.wait() != 0:
                raise RuntimeError("Certbot source build failed; see the job output for the compiler or Python dependency error.")
            for directory in (root / "config", root / "work", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            config = root / "conf/cli.ini"
            config.parent.mkdir(parents=True, exist_ok=True)
            config.write_text("# Server Engine Certbot defaults\nagree-tos = true\nnon-interactive = true\npreferred-challenges = http\n" f"config-dir = {root / 'config'}\nwork-dir = {root / 'work'}\nlogs-dir = {root / 'logs'}\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Certbot {requested_version} was built from source in {root}; no host Certbot package was changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)
            archive.unlink(missing_ok=True)

    def _run_rabbitmq_binary(self, job_id: str, requested_version: str):
        """Build RabbitMQ's generic UNIX package from the official source tree."""
        source_url = rabbitmq_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("rabbitmq")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = rabbitmq_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"RabbitMQ {requested_version} is not available from the official source repository. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated RabbitMQ installer must run with privileges to stage the runtime.")
            return
        missing = [tool for tool in ("make", "erl", "xsltproc", "xmlto") if not shutil.which(tool)]
        if missing:
            self._update(job_id, status="failed", message=f"RabbitMQ source builds require these build tools: {', '.join(missing)}. Install the Server Engine build dependencies, then retry.")
            return
        root = service_root("rabbitmq")
        staging = root.parent / f".rabbitmq-{job_id}-staging"
        archive = root.parent / f"rabbitmq-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=2, message=f"Downloading RabbitMQ {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=90) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 4 + round(downloaded * 26 / total) if total else 12
                    self._update(job_id, progress=min(30, progress), message=f"Downloading RabbitMQ {requested_version} source…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The RabbitMQ archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            self._update(job_id, progress=34, message="Building RabbitMQ and its generic UNIX package from source…")
            command = ["make", "package-generic-unix", f"RABBITMQ_VERSION={requested_version}"]
            self._update(job_id, log=["$ " + " ".join(command)])
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=source)
            assert process.stdout is not None
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    self._update(job_id, log=[line])
            if process.wait() != 0:
                raise RuntimeError("RabbitMQ source build failed; see the job output for the Erlang or packaging error.")
            package_archive = next(iter(sorted(source.glob("rabbitmq-server-generic-unix-*.tar.xz"))), None)
            if package_archive is None:
                raise RuntimeError("RabbitMQ completed its build but did not produce a generic UNIX package.")
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            with tarfile.open(package_archive, "r:xz") as binary_package:
                members = binary_package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The RabbitMQ binary archive contains an unsafe path")
                binary_package.extractall(root)
            nested = next((item for item in root.iterdir() if item.is_dir()), None)
            if nested and (nested / "sbin/rabbitmq-server").exists():
                for item in nested.iterdir():
                    target = root / item.name
                    if target.exists():
                        shutil.rmtree(target) if target.is_dir() else target.unlink()
                    shutil.move(str(item), target)
                nested.rmdir()
            for directory in (root / "etc/rabbitmq", root / "var/lib/rabbitmq", root / "var/log/rabbitmq", root / "var/run/rabbitmq"):
                directory.mkdir(parents=True, exist_ok=True)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"RabbitMQ {requested_version} was built from source in {root}; no host RabbitMQ package was changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)
            archive.unlink(missing_ok=True)

    def _run_pm2_binary(self, job_id: str, requested_version: str):
        """Install PM2 into its own prefix using an installed isolated Node.js."""
        node_versions = service_root("nodejs") / "versions"
        candidates = sorted(
            (item for item in node_versions.iterdir() if item.is_dir()),
            key=lambda item: tuple(int(part) if part.isdigit() else 0 for part in re.split(r"[.-]", item.name)),
            reverse=True,
        ) if node_versions.exists() else []
        node_root = next((item for item in candidates if binary_path("nodejs", item.name).exists()), None)
        if node_root is None:
            self._update(job_id, status="failed", message="Install an isolated Node.js runtime first. PM2 uses that runtime and does not install Node.js globally.")
            return
        self._stage_node_runtime_libraries(node_root)
        ensure_node_runtime(node_root)
        npm = node_root / "bin/npm"
        node = binary_path("nodejs", node_root.name)
        if not npm.exists() or not node.exists():
            self._update(job_id, status="failed", message="The selected isolated Node.js runtime does not include npm. Reinstall that Node.js version, then retry PM2.")
            return
        root = service_root("pm2") / "versions" / requested_version
        try:
            root.mkdir(parents=True, exist_ok=True)
            self._update(
                job_id,
                status="running",
                progress=10,
                message=f"Installing PM2 {requested_version} into its isolated prefix…",
                log=[f"$ {npm} install --prefix {root} pm2@{requested_version} --no-audit --no-fund --ignore-scripts"],
            )
            environment = os.environ.copy()
            environment["PATH"] = f"{node_root / 'bin'}:{environment.get('PATH', '')}"
            environment["npm_config_prefix"] = str(root)
            result = subprocess.run(
                [str(npm), "install", "--prefix", str(root), f"pm2@{requested_version}", "--no-audit", "--no-fund", "--ignore-scripts"],
                capture_output=True,
                text=True,
                check=False,
                timeout=300,
                env=environment,
            )
            output = (result.stdout + result.stderr).strip().splitlines()
            if output:
                self._update(job_id, progress=85, message="PM2 package installation output received.", log=output[-100:])
            if result.returncode != 0:
                raise RuntimeError("\n".join(output[-30:]) or f"Unable to install PM2 {requested_version} with the isolated Node.js runtime")
            package_launcher = root / "node_modules/.bin/pm2"
            launcher = root / "bin/pm2"
            if not package_launcher.exists():
                raise RuntimeError("The PM2 package did not create its npm executable")
            launcher.parent.mkdir(parents=True, exist_ok=True)
            launcher.write_text(f'#!/bin/sh\nexec "{package_launcher}" "$@"\n')
            launcher.chmod(0o755)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-node-version").write_text(node_root.name + "\n")
            version = subprocess.run([str(launcher), "--version"], capture_output=True, text=True, check=False, timeout=30, env=environment)
            if version.returncode != 0:
                raise RuntimeError((version.stderr or version.stdout).strip() or "The isolated PM2 executable could not start")
            self._update(job_id, status="succeeded", progress=100, message=f"PM2 {requested_version} is installed in {root} and uses isolated Node.js {node_root.name}.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_python_binary(self, job_id: str, requested_version: str):
        """Install a portable CPython build without touching the system Python."""
        asset_url = python_asset_for(requested_version)
        if not asset_url:
            try:
                definition, _, _ = refresh_service_versions("python")
                if any(item.version == requested_version for item in definition.versions):
                    asset_url = python_asset_for(requested_version)
            except Exception:
                asset_url = None
        if not asset_url:
            self._update(job_id, status="failed", message=f"Python {requested_version} is not available for this host architecture. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated Python installer must run with privileges to stage the runtime.")
            return
        root = service_root("python", requested_version)
        archive = root.parent / f".python-{requested_version}.tar.gz"
        staging = root.parent / f".python-{requested_version}.staging"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            if staging.exists():
                shutil.rmtree(staging)
            staging.mkdir(parents=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading portable Python {requested_version}…", log=[])
            request = urllib.request.Request(asset_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=30) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 5 + round(downloaded * 55 / total) if total else 20
                    self._update(job_id, progress=min(60, progress), message=f"Downloading portable Python {requested_version}…")
            self._update(job_id, progress=64, message=f"Extracting Python {requested_version} into its managed runtime…")
            with tarfile.open(archive, "r:gz") as bundle:
                staging_root = staging.resolve()
                for member in bundle.getmembers():
                    target = (staging_root / member.name).resolve()
                    if target != staging_root and staging_root not in target.parents:
                        raise RuntimeError("The Python archive contains an unsafe path")
                    bundle.extract(member, staging_root)
            extracted = staging / "python"
            source = extracted if extracted.exists() else staging
            if root.exists():
                shutil.rmtree(root)
            shutil.move(str(source), str(root))
            binary = binary_path("python", requested_version)
            if not binary.exists():
                raise RuntimeError("The downloaded Python archive did not contain a usable interpreter")
            (root / ".serverengine-version").write_text(requested_version)
            (root / "logs").mkdir(exist_ok=True)
            (root / "run").mkdir(exist_ok=True)
            archive.unlink(missing_ok=True)
            if staging.exists():
                shutil.rmtree(staging)
            version_result = subprocess.run([str(binary), "--version"], capture_output=True, text=True, check=False)
            detected = (version_result.stdout or version_result.stderr).strip()
            self._update(job_id, status="succeeded", progress=100, message=f"Python {requested_version} is installed and ready in {root}. {detected}")
        except Exception as error:
            archive.unlink(missing_ok=True)
            if staging.exists():
                shutil.rmtree(staging, ignore_errors=True)
            self._update(job_id, status="failed", message=str(error))

    def _run_python_source_binary(self, job_id: str, requested_version: str):
        """Build official CPython source into its own managed version root."""
        source_url = python_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("python", install_method="source")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = python_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"Python {requested_version} is not available from the official source catalog. Refresh compatible versions and try again.")
            return
        root = service_root("python", requested_version)
        staging = root.parent / f".python-{requested_version}-{job_id}-staging"
        archive = root.parent / f"python-{requested_version}.tgz"
        try:
            self._ensure_source_build_dependencies(job_id, "python")
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=5, message=f"Downloading Python {requested_version} source…", log=[f"$ curl -L {source_url}"])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=120) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 5 + round(downloaded * 25 / total) if total else 15
                    self._update(job_id, progress=min(30, progress), message=f"Downloading Python {requested_version} source…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The Python source archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            if root.exists():
                shutil.rmtree(root)
            configure = [
                "./configure",
                f"--prefix={root}",
                "--with-ensurepip=install",
                "--enable-shared",
                "--with-system-expat",
            ]
            environment = {**os.environ, "LDFLAGS": f"-Wl,-rpath,{root / 'lib'}"}
            self._update(job_id, progress=34, message=f"Configuring Python {requested_version}…", log=[f"$ {' '.join(configure)}"])
            configured = subprocess.run(configure, cwd=source, env=environment, capture_output=True, text=True, check=False)
            configure_log = (configured.stdout + configured.stderr).splitlines()
            if configure_log:
                self._update(job_id, log=configure_log[-100:])
            if configured.returncode != 0:
                raise RuntimeError("Python configure failed; see the job output for the missing library or compiler error.")
            jobs = str(max(1, min(os.cpu_count() or 1, 4)))
            command = ["make", f"-j{jobs}"]
            self._update(job_id, progress=50, message=f"Building Python {requested_version} from source…", log=[f"$ {' '.join(command)}"])
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=source, env=environment)
            output = []
            for line in process.stdout or []:
                line = line.rstrip()
                if line:
                    output.append(line)
                    if len(output) == 1 or len(output) % 5 == 0:
                        self._update(job_id, progress=50, log=output[-80:])
            if process.wait() != 0:
                raise RuntimeError("Python compilation failed; see the job output for the compiler error.")
            self._update(job_id, progress=82, message="Installing Python into the managed runtime…", log=["$ make install"])
            installed = subprocess.run(["make", "install"], cwd=source, env=environment, capture_output=True, text=True, check=False)
            install_log = (installed.stdout + installed.stderr).splitlines()
            if install_log:
                self._update(job_id, log=install_log[-100:])
            if installed.returncode != 0:
                raise RuntimeError("Python installation failed; see the job output for the installer error.")
            binary_candidates = sorted(root.glob("bin/python3.*"), reverse=True)
            if not binary_candidates:
                raise RuntimeError("The Python source build did not create a usable interpreter")
            binary = binary_candidates[0]
            for name in ("python", "python3"):
                link = root / "bin" / name
                if not link.exists():
                    link.symlink_to(binary.name)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-install-method").write_text("source\n")
            self._prepare_service_runtime(root, "logs", "run", "tmp")
            result = subprocess.run([str(root / "bin/python"), "--version"], capture_output=True, text=True, check=False, env=environment)
            detected = (result.stdout or result.stderr).strip()
            self._update(job_id, status="succeeded", progress=100, message=f"Python {requested_version} was built inside {root}. {detected}")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_redis_prebuilt(self, job_id: str, requested_version: str):
        """Extract the distro Redis package without registering a host service."""
        # Use apt for downloads when available. apt-get is fine for package
        # installation, but apt's download command has more consistent
        # behavior across Ubuntu/Debian releases.
        apt = shutil.which("apt") or shutil.which("apt-get")
        dpkg_deb = shutil.which("dpkg-deb")
        if not apt or not dpkg_deb:
            self._update(job_id, status="failed", message="The prebuilt Redis option requires apt-get and dpkg-deb. Choose source build on this host.")
            return
        root = service_root("redis", requested_version)
        staging = root.parent / f".redis-{job_id}-prebuilt"
        package_dir = staging / "packages"
        try:
            shutil.rmtree(staging, ignore_errors=True)
            package_dir.mkdir(parents=True, exist_ok=True)
            exact_version = self._resolve_apt_version("redis-server", requested_version)
            tools_version = self._resolve_apt_version("redis-tools", exact_version)
            package_names = ["redis-server", "redis-tools"]
            apt_cache = shutil.which("apt-cache")
            if apt_cache:
                pending = list(package_names)
                seen = set()
                while pending:
                    dependency_package = pending.pop(0)
                    if dependency_package in seen:
                        continue
                    seen.add(dependency_package)
                    dependency_output = subprocess.run(
                        [apt_cache, "depends", "--no-recommends", "--no-suggests", dependency_package],
                        capture_output=True,
                        text=True,
                        check=False,
                        timeout=10,
                    ).stdout
                    for line in dependency_output.splitlines():
                        match = re.match(r"\s+\|?(?:Depends|PreDepends):\s+([\w.+-]+)", line)
                        if match and match.group(1) not in seen and match.group(1) not in package_names:
                            package_names.append(match.group(1))
                            pending.append(match.group(1))
            package_requests = [f"redis-server={exact_version}", f"redis-tools={tools_version}", *package_names[2:]]
            self._update(
                job_id,
                status="running",
                progress=5,
                message=f"Downloading prebuilt Redis {requested_version} and its command-line tools…",
                log=[f"$ apt download {' '.join(package_requests)}"],
            )
            result = subprocess.run([apt, "download", *package_requests], cwd=package_dir, capture_output=True, text=True, check=False)
            download_log = (result.stdout + result.stderr).strip().splitlines()
            if download_log:
                self._update(job_id, progress=35, message="Redis package download output received.", log=download_log[-80:])
            if result.returncode != 0:
                raise RuntimeError((result.stderr or result.stdout).strip() or "The compatible Redis package could not be downloaded")
            archives = sorted(package_dir.glob("*.deb"))
            if not archives:
                raise RuntimeError("The package provider returned no Redis runtime archives for this OS and architecture")
            extracted = staging / "root"
            extracted.mkdir()
            self._update(job_id, progress=55, message="Extracting Redis into the Server Engine service area…")
            for index, archive in enumerate(archives, start=1):
                self._update(
                    job_id,
                    progress=55 + round(index * 12 / len(archives)),
                    message=f"Extracting Redis package {index} of {len(archives)}…",
                    log=[f"$ dpkg-deb -x {archive.name} {extracted}"],
                )
                unpacked = subprocess.run([dpkg_deb, "-x", str(archive), str(extracted)], capture_output=True, text=True, check=False)
                if unpacked.returncode != 0:
                    raise RuntimeError((unpacked.stderr or unpacked.stdout).strip() or f"Redis package extraction failed for {archive.name}")
            # The executable path is not identical on every Debian-family
            # package build. Inspect the extracted tree instead of assuming
            # that every architecture puts it in usr/bin.
            redis_candidates = sorted(
                candidate
                for candidate in extracted.rglob("redis-server")
                if candidate.is_file() or candidate.is_symlink()
            )
            redis_binary = next(
                (
                    candidate
                    for candidate in redis_candidates
                    if not candidate.is_symlink() or candidate.resolve().exists()
                ),
                None,
            )
            if redis_binary is None:
                listing = subprocess.run([dpkg_deb, "-c", str(archives[-1])], capture_output=True, text=True, check=False)
                package_files = [line.strip() for line in listing.stdout.splitlines() if "redis-server" in line][-20:]
                detail = f" Package contents: {'; '.join(package_files)}" if package_files else ""
                raise RuntimeError("The Redis package was extracted, but it did not contain a usable redis-server executable." + detail)
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            for item in extracted.iterdir():
                # Debian packages frequently contain links between the
                # package's usr/bin and usr/lib trees.  A plain copytree/copy2
                # follows those links and can report missing source files
                # (especially documentation links and redis-server aliases).
                # Merge the extracted tree while preserving links exactly.
                self._merge_managed_tree(item, root / item.name)
            managed_binary = root / "usr/bin/redis-server"
            if not managed_binary.exists():
                managed_binary.parent.mkdir(parents=True, exist_ok=True)
                relative_binary = os.path.relpath(root / redis_binary.relative_to(extracted), managed_binary.parent)
                managed_binary.symlink_to(relative_binary)
            if not managed_binary.exists():
                raise RuntimeError("Redis was extracted, but its managed usr/bin/redis-server launcher is unusable")
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-install-method").write_text("prebuilt\n")
            for directory in (root / "conf", root / "data", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            config = root / "conf/redis.conf"
            if not config.exists():
                config.write_text(f"bind 127.0.0.1 ::1\nprotected-mode yes\nport 6379\ndir {root / 'data'}\nlogfile {root / 'logs/redis.log'}\npidfile {root / 'run/redis.pid'}\ndaemonize no\n")
            base = service_root("redis")
            base.mkdir(parents=True, exist_ok=True)
            (base / ".serverengine-active-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Redis {requested_version} was installed from a compatible prebuilt package in {root}; no host Redis service was registered.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _run_redis_binary(self, job_id: str, requested_version: str):
        """Build Redis from its official source into the managed service root."""
        source_url = redis_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("redis")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = redis_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"Redis {requested_version} is not available from the official Redis release catalog. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated Redis installer must run with privileges to stage the runtime.")
            return
        make = shutil.which("make")
        compiler = shutil.which("cc") or shutil.which("gcc")
        if not make or not compiler:
            self._update(job_id, status="failed", message="Redis needs a compiler and make to build its isolated binary. Install the host build tools, then retry; no Redis system package is required.")
            return
        root = service_root("redis", requested_version)
        staging = root.parent / f".redis-{job_id}-staging"
        archive = root.parent / f"redis-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading Redis {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=60) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 5 + round(downloaded * 35 / total) if total else 15
                    self._update(job_id, progress=min(40, progress), message=f"Downloading Redis {requested_version} source…")
            self._update(job_id, progress=43, message=f"Extracting Redis {requested_version} into a temporary build area…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The Redis archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            self._update(job_id, progress=48, message=f"Building Redis {requested_version} in the managed service area…")
            build = subprocess.Popen([make, "-j2", "BUILD_TLS=no"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=50, message=f"Building Redis {requested_version}…", log=output[-80:])
            if build.wait() != 0:
                raise RuntimeError("Redis source build failed: " + (output[-1] if output else "make returned a non-zero exit code"))
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            install = subprocess.run([make, "PREFIX=" + str(root), "install"], cwd=source, capture_output=True, text=True, check=False)
            if install.returncode != 0:
                raise RuntimeError((install.stderr or install.stdout).strip() or "Redis installation into the managed directory failed")
            (root / ".serverengine-version").write_text(requested_version)
            (root / ".serverengine-install-method").write_text("source\n")
            for directory in (root / "conf", root / "data", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            config = root / "conf/redis.conf"
            if not config.exists():
                config.write_text(f"bind 127.0.0.1 ::1\nprotected-mode yes\nport 6379\ndir {root / 'data'}\nlogfile {root / 'logs/redis.log'}\npidfile {root / 'run/redis.pid'}\ndaemonize no\n")
            base = service_root("redis")
            base.mkdir(parents=True, exist_ok=True)
            (base / ".serverengine-active-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Redis {requested_version} is installed in {root}; the host Redis package and service were not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_postgresql_binary(self, job_id: str, requested_version: str):
        """Build PostgreSQL from the official source archive in its managed root."""
        source_url = postgresql_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("postgresql")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = postgresql_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"PostgreSQL {requested_version} is not available from the official release archive. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated PostgreSQL installer must run with privileges to stage the runtime.")
            return
        make = shutil.which("make")
        compiler = shutil.which("cc") or shutil.which("gcc")
        configure = shutil.which("configure")
        if not make or not compiler:
            self._update(job_id, status="failed", message="PostgreSQL needs a compiler and make to build its isolated binary. Install the host build tools, then retry; no PostgreSQL system package is required.")
            return
        root = service_root("postgresql")
        staging = root.parent / f".postgresql-{job_id}-staging"
        archive = root.parent / f"postgresql-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading PostgreSQL {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=60) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 5 + round(downloaded * 30 / total) if total else 15
                    self._update(job_id, progress=min(35, progress), message=f"Downloading PostgreSQL {requested_version} source…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The PostgreSQL archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            self._update(job_id, progress=40, message=f"Preparing PostgreSQL {requested_version} build…")
            configured = subprocess.run([str(source / "configure"), f"--prefix={root}", "--without-readline", "--without-zlib"], cwd=source, capture_output=True, text=True, check=False)
            if configured.returncode != 0:
                raise RuntimeError((configured.stderr or configured.stdout).strip() or "PostgreSQL configure failed")
            build = subprocess.Popen([make, "-j2"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=55, message=f"Building PostgreSQL {requested_version}…", log=output[-80:])
            if build.wait() != 0:
                raise RuntimeError("PostgreSQL source build failed: " + (output[-1] if output else "make returned a non-zero exit code"))
            if root.exists():
                shutil.rmtree(root)
            install = subprocess.run([make, "install"], cwd=source, capture_output=True, text=True, check=False)
            if install.returncode != 0:
                raise RuntimeError((install.stderr or install.stdout).strip() or "PostgreSQL installation into the managed directory failed")
            (root / ".serverengine-version").write_text(requested_version)
            for directory in (root / "conf", root / "data", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            self._update(job_id, progress=96, message="Preparing PostgreSQL runtime libraries…")
            prepare_postgresql_runtime(root)
            self._update(job_id, status="succeeded", progress=100, message=f"PostgreSQL {requested_version} is installed in {root}; the host PostgreSQL package and service were not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_caddy_prebuilt(self, job_id: str, requested_version: str):
        """Install Caddy's official architecture-specific binary archive."""
        source_match = re.match(r"(\d+\.\d+\.\d+)", requested_version)
        version = source_match.group(1) if source_match else requested_version
        machine = platform.machine().lower()
        architecture = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(machine)
        if not architecture:
            self._update(job_id, status="failed", message=f"Caddy does not publish a prebuilt Linux binary for {machine}. Choose Build from source instead.")
            return
        archive_url = f"https://github.com/caddyserver/caddy/releases/download/v{version}/caddy_{version}_linux_{architecture}.tar.gz"
        base = service_root("caddy")
        root = service_root("caddy", requested_version)
        staging = base.parent / f".caddy-{job_id}-prebuilt"
        archive = staging / "caddy.tar.gz"
        try:
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            self._update(job_id, status="running", progress=5, message=f"Downloading prebuilt Caddy {requested_version}…", log=[f"$ curl -fL {archive_url}"])
            with urllib.request.urlopen(urllib.request.Request(archive_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=180) as response, archive.open("wb") as output:
                shutil.copyfileobj(response, output)
            extracted = staging / "root"
            extracted.mkdir()
            with tarfile.open(archive, "r:gz") as package:
                package.extractall(extracted, filter="data")
            binary = extracted / "caddy"
            if not binary.exists():
                raise RuntimeError("The Caddy prebuilt archive did not contain its caddy executable.")
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            (root / "bin").mkdir(parents=True, exist_ok=True)
            shutil.copy2(binary, root / "bin/caddy")
            (root / "bin/caddy").chmod((root / "bin/caddy").stat().st_mode | 0o111)
            for directory in (root / "conf", root / "data", root / "www", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            config = root / "conf/Caddyfile"
            config.write_text(f"{{\n    admin 127.0.0.1:2019\n    storage file-system {root / 'data'}\n}}\n\n:80 {{\n    root * {root / 'www'}\n    encode zstd gzip\n    file_server\n    log {{ output file {root / 'logs/access.log'} }}\n}}\n")
            self._prepare_service_runtime(root, "conf", "data", "www", "logs", "run")
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-install-method").write_text("prebuilt\n")
            base.mkdir(parents=True, exist_ok=True)
            (base / ".serverengine-active-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Caddy {requested_version} was installed from the official prebuilt archive in {root}; the host Caddy package was not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_caddy_binary(self, job_id: str, requested_version: str):
        # Ubuntu package versions append a distro revision, for example
        # 2.6.2-6ubuntu0.24.04.3. Caddy's upstream source tag is only
        # 2.6.2, so use the upstream semantic version for the Coraza build.
        source_match = re.match(r"(\d+\.\d+\.\d+)", requested_version)
        source_version = source_match.group(1) if source_match else requested_version
        source_url = caddy_source_for(requested_version) or caddy_source_for(source_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("caddy")
                source_url = caddy_source_for(requested_version) or caddy_source_for(source_version)
            except Exception:
                source_url = None
        # Older installed distro packages may no longer be in the rolling
        # catalog, but their official upstream tag can still be built.
        if not source_url and source_match:
            source_url = f"https://github.com/caddyserver/caddy/archive/refs/tags/v{source_version}.tar.gz"
        go = shutil.which("go")
        if not source_url:
            self._update(job_id, status="failed", message=f"Caddy {source_version} source could not be found upstream. Choose a compatible Caddy release and retry.")
            return
        if not go:
            self._update(job_id, status="failed", message="The Go build toolchain is unavailable. Retry after the Caddy build dependencies finish installing.")
            return
        caddy_build_version = source_version if source_version.startswith("v") else f"v{source_version}"
        # Coraza's current v2 module requires a much newer Caddy release. The
        # Ubuntu 24.04 package currently shipped as Caddy 2.6.2 must use the
        # last compatible v1 module instead of letting Go silently upgrade
        # Caddy and then rejecting the requested version.
        caddy_semver = tuple(int(part) for part in source_version.split(".")[:3])
        if caddy_semver <= (2, 6, 2):
            coraza_module = "github.com/corazawaf/coraza-caddy@v1.2.2"
        else:
            coraza_module = "github.com/corazawaf/coraza-caddy/v2"
        base = service_root("caddy")
        root = service_root("caddy", requested_version)
        staging = root.parent / f".caddy-{job_id}-staging"
        archive = root.parent / f"caddy-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading Caddy {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=60) as response, archive.open("wb") as output:
                output.write(response.read())
            with tarfile.open(archive, "r:gz") as package:
                package.extractall(staging, filter="data")
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            root.mkdir(parents=True, exist_ok=True)
            (root / "bin").mkdir(parents=True, exist_ok=True)
            xcaddy = shutil.which("xcaddy")
            if xcaddy:
                command = [xcaddy, "build", caddy_build_version, "--with", coraza_module, "--output", str(root / "bin/caddy")]
            else:
                command = [go, "run", "github.com/caddyserver/xcaddy/cmd/xcaddy@latest", "build", caddy_build_version, "--with", coraza_module, "--output", str(root / "bin/caddy")]
            self._update(job_id, progress=35, message=f"Building Caddy {requested_version} with the Coraza Application Shield adapter…", log=[f"$ {' '.join(command)}"])
            build = subprocess.Popen(command, cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=60, message=f"Building Caddy {requested_version}…", log=output[-80:])
            if build.wait() != 0:
                raise RuntimeError(output[-1] if output else "Caddy source build failed")
            (root / "conf").mkdir(exist_ok=True)
            for directory in (root / "data", root / "www", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            config = root / "conf/Caddyfile"
            if not config.exists():
                config.write_text(f"{{\n    storage file-system {root / 'data'}\n}}\n\n:80 {{\n    root * {root / 'www'}\n    encode zstd gzip\n    file_server\n    log {{ output file {root / 'logs/access.log'} }}\n}}\n")
            (root / ".serverengine-version").write_text(requested_version)
            (root / ".serverengine-install-method").write_text("source\n")
            base.mkdir(parents=True, exist_ok=True)
            (base / ".serverengine-active-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Caddy {requested_version} was built from source in {root}; the host Caddy package was not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_mariadb_binary(self, job_id: str, requested_version: str):
        source_url = mariadb_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("mariadb")
                source_url = mariadb_source_for(requested_version) if any(item.version == requested_version for item in definition.versions) else None
            except Exception:
                source_url = None
        cmake = shutil.which("cmake")
        make = shutil.which("make")
        compiler = shutil.which("c++") or shutil.which("g++")
        if not source_url:
            self._update(job_id, status="failed", message="MariaDB source release is not available. Refresh compatible versions and retry.")
            return
        if not cmake or not make or not compiler:
            self._update(job_id, status="failed", message="The MariaDB build toolchain could not be prepared. Check the build-dependency output and retry.")
            return
        root = service_root("mariadb")
        staging = root.parent / f".mariadb-{job_id}-staging"
        archive = root.parent / f"mariadb-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading MariaDB {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=90) as response, archive.open("wb") as output:
                output.write(response.read())
            with tarfile.open(archive, "r:gz") as package:
                package.extractall(staging, filter="data")
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            build_dir = staging / "build"
            configure = [cmake, "-S", str(source), "-B", str(build_dir), f"-DCMAKE_INSTALL_PREFIX={root}", "-DWITHOUT_TOKUDB=1", "-DWITH_WSREP=0", "-DWITH_UNIT=OFF", "-DPLUGIN_ROCKSDB=NO", "-DPLUGIN_DUCKDB=NO"]
            self._update(job_id, progress=30, message=f"Configuring MariaDB {requested_version} source build…", log=[f"$ {' '.join(configure)}"])
            configured = subprocess.run(configure, capture_output=True, text=True, check=False)
            if configured.returncode != 0:
                raise RuntimeError((configured.stdout + configured.stderr).strip()[-2000:] or "MariaDB CMake configuration failed")
            self._update(job_id, progress=45, message=f"Compiling MariaDB {requested_version}…", log=[f"$ {cmake} --build {build_dir} -j2"])
            build = subprocess.Popen([cmake, "--build", str(build_dir), "-j2"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=65, message=f"Compiling MariaDB {requested_version}…", log=output[-80:])
            if build.wait() != 0:
                raise RuntimeError(output[-1] if output else "MariaDB source build failed")
            if root.exists():
                shutil.rmtree(root)
            subprocess.run([cmake, "--install", str(build_dir)], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            (root / ".serverengine-version").write_text(requested_version)
            for directory in (root / "conf", root / "logs", root / "run", root / "data"):
                directory.mkdir(parents=True, exist_ok=True)
            self._update(job_id, status="succeeded", progress=100, message=f"MariaDB {requested_version} was built from source in {root}; the host MariaDB package was not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_powerdns_binary(self, job_id: str, requested_version: str):
        source_url = powerdns_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("powerdns")
                source_url = powerdns_source_for(requested_version) if any(item.version == requested_version for item in definition.versions) else None
            except Exception:
                source_url = None
        make = shutil.which("make")
        compiler = shutil.which("c++") or shutil.which("g++")
        if not source_url or not make or not compiler:
            self._update(job_id, status="failed", message="PowerDNS source or the C++ build toolchain is unavailable. Install the isolated build toolchain, then refresh and retry.")
            return
        root = service_root("powerdns")
        staging = root.parent / f".powerdns-{job_id}-staging"
        archive = root.parent / f"powerdns-{requested_version}.tar.bz2"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading PowerDNS {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=90) as response, archive.open("wb") as output:
                output.write(response.read())
            with tarfile.open(archive, "r:bz2") as package:
                package.extractall(staging, filter="data")
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            configure = [str(source / "configure"), f"--prefix={root}", f"--sysconfdir={root / 'conf'}", f"--localstatedir={root / 'data'}", "--disable-static", "--without-lua"]
            self._update(job_id, progress=30, message=f"Configuring PowerDNS {requested_version} source build…", log=[f"$ {' '.join(configure)}"])
            configured = subprocess.run(configure, cwd=source, capture_output=True, text=True, check=False)
            if configured.returncode != 0:
                raise RuntimeError((configured.stdout + configured.stderr).strip()[-2000:] or "PowerDNS configure failed")
            self._update(job_id, progress=45, message=f"Compiling PowerDNS {requested_version}…", log=[f"$ {make} -j2"])
            build = subprocess.Popen([make, "-j2"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=65, message=f"Compiling PowerDNS {requested_version}…", log=output[-80:])
            if build.wait() != 0:
                raise RuntimeError(output[-1] if output else "PowerDNS source build failed")
            if root.exists():
                shutil.rmtree(root)
            install = subprocess.Popen([make, "install"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in install.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=90, message=f"Installing PowerDNS {requested_version}…", log=output[-80:])
            if install.wait() != 0:
                raise RuntimeError(output[-1] if output else "PowerDNS installation failed")
            (root / ".serverengine-version").write_text(requested_version)
            (root / "logs").mkdir(exist_ok=True)
            (root / "run").mkdir(exist_ok=True)
            config = root / "conf/pdns.conf"
            config.parent.mkdir(parents=True, exist_ok=True)
            if not config.exists():
                config.write_text("launch=gsqlite3\ngsqlite3-database=" + str(root / "data/pdns.sqlite3") + "\nlocal-address=127.0.0.1\nlocal-port=53\napi=yes\nwebserver=yes\nwebserver-address=127.0.0.1\nwebserver-port=8081\n")
            self._update(job_id, status="succeeded", progress=100, message=f"PowerDNS {requested_version} was built from source in {root}; the host PowerDNS package was not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_haproxy_binary(self, job_id: str, requested_version: str):
        source_url = haproxy_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("haproxy")
                source_url = haproxy_source_for(requested_version) if any(item.version == requested_version for item in definition.versions) else None
            except Exception:
                source_url = None
        make = shutil.which("make")
        compiler = shutil.which("cc") or shutil.which("gcc")
        if not source_url or not make or not compiler:
            self._update(job_id, status="failed", message="HAProxy source or the C build toolchain is unavailable. Install the isolated build toolchain, then refresh and retry.")
            return
        root = service_root("haproxy")
        staging = root.parent / f".haproxy-{job_id}-staging"
        archive = root.parent / f"haproxy-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading HAProxy {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=60) as response, archive.open("wb") as output:
                output.write(response.read())
            with tarfile.open(archive, "r:gz") as package:
                package.extractall(staging, filter="data")
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            configure = [make, "-j2", "TARGET=linux-glibc", "USE_OPENSSL=1", "USE_PCRE2=1", "USE_ZLIB=1"]
            self._update(job_id, progress=30, message=f"Compiling HAProxy {requested_version}…", log=[f"$ {' '.join(configure)}"])
            build = subprocess.Popen(configure, cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=65, message=f"Compiling HAProxy {requested_version}…", log=output[-80:])
            if build.wait() != 0:
                raise RuntimeError(output[-1] if output else "HAProxy source build failed")
            if root.exists():
                shutil.rmtree(root)
            install = subprocess.run([make, "install-bin", f"PREFIX={root}"], cwd=source, capture_output=True, text=True, check=False)
            if install.returncode != 0:
                raise RuntimeError((install.stdout + install.stderr).strip()[-2000:] or "HAProxy installation failed")
            (root / ".serverengine-version").write_text(requested_version)
            for directory in (root / "conf", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            config = root / "conf/haproxy.cfg"
            if not config.exists():
                config.write_text(f"global\n    daemon\n    pidfile {root / 'run/haproxy.pid'}\n\ndefaults\n    mode http\n    timeout connect 5s\n    timeout client 30s\n    timeout server 30s\n\nfrontend http\n    bind 127.0.0.1:8080\n    default_backend app\n\nbackend app\n    server app1 127.0.0.1:8080 check\n")
            self._update(job_id, status="succeeded", progress=100, message=f"HAProxy {requested_version} was built from source in {root}; the host HAProxy package was not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_memcached_binary(self, job_id: str, requested_version: str):
        source_url = memcached_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("memcached")
                source_url = memcached_source_for(requested_version) if any(item.version == requested_version for item in definition.versions) else None
            except Exception:
                source_url = None
        make = shutil.which("make")
        compiler = shutil.which("cc") or shutil.which("gcc")
        if not source_url or not make or not compiler:
            self._update(job_id, status="failed", message="Memcached source or the C build toolchain is unavailable. Install the isolated build toolchain, then refresh and retry.")
            return
        root = service_root("memcached")
        staging = root.parent / f".memcached-{job_id}-staging"
        archive = root.parent / f"memcached-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading Memcached {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=60) as response, archive.open("wb") as output:
                output.write(response.read())
            with tarfile.open(archive, "r:gz") as package:
                package.extractall(staging, filter="data")
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            root.mkdir(parents=True, exist_ok=True)
            configure = [str(source / "configure"), f"--prefix={root}", "--disable-sasl"]
            self._update(job_id, progress=30, message=f"Configuring Memcached {requested_version} source build…", log=[f"$ {' '.join(configure)}"])
            configured = subprocess.run(configure, cwd=source, capture_output=True, text=True, check=False)
            if configured.returncode != 0:
                raise RuntimeError((configured.stdout + configured.stderr).strip()[-2000:] or "Memcached configure failed")
            build = subprocess.Popen([make, "-j2"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=65, message=f"Compiling Memcached {requested_version}…", log=output[-80:])
            if build.wait() != 0:
                raise RuntimeError(output[-1] if output else "Memcached source build failed")
            if root.exists():
                shutil.rmtree(root)
            install = subprocess.run([make, "install"], cwd=source, capture_output=True, text=True, check=False)
            if install.returncode != 0:
                raise RuntimeError((install.stdout + install.stderr).strip()[-2000:] or "Memcached installation failed")
            (root / ".serverengine-version").write_text(requested_version)
            for directory in (root / "conf", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            (root / "conf/memcached.conf").write_text(f"-m 128\n-p 11211\n-l 127.0.0.1\n-P {root / 'run/memcached.pid'}\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Memcached {requested_version} was built from source in {root}; the host Memcached package was not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_valkey_binary(self, job_id: str, requested_version: str):
        source_url = valkey_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("valkey")
                source_url = valkey_source_for(requested_version) if any(item.version == requested_version for item in definition.versions) else None
            except Exception:
                source_url = None
        make = shutil.which("make")
        compiler = shutil.which("cc") or shutil.which("gcc")
        if not source_url or not make or not compiler:
            self._update(job_id, status="failed", message="Valkey source or the C build toolchain is unavailable. Install the isolated build toolchain, then refresh and retry.")
            return
        root = service_root("valkey")
        staging = root.parent / f".valkey-{job_id}-staging"
        archive = root.parent / f"valkey-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading Valkey {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=60) as response, archive.open("wb") as output:
                output.write(response.read())
            with tarfile.open(archive, "r:gz") as package:
                package.extractall(staging, filter="data")
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            self._update(job_id, progress=30, message=f"Compiling Valkey {requested_version}…", log=[f"$ {make} -j2"])
            build = subprocess.Popen([make, "-j2"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=65, message=f"Compiling Valkey {requested_version}…", log=output[-80:])
            if build.wait() != 0:
                raise RuntimeError(output[-1] if output else "Valkey source build failed")
            if root.exists():
                shutil.rmtree(root)
            install = subprocess.run([make, "PREFIX=" + str(root), "install"], cwd=source, capture_output=True, text=True, check=False)
            if install.returncode != 0:
                raise RuntimeError((install.stdout + install.stderr).strip()[-2000:] or "Valkey installation failed")
            (root / ".serverengine-version").write_text(requested_version)
            for directory in (root / "conf", root / "logs", root / "run", root / "data"):
                directory.mkdir(parents=True, exist_ok=True)
            (root / "conf/valkey.conf").write_text(f"bind 127.0.0.1\nport 6379\ndaemonize no\npidfile {root / 'run/valkey.pid'}\nlogfile {root / 'logs/valkey.log'}\ndir {root / 'data'}\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Valkey {requested_version} was built from source in {root}; the host Valkey package was not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_vsftpd_binary(self, job_id: str, requested_version: str):
        source_url = vsftpd_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("vsftpd")
                source_url = vsftpd_source_for(requested_version) if any(item.version == requested_version for item in definition.versions) else None
            except Exception:
                source_url = None
        make = shutil.which("make")
        compiler = shutil.which("cc") or shutil.which("gcc")
        if not source_url or not make or not compiler:
            self._update(job_id, status="failed", message="vsftpd source or the C build toolchain is unavailable. Install the isolated build toolchain, then refresh and retry.")
            return
        root = service_root("vsftpd")
        staging = root.parent / f".vsftpd-{job_id}-staging"
        archive = root.parent / f"vsftpd-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading vsftpd {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=60) as response, archive.open("wb") as output:
                output.write(response.read())
            with tarfile.open(archive, "r:gz") as package:
                package.extractall(staging, filter="data")
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            self._update(job_id, progress=35, message=f"Compiling vsftpd {requested_version}…", log=[f"$ {make} -j2"])
            build = subprocess.Popen([make, "-j2"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=70, message=f"Compiling vsftpd {requested_version}…", log=output[-80:])
            if build.wait() != 0:
                raise RuntimeError(output[-1] if output else "vsftpd source build failed")
            if root.exists():
                shutil.rmtree(root)
            (root / "usr/sbin").mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / "vsftpd", root / "usr/sbin/vsftpd")
            (root / "usr/sbin/vsftpd").chmod(0o755)
            (root / ".serverengine-version").write_text(requested_version)
            for directory in (root / "conf", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            (root / "conf/vsftpd.conf").write_text(f"listen=YES\nlisten_port=21\nlocal_enable=YES\nwrite_enable=YES\nlocal_root={root / 'www'}\nchroot_local_user=YES\n")
            (root / "www").mkdir(exist_ok=True)
            self._update(job_id, status="succeeded", progress=100, message=f"vsftpd {requested_version} was built from source in {root}; the host vsftpd package was not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_supervisor_binary(self, job_id: str, requested_version: str):
        """Build Supervisor from its official PyPI source distribution in a venv."""
        source_url = supervisor_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("supervisor")
                if any(item.version == requested_version for item in definition.versions): source_url = supervisor_source_for(requested_version)
            except Exception: source_url = None
        python = shutil.which("python3") or shutil.which("python")
        if not source_url: self._update(job_id, status="failed", message=f"Supervisor {requested_version} is not available from PyPI. Refresh compatible versions and try again."); return
        if not python: self._update(job_id, status="failed", message="Supervisor requires Python 3 to build its isolated runtime."); return
        root = service_root("supervisor"); staging = root.parent / f".supervisor-{job_id}-staging"; archive = root.parent / f"supervisor-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True); shutil.rmtree(staging, ignore_errors=True); staging.mkdir(parents=True); archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading Supervisor {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=120) as response, archive.open("wb") as output: output.write(response.read())
            with tarfile.open(archive, "r:gz") as package: package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            if root.exists(): shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            venv = root / "venv"
            self._update(job_id, progress=35, message=f"Creating the isolated Supervisor {requested_version} runtime…")
            subprocess.run([python, "-m", "venv", str(venv)], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            command = [str(venv / "bin/pip"), "install", "--disable-pip-version-check", "--no-cache-dir", "--no-binary", ":all:", str(source)]
            self._update(job_id, progress=50, message=f"Building Supervisor {requested_version} from source…", log=[f"$ {' '.join(command)}"])
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip() or "Supervisor source installation failed")
            for directory in (root / "conf", root / "logs", root / "run"): directory.mkdir(parents=True, exist_ok=True)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Supervisor {requested_version} was built from source in {root}; no host process manager package was changed.")
        except Exception as error: self._update(job_id, status="failed", message=str(error))
        finally: archive.unlink(missing_ok=True); shutil.rmtree(staging, ignore_errors=True)

    def _run_lynis_binary(self, job_id: str, requested_version: str):
        """Install the portable Lynis source tree in its managed service root."""
        source_url = lynis_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("lynis")
                if any(item.version == requested_version for item in definition.versions): source_url = lynis_source_for(requested_version)
            except Exception: source_url = None
        if not source_url: self._update(job_id, status="failed", message=f"Lynis {requested_version} is not available from the official source repository. Refresh compatible versions and try again."); return
        root = service_root("lynis"); staging = root.parent / f".lynis-{job_id}-staging"; archive = root.parent / f"lynis-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True); shutil.rmtree(staging, ignore_errors=True); staging.mkdir(parents=True); archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading Lynis {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=120) as response, archive.open("wb") as output: output.write(response.read())
            with tarfile.open(archive, "r:gz") as package: package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            if root.exists(): shutil.rmtree(root)
            shutil.move(str(source), str(root)); (root / "bin").mkdir(exist_ok=True)
            launcher = root / "bin/lynis"
            launcher.write_text(f"#!/bin/sh\nexec {shlex.quote(str(root / 'lynis'))} \"$@\"\n"); launcher.chmod(0o755)
            (root / "logs").mkdir(exist_ok=True); (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Lynis {requested_version} is installed in {root}; the host Lynis package was not changed.")
        except Exception as error: self._update(job_id, status="failed", message=str(error))
        finally: archive.unlink(missing_ok=True); shutil.rmtree(staging, ignore_errors=True)

    def _run_rspamd_binary(self, job_id: str, requested_version: str):
        """Build Rspamd from its official CMake source tree."""
        source_url = rspamd_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("rspamd")
                if any(item.version == requested_version for item in definition.versions): source_url = rspamd_source_for(requested_version)
            except Exception: source_url = None
        cmake = shutil.which("cmake"); make = shutil.which("make"); compiler = shutil.which("cc") or shutil.which("gcc")
        if not source_url: self._update(job_id, status="failed", message=f"Rspamd {requested_version} is not available from the official source repository. Refresh compatible versions and try again."); return
        if not cmake or not make or not compiler: self._update(job_id, status="failed", message="Rspamd source builds require CMake, make, and a compiler. Install the Server Engine build dependencies, then retry; no host Rspamd package is required."); return
        root = service_root("rspamd"); staging = root.parent / f".rspamd-{job_id}-staging"; archive = root.parent / f"rspamd-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True); shutil.rmtree(staging, ignore_errors=True); staging.mkdir(parents=True); archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading Rspamd {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=120) as response, archive.open("wb") as output: output.write(response.read())
            with tarfile.open(archive, "r:gz") as package: package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging); build_dir = staging / "build"
            configure = [cmake, "-S", str(source), "-B", str(build_dir), f"-DCMAKE_INSTALL_PREFIX={root}", "-DENABLE_SYSTEMD_UNITS=OFF", "-DENABLE_HYPERSCAN=OFF"]
            self._update(job_id, progress=35, message=f"Configuring Rspamd {requested_version}…", log=[f"$ {' '.join(configure)}"])
            result = subprocess.run(configure, capture_output=True, text=True, check=False)
            if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip() or "Rspamd CMake configuration failed")
            command = [cmake, "--build", str(build_dir), "-j2"]
            self._update(job_id, progress=48, message=f"Compiling Rspamd {requested_version}…", log=[f"$ {' '.join(command)}"])
            build = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1); output = []
            for line in build.stdout or []:
                if line.strip(): output.append(line.rstrip()); self._update(job_id, progress=60, message=f"Compiling Rspamd {requested_version}…", log=output[-120:])
            if build.wait() != 0: raise RuntimeError("Rspamd source build failed: " + (output[-1] if output else "CMake returned a non-zero exit code"))
            result = subprocess.run([cmake, "--install", str(build_dir)], capture_output=True, text=True, check=False)
            if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip() or "Rspamd isolated installation failed")
            for directory in (root / "conf", root / "data", root / "logs", root / "run"): directory.mkdir(parents=True, exist_ok=True)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Rspamd {requested_version} was built from source in {root}; no host mail package was changed.")
        except Exception as error: self._update(job_id, status="failed", message=str(error))
        finally: archive.unlink(missing_ok=True); shutil.rmtree(staging, ignore_errors=True)

    def _run_bind9_binary(self, job_id: str, requested_version: str):
        """Build BIND 9 from the official ISC source archive."""
        source_url = bind9_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("bind9")
                if any(item.version == requested_version for item in definition.versions): source_url = bind9_source_for(requested_version)
            except Exception: source_url = None
        make = shutil.which("make"); compiler = shutil.which("cc") or shutil.which("gcc")
        if not source_url: self._update(job_id, status="failed", message=f"BIND 9 {requested_version} is not available from the official ISC source archive. Refresh compatible versions and try again."); return
        if not make or not compiler: self._update(job_id, status="failed", message="BIND 9 source builds require a compiler and make. Install the Server Engine build dependencies, then retry; no host BIND package is required."); return
        root = service_root("bind9"); staging = root.parent / f".bind9-{job_id}-staging"; archive = root.parent / f"bind9-{requested_version}.tar.xz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True); shutil.rmtree(staging, ignore_errors=True); staging.mkdir(parents=True); archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading BIND 9 {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=120) as response, archive.open("wb") as output: output.write(response.read())
            with tarfile.open(archive, "r:xz") as package: package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            configure = [str(source / "configure"), f"--prefix={root}", f"--sysconfdir={root / 'conf'}", f"--localstatedir={root / 'var'}", "--disable-doh"]
            self._update(job_id, progress=35, message=f"Configuring BIND 9 {requested_version}…", log=[f"$ {' '.join(configure)}"])
            result = subprocess.run(configure, cwd=source, capture_output=True, text=True, check=False)
            if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip() or "BIND 9 configure failed")
            build = subprocess.Popen([make, "-j2"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1); output = []
            for line in build.stdout or []:
                if line.strip(): output.append(line.rstrip()); self._update(job_id, progress=60, message=f"Compiling BIND 9 {requested_version}…", log=output[-120:])
            if build.wait() != 0: raise RuntimeError("BIND 9 source build failed: " + (output[-1] if output else "make returned a non-zero exit code"))
            result = subprocess.run([make, "install"], cwd=source, capture_output=True, text=True, check=False)
            if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip() or "BIND 9 isolated installation failed")
            for directory in (root / "data", root / "logs", root / "run"): directory.mkdir(parents=True, exist_ok=True)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"BIND 9 {requested_version} was built from source in {root}; no host DNS package was changed.")
        except Exception as error: self._update(job_id, status="failed", message=str(error))
        finally: archive.unlink(missing_ok=True); shutil.rmtree(staging, ignore_errors=True)

    def _run_unbound_binary(self, job_id: str, requested_version: str):
        """Build Unbound from the official NLnet Labs source archive."""
        source_url = unbound_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("unbound")
                if any(item.version == requested_version for item in definition.versions): source_url = unbound_source_for(requested_version)
            except Exception: source_url = None
        make = shutil.which("make"); compiler = shutil.which("cc") or shutil.which("gcc")
        if not source_url: self._update(job_id, status="failed", message=f"Unbound {requested_version} is not available from the official source archive. Refresh compatible versions and try again."); return
        if not make or not compiler: self._update(job_id, status="failed", message="Unbound source builds require a compiler and make. Install the Server Engine build dependencies, then retry; no host Unbound package is required."); return
        root = service_root("unbound"); staging = root.parent / f".unbound-{job_id}-staging"; archive = root.parent / f"unbound-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True); shutil.rmtree(staging, ignore_errors=True); staging.mkdir(parents=True); archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading Unbound {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=120) as response, archive.open("wb") as output: output.write(response.read())
            with tarfile.open(archive, "r:gz") as package: package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            configure = [str(source / "configure"), f"--prefix={root}", f"--sysconfdir={root / 'conf'}", f"--localstatedir={root / 'var'}", "--with-ssl"]
            self._update(job_id, progress=35, message=f"Configuring Unbound {requested_version}…", log=[f"$ {' '.join(configure)}"])
            result = subprocess.run(configure, cwd=source, capture_output=True, text=True, check=False)
            if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip() or "Unbound configure failed")
            build = subprocess.Popen([make, "-j2"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1); output = []
            for line in build.stdout or []:
                if line.strip(): output.append(line.rstrip()); self._update(job_id, progress=60, message=f"Compiling Unbound {requested_version}…", log=output[-120:])
            if build.wait() != 0: raise RuntimeError("Unbound source build failed: " + (output[-1] if output else "make returned a non-zero exit code"))
            result = subprocess.run([make, "install"], cwd=source, capture_output=True, text=True, check=False)
            if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip() or "Unbound isolated installation failed")
            for directory in (root / "data", root / "logs", root / "run"): directory.mkdir(parents=True, exist_ok=True)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Unbound {requested_version} was built from source in {root}; no host DNS package was changed.")
        except Exception as error: self._update(job_id, status="failed", message=str(error))
        finally: archive.unlink(missing_ok=True); shutil.rmtree(staging, ignore_errors=True)

    def _run_clamav_binary(self, job_id: str, requested_version: str):
        """Build ClamAV from its official CMake source archive."""
        source_url = clamav_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("clamav")
                if any(item.version == requested_version for item in definition.versions): source_url = clamav_source_for(requested_version)
            except Exception: source_url = None
        cmake = shutil.which("cmake"); make = shutil.which("make"); compiler = shutil.which("cc") or shutil.which("gcc")
        if not source_url: self._update(job_id, status="failed", message=f"ClamAV {requested_version} is not available from the official source archive. Refresh compatible versions and try again."); return
        if not cmake or not make or not compiler: self._update(job_id, status="failed", message="ClamAV source builds require CMake, make, and a compiler. Install the Server Engine build dependencies, then retry; no host ClamAV package is required."); return
        root = service_root("clamav"); staging = root.parent / f".clamav-{job_id}-staging"; archive = root.parent / f"clamav-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True); shutil.rmtree(staging, ignore_errors=True); staging.mkdir(parents=True); archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading ClamAV {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=120) as response, archive.open("wb") as output: output.write(response.read())
            with tarfile.open(archive, "r:gz") as package: package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging); build_dir = staging / "build"
            configure = [cmake, "-S", str(source), "-B", str(build_dir), f"-DCMAKE_INSTALL_PREFIX={root}", f"-DAPP_CONFIG_DIRECTORY={root / 'conf'}", f"-DDATABASE_DIRECTORY={root / 'data'}", "-DENABLE_SYSTEMD=OFF", "-DENABLE_JSON_SHARED=OFF"]
            self._update(job_id, progress=35, message=f"Configuring ClamAV {requested_version}…", log=[f"$ {' '.join(configure)}"])
            result = subprocess.run(configure, capture_output=True, text=True, check=False)
            if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip() or "ClamAV CMake configuration failed")
            command = [cmake, "--build", str(build_dir), "-j2"]
            self._update(job_id, progress=48, message=f"Compiling ClamAV {requested_version}…", log=[f"$ {' '.join(command)}"])
            build = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1); output = []
            for line in build.stdout or []:
                if line.strip(): output.append(line.rstrip()); self._update(job_id, progress=60, message=f"Compiling ClamAV {requested_version}…", log=output[-120:])
            if build.wait() != 0: raise RuntimeError("ClamAV source build failed: " + (output[-1] if output else "CMake returned a non-zero exit code"))
            result = subprocess.run([cmake, "--install", str(build_dir)], capture_output=True, text=True, check=False)
            if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip() or "ClamAV isolated installation failed")
            for directory in (root / "logs", root / "run"): directory.mkdir(parents=True, exist_ok=True)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"ClamAV {requested_version} was built from source in {root}; no host antivirus package was changed.")
        except Exception as error: self._update(job_id, status="failed", message=str(error))
        finally: archive.unlink(missing_ok=True); shutil.rmtree(staging, ignore_errors=True)

    def _run_opensearch_binary(self, job_id: str, requested_version: str):
        """Build OpenSearch from its Gradle source distribution into its service root."""
        source_url = opensearch_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("opensearch")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = opensearch_source_for(requested_version)
            except Exception:
                source_url = None
        java = shutil.which("java")
        javac = shutil.which("javac")
        if not source_url:
            self._update(job_id, status="failed", message=f"OpenSearch {requested_version} is not available from the official source repository. Refresh compatible versions and try again.")
            return
        if not java or not javac:
            self._update(job_id, status="failed", message="OpenSearch source builds require a JDK. Install the Server Engine build dependencies, then retry; no host OpenSearch package is required.")
            return
        root = service_root("opensearch")
        staging = root.parent / f".opensearch-{job_id}-staging"
        archive = root.parent / f"opensearch-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True); shutil.rmtree(staging, ignore_errors=True); staging.mkdir(parents=True); archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=2, message=f"Downloading OpenSearch {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=180) as response, archive.open("wb") as output:
                output.write(response.read())
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(item.name.startswith("/") or ".." in Path(item.name).parts for item in members): raise RuntimeError("The OpenSearch archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            arch_task = "linux-arm64-tar" if platform.machine().lower() in {"aarch64", "arm64"} else "linux-tar"
            wrapper = source / "gradlew"
            if not wrapper.exists(): raise RuntimeError("The OpenSearch source tree does not contain its Gradle wrapper")
            wrapper.chmod(0o755)
            command = [str(wrapper), f":distribution:archives:{arch_task}:assemble"]
            self._update(job_id, progress=35, message=f"Compiling OpenSearch {requested_version} with Gradle…", log=[f"$ {' '.join(command)}"])
            build = subprocess.Popen(command, cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip(): output.append(line.rstrip()); self._update(job_id, progress=45, message=f"Compiling OpenSearch {requested_version}…", log=output[-120:])
            if build.wait() != 0: raise RuntimeError("OpenSearch source build failed: " + (output[-1] if output else "Gradle returned a non-zero exit code"))
            bundles = sorted(source.glob(f"distribution/archives/{arch_task}/build/distributions/opensearch-*.tar.gz"))
            if not bundles: raise RuntimeError("The OpenSearch source build did not produce a Linux distribution archive")
            extracted = staging / "runtime"
            extracted.mkdir()
            with tarfile.open(bundles[-1], "r:gz") as package: package.extractall(extracted)
            built = next((item for item in extracted.iterdir() if item.is_dir()), extracted)
            if root.exists(): shutil.rmtree(root)
            shutil.move(str(built), str(root))
            (root / "data").mkdir(exist_ok=True); (root / "logs").mkdir(exist_ok=True); (root / "run").mkdir(exist_ok=True)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"OpenSearch {requested_version} was built from source in {root}; no host OpenSearch package was changed.")
        except Exception as error: self._update(job_id, status="failed", message=str(error))
        finally: archive.unlink(missing_ok=True); shutil.rmtree(staging, ignore_errors=True)

    def _run_wpcli_binary(self, job_id: str, requested_version: str, selected_php_version: str | None = None):
        """Install the official WP-CLI PHAR without resolving its development repository."""
        versions_root = service_root("php") / "versions"
        php_candidates = []
        if versions_root.exists():
            for runtime in versions_root.iterdir():
                if runtime.is_dir():
                    candidate = php_cli_path(runtime.name)
                    if candidate.is_file():
                        php_candidates.append((version_sort_key(runtime.name), candidate))
        selected_php = php_cli_path(selected_php_version) if selected_php_version else None
        php = selected_php if selected_php and selected_php.is_file() else (max(php_candidates, key=lambda item: item[0])[1] if php_candidates else None)
        if not php:
            self._update(job_id, status="failed", message="WP-CLI requires an installed PHP CLI runtime. Install PHP first, then retry.")
            return

        root = service_root("wp-cli") / "versions" / requested_version
        staging = root.parent / f".wp-cli-{job_id}-staging"
        archive = staging / "wp-cli.phar"
        source_url = f"https://github.com/wp-cli/wp-cli/releases/download/v{requested_version}/wp-cli-{requested_version}.phar"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True)
            self._update(
                job_id,
                status="running",
                progress=3,
                message=f"Downloading official WP-CLI {requested_version} release…",
                log=[f"$ curl -fL {source_url} -o {archive}"],
            )
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=120) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length") or 0)
                downloaded = 0
                while True:
                    chunk = response.read(1024 * 256)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = min(60, 5 + int(downloaded * 55 / total)) if total else 25
                    self._update(job_id, progress=progress, message=f"Downloading WP-CLI {requested_version}…", log=[f"Downloaded {downloaded // 1024} KiB"])
            if archive.stat().st_size < 10_000:
                raise RuntimeError("The WP-CLI release download was incomplete or invalid.")

            php_root = php.parent.parent.parent
            ensure_php_runtime_configuration(php_root.name)
            self._update(job_id, progress=70, message=f"Checking WP-CLI {requested_version} with PHP…", log=[f"$ {php} {archive} --info"])
            check = subprocess.run(
                [str(php), str(archive), "--info"],
                capture_output=True,
                text=True,
                check=False,
                timeout=30,
                env={
                    **os.environ,
                    "LD_LIBRARY_PATH": php_runtime_library_path(php_root),
                    "PHP_INI_SCAN_DIR": str(php_root / "conf/conf.d"),
                },
            )
            if check.returncode != 0:
                raise RuntimeError((check.stderr or check.stdout).strip() or "The downloaded WP-CLI release could not be started by the selected PHP runtime.")
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True)
            shutil.copy2(archive, root / "wp-cli.phar")
            (root / "bin").mkdir()
            launcher = root / "bin/wp"
            launcher.write_text(
                "#!/bin/sh\n"
                f'PHP={shlex.quote(str(php))}\n'
                f'PHAR={shlex.quote(str(root / "wp-cli.phar"))}\n'
                'if [ ! -x "$PHP" ]; then\n'
                f'  for candidate in {shlex.quote(str(versions_root))}/*/usr/bin/php {shlex.quote(str(versions_root))}/*/bin/php; do\n'
                '    if [ -x "$candidate" ]; then PHP="$candidate"; fi\n'
                '  done\n'
                'fi\n'
                'exec "$PHP" "$PHAR" "$@"\n'
            )
            launcher.chmod(0o755)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-install-method").write_text("official-release\n")
            self._update(job_id, status="succeeded", progress=100, message=f"WP-CLI {requested_version} is installed in {root}; it uses the latest available PHP CLI runtime.", log=[check.stdout.strip() or "WP-CLI release verified."])
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _run_postfix_binary(self, job_id: str, requested_version: str):
        """Build Postfix from its official source archive without host installation."""
        source_url = postfix_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("postfix")
                if any(item.version == requested_version for item in definition.versions): source_url = postfix_source_for(requested_version)
            except Exception: source_url = None
        make = shutil.which("make"); compiler = shutil.which("cc") or shutil.which("gcc")
        if not source_url: self._update(job_id, status="failed", message=f"Postfix {requested_version} is not available from the official source archive. Refresh compatible versions and try again."); return
        if not make or not compiler: self._update(job_id, status="failed", message="Postfix source builds require a compiler and make. Install the Server Engine build dependencies, then retry; no host Postfix package is required."); return
        root = service_root("postfix"); staging = root.parent / f".postfix-{job_id}-staging"; archive = root.parent / f"postfix-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True); shutil.rmtree(staging, ignore_errors=True); staging.mkdir(parents=True); archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading Postfix {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=120) as response, archive.open("wb") as output: output.write(response.read())
            with tarfile.open(archive, "r:gz") as package: package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            config = ["make", "makefiles", f"config_directory={root / 'conf'}", f"daemon_directory={root / 'libexec'}", f"command_directory={root / 'bin'}", f"meta_directory={root / 'conf'}", f"data_directory={root / 'data'}", f"queue_directory={root / 'queue'}", "shared=yes"]
            self._update(job_id, progress=35, message=f"Preparing Postfix {requested_version} build…", log=[f"$ {' '.join(config)}"])
            result = subprocess.run(config, cwd=source, capture_output=True, text=True, check=False)
            if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip() or "Postfix makefiles failed")
            build = subprocess.Popen([make, "-j2"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1); output = []
            for line in build.stdout or []:
                if line.strip(): output.append(line.rstrip()); self._update(job_id, progress=55, message=f"Compiling Postfix {requested_version}…", log=output[-120:])
            if build.wait() != 0: raise RuntimeError("Postfix source build failed: " + (output[-1] if output else "make returned a non-zero exit code"))
            root.mkdir(parents=True, exist_ok=True)
            install = subprocess.run([make, "install", "non_interactive=yes", f"install_root={root}"], cwd=source, capture_output=True, text=True, check=False)
            if install.returncode != 0: raise RuntimeError((install.stderr or install.stdout).strip() or "Postfix isolated installation failed")
            (root / "logs").mkdir(exist_ok=True); (root / "run").mkdir(exist_ok=True); (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Postfix {requested_version} was built from source in {root}; no host mail package was changed.")
        except Exception as error: self._update(job_id, status="failed", message=str(error))
        finally: archive.unlink(missing_ok=True); shutil.rmtree(staging, ignore_errors=True)

    def _run_dovecot_binary(self, job_id: str, requested_version: str):
        """Build Dovecot from its official source archive into its service root."""
        source_url = dovecot_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("dovecot")
                if any(item.version == requested_version for item in definition.versions): source_url = dovecot_source_for(requested_version)
            except Exception: source_url = None
        make = shutil.which("make"); compiler = shutil.which("cc") or shutil.which("gcc")
        if not source_url: self._update(job_id, status="failed", message=f"Dovecot {requested_version} is not available from the official source repository. Refresh compatible versions and try again."); return
        if not make or not compiler: self._update(job_id, status="failed", message="Dovecot source builds require a compiler and make. Install the Server Engine build dependencies, then retry; no host Dovecot package is required."); return
        root = service_root("dovecot"); staging = root.parent / f".dovecot-{job_id}-staging"; archive = root.parent / f"dovecot-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True); shutil.rmtree(staging, ignore_errors=True); staging.mkdir(parents=True); archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading Dovecot {requested_version} source…", log=[])
            with urllib.request.urlopen(urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=120) as response, archive.open("wb") as output: output.write(response.read())
            with tarfile.open(archive, "r:gz") as package: package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            configure = [str(source / "configure"), f"--prefix={root}", f"--sysconfdir={root / 'conf'}", f"--localstatedir={root / 'var'}", f"--with-rundir={root / 'run'}", "--with-ssldir=/etc/ssl"]
            if not (source / "configure").exists():
                subprocess.run([str(source / "autogen.sh")], cwd=source, check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            self._update(job_id, progress=35, message=f"Configuring Dovecot {requested_version}…", log=[f"$ {' '.join(configure)}"])
            configured = subprocess.run(configure, cwd=source, capture_output=True, text=True, check=False)
            if configured.returncode != 0: raise RuntimeError((configured.stderr or configured.stdout).strip() or "Dovecot configure failed")
            build = subprocess.Popen([make, "-j2"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1); output = []
            for line in build.stdout or []:
                if line.strip(): output.append(line.rstrip()); self._update(job_id, progress=55, message=f"Compiling Dovecot {requested_version}…", log=output[-120:])
            if build.wait() != 0: raise RuntimeError("Dovecot source build failed: " + (output[-1] if output else "make returned a non-zero exit code"))
            result = subprocess.run([make, "install"], cwd=source, capture_output=True, text=True, check=False)
            if result.returncode != 0: raise RuntimeError((result.stderr or result.stdout).strip() or "Dovecot isolated installation failed")
            (root / "logs").mkdir(exist_ok=True); (root / "data").mkdir(exist_ok=True); (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Dovecot {requested_version} was built from source in {root}; no host mail package was changed.")
        except Exception as error: self._update(job_id, status="failed", message=str(error))
        finally: archive.unlink(missing_ok=True); shutil.rmtree(staging, ignore_errors=True)

    def _run_stalwart_prebuilt(self, job_id: str, requested_version: str):
        """Install Stalwart's official Linux binary without touching host mail packages."""
        archive_url = stalwart_prebuilt_for(requested_version)
        if not archive_url:
            try:
                definition, _, _ = refresh_service_versions("stalwart", force=True, install_method="prebuilt")
                if any(item.version == requested_version for item in definition.versions):
                    archive_url = stalwart_prebuilt_for(requested_version)
            except Exception:
                archive_url = None
        if not archive_url:
            self._update(
                job_id,
                status="failed",
                message=f"Stalwart {requested_version} has no compatible prebuilt binary for this OS and architecture. Choose source build instead.",
            )
            return
        root = service_root("stalwart")
        staging = root.parent / f".stalwart-{job_id}-prebuilt"
        archive = staging / "stalwart.tar.gz"
        try:
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            self._update(
                job_id,
                status="running",
                progress=5,
                message=f"Downloading prebuilt Stalwart {requested_version}…",
                log=[f"$ curl -fL {archive_url}"],
            )
            request = urllib.request.Request(archive_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=180) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 5 + round(downloaded * 35 / total) if total else 20
                    self._update(job_id, progress=min(40, progress), message=f"Downloading prebuilt Stalwart {requested_version}…")
            self._update(job_id, progress=45, message=f"Extracting Stalwart {requested_version}…")
            extracted = staging / "root"
            extracted.mkdir()
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The Stalwart archive contains an unsafe path")
                package.extractall(extracted)
            binary = next((item for item in extracted.rglob("stalwart") if item.is_file()), None)
            if binary is None:
                raise RuntimeError("The Stalwart archive did not contain a stalwart executable")
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            (root / "bin").mkdir(parents=True, exist_ok=True)
            shutil.copy2(binary, root / "bin/stalwart")
            (root / "bin/stalwart").chmod(0o755)
            for directory in (root / "conf", root / "data", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            storage_path = root / "conf/storage.json"
            if not storage_path.exists():
                storage_path.write_text(json.dumps({"data_store": "RocksDB", "data_directory": str(root / "data")}, indent=2) + "\n")
            config_path = root / "conf/config.json"
            if not config_path.exists():
                config_path.write_text(json.dumps({"@type": "RocksDb", "path": str(root / "data")}, indent=2) + "\n")
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-install-method").write_text("prebuilt\n")
            self._prepare_service_runtime(root, "conf", "data", "logs", "run")
            self._update(
                job_id,
                status="succeeded",
                progress=100,
                message=f"Stalwart {requested_version} was installed from the official prebuilt archive in {root}; no host mail package was changed.",
            )
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_stalwart_binary(self, job_id: str, requested_version: str):
        """Build Stalwart Mail Server from its official Rust source tree."""
        source_url = stalwart_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("stalwart")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = stalwart_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"Stalwart {requested_version} is not available from the official source repository. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated Stalwart installer must run with privileges to stage the runtime.")
            return
        cargo = shutil.which("cargo")
        rustc = shutil.which("rustc")
        if not cargo or not rustc:
            self._update(job_id, status="failed", message="Stalwart needs Rust 1.85+ and Cargo for Edition 2024. Install the Server Engine Rust build dependencies, then retry.")
            return
        root = service_root("stalwart")
        staging = root.parent / f".stalwart-{job_id}-staging"
        archive = root.parent / f"stalwart-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=2, message=f"Downloading Stalwart {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=120) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 4 + round(downloaded * 28 / total) if total else 14
                    self._update(job_id, progress=min(32, progress), message=f"Downloading Stalwart {requested_version} source…")
            self._update(job_id, progress=35, message=f"Extracting Stalwart {requested_version} into a temporary build area…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The Stalwart archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            build_env = os.environ.copy()
            rust_version = subprocess.run([rustc, "--version"], capture_output=True, text=True, check=False, timeout=10)
            match = re.search(r"rustc (\d+)\.(\d+)", rust_version.stdout or "")
            modern_rust = bool(match and (int(match.group(1)), int(match.group(2))) >= (1, 85))
            rustup = shutil.which("rustup")
            if not modern_rust:
                # Do not install Ubuntu's rustup package: it conflicts with
                # Ubuntu's cargo/rustc packages. Download rustup-init directly
                # and keep its toolchain and crate cache inside Server Engine.
                toolchain_root = root.parent.parent / "toolchains" / "rust"
                rustup_home = toolchain_root / "rustup"
                cargo_home = toolchain_root / "cargo"
                rustup_home.mkdir(parents=True, exist_ok=True)
                cargo_home.mkdir(parents=True, exist_ok=True)
                build_env["RUSTUP_HOME"] = str(rustup_home)
                build_env["CARGO_HOME"] = str(cargo_home)
                isolated_rustup = cargo_home / "bin/rustup"
                if not isolated_rustup.exists():
                    machine = os.uname().machine
                    target = {"x86_64": "x86_64-unknown-linux-gnu", "aarch64": "aarch64-unknown-linux-gnu", "arm64": "aarch64-unknown-linux-gnu"}.get(machine)
                    if not target:
                        raise RuntimeError(f"Automatic Rust toolchain setup is not available for architecture {machine}")
                    installer = toolchain_root / "rustup-init"
                    self._update(job_id, progress=38, message="Downloading a current Rust toolchain for Stalwart Edition 2024…", log=[f"$ download rustup-init ({target})"])
                    request = urllib.request.Request(f"https://static.rust-lang.org/rustup/dist/{target}/rustup-init", headers={"User-Agent": "Server-Engine-Control-Panel"})
                    with urllib.request.urlopen(request, timeout=120) as response, installer.open("wb") as output:
                        shutil.copyfileobj(response, output)
                    installer.chmod(0o755)
                    setup = subprocess.run([str(installer), "-y", "--no-modify-path", "--profile", "minimal", "--default-toolchain", "stable"], env=build_env, capture_output=True, text=True, check=False, timeout=900)
                    if setup.returncode != 0:
                        detail = (setup.stderr or setup.stdout).strip()
                        raise RuntimeError(f"Unable to prepare the Rust Edition 2024 toolchain: {detail[-1200:]}")
                rustup = str(isolated_rustup)
                toolchain = subprocess.run([rustup, "toolchain", "install", "stable", "--profile", "minimal", "--no-self-update"], env=build_env, capture_output=True, text=True, check=False, timeout=900)
                if toolchain.returncode != 0:
                    detail = (toolchain.stderr or toolchain.stdout).strip()
                    raise RuntimeError(f"Unable to prepare the Rust Edition 2024 toolchain: {detail[-1200:]}")
                command = [rustup, "run", "stable", "cargo", "build", "--release", "--locked", "--bin", "stalwart"]
            else:
                command = [cargo, "build", "--release", "--locked", "--bin", "stalwart"]
            self._update(job_id, progress=40, message=f"Compiling Stalwart {requested_version} with Cargo…", log=[f"$ {' '.join(command)}"])
            build = subprocess.Popen(command, cwd=source, env=build_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=40, message=f"Compiling Stalwart {requested_version}…", log=output[-120:])
            if build.wait() != 0:
                raise RuntimeError("Stalwart source build failed: " + (output[-1] if output else "cargo returned a non-zero exit code"))
            built = source / "target/release/stalwart"
            if not built.exists():
                raise RuntimeError("The Stalwart source build did not produce target/release/stalwart")
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            (root / "bin").mkdir(parents=True, exist_ok=True)
            shutil.copy2(built, root / "bin/stalwart")
            (root / "bin/stalwart").chmod(0o755)
            for directory in (root / "conf", root / "data", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            storage_path = root / "conf/storage.json"
            if not storage_path.exists():
                storage_path.write_text(json.dumps({"data_store": "RocksDB", "data_directory": str(root / "data")}, indent=2) + "\n")
            config_path = root / "conf/config.json"
            if not config_path.exists():
                config_path.write_text(json.dumps({"@type": "RocksDb", "path": str(root / "data")}, indent=2) + "\n")
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Stalwart {requested_version} was built from source in {root}; no host mail package was changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_mongodb_prebuilt(self, job_id: str, requested_version: str):
        """Install MongoDB's official Ubuntu archive into its service root."""
        archive_url = mongodb_prebuilt_for(requested_version)
        if not archive_url:
            try:
                definition, _, _ = refresh_service_versions("mongodb", force=True, install_method="prebuilt")
                if any(item.version == requested_version for item in definition.versions):
                    archive_url = mongodb_prebuilt_for(requested_version)
            except Exception:
                archive_url = None
        if not archive_url:
            self._update(job_id, status="failed", message=f"MongoDB {requested_version} has no compatible prebuilt archive for this OS and architecture. Choose source build instead.")
            return
        root = service_root("mongodb")
        staging = root.parent / f".mongodb-{job_id}-prebuilt"
        archive = staging / "mongodb.tgz"
        try:
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            self._update(job_id, status="running", progress=5, message=f"Downloading prebuilt MongoDB {requested_version}…", log=[f"$ curl -fL {archive_url}"])
            request = urllib.request.Request(archive_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=180) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 5 + round(downloaded * 35 / total) if total else 20
                    self._update(job_id, progress=min(40, progress), message=f"Downloading prebuilt MongoDB {requested_version}…")
            extracted = staging / "root"
            extracted.mkdir()
            self._update(job_id, progress=45, message=f"Extracting MongoDB {requested_version} into the Server Engine service area…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The MongoDB archive contains an unsafe path")
                package.extractall(extracted)
            source = next((item for item in extracted.iterdir() if item.is_dir()), extracted)
            binary = next(source.glob("bin/mongod"), None)
            if binary is None or not binary.exists():
                raise RuntimeError("The MongoDB archive did not contain a mongod executable")
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            for item in source.iterdir():
                target = root / item.name
                if item.is_symlink():
                    target.symlink_to(os.readlink(item), target_is_directory=item.is_dir())
                elif item.is_dir():
                    shutil.copytree(item, target, dirs_exist_ok=True, symlinks=True)
                else:
                    shutil.copy2(item, target)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-install-method").write_text("prebuilt\n")
            for directory in (root / "conf", root / "data", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            (root / "conf/mongod.conf").write_text(
                f"systemLog:\n  destination: file\n  path: {root / 'logs/mongod.log'}\n  logAppend: true\nstorage:\n  dbPath: {root / 'data'}\nnet:\n  bindIp: 127.0.0.1\n  port: 27017\nprocessManagement:\n  fork: false\n"
            )
            self._prepare_service_runtime(root, "conf", "data", "logs", "run")
            self._update(job_id, progress=96, message="Preparing MongoDB runtime libraries…")
            prepare_mongodb_runtime(root)
            self._update(job_id, status="succeeded", progress=100, message=f"MongoDB {requested_version} was installed from an official prebuilt archive in {root}; no host MongoDB package was changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_mongodb_binary(self, job_id: str, requested_version: str):
        """Build MongoDB's server binary from the official Bazel source tree."""
        source_url = mongodb_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("mongodb")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = mongodb_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"MongoDB {requested_version} is not available from the official source repository. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated MongoDB installer must run with privileges to stage the runtime.")
            return
        python = shutil.which("python3") or shutil.which("python")
        make = shutil.which("make")
        compiler = shutil.which("c++") or shutil.which("g++") or shutil.which("clang++")
        if not python or not make or not compiler:
            self._update(job_id, status="failed", message="MongoDB source builds require Python 3, make, and a modern C++ compiler. Install the Server Engine build dependencies, then retry; no host MongoDB package is required.")
            return
        root = service_root("mongodb")
        staging = root.parent / f".mongodb-{job_id}-staging"
        archive = root.parent / f"mongodb-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=2, message=f"Downloading MongoDB {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=180) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 4 + round(downloaded * 26 / total) if total else 12
                    self._update(job_id, progress=min(30, progress), message=f"Downloading MongoDB {requested_version} source…")
            self._update(job_id, progress=33, message=f"Extracting MongoDB {requested_version} into a temporary build area…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The MongoDB archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            # MongoDB's installer writes Bazel and buildozer to
            # ~/.local/bin. Give it a private HOME inside the temporary build
            # area so it never writes to the host user's home directory and so
            # the generated tools remain available to the following Bazel run.
            build_home = staging / ".home"
            local_bin = build_home / ".local/bin"
            local_bin.mkdir(parents=True, exist_ok=True)
            build_env = os.environ.copy()
            build_env["HOME"] = str(build_home)
            build_env["PATH"] = f"{local_bin}:{build_env.get('PATH', '')}"

            bazel = shutil.which("bazel", path=build_env["PATH"]) or shutil.which("bazelisk", path=build_env["PATH"])
            if not bazel:
                installer = source / "buildscripts/install_bazel.py"
                if not installer.exists():
                    raise RuntimeError("The MongoDB source tree does not contain its Bazel installer")
                self._update(job_id, progress=36, message="Installing the MongoDB-compatible Bazel build tool in the build environment…", log=[f"$ {python} buildscripts/install_bazel.py"])
                installed = subprocess.run([python, str(installer)], cwd=source, env=build_env, capture_output=True, text=True, check=False)
                if installed.returncode != 0:
                    output = (installed.stderr or installed.stdout).strip()
                    raise RuntimeError(output[-4000:] or "MongoDB Bazel bootstrap failed")
                bazel = shutil.which("bazel", path=build_env["PATH"]) or shutil.which("bazelisk", path=build_env["PATH"])
            if not bazel or (not Path(bazel).exists() and shutil.which(bazel, path=build_env["PATH"]) is None):
                raise RuntimeError("MongoDB Bazel was not available after the source bootstrap")
            command = [bazel, "build", "install-mongod", "--jobs=2"]
            self._update(job_id, progress=40, message=f"Compiling MongoDB {requested_version} with Bazel…", log=[f"$ {' '.join(command)}"])
            build = subprocess.Popen(command, cwd=source, env=build_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=40, message=f"Compiling MongoDB {requested_version}…", log=output[-120:])
            if build.wait() != 0:
                raise RuntimeError("MongoDB source build failed: " + (output[-1] if output else "Bazel returned a non-zero exit code"))
            candidates = [source / "bazel-bin/install-mongod/bin/mongod", source / "bazel-bin/install/bin/mongod", source / "bazel-bin/mongod"]
            built = next((candidate for candidate in candidates if candidate.exists()), None)
            if built is None:
                built = next(source.glob("bazel-bin/**/mongod"), None)
            if built is None:
                raise RuntimeError("The MongoDB source build did not produce a mongod binary")
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            (root / "bin").mkdir(parents=True, exist_ok=True)
            shutil.copy2(built, root / "bin/mongod")
            (root / "bin/mongod").chmod(0o755)
            for directory in (root / "conf", root / "data", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            (root / "conf/mongod.conf").write_text(
                f"systemLog:\n  destination: file\n  path: {root / 'logs/mongod.log'}\n  logAppend: true\nstorage:\n  dbPath: {root / 'data'}\nnet:\n  bindIp: 127.0.0.1\n  port: 27017\nprocessManagement:\n  fork: false\n"
            )
            (root / ".serverengine-version").write_text(requested_version + "\n")
            self._update(job_id, progress=96, message="Preparing MongoDB runtime libraries…")
            prepare_mongodb_runtime(root)
            self._update(job_id, status="succeeded", progress=100, message=f"MongoDB {requested_version} was built from source in {root}; no host MongoDB package was changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_nginx_binary(self, job_id: str, requested_version: str):
        """Build Nginx from the official source archive inside its service root."""
        source_url = nginx_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("nginx")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = nginx_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"Nginx {requested_version} is not available from the official release archive. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated Nginx installer must run with privileges to stage the runtime.")
            return
        make = shutil.which("make")
        compiler = shutil.which("cc") or shutil.which("gcc")
        if not make or not compiler:
            self._update(job_id, status="failed", message="Nginx needs a compiler and make to build its isolated binary. Install the host build tools, then retry; no Nginx system package is required.")
            return
        self._force_stop_nginx_runtime(job_id)
        root = service_root("nginx", requested_version)
        staging = root.parent.parent / f".nginx-{job_id}-staging"
        archive = root.parent / f"nginx-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=3, message=f"Downloading Nginx {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=60) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 5 + round(downloaded * 30 / total) if total else 15
                    self._update(job_id, progress=min(35, progress), message=f"Downloading Nginx {requested_version} source…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The Nginx archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            shared_paths = nginx_paths(requested_version)
            configure = [
                str(source / "configure"), f"--prefix={root}", f"--sbin-path={root / 'bin/nginx'}",
                f"--conf-path={shared_paths['config']}", f"--pid-path={shared_paths['pid']}",
                f"--error-log-path={shared_paths['error_log']}", f"--http-log-path={shared_paths['access_log']}",
                f"--http-client-body-temp-path={root / 'data/client_temp'}", f"--http-proxy-temp-path={root / 'data/proxy_temp'}",
                f"--http-fastcgi-temp-path={root / 'data/fastcgi_temp'}", "--with-compat", "--with-http_ssl_module", "--with-http_v2_module",
                "--with-http_gzip_static_module", "--with-threads", "--with-stream",
            ]
            self._update(job_id, progress=40, message=f"Preparing Nginx {requested_version} build…", log=[f"$ {' '.join(configure)}"])
            configured = subprocess.Popen(configure, cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in configured.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=45, message=f"Configuring Nginx {requested_version}…", log=output[-80:])
            if configured.wait() != 0:
                raise RuntimeError("Nginx configure failed: " + (output[-1] if output else "configure returned a non-zero exit code"))
            self._update(job_id, progress=50, message=f"Compiling Nginx {requested_version}…", log=[f"$ {make} -j2"])
            build = subprocess.Popen([make, "-j2"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=60, message=f"Compiling Nginx {requested_version}…", log=output[-80:])
            if build.wait() != 0:
                raise RuntimeError("Nginx source build failed: " + (output[-1] if output else "make returned a non-zero exit code"))
            if root.exists():
                shutil.rmtree(root)
            self._update(job_id, progress=92, message=f"Installing Nginx {requested_version} into the managed directory…", log=[f"$ {make} install"])
            install = subprocess.Popen([make, "install"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in install.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=95, message=f"Installing Nginx {requested_version}…", log=output[-80:])
            if install.wait() != 0:
                raise RuntimeError("Nginx installation into the managed directory failed: " + (output[-1] if output else "make install returned a non-zero exit code"))
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-install-method").write_text("source\n")
            ensure_nginx_layout(nginx_paths(requested_version))
            base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "nginx"
            base.mkdir(parents=True, exist_ok=True)
            (base / ".serverengine-active-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Nginx {requested_version} is installed in {root}; the host Nginx package and service were not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_apache_binary(self, job_id: str, requested_version: str):
        """Build Apache HTTP Server and its APR dependencies in its service root."""
        if not requested_version.startswith("2."):
            self._update(
                job_id,
                status="failed",
                message="That Apache source release is not supported. Refresh versions and choose an Apache 2.x release.",
            )
            return
        source_url = apache_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("apache")
                if any(item.version == requested_version for item in definition.versions):
                    source_url = apache_source_for(requested_version)
            except Exception:
                source_url = None
        if not source_url:
            self._update(job_id, status="failed", message=f"Apache {requested_version} is not available from the official release archive. Refresh compatible versions and try again.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The isolated Apache installer must run with privileges to stage the runtime.")
            return
        make = shutil.which("make")
        compiler = shutil.which("cc") or shutil.which("gcc")
        if not make or not compiler:
            self._update(job_id, status="failed", message="Apache needs a compiler and make to build its isolated binary. Install the host build tools, then retry; no Apache system package is required.")
            return
        self._force_stop_apache_runtime(job_id)
        apache_base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "apache"
        root = service_root("apache", requested_version)
        staging = apache_base / f".apache-{job_id}-staging"
        archive = apache_base / f"apache-{requested_version}.tar.gz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="running", progress=2, message=f"Downloading Apache {requested_version} source…", log=[])
            request = urllib.request.Request(source_url, headers={"User-Agent": "Server-Engine-Control-Panel"})
            with urllib.request.urlopen(request, timeout=60) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length", "0") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    downloaded += len(chunk)
                    progress = 4 + round(downloaded * 26 / total) if total else 12
                    self._update(job_id, progress=min(30, progress), message=f"Downloading Apache {requested_version} source…")
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The Apache archive contains an unsafe path")
                package.extractall(staging)
            source = next((item for item in staging.iterdir() if item.is_dir()), staging)
            # Older Apache source releases bundle obsolete GNU config scripts.
            # Replace them with the current scripts so their isolated build can
            # identify modern x86_64 and ARM64 hosts.
            config_guess = next((item for item in (
                Path("/usr/share/misc/config.guess"),
                Path("/usr/share/automake-1.16/config.guess"),
                Path("/usr/share/automake-1.15/config.guess"),
            ) if item.exists()), None)
            config_sub = next((item for item in (
                Path("/usr/share/misc/config.sub"),
                Path("/usr/share/automake-1.16/config.sub"),
                Path("/usr/share/automake-1.15/config.sub"),
            ) if item.exists()), None)
            if config_guess and config_sub:
                for config_dir in (source / "build", source / "srclib/apr/build", source / "srclib/apr-util/build"):
                    config_dir.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(config_guess, config_dir / "config.guess")
                    shutil.copy2(config_sub, config_dir / "config.sub")
            srclib = source / "srclib"
            srclib.mkdir(exist_ok=True)
            self._update(job_id, progress=33, message="Downloading Apache APR build dependencies…", log=["APR and APR-util are built inside the Apache staging area."])
            for dependency, version in (("apr", "1.7.6"), ("apr-util", "1.6.3")):
                dependency_archive = staging / f"{dependency}-{version}.tar.gz"
                dependency_url = f"https://archive.apache.org/dist/apr/{dependency}-{version}.tar.gz"
                with urllib.request.urlopen(urllib.request.Request(dependency_url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=60) as response, dependency_archive.open("wb") as output:
                    output.write(response.read())
                with tarfile.open(dependency_archive, "r:gz") as dependency_package:
                    dependency_package.extractall(srclib)
                extracted = srclib / f"{dependency}-{version}"
                target = srclib / dependency
                if target.exists():
                    shutil.rmtree(target)
                extracted.rename(target)
                dependency_archive.unlink(missing_ok=True)
            apache_version = tuple(int(part) for part in requested_version.split("."))
            legacy_ssl_root = None
            if apache_version < (2, 4, 0):
                legacy_ssl_root = self._ensure_isolated_openssl(job_id, "1.0.2u")
            configure = [
                str(source / "configure"), f"--prefix={root}", f"--sbindir={root / 'bin'}",
                f"--sysconfdir={root / 'conf'}", "--with-mpm=event", "--enable-so",
                "--enable-rewrite", "--enable-proxy", "--with-included-apr",
            ]
            if apache_version >= (2, 4, 0):
                # Apache 2.4's mod_ssl supports the OpenSSL 3 toolchain used
                # by current Ubuntu/Debian releases. Point configure at the
                # system prefix so it does not mix headers and libraries from
                # different SSL installations.
                configure.extend(["--enable-ssl", "--with-ssl=/usr", "--enable-proxy-fcgi"])
            else:
                configure.extend(["--enable-ssl", f"--with-ssl={legacy_ssl_root}"])
            if apache_version >= (2, 4, 17):
                configure.append("--enable-http2")
            self._update(job_id, progress=40, message=f"Configuring Apache {requested_version}…", log=[f"$ {' '.join(configure)}"])
            configure_env = os.environ.copy()
            # Older Apache's configure script puts -lpcre before its static
            # objects. Modern linkers process archives left-to-right, so add
            # PCRE at the end as well to resolve the final httpd link.
            configure_env["LIBS"] = f"{configure_env.get('LIBS', '').strip()} -lpcre".strip()
            configured = subprocess.Popen(configure, cwd=source, env=configure_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in configured.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=45, message=f"Configuring Apache {requested_version}…", log=output[-80:])
            if configured.wait() != 0:
                raise RuntimeError("Apache configure failed: " + (output[-1] if output else "configure returned a non-zero exit code"))
            make_jobs = "-j1" if apache_version < (2, 4, 0) else "-j2"
            self._update(job_id, progress=50, message=f"Compiling Apache {requested_version}…", log=[f"$ {make} {make_jobs}"])
            build = subprocess.Popen([make, make_jobs], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=60, message=f"Compiling Apache {requested_version}…", log=output[-200:])
            if build.wait() != 0:
                self._update(job_id, log=output[-300:])
                raise RuntimeError("Apache source build failed: " + (output[-1] if output else "make returned a non-zero exit code"))
            if root.exists():
                shutil.rmtree(root)
            self._update(job_id, progress=92, message=f"Installing Apache {requested_version} into the managed directory…", log=[f"$ {make} install"])
            install = subprocess.Popen([make, "install"], cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in install.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=95, message=f"Installing Apache {requested_version}…", log=output[-80:])
            if install.wait() != 0:
                raise RuntimeError("Apache installation into the managed directory failed: " + (output[-1] if output else "make install returned a non-zero exit code"))
            self._share_versioned_service_paths("apache", root)
            (root / ".serverengine-version").write_text(requested_version)
            (root / ".serverengine-install-method").write_text("source\n")
            active_root = service_root("apache")
            active_root.mkdir(parents=True, exist_ok=True)
            (active_root / ".serverengine-active-version").write_text(requested_version + "\n")
            self._update(job_id, status="succeeded", progress=100, message=f"Apache {requested_version} is installed in {root}; the host Apache package and service were not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _ensure_isolated_icu(self, job_id: str, requested_version: str) -> Path:
        """Build and cache an ICU release compatible with legacy PHP intl."""
        root = service_root("icu", requested_version)
        marker = root / ".serverengine-version"
        icu_config = root / "bin/icu-config"
        if marker.exists() and icu_config.is_file() and (root / "lib/libicuuc.so").exists():
            return root
        make = shutil.which("make")
        compiler = shutil.which("cc") or shutil.which("gcc")
        if not make or not compiler:
            raise RuntimeError("ICU source builds require make and a C compiler.")
        staging = root.parent.parent / f".icu-{job_id}-staging"
        archive = staging / f"icu4c-{requested_version.replace('.', '_')}-src.tgz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            self._update(job_id, progress=27, message=f"Downloading ICU {requested_version} source for PHP intl…", log=[])
            url = f"https://github.com/unicode-org/icu/releases/download/release-{requested_version.replace('.', '-')}/icu4c-{requested_version.replace('.', '_')}-src.tgz"
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=120) as response, archive.open("wb") as output:
                shutil.copyfileobj(response, output)
            with tarfile.open(archive, "r:*") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The ICU archive contains an unsafe path")
                package.extractall(staging)
            extracted = next((item for item in staging.iterdir() if item.is_dir()), None)
            source = extracted / "source" if extracted and (extracted / "source").is_dir() else extracted
            if source is None or not (source / "configure").is_file():
                raise RuntimeError(f"ICU {requested_version} source archive has an unexpected layout.")
            configure = [str(source / "configure"), f"--prefix={root}", "--disable-samples", "--disable-tests"]
            build_env = {**os.environ, "CXXFLAGS": "-std=gnu++11"}
            self._update(job_id, progress=30, message=f"Configuring isolated ICU {requested_version}…", log=[f"$ {' '.join(configure)}"])
            configured = subprocess.run(configure, cwd=source, env=build_env, capture_output=True, text=True, check=False)
            if configured.returncode != 0:
                raise RuntimeError("ICU configure failed: " + (configured.stderr or configured.stdout).strip()[-1600:])
            make_command = [make, "-j1"]
            self._update(job_id, progress=34, message=f"Compiling isolated ICU {requested_version}…", log=[f"$ {' '.join(make_command)}"])
            build = subprocess.Popen(make_command, cwd=source, env=build_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            output = []
            for line in build.stdout or []:
                line = line.rstrip()
                if line:
                    output.append(line)
                    if len(output) > 1000:
                        del output[:-1000]
                    self._update(job_id, progress=min(78, 34 + len(output) // 12), message=f"Compiling isolated ICU {requested_version}…", log=[f"$ {' '.join(make_command)}", *output[-999:]])
                self._raise_if_cancelled(job_id)
            if build.wait() != 0:
                raise RuntimeError("ICU build failed: " + ("\n".join(output[-30:]) or "make returned a non-zero exit code"))
            self._update(job_id, progress=84, message=f"Installing isolated ICU {requested_version}…", log=[f"$ {make} install", *output[-999:]])
            installed = subprocess.run([make, "install"], cwd=source, env=build_env, capture_output=True, text=True, check=False)
            if installed.returncode != 0:
                raise RuntimeError("ICU installation failed: " + (installed.stderr or installed.stdout).strip()[-1600:])
            if not icu_config.is_file():
                raise RuntimeError(f"ICU {requested_version} installed without icu-config.")
            marker.write_text(requested_version + "\n")
            return root
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _latest_legacy_openssl_version(self) -> str:
        """Resolve the newest archived OpenSSL 1.1.1 source release."""
        try:
            definition, _, _ = refresh_service_versions("openssl", install_method="source")
            versions = [item.version for item in definition.versions if item.version.startswith("1.1.1")]
            if versions:
                return max(versions, key=version_sort_key)
        except Exception:
            pass
        return "1.1.1w"

    def _ensure_isolated_openssl(self, job_id: str, requested_version: str) -> Path:
        """Build and cache a reusable private OpenSSL runtime for legacy tools."""
        root = service_root("openssl", requested_version)
        marker = root / ".serverengine-version"
        if marker.exists() and (root / "lib/libssl.a").exists() and (root / "lib/libcrypto.a").exists():
            return root
        make = shutil.which("make")
        if not make:
            raise RuntimeError("OpenSSL source builds require make and a compiler.")
        staging = root.parent.parent / f".openssl-{job_id}-staging"
        archive = staging / f"openssl-{requested_version}.tar.gz"
        source = staging / f"openssl-{requested_version}"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            self._update(job_id, progress=36, message=f"Building reusable OpenSSL {requested_version}…", log=[])
            branch = "1.1.1" if requested_version.startswith("1.1.1") else "1.0.2"
            url = openssl_source_for(requested_version) or f"https://www.openssl.org/source/old/{branch}/openssl-{requested_version}.tar.gz"
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Server-Engine-Control-Panel"}), timeout=60) as response, archive.open("wb") as output:
                output.write(response.read())
            with tarfile.open(archive, "r:gz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The OpenSSL archive contains an unsafe path")
                package.extractall(staging)
            configure = ["./config", f"--prefix={root}", f"--openssldir={root / 'ssl'}", "no-shared", "no-tests", "no-ssl3"]
            self._update(job_id, progress=38, message=f"Configuring reusable OpenSSL {requested_version}…", log=[f"$ {' '.join(configure)}"])
            configured = subprocess.run(configure, cwd=source, capture_output=True, text=True, check=False)
            if configured.returncode != 0:
                raise RuntimeError("OpenSSL configure failed: " + (configured.stderr or configured.stdout).strip()[-1200:])
            # OpenSSL 1.0.2 uses recursive Makefiles that cannot reliably
            # inherit GNU make's parallel jobserver through this managed
            # subprocess. Build the compatibility runtime serially so the
            # job does not fail with "write jobserver: Bad file descriptor".
            make_command = [make, "-j1"]
            self._update(job_id, progress=39, message=f"Compiling reusable OpenSSL {requested_version}…", log=[f"$ {' '.join(make_command)}"])
            build_output: list[str] = []
            started = time.monotonic()
            last_update = started
            with subprocess.Popen(
                make_command,
                cwd=source,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            ) as build:
                for line in build.stdout or []:
                    line = line.rstrip()
                    if not line:
                        continue
                    build_output.append(line)
                    if len(build_output) > 1000:
                        del build_output[:-1000]
                    now = time.monotonic()
                    if now - last_update >= 0.35:
                        elapsed = max(1, int(now - started))
                        self._update(
                            job_id,
                            progress=min(78, 39 + min(39, len(build_output) // 8)),
                            message=f"Compiling reusable OpenSSL {requested_version}… {elapsed}s elapsed",
                            log=[f"$ {' '.join(make_command)}", *build_output[-999:]],
                        )
                        last_update = now
                    self._raise_if_cancelled(job_id)
                return_code = build.wait()
            if return_code != 0:
                raise RuntimeError("OpenSSL build failed: " + ("\n".join(build_output[-30:]) or "make returned a non-zero exit code"))
            if root.exists():
                shutil.rmtree(root)
            self._update(job_id, progress=82, message=f"Installing reusable OpenSSL {requested_version}…", log=[f"$ {make} install_sw", *build_output[-999:]])
            installed = subprocess.run([make, "install_sw"], cwd=source, capture_output=True, text=True, check=False)
            if installed.returncode != 0:
                raise RuntimeError("OpenSSL installation failed: " + (installed.stderr or installed.stdout).strip()[-1200:])
            marker.write_text(requested_version + "\n")
            return root
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_openssl_compatibility_runtime(self, job_id: str, requested_version: str):
        """Build an explicit, reusable legacy OpenSSL runtime on request."""
        try:
            root = self._ensure_isolated_openssl(job_id, requested_version)
            self._update(
                job_id,
                status="succeeded",
                progress=100,
                message=f"OpenSSL {requested_version} was built in the isolated runtime at {root}. The host OpenSSL installation was not changed.",
                log=[f"Runtime: {root}", "Warning: OpenSSL 1.1.1 is end-of-life and should only support legacy applications."],
            )
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_sqlserver_container(self, job_id: str, requested_version: str):
        if platform.machine().lower() not in {"x86_64", "amd64"}:
            self._update(job_id, status="failed", message="Microsoft SQL Server requires an x86_64 Linux host; ARM64 is not supported by the official Linux container.")
            return
        docker = shutil.which("docker")
        if not docker:
            self._update(job_id, status="failed", message="Docker Engine is required to install Microsoft SQL Server. Install Docker from Services first, then retry.")
            return
        tag = requested_version
        root = service_root("sqlserver")
        data = root / "data"
        credentials = root / "sa-password"
        container = "server-engine-sqlserver"
        root.mkdir(parents=True, exist_ok=True)
        data.mkdir(parents=True, exist_ok=True)
        if not credentials.exists():
            credentials.write_text(secrets.token_urlsafe(24) + "!Aa1")
            credentials.chmod(0o600)
        password = credentials.read_text().strip()
        image = f"mcr.microsoft.com/mssql/server:{tag}"
        try:
            self._update(job_id, status="running", progress=5, message=f"Pulling Microsoft SQL Server {requested_version} container…", log=[])
            pull = subprocess.Popen([docker, "pull", image], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            output = []
            for line in pull.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=40, message="Downloading Microsoft SQL Server image…", log=output[-80:])
            if pull.wait() != 0:
                raise RuntimeError("Unable to download the Microsoft SQL Server Docker image")
            subprocess.run([docker, "rm", "-f", container], capture_output=True, text=True, check=False)
            command = [
                docker, "run", "-d", "--name", container, "--restart", "unless-stopped",
                "-e", "ACCEPT_EULA=Y", "-e", "MSSQL_PID=Developer", "-e", f"MSSQL_SA_PASSWORD={password}",
                "-p", "127.0.0.1:1433:1433", "-v", f"{data}:/var/opt/mssql", image,
            ]
            started = subprocess.run(command, capture_output=True, text=True, check=False)
            if started.returncode != 0:
                raise RuntimeError((started.stderr or started.stdout).strip() or "Unable to start the Microsoft SQL Server container")
            (root / ".serverengine-version").write_text(requested_version)
            self._update(job_id, status="succeeded", progress=100, message=f"Microsoft SQL Server {requested_version} is running in Docker on 127.0.0.1:1433. SA password: {credentials}")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_composer_binary(self, job_id: str, requested_version: str, selected_php_version: str | None = None):
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="Composer installation requires privileges to create its managed tool directory.")
            return
        php_root = service_root("php") / "versions"
        php_versions = sorted((item for item in php_root.iterdir() if item.is_dir()), key=lambda item: version_sort_key(item.name), reverse=True) if php_root.exists() else []
        php_version = selected_php_version if selected_php_version and php_cli_path(selected_php_version).exists() else next((item.name for item in php_versions if php_cli_path(item.name).exists()), None)
        if not php_version:
            self._update(job_id, status="failed", message="Install a PHP runtime first, then choose it for Composer.")
            return
        root = service_root("composer") / "versions" / requested_version
        archive = root / "composer.phar"
        try:
            root.mkdir(parents=True, exist_ok=True)
            (root / "bin").mkdir(parents=True, exist_ok=True)
            if not archive.exists() or archive.stat().st_size < 1000:
                self._update(job_id, status="running", progress=10, message=f"Downloading Composer for PHP {php_version}…", log=[])
                composer_url = f"https://getcomposer.org/download/{requested_version}/composer.phar"
                with urllib.request.urlopen(composer_url, timeout=60) as response, archive.open("wb") as destination:
                    data = response.read()
                    self._raise_if_cancelled(job_id)
                    destination.write(data)
            else:
                self._update(job_id, status="running", progress=70, message=f"Using the downloaded Composer PHAR with PHP {php_version}…", log=[])
            archive.chmod(0o755)
            php = php_cli_path(php_version)
            ensure_php_fpm_layout(php_version)
            launcher = root / "bin/composer"
            php_root_path = service_root("php", php_version)
            library_paths = {php_root_path / "lib", php_root_path / "lib64", php_root_path / "usr/lib", php_root_path / "usr/lib64"}
            library_paths.update(library.parent for library in php_root_path.rglob("*.so*") if library.is_file() or library.is_symlink())
            libraries = ":".join(str(path) for path in library_paths if path.exists())
            extension_dir = next(
                (
                    candidate
                    for base in (php_root_path / "usr/lib/php", php_root_path / "lib/php", php_root_path / "lib64/php")
                    if base.exists()
                    for candidate in sorted(base.iterdir())
                    if candidate.is_dir()
                ),
                None,
            )
            phar = extension_dir / "phar.so" if extension_dir else None
            php_extensions = [module for module in ("phar.so", "iconv.so") if extension_dir and (extension_dir / module).exists()]
            extension_flags = " ".join(f"-d extension=\"{extension_dir / module}\"" for module in php_extensions)
            php_options = f" -d extension_dir=\"{extension_dir}\" {extension_flags}" if extension_dir else ""
            php_ini = php_root_path / "conf/php.ini"
            composer_home = ensure_composer_cache()
            launcher.write_text(f"#!/bin/sh\nexport LD_LIBRARY_PATH=\"{libraries}:$LD_LIBRARY_PATH\"\nexport COMPOSER_HOME=\"{composer_home}\"\nexec \"{php}\" -c \"{php_ini}\"{php_options} \"{archive}\" \"$@\"\n")
            launcher.chmod(0o755)
            (root / ".serverengine-version").write_text(requested_version)
            (service_root("composer") / ".serverengine-php-version").write_text(php_version + "\n")
            result = subprocess.run([str(launcher), "--version"], capture_output=True, text=True, check=False, timeout=30)
            if result.returncode != 0:
                raise RuntimeError((result.stderr or result.stdout).strip() or "Composer could not start with the selected PHP runtime")
            actual = (result.stdout or result.stderr).strip()
            self._update(job_id, status="succeeded", progress=100, message=f"{actual}. Available as composer in the Server Engine terminal.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_node_binary(self, job_id: str, requested_version: str):
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The app-root installer must run with privileges to stage the Node.js runtime.")
            return
        machine = platform.machine().lower()
        architecture = "arm64" if machine in {"aarch64", "arm64"} else "x64" if machine in {"x86_64", "amd64"} else None
        if not architecture:
            self._update(job_id, status="failed", message=f"Official Node.js binaries are not available for host architecture {machine}.")
            return
        root = service_root("nodejs", requested_version)
        staging = root.parent / f".node-{job_id}-staging"
        archive = root.parent / f"node-v{requested_version}-linux-{architecture}.tar.xz"
        try:
            with urllib.request.urlopen("https://nodejs.org/dist/index.json", timeout=30) as response:
                releases = json.loads(response.read().decode())
            release = next((item for item in releases if item["version"].startswith(f"v{requested_version}.")), None)
            if not release:
                raise RuntimeError(f"Node.js {requested_version} is not available from the official release archive")
            full_version = release["version"]
            url = f"https://nodejs.org/dist/{full_version}/node-{full_version}-linux-{architecture}.tar.xz"
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            self._update(job_id, status="running", progress=0, message=f"Downloading Node.js {full_version}…", log=[])
            with urllib.request.urlopen(url, timeout=60) as response, archive.open("wb") as destination:
                total = int(response.headers.get("Content-Length") or 0)
                downloaded = 0
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    destination.write(chunk)
                    downloaded += len(chunk)
                    progress = min(70, round(downloaded * 70 / total)) if total else 10
                    self._update(job_id, progress=progress, message=f"Downloading Node.js {full_version}… {progress}%")
            with tarfile.open(archive, mode="r:xz") as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The downloaded Node.js archive contains an unsafe path")
                package.extractall(staging, filter="data")
            extracted = next(item for item in staging.iterdir() if item.is_dir())
            shutil.rmtree(root, ignore_errors=True)
            (root / "bin").mkdir(parents=True, exist_ok=True)
            (root / "lib").mkdir(parents=True, exist_ok=True)
            (root / "include").mkdir(parents=True, exist_ok=True)
            (root / "share").mkdir(parents=True, exist_ok=True)
            for source_name, target in (("bin", root / "bin"), ("lib", root / "lib"), ("include", root / "include"), ("share", root / "share")):
                source = extracted / source_name
                if source.exists():
                    shutil.copytree(source, target, dirs_exist_ok=True)
            (root / ".serverengine-version").write_text(requested_version)
            self._stage_node_runtime_libraries(root)
            ensure_node_runtime(root)
            self._update(job_id, status="succeeded", progress=100, message=f"Node.js {full_version} installed in {root}.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_mysql_binary(self, job_id: str, requested_version: str):
        releases = {"8.4": "8.4.11", "8.0": "8.0.46", "5.7": "5.7.44"}
        release = mysql_release_for(requested_version) or releases.get(requested_version)
        if not release:
            self._update(job_id, status="failed", message=f"MySQL {requested_version} is listed but has no binary adapter yet. Supported automatic binaries: {', '.join(releases)}.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The app-root installer must run with privileges to stage the MySQL binary.")
            return
        machine = platform.machine().lower()
        architecture = "aarch64" if machine in {"aarch64", "arm64"} else "x86_64" if machine in {"x86_64", "amd64"} else None
        if not architecture:
            self._update(job_id, status="failed", message=f"Official MySQL generic binaries are not available for host architecture {machine}.")
            return
        if release.startswith("5.7") and architecture != "x86_64":
            self._update(job_id, status="failed", message="MySQL 5.7.44's official generic binary is available for Linux x86_64 only; Oracle does not publish an ARM64 MySQL 5.7 archive. Choose MySQL 8.0/8.4 on ARM64 or use an x86_64 host.")
            return
        root = service_root("mysql")
        legacy_mysql = release.startswith("5.7")
        archive_suffix = ".tar.gz" if legacy_mysql else ".tar.xz"
        archive = root.parent / f"mysql-{release}-{architecture}{archive_suffix}"
        staging = root.parent / f".mysql-{job_id}-staging"
        backup = root.parent / f".mysql-{job_id}-backup"
        series = ".".join(release.split(".")[:2])
        if legacy_mysql:
            url = f"https://dev.mysql.com/get/Downloads/MySQL-{series}/mysql-{release}-linux-glibc2.12-x86_64.tar.gz"
        else:
            url = f"https://dev.mysql.com/get/Downloads/MySQL-{series}/mysql-{release}-linux-glibc2.28-{architecture}.tar.xz"
        try:
            root.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(staging, ignore_errors=True)
            if backup.exists():
                shutil.rmtree(backup, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
            self._update(job_id, status="running", progress=0, message=f"Downloading MySQL {release} for {architecture} into a temporary isolated area.", log=[])
            with urllib.request.urlopen(url, timeout=60) as response, archive.open("wb") as destination:
                total = int(response.headers.get("Content-Length") or 0)
                downloaded = 0
                last_progress = -1
                while True:
                    self._raise_if_cancelled(job_id)
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    destination.write(chunk)
                    downloaded += len(chunk)
                    progress = min(70, round(downloaded * 70 / total)) if total else min(70, 5 + downloaded // (1024 * 1024 * 5))
                    if progress != last_progress:
                        last_progress = progress
                        self._update(job_id, progress=progress, message=f"Downloading MySQL {release}… {progress}%")
            self._raise_if_cancelled(job_id)
            self._update(job_id, progress=72, message=f"Extracting MySQL {release} into a temporary isolated area; the global OS package database will not be changed.")
            archive_mode = "r:gz" if legacy_mysql else "r:xz"
            with tarfile.open(archive, mode=archive_mode) as package:
                members = package.getmembers()
                if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
                    raise RuntimeError("The downloaded MySQL archive contains an unsafe path")
                for index, member in enumerate(members):
                    self._raise_if_cancelled(job_id)
                    package.extract(member, staging, filter="data")
                    if index % max(1, len(members) // 20) == 0:
                        self._update(job_id, progress=min(92, 72 + round((index + 1) * 20 / max(1, len(members)))), message=f"Extracting MySQL {release}…")
            extracted = next((item for item in staging.iterdir() if item.is_dir() and item.name.startswith("mysql-")), None)
            if extracted:
                for item in extracted.iterdir():
                    target = staging / item.name
                    if target.exists():
                        if target.is_dir():
                            shutil.copytree(item, target, dirs_exist_ok=True)
                        else:
                            target.unlink()
                    else:
                        shutil.move(str(item), str(target))
                extracted.rmdir()
            self._raise_if_cancelled(job_id)
            if root.exists():
                root.rename(backup)
            staging.rename(root)
            (root / ".serverengine-version").write_text(requested_version)
            (root / "logs").mkdir(exist_ok=True)
            (root / "run").mkdir(exist_ok=True)
            (root / "data").mkdir(exist_ok=True)
            shutil.rmtree(backup, ignore_errors=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="succeeded", progress=100, message=f"MySQL {release} staged in {root}. The global OS package database and configuration were not modified.")
        except InstallCancelled:
            shutil.rmtree(staging, ignore_errors=True)
            archive.unlink(missing_ok=True)
            shutil.rmtree(backup, ignore_errors=True)
            self._update(job_id, status="cancelled", progress=0, message="Installation cancelled. Temporary MySQL files were rolled back.")
        except Exception as error:
            shutil.rmtree(staging, ignore_errors=True)
            archive.unlink(missing_ok=True)
            self._update(job_id, status="failed", message=f"Unable to install official MySQL {release}: {error}")

    def _run_nginx_install(self, job_id: str, requested_version: str):
        paths = nginx_paths(requested_version)
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The app-root installer must run with privileges to stage the service binary.")
            return
        apt = shutil.which("apt-get")
        dpkg = shutil.which("dpkg-deb")
        if not apt or not dpkg:
            self._update(job_id, status="failed", message="The isolated Nginx adapter currently supports Debian/Ubuntu package extraction.")
            return
        self._force_stop_nginx_runtime(job_id)
        try:
            paths["root"].mkdir(parents=True, exist_ok=True)
            self._update(job_id, status="running", message=f"Staging Nginx {requested_version} inside {paths['root']} (no global nginx package).", log=[])
            subprocess.run([apt, "update"], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            with subprocess.Popen([apt, "download", "nginx"], cwd=paths["root"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True) as process:
                output = []
                for line in process.stdout or []:
                    if line.strip():
                        output.append(line.rstrip())
                        self._update(job_id, log=output[-80:])
                if process.wait() != 0:
                    raise RuntimeError("Unable to download the Nginx package")
            debs = sorted(paths["root"].glob("nginx_*.deb"))
            if not debs:
                raise RuntimeError("Nginx package archive was not downloaded")
            subprocess.run([dpkg, "-x", str(debs[-1]), str(paths["root"])], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            ensure_nginx_layout(paths)
            base = Path(os.getenv("SE_SERVICE_ROOT", "/opt/server-engine/services")) / "nginx"
            base.mkdir(parents=True, exist_ok=True)
            (base / ".serverengine-active-version").write_text(requested_version + "\n")
            for deb in debs:
                deb.unlink(missing_ok=True)
            self._update(job_id, status="succeeded", message=f"Nginx staged in {paths['root']}. The host global Nginx configuration was not modified.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

    def _run_legacy_install(self, job_id: str, service_id: str, requested_version: str):
        # This method is retained only for old queued jobs. It must never be
        # allowed to install a package into the host operating system.
        self._update(
            job_id,
            status="failed",
            message=f"The legacy installer for {service_id} was blocked because Server Engine never installs global OS packages. Use the isolated service installer instead.",
        )

    def list(self) -> list[JobSummary]:
        with self._lock:
            return sorted(self._jobs.values(), key=lambda item: item.created_at, reverse=True)


job_store = JobStore()


def _managed_process_alive(pid_file: Path) -> bool:
    try:
        pid = int(pid_file.read_text().strip())
        os.kill(pid, 0)
        return True
    except (FileNotFoundError, OSError, ValueError):
        return False


def enqueue_startup_services() -> None:
    """Start installed managed services when the control plane boots.

    Nginx is preferred over Apache when both are installed because only one
    default web server can own the public HTTP ports at a time.
    """
    php_versions = service_root("php") / "versions"
    if php_versions.exists():
        for version_root in sorted(item for item in php_versions.iterdir() if item.is_dir()):
            version = version_root.name
            paths = php_fpm_paths(version)
            if startup_enabled("php", version) and paths["binary"].exists() and not _managed_process_alive(paths["pid"]):
                job_store.enqueue_action(f"startup-php-{version}", "php", "start", version)

    nginx = nginx_paths()
    apache_root = service_root("apache")
    if startup_enabled("nginx") and nginx["binary"].exists() and nginx["config"].exists() and not _managed_process_alive(nginx["pid"]):
        job_store.enqueue_action("startup-nginx", "nginx", "start")
    elif startup_enabled("apache") and binary_path("apache").exists() and (apache_root / "conf/httpd.conf").exists() and not _managed_process_alive(apache_root / "run/httpd.pid"):
        job_store.enqueue_action("startup-apache", "apache", "start")

    database = next(
        (
            service_id
            for service_id in ("mysql", "mariadb")
            if binary_path(service_id).exists() and startup_enabled(service_id)
        ),
        None,
    )
    if database:
        pid_file = service_root(database) / "run/mysqld.pid"
        if not _managed_process_alive(pid_file):
            job_store.enqueue_action(f"startup-{database}", database, "start")

    ftp_root = service_root("vsftpd")
    if startup_enabled("vsftpd") and binary_path("vsftpd").exists() and not _managed_process_alive(ftp_root / "run/vsftpd.pid"):
        job_store.enqueue_action("startup-vsftpd", "vsftpd", "start")

    # Other long-running services are opt-in. Their Runtime toggles persist
    # the choice, and this boot hook starts them only when explicitly enabled.
    optional_services = {
        "postgresql": "postmaster.pid",
        "redis": "redis.pid",
        "valkey": "valkey.pid",
        "memcached": "memcached.pid",
        "mongodb": "mongod.pid",
        "powerdns": "pdns.pid",
        "haproxy": "haproxy.pid",
        "caddy": "caddy.pid",
        "fail2ban": "fail2ban.pid",
        "supervisor": "supervisord.pid",
    }
    for service_id, pid_name in optional_services.items():
        if startup_enabled(service_id) and binary_path(service_id).exists():
            pid_file = service_root(service_id) / "run" / pid_name
            if not _managed_process_alive(pid_file):
                job_store.enqueue_action(f"startup-{service_id}", service_id, "start")
