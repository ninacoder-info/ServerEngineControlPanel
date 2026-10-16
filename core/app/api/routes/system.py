import os
import json
import platform
import re
import socket
import shutil
import time
import subprocess
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Event, Lock, Thread
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import require_user
from app.services.job_service import job_store
from app.services.settings_service import settings_service
from app.version import APP_VERSION

router = APIRouter(prefix="/api/v1", tags=["system"])

_previous_network = None
_previous_metrics_at = None
_metrics_lock = Lock()
_history_lock = Lock()
_collector_stop = Event()
_collector_thread = None
_METRICS_INTERVAL_SECONDS = 5
_HISTORY_LIMIT = (7 * 24 * 60 * 60) // _METRICS_INTERVAL_SECONDS
HEALTH_THRESHOLD_DEFAULTS = {
    "cpu_warning": 70,
    "memory_warning": 80,
    "disk_critical": 90,
    "load_warning": 1.0,
}

UPDATE_REPOSITORY = os.getenv("SE_GITHUB_REPO", "ninacoder-info/ServerEngineControlPanel")
_UPDATE_CACHE_TTL = 24 * 60 * 60
_update_cache = None
_update_cache_lock = Lock()


def _github_release() -> dict:
    request = urllib.request.Request(
        f"https://api.github.com/repos/{UPDATE_REPOSITORY}/releases/latest",
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    token = os.getenv("SE_GITHUB_TOKEN", "").strip() or settings_service.github_token()
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def _github_changelog(tag: str) -> str:
    request = urllib.request.Request(
        f"https://api.github.com/repos/{UPDATE_REPOSITORY}/contents/CHANGELOG.md?ref={quote(tag)}",
        headers={
            "Accept": "application/vnd.github.raw+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    token = os.getenv("SE_GITHUB_TOKEN", "").strip() or settings_service.github_token()
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.read().decode("utf-8")


def _release_changelog_section(markdown: str, version: str) -> str:
    lines = markdown.splitlines()
    heading = re.compile(rf"^##\s+\[?v?{re.escape(version)}\]?\s*$", re.IGNORECASE)
    start = next((index for index, line in enumerate(lines) if heading.match(line.strip())), None)
    if start is None:
        # Never return the complete document here: that can surface an
        # unrelated `Unreleased` section when this version is absent.
        return ""
    end = next((index for index in range(start + 1, len(lines)) if re.match(r"^##\s+", lines[index])), len(lines))
    return "\n".join(lines[start:end]).strip()


def _version_tuple(value: str) -> tuple[int, int, int]:
    parts = str(value or "0.0.0").lstrip("v").split(".")
    numbers = []
    for part in parts[:3]:
        digits = "".join(character for character in part if character.isdigit())
        numbers.append(int(digits or 0))
    return tuple((numbers + [0, 0, 0])[:3])


@router.get("/system/update")
def check_for_panel_update(refresh: bool = Query(default=False), user=Depends(require_user)):
    global _update_cache
    current = APP_VERSION
    with _update_cache_lock:
        if not refresh and _update_cache and time.time() - _update_cache["checked_at"] < _UPDATE_CACHE_TTL:
            return _update_cache["data"]
    try:
        release = _github_release()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        status = getattr(error, "code", None)
        detail = "GitHub release check failed"
        if status == 404:
            detail = "The configured GitHub release is unavailable or requires a server-side token."
        result = {"current_version": current, "available": False, "checked": False, "message": detail}
        with _update_cache_lock:
            _update_cache = {"checked_at": time.time(), "data": result}
        return result
    latest = str(release.get("tag_name", "")).lstrip("v")
    # The release body is the authoritative content shown on the GitHub
    # release page.  Do not replace it with CHANGELOG.md: the changelog may
    # not have been committed to the tagged repository yet, and that would
    # make the updater display an unrelated Unreleased section.
    notes = str(release.get("body") or "").strip()
    if not notes and latest:
        try:
            notes = _release_changelog_section(_github_changelog(str(release.get("tag_name", latest))), latest)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, UnicodeDecodeError):
            notes = ""
    notes = notes or "No release notes were published for this version."
    result = {
        "current_version": current,
        "latest_version": latest,
        "available": bool(latest and _version_tuple(latest) > _version_tuple(current)),
        "checked": True,
        "repository": UPDATE_REPOSITORY,
        "release_url": release.get("html_url", ""),
        "published_at": release.get("published_at"),
        "name": release.get("name") or f"Server Engine v{latest}",
        "notes": notes,
    }
    with _update_cache_lock:
        _update_cache = {"checked_at": time.time(), "data": result}
    return result


@router.post("/system/update")
def update_panel(user=Depends(require_user)):
    """Start the installer and let it replace the panel after this response."""
    helper = "/usr/local/sbin/server-engine-update"
    if not Path(helper).is_file():
        raise HTTPException(status_code=503, detail="The panel updater is not installed. Run the latest Server Engine installer once before using panel updates.")
    job_id = f"panel-update-{uuid.uuid4().hex}"
    installer_log = Path(os.getenv("SE_LOG_ROOT", "/server-engine/logs")) / "panel-update.log"
    installer_log.parent.mkdir(parents=True, exist_ok=True)
    with installer_log.open("a") as stream:
        stream.write(f"Starting panel update {job_id}.\n")
        stream.flush()
        subprocess.Popen(
            ["/usr/bin/sudo", "-n", helper],
            stdout=stream,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
        )
    job_store.publish({
        "type": "panel-update",
        "status": "started",
        "job_id": job_id,
        "message": "Panel update started. Server Engine will restart when the replacement is ready.",
    })
    return {"status": "started", "job_id": job_id, "log": str(installer_log)}


def _history_path() -> Path:
    return Path(os.getenv("SE_LOG_ROOT", "/server-engine/logs")) / "metrics-history.json"


def _read_history() -> list[dict]:
    try:
        value = json.loads(_history_path().read_text())
        return value if isinstance(value, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _record_history(sample: dict) -> None:
    item = {"timestamp": sample["timestamp"].isoformat(), **{key: sample[key] for key in ("cpu", "memory", "disk", "network")}}
    with _history_lock:
        path = _history_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        history = _read_history()
        if history and history[-1].get("timestamp") == item["timestamp"]:
            history[-1] = item
        else:
            history.append(item)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(history[-_HISTORY_LIMIT:], separators=(",", ":")) + "\n")
        temporary.replace(path)


def _collect_and_publish() -> None:
    try:
        sample = _collect_metrics()
        _record_history(sample)
        job_store.publish({"type": "metrics", "metrics": {**sample, "timestamp": sample["timestamp"].isoformat()}})
    except (OSError, ValueError, ZeroDivisionError):
        return


def _collector() -> None:
    while not _collector_stop.is_set():
        _collect_and_publish()
        _collector_stop.wait(_METRICS_INTERVAL_SECONDS)


def start_metrics_collector() -> None:
    global _collector_thread
    if _collector_thread and _collector_thread.is_alive():
        return
    _collector_stop.clear()
    _collector_thread = Thread(target=_collector, name="server-engine-metrics", daemon=True)
    _collector_thread.start()


def stop_metrics_collector() -> None:
    _collector_stop.set()


def _cpu_times():
    with open("/proc/stat", encoding="utf-8") as stream:
        values = stream.readline().split()[1:]
    numbers = [int(value) for value in values]
    return sum(numbers), numbers[3] + (numbers[4] if len(numbers) > 4 else 0)


def _cpu_breakdown() -> tuple[int, int, int, int]:
    with open("/proc/stat", encoding="utf-8") as stream:
        values = [int(value) for value in stream.readline().split()[1:]]
    user = values[0] + (values[1] if len(values) > 1 else 0)
    system = values[2] if len(values) > 2 else 0
    total = sum(values)
    idle = max(total - user - system, 0)
    return total, user, system, idle


def _top_processes(limit: int = 8) -> list[dict]:
    processes = []
    try:
        result = subprocess.run(
            ["ps", "-eo", "pid=,comm=,pcpu=,pmem=", "--sort=-pcpu"],
            check=False,
            capture_output=True,
            text=True,
            timeout=2,
        )
        for line in result.stdout.splitlines()[:limit]:
            columns = line.split(None, 3)
            if len(columns) != 4:
                continue
            try:
                processes.append({
                    "pid": int(columns[0]),
                    "name": columns[1],
                    "cpu": round(float(columns[2]), 1),
                    "memory": round(float(columns[3]), 1),
                })
            except ValueError:
                continue
    except (OSError, subprocess.SubprocessError):
        pass
    return processes


def _network_bytes():
    received = sent = 0
    with open("/proc/net/dev", encoding="utf-8") as stream:
        for line in stream:
            if ":" not in line:
                continue
            _, values = line.split(":", 1)
            columns = values.split()
            if len(columns) >= 9:
                received += int(columns[0])
                sent += int(columns[8])
    return received, sent


def _collect_metrics():
    global _previous_network, _previous_metrics_at

    with _metrics_lock:
        cpu_start = _cpu_breakdown()
        network_start = _network_bytes()
        time.sleep(0.08)
        cpu_end = _cpu_breakdown()
        network_end = _network_bytes()
        now = time.monotonic()

        total_delta = cpu_end[0] - cpu_start[0]
        user_delta = cpu_end[1] - cpu_start[1]
        system_delta = cpu_end[2] - cpu_start[2]
        idle_delta = cpu_end[3] - cpu_start[3]
        cpu_percent = round(
            max(0, min(100, (1 - idle_delta / total_delta) * 100))
            if total_delta
            else 0,
            1,
        )

        if _previous_network and _previous_metrics_at:
            elapsed = max(now - _previous_metrics_at, 0.001)
            download_rate = max(
                0, (network_end[0] - _previous_network[0]) / elapsed
            )
            upload_rate = max(
                0, (network_end[1] - _previous_network[1]) / elapsed
            )
        else:
            download_rate = upload_rate = 0
        _previous_network = network_end
        _previous_metrics_at = now

    memory = {}
    with open("/proc/meminfo", encoding="utf-8") as stream:
        for line in stream:
            key, value = line.split(":", 1)
            memory[key] = int(value.strip().split()[0]) * 1024
    total_memory = memory.get("MemTotal", 0)
    available_memory = memory.get("MemAvailable", memory.get("MemFree", 0))
    used_memory = max(total_memory - available_memory, 0)

    disk = os.statvfs("/")
    total_disk = disk.f_blocks * disk.f_frsize
    free_disk = disk.f_bavail * disk.f_frsize
    used_disk = max(total_disk - free_disk, 0)

    return {
        "timestamp": datetime.now(timezone.utc),
        "cpu": {
            "percent": cpu_percent,
            "user": round(user_delta / total_delta * 100, 1) if total_delta else 0,
            "system": round(system_delta / total_delta * 100, 1) if total_delta else 0,
            "idle": round(idle_delta / total_delta * 100, 1) if total_delta else 100,
            "load": round(os.getloadavg()[0], 2),
            "load1": round(os.getloadavg()[0], 2),
            "load5": round(os.getloadavg()[1], 2),
            "load15": round(os.getloadavg()[2], 2),
        },
        "processes": _top_processes(),
        "memory": {"used": used_memory, "total": total_memory, "percent": round(used_memory / total_memory * 100, 1) if total_memory else 0},
        "disk": {"used": used_disk, "total": total_disk, "percent": round(used_disk / total_disk * 100, 1) if total_disk else 0},
        "network": {"download": round(download_rate), "upload": round(upload_rate)},
    }


def _temperature_sensors() -> list[dict]:
    """Read temperatures exposed by Linux hwmon and thermal-zone devices."""
    sensors = []
    seen = set()
    hwmon_root = Path("/sys/class/hwmon")
    for device in sorted(hwmon_root.glob("hwmon*")):
        try:
            name = (device / "name").read_text(encoding="utf-8").strip()
        except OSError:
            name = device.name
        for input_path in sorted(device.glob("temp*_input")):
            try:
                millidegrees = int(input_path.read_text(encoding="utf-8").strip())
                temperature = round(millidegrees / 1000, 1)
            except (OSError, ValueError):
                continue
            index = input_path.name.removesuffix("_input")
            label_path = device / f"{index}_label"
            try:
                label = label_path.read_text(encoding="utf-8").strip()
            except OSError:
                label = index.replace("_", " ").title()
            display_name = f"{name} {label}".strip()
            key = display_name.lower()
            if key in seen:
                continue
            seen.add(key)
            sensors.append({"name": display_name, "temperature": temperature, "source": "hwmon"})

    thermal_root = Path("/sys/class/thermal")
    for zone in sorted(thermal_root.glob("thermal_zone*")):
        try:
            millidegrees = int((zone / "temp").read_text(encoding="utf-8").strip())
            temperature = round(millidegrees / 1000, 1)
        except (OSError, ValueError):
            continue
        try:
            label = (zone / "type").read_text(encoding="utf-8").strip()
        except OSError:
            label = zone.name
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        sensors.append({"name": label, "temperature": temperature, "source": "thermal-zone"})
    return sensors


@router.get("/metrics")
def metrics(user=Depends(require_user)):
    sample = _collect_metrics()
    _record_history(sample)
    return sample


@router.get("/metrics/history")
def metrics_history(window: str = "5m", user=Depends(require_user)):
    windows = {
        "5m": 5 * 60,
        "30m": 30 * 60,
        "1h": 60 * 60,
        "6h": 6 * 60 * 60,
        "24h": 24 * 60 * 60,
    }
    seconds = windows.get(window, windows["5m"])
    sample_count = max(1, seconds // _METRICS_INTERVAL_SECONDS)
    with _history_lock:
        history = _read_history()
    return {
        "window": window,
        "interval": f"{_METRICS_INTERVAL_SECONDS}s",
        "samples": history[-sample_count:],
    }


@router.get("/system/cpu-details")
def cpu_details(user=Depends(require_user)):
    """Return one CPU/process snapshot for the on-demand CPU inspector."""
    try:
        total_start, user_start, system_start, idle_start = _cpu_breakdown()
        time.sleep(0.08)
        total_end, user_end, system_end, idle_end = _cpu_breakdown()
        total_delta = max(total_end - total_start, 1)
        cpu = {
            "percent": round(max(0, min(100, (1 - (idle_end - idle_start) / total_delta) * 100)), 1),
            "user": round((user_end - user_start) / total_delta * 100, 1),
            "system": round((system_end - system_start) / total_delta * 100, 1),
            "idle": round((idle_end - idle_start) / total_delta * 100, 1),
            "load": [round(value, 2) for value in os.getloadavg()],
        }
    except (OSError, ValueError, IndexError, ZeroDivisionError):
        cpu = {"percent": 0, "user": 0, "system": 0, "idle": 100, "load": [0, 0, 0]}

    memory = {}
    try:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition(":")
            if separator:
                memory[key] = int(value.strip().split()[0]) * 1024
    except (OSError, ValueError, IndexError):
        pass
    total_memory = memory.get("MemTotal", 0)
    available_memory = memory.get("MemAvailable", memory.get("MemFree", 0))
    try:
        uptime_seconds = max(0, int(float(Path("/proc/uptime").read_text().split()[0])))
    except (OSError, ValueError, IndexError):
        uptime_seconds = 0
    return {
        "cpu": cpu,
        "processes": _top_processes(),
        "processor": {"cores": os.cpu_count() or 1},
        "memory": {
            "used": max(total_memory - available_memory, 0),
            "total": total_memory,
            "percent": round((total_memory - available_memory) / total_memory * 100, 1) if total_memory else 0,
        },
        "uptime_seconds": uptime_seconds,
    }


@router.get("/system/temperature-sensors")
def temperature_sensors(user=Depends(require_user)):
    sensors = _temperature_sensors()
    return {"available": bool(sensors), "sensors": sensors}


@router.get("/system/memory-details")
def memory_details(user=Depends(require_user)):
    """Return one memory/process snapshot for the on-demand memory inspector."""
    memory = {}
    try:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition(":")
            if separator:
                memory[key] = int(value.strip().split()[0]) * 1024
    except (OSError, ValueError, IndexError):
        pass

    total = memory.get("MemTotal", 0)
    available = memory.get("MemAvailable", memory.get("MemFree", 0))
    free = max(available, 0)
    used = max(total - free, 0)
    swap_total = memory.get("SwapTotal", 0)
    swap_free = memory.get("SwapFree", 0)
    swap_used = max(swap_total - swap_free, 0)
    categories = {
        "wired": memory.get("SReclaimable", 0) + memory.get("SUnreclaim", 0),
        "active": memory.get("Active", 0),
        "compressed": memory.get("SwapCached", 0),
        "free": free,
    }

    processes = []
    try:
        result = subprocess.run(
            ["ps", "-eo", "pid=,comm=,pmem=,rss=", "--sort=-rss"],
            check=False,
            capture_output=True,
            text=True,
            timeout=2,
        )
        for line in result.stdout.splitlines()[:8]:
            columns = line.split(None, 3)
            if len(columns) != 4:
                continue
            try:
                processes.append({
                    "pid": int(columns[0]),
                    "name": columns[1],
                    "percent": round(float(columns[2]), 1),
                    "bytes": int(columns[3]) * 1024,
                })
            except ValueError:
                continue
    except (OSError, subprocess.SubprocessError):
        pass

    pressure = 0
    try:
        pressure_line = next(
            line for line in Path("/proc/pressure/memory").read_text(encoding="utf-8").splitlines()
            if line.startswith("some ")
        )
        pressure_value = re.search(r"avg10=([0-9.]+)", pressure_line)
        pressure = round(float(pressure_value.group(1)), 1) if pressure_value else 0
    except (OSError, ValueError, AttributeError, StopIteration):
        pass

    paging = {}
    try:
        for line in Path("/proc/vmstat").read_text(encoding="utf-8").splitlines():
            key, value = line.split()[:2]
            if key in {"pgpgin", "pgpgout", "pswpin", "pswpout"}:
                paging[key] = int(value)
    except (OSError, ValueError, IndexError):
        pass

    return {
        "memory": {
            "total": total,
            "used": used,
            "free": free,
            "percent": round(used / total * 100, 1) if total else 0,
            "categories": categories,
        },
        "pressure": pressure,
        "processes": processes,
        "swap": {
            "total": swap_total,
            "used": swap_used,
            "free": swap_free,
            "percent": round(swap_used / swap_total * 100, 1) if swap_total else 0,
        },
        "paging": paging,
    }


@router.get("/system/network-details")
def network_details(user=Depends(require_user)):
    """Return interface information for the on-demand network inspector."""
    addresses = {}
    try:
        result = subprocess.run(
            ["ip", "-o", "-4", "addr", "show"],
            check=False,
            capture_output=True,
            text=True,
            timeout=2,
        )
        for line in result.stdout.splitlines():
            columns = line.split()
            if len(columns) >= 4:
                addresses[columns[1]] = columns[3].split("/", 1)[0]
    except (OSError, subprocess.SubprocessError):
        pass

    interfaces = []
    net_path = Path("/sys/class/net")
    try:
        for interface_path in sorted(net_path.iterdir()):
            name = interface_path.name
            if name == "lo":
                continue
            try:
                state = (interface_path / "operstate").read_text(encoding="utf-8").strip()
            except OSError:
                state = "unknown"
            interfaces.append({
                "name": name,
                "state": state,
                "connected": state == "up",
                "address": addresses.get(name, ""),
            })
    except OSError:
        pass

    public_ip = ""
    try:
        request = urllib.request.Request("https://api.ipify.org", headers={"User-Agent": "ServerEngine"})
        with urllib.request.urlopen(request, timeout=2) as response:
            public_ip = response.read().decode("utf-8").strip()
    except (OSError, urllib.error.URLError, TimeoutError, UnicodeDecodeError):
        pass

    return {"public_ip": public_ip, "interfaces": interfaces}


def _process_io_snapshot() -> dict[int, dict]:
    snapshot = {}
    for process_path in Path("/proc").iterdir():
        if not process_path.name.isdigit():
            continue
        try:
            values = {}
            for line in (process_path / "io").read_text(encoding="utf-8").splitlines():
                key, value = line.split(":", 1)
                if key in {"read_bytes", "write_bytes"}:
                    values[key] = int(value.strip())
            name = (process_path / "comm").read_text(encoding="utf-8").strip()
            snapshot[int(process_path.name)] = {
                "name": name,
                "read": values.get("read_bytes", 0),
                "write": values.get("write_bytes", 0),
            }
        except (OSError, ValueError, IndexError):
            continue
    return snapshot


@router.get("/system/disk-details")
def disk_details(user=Depends(require_user)):
    """Return filesystem and on-demand process disk I/O details."""
    disk = shutil.disk_usage("/")
    before = _process_io_snapshot()
    time.sleep(0.1)
    after = _process_io_snapshot()
    processes = []
    total_read = total_write = 0
    for pid, current in after.items():
        previous = before.get(pid, current)
        read = max(current["read"] - previous["read"], 0) * 10
        write = max(current["write"] - previous["write"], 0) * 10
        total_read += read
        total_write += write
        if read or write:
            processes.append({"pid": pid, "name": current["name"], "read": read, "write": write})
    processes.sort(key=lambda item: item["read"] + item["write"], reverse=True)
    return {
        "disks": [{
            "name": "Root filesystem",
            "path": "/",
            "total": disk.total,
            "used": disk.total - disk.free,
            "free": disk.free,
            "percent": round((disk.total - disk.free) / disk.total * 100, 1) if disk.total else 0,
        }],
        "io": {"read": total_read, "write": total_write},
        "processes": processes[:8],
    }


def _threshold_path() -> Path:
    return Path(os.getenv("SE_STATE_DIR", "/var/lib/server-engine")) / "health-thresholds.json"


@router.get("/health/thresholds")
def health_thresholds(user=Depends(require_user)):
    try:
        stored = json.loads(_threshold_path().read_text())
    except (OSError, json.JSONDecodeError):
        stored = {}
    return {**HEALTH_THRESHOLD_DEFAULTS, **{key: stored[key] for key in HEALTH_THRESHOLD_DEFAULTS if key in stored}}


@router.put("/health/thresholds")
def update_health_thresholds(payload: dict, user=Depends(require_user)):
    values = {}
    for key, default in HEALTH_THRESHOLD_DEFAULTS.items():
        value = payload.get(key, default)
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise HTTPException(status_code=422, detail=f"{key} must be numeric")
        maximum = 100 if key != "load_warning" else 1000
        if value <= 0 or value > maximum:
            raise HTTPException(status_code=422, detail=f"{key} is outside the supported range")
        values[key] = round(float(value), 2)
    path = _threshold_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(values, indent=2) + "\n")
    job_store.publish({"type": "health-thresholds", "thresholds": values})
    return values


@router.get("/health")
def health():
    return {"status": "ok", "service": "server-engine-core", "version": APP_VERSION, "timestamp": datetime.now(timezone.utc)}


def _os_release() -> dict[str, str]:
    values = {}
    try:
        for line in Path("/etc/os-release").read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition("=")
            if separator:
                values[key] = value.strip().strip('"')
    except OSError:
        pass
    return values


@router.get("/system/server-info")
def server_info(user=Depends(require_user)):
    """Return lightweight host information for the global Server inspector."""
    release = _os_release()
    try:
        uptime_seconds = max(0, int(float(Path("/proc/uptime").read_text().split()[0])))
    except (OSError, ValueError, IndexError):
        uptime_seconds = 0
    memory = {}
    try:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition(":")
            if separator:
                memory[key] = int(value.strip().split()[0]) * 1024
    except (OSError, ValueError, IndexError):
        memory = {}
    memory_total = memory.get("MemTotal", 0)
    memory_available = memory.get("MemAvailable", memory.get("MemFree", 0))
    memory_used = max(memory_total - memory_available, 0)
    disk = shutil.disk_usage("/")
    return {
        "hostname": socket.gethostname(),
        "os": {
            "name": release.get("PRETTY_NAME") or platform.system(),
            "kernel": platform.release(),
            "architecture": platform.machine(),
        },
        "uptime_seconds": uptime_seconds,
        "cpu": {
            "cores": os.cpu_count() or 1,
            "load": [round(value, 2) for value in os.getloadavg()],
        },
        "memory": {
            "total": memory_total,
            "used": memory_used,
            "available": memory_available,
            "percent": round(memory_used / memory_total * 100, 1) if memory_total else 0,
        },
        "disk": {
            "path": "/",
            "total": disk.total,
            "used": disk.total - disk.free,
            "free": disk.free,
            "percent": round((disk.total - disk.free) / disk.total * 100, 1) if disk.total else 0,
        },
        "server_engine": {"version": APP_VERSION, "python": platform.python_version()},
        "collected_at": datetime.now(timezone.utc),
    }


@router.get("/capabilities")
def capabilities(user=Depends(require_user)):
    return {"api_version": "v1", "agent_connected": False, "providers": []}
