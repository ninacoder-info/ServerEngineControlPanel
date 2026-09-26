from datetime import datetime, timezone
import os
import re
import shutil
import subprocess
from threading import Thread
from threading import Lock

from app.models.job import JobSummary
from app.services.service_runtime import SERVICE_PACKAGES, binary_path, ensure_nginx_layout, ensure_php_fpm_layout, nginx_paths, package_for, php_fpm_paths, service_root


class JobStore:
    """Background installer queue for the local privileged control-plane process."""

    def __init__(self):
        self._jobs: dict[str, JobSummary] = {}
        self._lock = Lock()

    def create(self, job_id: str, job_type: str) -> JobSummary:
        job = JobSummary(id=job_id, type=job_type, status="queued", created_at=datetime.now(timezone.utc))
        with self._lock:
            self._jobs[job_id] = job
        return job

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
        shared_object = next(root.glob(f"usr/lib/php/*/{extension}.so"), None)
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
        nginx = nginx_paths()
        commands = {
            "nginx": {"start": [str(nginx["binary"]), "-p", str(nginx["root"]), "-c", str(nginx["config"])], "stop": [str(nginx["binary"]), "-p", str(nginx["root"]), "-c", str(nginx["config"]), "-s", "stop"], "restart": [str(nginx["binary"]), "-p", str(nginx["root"]), "-c", str(nginx["config"]), "-s", "reload"]},
        }
        php = php_fpm_paths(version) if service_id == "php" and version else None
        if php:
            ensure_php_fpm_layout(version)
            command = [str(php["binary"]), "--nodaemonize", "--fpm-config", str(php["config"])] if action in {"start", "restart"} else None
        else:
            command = commands.get(service_id, {}).get(action)
        if command is None:
            if php and action == "stop":
                subprocess.run(["pkill", "-TERM", "-f", str(php["binary"])], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
                    subprocess.run(["pkill", "-TERM", "-f", str(php["binary"])], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    import time
                    time.sleep(0.4)
                runtime_env = os.environ.copy()
                library_paths = [php["root"] / item for item in ("lib", "usr/lib", "lib/aarch64-linux-gnu", "usr/lib/aarch64-linux-gnu", "lib/x86_64-linux-gnu", "usr/lib/x86_64-linux-gnu")]
                runtime_env["LD_LIBRARY_PATH"] = ":".join(str(item) for item in library_paths if item.exists())
                with php["error_log"].open("a") as log_file:
                    process = subprocess.Popen(command, stdout=log_file, stderr=subprocess.STDOUT, start_new_session=True, env=runtime_env)
                import time
                time.sleep(0.3)
                if process.poll() is not None:
                    raise RuntimeError(f"PHP-FPM exited with code {process.returncode}; inspect {php['error_log']}")
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

    def _update(self, job_id: str, **changes):
        with self._lock:
            current = self._jobs[job_id]
            self._jobs[job_id] = current.model_copy(update={"updated_at": datetime.now(timezone.utc), **changes})

    def _run_install(self, job_id: str, service_id: str, requested_version: str):
        self._run_isolated_package(job_id, service_id, requested_version)

    def _run_isolated_package(self, job_id: str, service_id: str, requested_version: str, package_override: str | None = None):
        package = package_for(service_id)
        root = service_root(service_id)
        if service_id == "php":
            normalized = requested_version.removeprefix("php")
            package = package_override or f"php{normalized}-fpm"
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
            self._update(job_id, status="running", message=f"Staging {service_id} inside {root}; the global OS package database will not be changed.", log=[])
            subprocess.run([apt, "update"], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            apt_cache = shutil.which("apt-cache")
            packages = [package]
            if apt_cache:
                dependency_output = subprocess.run([apt_cache, "depends", "--no-recommends", "--no-suggests", package], capture_output=True, text=True, check=False).stdout
                for line in dependency_output.splitlines():
                    match = re.match(r"\s+\|?(?:Depends|PreDepends):\s+([^\s|<>]+)", line)
                    if match and match.group(1) not in packages:
                        packages.append(match.group(1))
            process = subprocess.Popen([apt, "download", *packages], cwd=package_dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            output = []
            for line in process.stdout or []:
                if line.strip():
                    output.append(line.rstrip())
                    self._update(job_id, log=output[-80:])
            if process.wait() != 0:
                raise RuntimeError(f"Unable to download isolated package {package}")
            debs = sorted(package_dir.glob("*.deb"))
            if not debs:
                raise RuntimeError(f"Package archive {package} was not downloaded")
            for deb in debs:
                subprocess.run([dpkg, "-x", str(deb), str(root)], check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            (root / ".serverengine-version").write_text(requested_version)
            for deb in debs:
                deb.unlink(missing_ok=True)
            package_dir.rmdir()
            if service_id == "nginx":
                ensure_nginx_layout()
            (root / "logs").mkdir(exist_ok=True)
            (root / "run").mkdir(exist_ok=True)
            (root / "data").mkdir(exist_ok=True)
            self._update(job_id, status="succeeded", message=f"{service_id} staged in {root}. The global OS package database and configuration were not modified.")
        except Exception as error:
            self._update(job_id, status="failed", message=str(error))

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
