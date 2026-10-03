import os
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from threading import Event, Lock, Thread

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import require_user
from app.services.job_service import job_store
from app.version import APP_VERSION

router = APIRouter(prefix="/api/v1", tags=["system"])

_previous_cpu = None
_previous_network = None
_previous_metrics_at = None
_history_lock = Lock()
_collector_stop = Event()
_collector_thread = None
_HISTORY_LIMIT = 10080  # one sample per minute for seven days
HEALTH_THRESHOLD_DEFAULTS = {
    "cpu_warning": 70,
    "memory_warning": 80,
    "disk_critical": 90,
    "load_warning": 1.0,
}


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
    while not _collector_stop.wait(60):
        _collect_and_publish()


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
    global _previous_cpu, _previous_network, _previous_metrics_at

    cpu_start = _cpu_times()
    network_start = _network_bytes()
    time.sleep(0.08)
    cpu_end = _cpu_times()
    network_end = _network_bytes()
    now = time.monotonic()

    total_delta = cpu_end[0] - cpu_start[0]
    idle_delta = cpu_end[1] - cpu_start[1]
    cpu_percent = round(max(0, min(100, (1 - idle_delta / total_delta) * 100)) if total_delta else 0, 1)

    if _previous_network and _previous_metrics_at:
        elapsed = max(now - _previous_metrics_at, 0.001)
        download_rate = max(0, (network_end[0] - _previous_network[0]) / elapsed)
        upload_rate = max(0, (network_end[1] - _previous_network[1]) / elapsed)
    else:
        download_rate = upload_rate = 0
    _previous_cpu = cpu_end
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
        "cpu": {"percent": cpu_percent, "load": round(os.getloadavg()[0], 2), "load1": round(os.getloadavg()[0], 2), "load5": round(os.getloadavg()[1], 2), "load15": round(os.getloadavg()[2], 2)},
        "memory": {"used": used_memory, "total": total_memory, "percent": round(used_memory / total_memory * 100, 1) if total_memory else 0},
        "disk": {"used": used_disk, "total": total_disk, "percent": round(used_disk / total_disk * 100, 1) if total_disk else 0},
        "network": {"download": round(download_rate), "upload": round(upload_rate)},
    }


@router.get("/metrics")
def metrics(user=Depends(require_user)):
    sample = _collect_metrics()
    _record_history(sample)
    return sample


@router.get("/metrics/history")
def metrics_history(window: str = "5m", user=Depends(require_user)):
    windows = {"5m": 5, "1h": 60, "6h": 360, "24h": 1440}
    minutes = windows.get(window, 5)
    with _history_lock:
        history = _read_history()
    return {"window": window, "interval": "60s", "samples": history[-minutes:]}


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


@router.get("/capabilities")
def capabilities(user=Depends(require_user)):
    return {"api_version": "v1", "agent_connected": False, "providers": []}
