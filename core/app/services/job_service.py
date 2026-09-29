import asyncio
from datetime import datetime, timezone
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
import subprocess
import tempfile
import time
from pathlib import Path
from threading import Event, Thread
from threading import Lock

from app.models.job import JobSummary
from app.services.service_catalog import apache_source_for, bind9_source_for, certbot_source_for, caddy_source_for, clamav_source_for, dovecot_source_for, ffmpeg_source_for, git_source_for, haproxy_source_for, imagemagick_source_for, lynis_source_for, mariadb_source_for, memcached_source_for, mongodb_prebuilt_for, mongodb_source_for, mysql_release_for, nginx_source_for, opensearch_source_for, openlitespeed_prebuilt_for, openlitespeed_source_for, php_source_for, postfix_source_for, powerdns_source_for, postgresql_source_for, prebuilt_package_for, python_asset_for, python_source_for, rabbitmq_source_for, redis_source_for, refresh_service_versions, rspamd_source_for, ruby_source_for, stalwart_source_for, supervisor_source_for, unbound_source_for, valkey_source_for, vsftpd_source_for, wpcli_source_for
from app.services.service_runtime import PHP_BASELINE_MODULES, PHP_REQUIRED_EXTENSIONS, SERVICE_PACKAGES, binary_path, enable_php_baseline_extensions, ensure_composer_cache, ensure_nginx_layout, ensure_node_runtime, ensure_php_fpm_layout, ensure_php_runtime_configuration, ensure_php_runtime_launcher, nginx_paths, normalize_php_runtime_layout, package_for, php_cli_path, php_fpm_paths, php_runtime_library_path, service_root, startup_enabled, version_sort_key


class InstallCancelled(Exception):
    pass


class JobStore:
    """Background installer queue for the local privileged control-plane process."""

    def __init__(self):
        self._jobs: dict[str, JobSummary] = {}
        self._cancel_events: dict[str, Event] = {}
        self._subscribers: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()
        self._lock = Lock()
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

    def create(self, job_id: str, job_type: str) -> JobSummary:
        job = JobSummary(id=job_id, type=job_type, status="queued", created_at=datetime.now(timezone.utc))
        with self._lock:
            self._jobs[job_id] = job
            self._cancel_events[job_id] = Event()
        self._broadcast(job)
        return job

    def cancel(self, job_id: str) -> JobSummary | None:
        with self._lock:
            current = self._jobs.get(job_id)
            if current is None:
                return None
            if current.status in {"succeeded", "failed", "cancelled"}:
                return current
            event = self._cancel_events.get(job_id)
            if event:
                event.set()
            cancelled = current.model_copy(update={
                "status": "cancelled",
                "message": "Cancellation requested.",
                "updated_at": datetime.now(timezone.utc),
            })
            self._jobs[job_id] = cancelled
        self._broadcast(cancelled)
        return cancelled

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

    def enqueue_extension(self, job_id: str, version: str, extension: str) -> JobSummary:
        job = self.create(job_id, f"Install PHP {version} extension {extension}")
        Thread(target=self._run_serialized, args=(self._run_extension_install, job_id, version, extension), daemon=True).start()
        return job

    def _run_serialized(self, runner, job_id: str, *args):
        """Run exactly one privileged job at a time.

        Jobs are still created immediately so the UI can show them as queued,
        but package operations, source builds, and service actions cannot
        overlap. This protects APT/dpkg and prevents concurrent builds from
        exhausting the host.
        """
        with self._task_lock:
            if self._is_cancelled(job_id):
                return
            try:
                runner(job_id, *args)
            except InstallCancelled:
                self._update(job_id, status="cancelled", message="Job cancelled.")
            except Exception as error:
                self._update(job_id, status="failed", message=str(error))

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

    def _run_action(self, job_id: str, service_id: str, action: str, version: str | None = None):
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
                check = subprocess.run([str(nginx["binary"]), "-p", str(nginx["root"]), "-c", str(nginx["config"]), "-t"], capture_output=True, text=True, check=False)
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
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
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

    def _run_powerdns_action(self, job_id: str, action: str):
        root = service_root("powerdns")
        binary = Path(shutil.which("pdns_server") or "/usr/sbin/pdns_server")
        config_dir = root / "conf"
        config = config_dir / "pdns.conf"
        log_file = root / "logs/pdns.log"
        try:
            if not binary.exists():
                raise RuntimeError("PowerDNS is not installed")
            self._prepare_service_runtime(root, "conf", "logs", "run")
            if not config.exists():
                config.write_text("launch=local\nlocal-address=0.0.0.0\nlocal-port=53\nsetuid=serverengine\nsetgid=serverengine\n")
            if action in {"stop", "restart"}:
                self._stop_process_by_binary(binary)
            if action == "stop":
                self._update(job_id, status="succeeded", message="PowerDNS stopped.", log=[])
                return
            command = [str(binary), "--daemon=no", "--config-dir", str(config_dir)]
            self._update(job_id, status="running", message=f"Starting PowerDNS with {config}…", log=[])
            with log_file.open("a") as stream:
                process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
            import time
            time.sleep(0.4)
            if process.poll() is not None:
                raise RuntimeError(f"PowerDNS exited with code {process.returncode}; inspect {log_file}")
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
        pid_file = root / "run/postmaster.pid"
        try:
            if not binary.exists():
                raise RuntimeError("PostgreSQL is not installed in the managed service root")
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
            if not (data / "PG_VERSION").exists():
                if not initdb.exists():
                    raise RuntimeError("PostgreSQL initdb was not found in the managed service root")
                initialize_command = [str(initdb), "-D", str(data), "--auth-local=scram-sha-256", "--auth-host=scram-sha-256", "--no-locale", "--encoding=UTF8"]
                if os.geteuid() == 0 and shutil.which("runuser"):
                    initialize_command = ["runuser", "-u", user, "--", *initialize_command]
                initialize = subprocess.run(initialize_command, capture_output=True, text=True, check=False)
                if initialize.returncode != 0:
                    raise RuntimeError((initialize.stderr or initialize.stdout).strip() or "PostgreSQL data directory initialization failed")
            subprocess.run(["chown", "-R", f"{user}:{user}", str(data), str(config_dir), str(log_file.parent)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            command = [str(binary), "-D", str(data), "-c", f"config_file={config}", "-c", f"hba_file={hba}", "-k", str(root / "run")]
            if os.geteuid() == 0 and shutil.which("runuser"):
                command = ["runuser", "-u", user, "--", *command]
            self._update(job_id, status="running", message=f"Starting PostgreSQL with {config}…", log=[])
            with log_file.open("a") as stream:
                process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
            import time
            time.sleep(0.8)
            if process.poll() is not None:
                details = log_file.read_text(errors="replace").splitlines()[-20:]
                raise RuntimeError(f"PostgreSQL exited during startup: {' | '.join(details) if details else process.returncode}")
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
            for path in (config_dir, data, log_file.parent, pid_file.parent):
                path.mkdir(parents=True, exist_ok=True)
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
            subprocess.run(["chown", "-R", f"{user}:{user}", str(data), str(log_file.parent), str(pid_file.parent)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            command = [str(binary), str(config)]
            if os.geteuid() == 0 and shutil.which("runuser"):
                command = ["runuser", "-u", user, "--", *command]
            self._update(job_id, status="running", message=f"Starting Redis with {config}…", log=[])
            with log_file.open("a") as stream:
                process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
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
            for path in (data, logs, run, config.parent):
                path.mkdir(parents=True, exist_ok=True)
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
            user = self._ensure_service_user()
            subprocess.run(["chown", "-R", f"{user}:{user}", str(data), str(logs), str(run)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
                process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
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
        library_dir = root / ".runtime-libraries"
        library_dir.mkdir(parents=True, exist_ok=True)
        if not any(library_dir.rglob("libaio.so*")) or not any(library_dir.rglob("libnuma.so*")):
            apt = shutil.which("apt")
            dpkg_deb = shutil.which("dpkg-deb")
            if not apt or not dpkg_deb:
                raise RuntimeError("MySQL needs libaio and libnuma, but the isolated Debian package tools are unavailable")
            for archive in library_dir.glob("*.deb"):
                archive.unlink(missing_ok=True)
            download = subprocess.run([apt, "download", "libaio1t64", "libnuma1"], cwd=library_dir, capture_output=True, text=True, check=False)
            if download.returncode != 0:
                raise RuntimeError("Unable to stage MySQL runtime libraries: " + (download.stderr or download.stdout).strip())
            archives = sorted(library_dir.glob("*.deb"))
            if len(archives) < 2:
                raise RuntimeError("MySQL runtime library packages were not downloaded")
            for archive in archives:
                subprocess.run([dpkg_deb, "-x", str(archive), str(library_dir)], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                archive.unlink(missing_ok=True)
        aio_candidates = list(library_dir.rglob("libaio.so.1t64"))
        aio_link = next((path.parent / "libaio.so.1" for path in aio_candidates), None)
        if aio_link and not aio_link.exists():
            aio_link.symlink_to(aio_candidates[0].name)
        library_paths = [library_dir, *[path for path in library_dir.rglob("*") if path.is_dir()]]
        environment = os.environ.copy()
        environment["LD_LIBRARY_PATH"] = ":".join(str(path) for path in library_paths)
        return environment

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
        subprocess.run([apt, "update"], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

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
            if "log" in changes and changes["log"]:
                incoming = list(changes["log"])
                existing = current.log
                if existing and len(incoming) >= len(existing) and incoming[:len(existing)] == existing:
                    changes["log"] = incoming
                else:
                    overlap = 0
                    for size in range(1, min(len(existing), len(incoming)) + 1):
                        if existing[-size:] == incoming[:size]:
                            overlap = size
                    changes["log"] = existing + incoming[overlap:]
            updated = current.model_copy(update={"updated_at": datetime.now(timezone.utc), **changes})
            self._jobs[job_id] = updated
        self._broadcast(updated)

    def _run_install(self, job_id: str, service_id: str, requested_version: str, install_method: str = "prebuilt", php_version: str | None = None, composer_version: str | None = None):
        if service_id == "php" and install_method == "source":
            self._run_php_source_binary(job_id, requested_version)
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
        if install_method == "prebuilt" and prebuilt_package_for(service_id):
            if service_id == "redis":
                self._run_redis_prebuilt(job_id, requested_version)
            else:
                self._run_debian_prebuilt(job_id, service_id, requested_version)
            return
        self._run_isolated_package(job_id, service_id, requested_version)

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
            if full_version == requested_version or full_version.split(":", 1)[-1] == requested_version:
                return full_version
        return requested_version

    def _run_debian_prebuilt(self, job_id: str, service_id: str, requested_version: str):
        """Extract an exact Debian package into a managed service root."""
        package = prebuilt_package_for(service_id)
        apt = shutil.which("apt-get")
        dpkg_deb = shutil.which("dpkg-deb")
        if not package or not apt or not dpkg_deb:
            self._update(job_id, status="failed", message=f"No compatible prebuilt {service_id} package provider is available on this host. Choose source build instead.")
            return
        root = service_root(service_id)
        staging = root.parent / f".{service_id}-{job_id}-prebuilt"
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
            self._update(job_id, status="running", progress=5, message=f"Downloading prebuilt {service_id} {requested_version}…", log=[f"$ apt-get download {package}={exact_version}"])
            packages = [f"{package}={exact_version}"]
            apt_cache = shutil.which("apt-cache")
            if apt_cache:
                pending = [package]
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
            downloaded = subprocess.run([apt, "download", *packages], cwd=package_dir, capture_output=True, text=True, check=False)
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
                ensure_nginx_layout()
            elif service_id == "apache":
                apache_conf = root / "conf/httpd.conf"
                if not apache_conf.exists():
                    module_root = root / "usr/lib/apache2/modules"
                    apache_conf.write_text(
                        f'ServerRoot "{root}"\nListen 80\n'
                        f'PidFile "{root / "run/httpd.pid"}"\n'
                        f'ErrorLog "{root / "logs/error.log"}"\n'
                        f"LoadModule mpm_event_module {module_root / 'mod_mpm_event.so'}\n"
                        f"LoadModule unixd_module {module_root / 'mod_unixd.so'}\n"
                        f"LoadModule authz_core_module {module_root / 'mod_authz_core.so'}\n"
                        f"LoadModule dir_module {module_root / 'mod_dir.so'}\n"
                        f"LoadModule mime_module {module_root / 'mod_mime.so'}\n"
                        f"LoadModule rewrite_module {module_root / 'mod_rewrite.so'}\n"
                        "TypesConfig /etc/mime.types\n"
                        "DocumentRoot /server-engine/www\n"
                        "<Directory /server-engine/www>\n  AllowOverride All\n  Require all granted\n</Directory>\n"
                    )
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
            "apache": base | {"automake", "libexpat1-dev", "libnghttp2-dev", "libpcre3-dev", "libpcre2-dev", "perl"},
            "mariadb": base | {"bison", "libaio-dev", "libcurl4-openssl-dev", "libevent-dev", "libfmt-dev", "libgcrypt20-dev", "liblz4-dev", "libncurses-dev", "libnuma-dev", "libpcre2-dev", "libsnappy-dev", "liburing-dev", "libzstd-dev"},
            "php": base | {"autoconf", "bison", "re2c", "libxml2-dev", "libcurl4-openssl-dev", "libsqlite3-dev", "libonig-dev", "libzip-dev", "libreadline-dev", "libxslt1-dev", "libjpeg-dev", "libpng-dev", "libwebp-dev", "libfreetype6-dev", "libicu-dev", "libpq-dev"},
            "python": base | {"libbz2-dev", "libffi-dev", "liblzma-dev", "libncurses-dev", "libreadline-dev", "libsqlite3-dev", "libgdbm-dev", "libnss3-dev", "libuuid1", "uuid-dev", "tk-dev"},
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
        }.get(service_id)
        if not dependencies:
            return
        if os.geteuid() != 0:
            raise RuntimeError(f"Installing {service_id} requires root privileges to prepare its isolated source build dependencies.")
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
        archive = root.parent / f"php-{requested_version}.tar.gz"
        try:
            self._ensure_source_build_dependencies(job_id, "php")
            shutil.rmtree(staging, ignore_errors=True)
            staging.mkdir(parents=True, exist_ok=True)
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
            configure = [
                "./configure", f"--prefix={root}", f"--with-config-file-path={root / 'conf'}",
                f"--with-config-file-scan-dir={root / 'conf/conf.d'}", "--enable-fpm", f"--with-fpm-user={runtime_user}",
                f"--with-fpm-group={runtime_user}", "--enable-mbstring", "--enable-bcmath", "--enable-opcache",
                "--enable-zip", "--with-curl", "--with-openssl", "--with-zlib",
                "--with-mysqli=mysqlnd", "--with-pdo-mysql=mysqlnd", "--with-pdo-pgsql", "--with-sqlite3",
                "--enable-intl", "--enable-gd", "--enable-fileinfo", "--with-jpeg", "--with-webp", "--with-freetype", "--enable-soap",
            ]
            self._update(job_id, progress=25, message=f"Configuring PHP {requested_version} with FPM and web extensions…", log=[f"$ {' '.join(configure)}"])
            result = subprocess.run(configure, cwd=source, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                raise RuntimeError((result.stderr or result.stdout).strip()[-3000:] or "PHP configure failed")
            jobs = str(max(1, min(os.cpu_count() or 1, 4)))
            self._update(job_id, progress=45, message="Compiling PHP…", log=[f"$ make -j{jobs}"])
            result = subprocess.run(["make", f"-j{jobs}"], cwd=source, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                raise RuntimeError((result.stderr or result.stdout).strip()[-3000:] or "PHP compilation failed")
            self._update(job_id, progress=80, message="Installing PHP into the isolated Server Engine runtime…", log=["$ make install"])
            result = subprocess.run(["make", "install"], cwd=source, capture_output=True, text=True, check=False)
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
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_isolated_package(self, job_id: str, service_id: str, requested_version: str, package_override: str | None = None):
        if service_id in {"apache", "mariadb", "stalwart", "mongodb", "opensearch", "wp-cli", "postfix", "dovecot", "rspamd", "bind9", "unbound", "clamav", "supervisor", "lynis", "openlitespeed"}:
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
            metadata = subprocess.run([apt, "update"], check=False, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
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
            process = subprocess.Popen([apt, "download", *packages], cwd=package_dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            output = []
            for line in process.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, progress=min(65, 25 + len(output)), message=f"Downloading {service_id} packages…", log=output[-80:])
            if process.wait() != 0:
                raise RuntimeError(f"Unable to download isolated package {package}")
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
                        "launch=local\nlocal-address=0.0.0.0\nlocal-port=53\n"
                        "default-ttl=3600\napi=yes\nwebserver=yes\n"
                        "webserver-address=127.0.0.1\nwebserver-port=8081\n"
                        "webserver-allow-from=127.0.0.1,::1\n"
                    )
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
        root = service_root("openlitespeed")
        staging = root.parent / f".openlitespeed-{job_id}-staging"
        archive = root.parent / f"openlitespeed-{requested_version}.tar.gz"
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
            (root / ".serverengine-version").write_text(requested_version + "\n")
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
        root = service_root("openlitespeed")
        staging = root.parent / f".openlitespeed-{job_id}-prebuilt"
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
            (root / ".serverengine-version").write_text(requested_version + "\n")
            (root / ".serverengine-install-method").write_text("prebuilt\n")
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
        apt = shutil.which("apt-get")
        dpkg_deb = shutil.which("dpkg-deb")
        if not apt or not dpkg_deb:
            self._update(job_id, status="failed", message="The prebuilt Redis option requires apt-get and dpkg-deb. Choose source build on this host.")
            return
        root = service_root("redis")
        staging = root.parent / f".redis-{job_id}-prebuilt"
        package_dir = staging / "packages"
        try:
            shutil.rmtree(staging, ignore_errors=True)
            package_dir.mkdir(parents=True, exist_ok=True)
            exact_version = self._resolve_apt_version("redis-server", requested_version)
            self._update(job_id, status="running", progress=5, message=f"Downloading prebuilt Redis {requested_version}…", log=[f"$ apt-get download redis-server={exact_version}"])
            result = subprocess.run([apt, "download", f"redis-server={exact_version}"], cwd=package_dir, capture_output=True, text=True, check=False)
            download_log = (result.stdout + result.stderr).strip().splitlines()
            if download_log:
                self._update(job_id, progress=35, message="Redis package download output received.", log=download_log[-80:])
            if result.returncode != 0:
                raise RuntimeError((result.stderr or result.stdout).strip() or "The compatible Redis package could not be downloaded")
            archives = sorted(package_dir.glob("redis-server_*.deb"))
            if not archives:
                raise RuntimeError("The package provider returned no Redis archive for this OS and architecture")
            extracted = staging / "root"
            extracted.mkdir()
            self._update(job_id, progress=55, message="Extracting Redis into the Server Engine service area…")
            unpacked = subprocess.run([dpkg_deb, "-x", str(archives[-1]), str(extracted)], capture_output=True, text=True, check=False)
            if unpacked.returncode != 0:
                raise RuntimeError((unpacked.stderr or unpacked.stdout).strip() or "Redis package extraction failed")
            if root.exists():
                shutil.rmtree(root)
            root.mkdir(parents=True, exist_ok=True)
            for item in extracted.iterdir():
                target = root / item.name
                if item.is_dir():
                    shutil.copytree(item, target, dirs_exist_ok=True)
                else:
                    shutil.copy2(item, target)
            (root / ".serverengine-version").write_text(requested_version + "\n")
            for directory in (root / "conf", root / "data", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            config = root / "conf/redis.conf"
            if not config.exists():
                config.write_text(f"bind 127.0.0.1 ::1\nprotected-mode yes\nport 6379\ndir {root / 'data'}\nlogfile {root / 'logs/redis.log'}\npidfile {root / 'run/redis.pid'}\ndaemonize no\n")
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
        root = service_root("redis")
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
            for directory in (root / "conf", root / "data", root / "logs", root / "run"):
                directory.mkdir(parents=True, exist_ok=True)
            config = root / "conf/redis.conf"
            if not config.exists():
                config.write_text(f"bind 127.0.0.1 ::1\nprotected-mode yes\nport 6379\ndir {root / 'data'}\nlogfile {root / 'logs/redis.log'}\npidfile {root / 'run/redis.pid'}\ndaemonize no\n")
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
            self._update(job_id, status="succeeded", progress=100, message=f"PostgreSQL {requested_version} is installed in {root}; the host PostgreSQL package and service were not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_caddy_binary(self, job_id: str, requested_version: str):
        source_url = caddy_source_for(requested_version)
        if not source_url:
            try:
                definition, _, _ = refresh_service_versions("caddy")
                source_url = caddy_source_for(requested_version) if any(item.version == requested_version for item in definition.versions) else None
            except Exception:
                source_url = None
        go = shutil.which("go")
        if not source_url or not go:
            self._update(job_id, status="failed", message="Caddy source or Go 1.20+ is unavailable. Install the isolated build toolchain, then refresh and retry.")
            return
        root = service_root("caddy")
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
            command = [go, "build", "-trimpath", "-ldflags", f"-X github.com/caddyserver/caddy/v2.CustomVersion=v{requested_version}", "-o", str(root / "bin/caddy"), "./cmd/caddy"]
            self._update(job_id, progress=35, message=f"Building Caddy {requested_version} from source…", log=[f"$ {' '.join(command)}"])
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
            self._update(job_id, status="failed", message="Stalwart needs the Rust compiler and Cargo to build its isolated binary. Install the Server Engine build dependencies, then retry; no host mail package is required.")
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
            command = [cargo, "build", "--release", "--locked", "--bin", "stalwart"]
            self._update(job_id, progress=40, message=f"Compiling Stalwart {requested_version} with Cargo…", log=[f"$ {' '.join(command)}"])
            build = subprocess.Popen(command, cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
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
        root = service_root("nginx")
        staging = root.parent / f".nginx-{job_id}-staging"
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
            configure = [
                str(source / "configure"), f"--prefix={root}", f"--sbin-path={root / 'bin/nginx'}",
                f"--conf-path={root / 'conf/nginx.conf'}", f"--pid-path={root / 'run/nginx.pid'}",
                f"--error-log-path={root / 'logs/error.log'}", f"--http-log-path={root / 'logs/access.log'}",
                f"--http-client-body-temp-path={root / 'data/client_temp'}", f"--http-proxy-temp-path={root / 'data/proxy_temp'}",
                f"--http-fastcgi-temp-path={root / 'data/fastcgi_temp'}", "--with-http_ssl_module", "--with-http_v2_module",
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
            (root / ".serverengine-version").write_text(requested_version)
            ensure_nginx_layout()
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
        root = service_root("apache")
        staging = root.parent / f".apache-{job_id}-staging"
        archive = root.parent / f"apache-{requested_version}.tar.gz"
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
            (root / ".serverengine-version").write_text(requested_version)
            self._update(job_id, status="succeeded", progress=100, message=f"Apache {requested_version} is installed in {root}; the host Apache package and service were not changed.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

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
            url = f"https://www.openssl.org/source/old/1.0.2/openssl-{requested_version}.tar.gz"
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
            self._update(job_id, progress=39, message=f"Compiling reusable OpenSSL {requested_version}…", log=[f"$ {make} -j2"])
            built = subprocess.run([make, "-j2"], cwd=source, capture_output=True, text=True, check=False)
            if built.returncode != 0:
                raise RuntimeError("OpenSSL build failed: " + (built.stderr or built.stdout).strip()[-1200:])
            if root.exists():
                shutil.rmtree(root)
            installed = subprocess.run([make, "install_sw"], cwd=source, capture_output=True, text=True, check=False)
            if installed.returncode != 0:
                raise RuntimeError("OpenSSL installation failed: " + (installed.stderr or installed.stdout).strip()[-1200:])
            marker.write_text(requested_version + "\n")
            return root
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

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
        paths = nginx_paths()
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The app-root installer must run with privileges to stage the service binary.")
            return
        apt = shutil.which("apt-get")
        dpkg = shutil.which("dpkg-deb")
        if not apt or not dpkg:
            self._update(job_id, status="failed", message="The isolated Nginx adapter currently supports Debian/Ubuntu package extraction.")
            return
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
            ensure_nginx_layout()
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
