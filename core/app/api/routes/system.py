import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.api.dependencies import require_user

router = APIRouter(prefix="/api/v1", tags=["system"])

_previous_cpu = None
_previous_network = None
_previous_metrics_at = None


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


@router.get("/metrics")
def metrics(user=Depends(require_user)):
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


@router.get("/health")
def health():
    return {"status": "ok", "service": "server-engine-core", "version": "0.1.0", "timestamp": datetime.now(timezone.utc)}


@router.get("/capabilities")
def capabilities(user=Depends(require_user)):
    return {"api_version": "v1", "agent_connected": False, "providers": []}
