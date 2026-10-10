import React from "react";
import {
  Cpu,
  HardDrive,
  Info,
  LoaderCircle,
  RefreshCw,
  Server,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../lib/api";

function formatBytes(value) {
  let size = Number(value || 0);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function formatUptime(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return (
    [days && `${days}d`, hours && `${hours}h`, `${minutes}m`]
      .filter(Boolean)
      .join(" ") || "Less than a minute"
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-2.5 last:border-0 dark:border-neutral-800">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <span className="max-w-[65%] break-words text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {value || "—"}
      </span>
    </div>
  );
}

export default function ServerInfoModal({ onClose }) {
  const [info, setInfo] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest("/api/v1/system/server-info");
      if (!response.ok)
        throw new Error(
          await readApiError(response, "Unable to load server information."),
        );
      setInfo(await response.json());
    } catch (reason) {
      setError(reason.message || "Unable to load server information.");
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  const diskUsed = info?.disk?.total
    ? Math.round((info.disk.used / info.disk.total) * 100)
    : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              <Server size={20} className="text-blue-600" />
              Server information
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Current host and Server Engine runtime details.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Refresh server information"
              aria-label="Refresh server information"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              aria-label="Close server information"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {loading && !info ? (
          <div className="flex min-h-52 items-center justify-center text-sm text-neutral-500">
            <LoaderCircle size={18} className="mr-2 animate-spin" />
            Loading server information…
          </div>
        ) : error ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                <Info size={16} className="text-blue-600" />
                Host
              </h3>
              <InfoRow label="Hostname" value={info.hostname} />
              <InfoRow label="Operating system" value={info.os?.name} />
              <InfoRow label="Kernel" value={info.os?.kernel} />
              <InfoRow label="Architecture" value={info.os?.architecture} />
              <InfoRow
                label="Uptime"
                value={formatUptime(info.uptime_seconds)}
              />
            </section>
            <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                <Cpu size={16} className="text-blue-600" />
                Capacity
              </h3>
              <InfoRow label="CPU cores" value={info.cpu?.cores} />
              <InfoRow
                label="Memory used"
                value={`${formatBytes(info.memory?.used)} / ${formatBytes(info.memory?.total)} (${info.memory?.percent ?? 0}%)`}
              />
              <InfoRow
                label="Memory available"
                value={formatBytes(info.memory?.available)}
              />
              <InfoRow
                label="Disk used"
                value={`${formatBytes(info.disk?.used)} / ${formatBytes(info.disk?.total)} (${diskUsed}%)`}
              />
              <InfoRow label="Disk free" value={formatBytes(info.disk?.free)} />
            </section>
            <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  <HardDrive size={16} className="text-blue-600" />
                  Server Engine
                </h3>
                <span className="text-xs text-neutral-400">Runtime</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-neutral-50 px-3 py-3 dark:bg-neutral-800/60">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Version
                  </p>
                  <p className="mt-1 truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    {info.server_engine?.version || "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-neutral-50 px-3 py-3 dark:bg-neutral-800/60">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Python
                  </p>
                  <p className="mt-1 truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    {info.server_engine?.python || "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-neutral-50 px-3 py-3 dark:bg-neutral-800/60">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Last collected
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {info.collected_at
                      ? new Date(info.collected_at).toLocaleTimeString()
                      : "—"}
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
