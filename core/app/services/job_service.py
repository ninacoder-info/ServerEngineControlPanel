from datetime import datetime, timezone
import json
import os
import pwd
import platform
import tarfile
import urllib.request
import re
import shutil
import subprocess
from pathlib import Path
from threading import Event, Thread
from threading import Lock

from app.models.job import JobSummary
from app.services.service_runtime import PHP_BASELINE_MODULES, SERVICE_PACKAGES, binary_path, enable_php_baseline_extensions, ensure_composer_cache, ensure_nginx_layout, ensure_node_runtime, ensure_php_fpm_layout, nginx_paths, package_for, php_cli_path, php_fpm_paths, service_root


class InstallCancelled(Exception):
    pass


class JobStore:
    """Background installer queue for the local privileged control-plane process."""

    def __init__(self):
        self._jobs: dict[str, JobSummary] = {}
        self._cancel_events: dict[str, Event] = {}
        self._lock = Lock()

    def create(self, job_id: str, job_type: str) -> JobSummary:
        job = JobSummary(id=job_id, type=job_type, status="queued", created_at=datetime.now(timezone.utc))
        with self._lock:
            self._jobs[job_id] = job
            self._cancel_events[job_id] = Event()
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
                "message": "Cancellation requested. Rolling back staged files…",
                "updated_at": datetime.now(timezone.utc),
            })
            self._jobs[job_id] = cancelled
            return cancelled

    def _is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            event = self._cancel_events.get(job_id)
            return bool(event and event.is_set())

    def _raise_if_cancelled(self, job_id: str):
        if self._is_cancelled(job_id):
            raise InstallCancelled()

    def enqueue_install(self, job_id: str, service_id: str, requested_version: str) -> JobSummary:
        job = self.create(job_id, f"Install {service_id} {requested_version}")
        Thread(target=self._run_install, args=(job_id, service_id, requested_version), daemon=True).start()
        return job

    def enqueue_action(self, job_id: str, service_id: str, action: str, version: str | None = None) -> JobSummary:
        job = self.create(job_id, f"{action.title()} {service_id}" + (f" {version}" if version else ""))
        Thread(target=self._run_action, args=(job_id, service_id, action, version), daemon=True).start()
        return job

    def enqueue_extension(self, job_id: str, version: str, extension: str) -> JobSummary:
        job = self.create(job_id, f"Install PHP {version} extension {extension}")
        Thread(target=self._run_extension_install, args=(job_id, version, extension), daemon=True).start()
        return job

    def _run_extension_install(self, job_id: str, version: str, extension: str):
        package = f"php{version}-{extension}"
        self._run_isolated_package(job_id, "php", version, package_override=package)
        with self._lock:
            job = self._jobs.get(job_id)
        if not job or job.status != "succeeded":
            return
        root = service_root("php", version)
        module_names = PHP_BASELINE_MODULES.get(extension, (extension,))
        shared_object = next((candidate for name in module_names for candidate in root.glob(f"usr/lib/php/*/{name}.so")), None)
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
        if service_id == "vsftpd":
            self._run_vsftpd_action(job_id, action)
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
                library_paths = [php["root"] / item for item in ("lib", "usr/lib", "lib/aarch64-linux-gnu", "usr/lib/aarch64-linux-gnu", "lib/x86_64-linux-gnu", "usr/lib/x86_64-linux-gnu")]
                runtime_env["LD_LIBRARY_PATH"] = ":".join(str(item) for item in library_paths if item.exists())
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
            for path in (config.parent, pid_file.parent, log_file.parent, root / "empty"):
                path.mkdir(parents=True, exist_ok=True)
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
                config.write_text("[mysqld]\nbind-address=127.0.0.1\nport=3306\ndatadir=" + str(data) + "\nlog-error=" + str(error_log) + "\nslow_query_log=ON\nmax_connections=151\nsql_mode=STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION\n\n[client]\nport=3306\n")
            if action == "stop":
                self._stop_mysql_process(binary, pid_file)
                self._update(job_id, status="succeeded", message=f"{label} stopped.", log=[])
                return
            if action == "restart":
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
            command = [str(binary), f"--defaults-file={config}", f"--basedir={root}", f"--datadir={data}", f"--pid-file={pid_file}", f"--socket={run / 'mysql.sock'}", f"--log-error={error_log}", f"--user={user}"]
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
            useradd = shutil.which("useradd")
            if not useradd:
                raise RuntimeError("The isolated MySQL service account serverengine is missing and useradd is unavailable")
            result = subprocess.run([useradd, "--system", "--home-dir", "/nonexistent", "--shell", "/usr/sbin/nologin", "serverengine"], capture_output=True, text=True, check=False)
            if result.returncode != 0 and "already exists" not in (result.stderr or ""):
                raise RuntimeError("Unable to create the isolated MySQL service account: " + (result.stderr or result.stdout).strip())
            return "serverengine"

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
    def _stop_process_by_binary(self, binary: Path, pid_file: Path | None = None):
        """Terminate a managed process without requiring pkill or pgrep."""
        pids = []
        if pid_file and pid_file.exists():
            try:
                pids.append(int(pid_file.read_text().strip()))
            except ValueError:
                pass
        if not pids:
            pgrep = shutil.which("pgrep")
            if pgrep:
                result = subprocess.run([pgrep, "-f", str(binary)], capture_output=True, text=True, check=False)
                pids = [int(item) for item in result.stdout.split() if item.isdigit()]
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
        for pid in pids:
            try:
                os.kill(pid, 15)
            except (ProcessLookupError, PermissionError):
                pass

    def _stop_mysql_process(self, binary: Path, pid_file: Path):
        self._stop_process_by_binary(binary, pid_file)

    def _update(self, job_id: str, **changes):
        with self._lock:
            current = self._jobs[job_id]
            if current.status == "cancelled" and changes.get("status") != "cancelled":
                return
            self._jobs[job_id] = current.model_copy(update={"updated_at": datetime.now(timezone.utc), **changes})

    def _run_install(self, job_id: str, service_id: str, requested_version: str):
        self._run_isolated_package(job_id, service_id, requested_version)

    def _prepare_node_runtime(self, root: Path):
        node = root / "usr/bin/node"
        real_node = root / "usr/bin/node.bin"
        if not node.exists() or node.is_symlink():
            return
        if not real_node.exists():
            node.rename(real_node)
        library_paths = [root / "lib", root / "usr/lib", root / "lib/aarch64-linux-gnu", root / "usr/lib/aarch64-linux-gnu", root / "lib/x86_64-linux-gnu", root / "usr/lib/x86_64-linux-gnu"]
        paths = ":".join(str(item) for item in library_paths if item.exists())
        node.write_text(f"#!/bin/sh\nexport LD_LIBRARY_PATH=\"{paths}:$LD_LIBRARY_PATH\"\nexec \"{real_node}\" \"$@\"\n")
        node.chmod(0o755)

    def _run_isolated_package(self, job_id: str, service_id: str, requested_version: str, package_override: str | None = None):
        if service_id == "mysql":
            self._run_mysql_binary(job_id, requested_version)
            return
        if service_id == "nodejs":
            self._run_node_binary(job_id, requested_version)
            return
        if service_id == "composer":
            self._run_composer_binary(job_id, requested_version)
            return
        package = package_for(service_id)
        root = service_root(service_id, requested_version if service_id == "nodejs" else None)
        packages = [package] if package else []
        if service_id == "php":
            normalized = requested_version.removeprefix("php")
            package = package_override or f"php{normalized}-fpm"
            packages = [package, f"php{normalized}-cli", f"php{normalized}-common", "unzip"]
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
            self._update(job_id, status="running", progress=2, message=f"Preparing {service_id} {requested_version}…", log=[])
            metadata = subprocess.run([apt, "update"], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            metadata_log = [line.strip() for line in metadata.stdout.splitlines() if line.strip()][-20:]
            self._update(job_id, progress=8, message="Package metadata is ready. Resolving runtime dependencies…", log=metadata_log)
            apt_cache = shutil.which("apt-cache")
            packages = [item for item in packages if item]
            if service_id == "php" and apt_cache:
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
                    common_modules = ("cli", "mysql", "curl", "mbstring", "xml", "gd", "zip", "intl", "bcmath", "opcache", "igbinary", "redis")
                    for module in common_modules:
                        candidate = f"php{normalized}-{module}"
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
            (root / ".serverengine-version").write_text(requested_version)
            for deb in debs:
                deb.unlink(missing_ok=True)
            package_dir.rmdir()
            self._update(job_id, progress=92, message=f"Configuring {service_id} runtime files and default extensions…")
            if service_id == "nginx":
                ensure_nginx_layout()
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

    def _run_composer_binary(self, job_id: str, requested_version: str):
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="Composer installation requires privileges to create the isolated tool directory.")
            return
        php_root = service_root("php") / "versions"
        php_versions = sorted((item for item in php_root.iterdir() if item.is_dir()), reverse=True) if php_root.exists() else []
        php_version = next((item.name for item in php_versions if php_cli_path(item.name).exists()), None)
        if not php_version:
            self._update(job_id, status="failed", message="Install a PHP runtime first. Composer uses the newest isolated PHP CLI.")
            return
        root = service_root("composer") / "versions" / requested_version
        archive = root / "composer.phar"
        try:
            root.mkdir(parents=True, exist_ok=True)
            (root / "bin").mkdir(parents=True, exist_ok=True)
            if not archive.exists() or archive.stat().st_size < 1000:
                self._update(job_id, status="running", progress=10, message=f"Downloading Composer for isolated PHP {php_version}…", log=[])
                with urllib.request.urlopen("https://getcomposer.org/download/latest-stable/composer.phar", timeout=60) as response, archive.open("wb") as destination:
                    data = response.read()
                    self._raise_if_cancelled(job_id)
                    destination.write(data)
            else:
                self._update(job_id, status="running", progress=70, message=f"Using the downloaded Composer PHAR with isolated PHP {php_version}…", log=[])
            archive.chmod(0o755)
            php = php_cli_path(php_version)
            ensure_php_fpm_layout(php_version)
            launcher = root / "bin/composer"
            php_root_path = service_root("php", php_version)
            library_paths = {php_root_path / "lib", php_root_path / "lib64", php_root_path / "usr/lib", php_root_path / "usr/lib64"}
            library_paths.update(library.parent for library in php_root_path.rglob("*.so*") if library.is_file() or library.is_symlink())
            libraries = ":".join(str(path) for path in library_paths if path.exists())
            extension_dir = next(iter(sorted(php_root_path.glob("usr/lib/php/*"))), None)
            phar = extension_dir / "phar.so" if extension_dir else None
            php_extensions = [module for module in ("phar.so", "iconv.so") if extension_dir and (extension_dir / module).exists()]
            extension_flags = " ".join(f"-d extension=\"{extension_dir / module}\"" for module in php_extensions)
            php_options = f" -d extension_dir=\"{extension_dir}\" {extension_flags}" if extension_dir else ""
            php_ini = php_root_path / "conf/php.ini"
            composer_home = ensure_composer_cache()
            launcher.write_text(f"#!/bin/sh\nexport LD_LIBRARY_PATH=\"{libraries}:$LD_LIBRARY_PATH\"\nexport COMPOSER_HOME=\"{composer_home}\"\nexec \"{php}\" -c \"{php_ini}\"{php_options} \"{archive}\" \"$@\"\n")
            launcher.chmod(0o755)
            (root / ".serverengine-version").write_text(requested_version)
            result = subprocess.run([str(launcher), "--version"], capture_output=True, text=True, check=False, timeout=30)
            if result.returncode != 0:
                raise RuntimeError((result.stderr or result.stdout).strip() or "Composer could not start with the installed isolated PHP runtime")
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
            ensure_node_runtime(root)
            self._update(job_id, status="succeeded", progress=100, message=f"Node.js {full_version} installed in {root}.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(staging, ignore_errors=True)

    def _run_mysql_binary(self, job_id: str, requested_version: str):
        releases = {"8.4": "8.4.11", "8.0": "8.0.46", "5.7": "5.7.44"}
        release = releases.get(requested_version)
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
        root = service_root("mysql")
        archive = root.parent / f"mysql-{release}-{architecture}.tar.xz"
        staging = root.parent / f".mysql-{job_id}-staging"
        backup = root.parent / f".mysql-{job_id}-backup"
        url = f"https://dev.mysql.com/get/Downloads/MySQL-{requested_version}/mysql-{release}-linux-glibc2.28-{architecture}.tar.xz"
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
            with tarfile.open(archive, mode="r:xz") as package:
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
        package = {"nginx": "nginx", "apache": "apache2", "php": "php-fpm", "nodejs": "nodejs", "python": "python3", "mariadb": "mariadb-server", "mysql": "mysql-server", "postgresql": "postgresql", "redis": "redis-server", "memcached": "memcached", "certbot": "certbot", "vsftpd": "vsftpd", "fail2ban": "fail2ban"}.get(service_id)
        if not package:
            self._update(job_id, status="failed", message=f"No installer adapter exists for {service_id} yet.")
            return
        if os.geteuid() != 0:
            self._update(job_id, status="failed", message="The installer agent must run as root or through a configured privileged helper.")
            return
        apt = shutil.which("apt-get")
        if not apt:
            self._update(job_id, status="failed", message="This test installer currently supports Debian/Ubuntu apt-based hosts.")
            return
        try:
            self._update(job_id, status="running", message=f"Installing distro package {package}; requested version {requested_version}.", log=[])
            for command in ([apt, "update"], [apt, "install", "-y", "--no-install-recommends", package]):
                process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                output = []
                for line in process.stdout or []:
                    line = line.rstrip()
                    if line:
                        output.append(line)
                        self._update(job_id, log=output[-80:])
                if process.wait() != 0:
                    raise RuntimeError(f"Command failed: {' '.join(command)}")
            self._update(job_id, status="succeeded", message=f"{package} installed. The distro selected the available package for requested version {requested_version}.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

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
            if paths["binary"].exists() and not _managed_process_alive(paths["pid"]):
                job_store.enqueue_action(f"startup-php-{version}", "php", "start", version)

    nginx = nginx_paths()
    apache_root = service_root("apache")
    if nginx["binary"].exists() and nginx["config"].exists() and not _managed_process_alive(nginx["pid"]):
        job_store.enqueue_action("startup-nginx", "nginx", "start")
    elif (apache_root / "usr/sbin/apache2").exists() and (apache_root / "conf/httpd.conf").exists() and not _managed_process_alive(apache_root / "run/httpd.pid"):
        job_store.enqueue_action("startup-apache", "apache", "start")

    database = next((service_id for service_id in ("mysql", "mariadb") if binary_path(service_id).exists()), None)
    if database:
        pid_file = service_root(database) / "run/mysqld.pid"
        if not _managed_process_alive(pid_file):
            job_store.enqueue_action(f"startup-{database}", database, "start")

    ftp_root = service_root("vsftpd")
    if binary_path("vsftpd").exists() and not _managed_process_alive(ftp_root / "run/vsftpd.pid"):
        job_store.enqueue_action("startup-vsftpd", "vsftpd", "start")
