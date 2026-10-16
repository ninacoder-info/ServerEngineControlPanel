import React from "react";
import {
  ArrowDown,
  CheckCircle2,
  CircleAlert,
  Database,
  FileText,
  Globe2,
  Layers3,
  LoaderCircle,
  Server,
  ShieldCheck,
  TerminalSquare,
  ArrowUp,
  X,
  Zap,
} from "lucide-react";
import { apiRequest } from "../lib/api";

function statusIcon(status) {
  if (status === "idle")
    return <span className="block h-2.5 w-2.5 rounded-full bg-white/70" />;
  if (status === "succeeded") return <CheckCircle2 size={17} />;
  if (status === "failed" || status === "cancelled")
    return <CircleAlert size={17} />;
  return <LoaderCircle className="animate-spin" size={17} />;
}

function CpuHistoryChart({ values }) {
  const points = values.length ? values : [0];
  const line = points
    .map((value, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100;
      const y = 92 - (Math.max(0, Math.min(100, Number(value) || 0)) / 100) * 78;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-28 w-full rounded-md bg-neutral-100 dark:bg-neutral-800"
      aria-label="CPU usage history"
      role="img"
    >
      <polygon points={`0,100 ${line} 100,100`} fill="#38bdf8" opacity="0.75" />
      <polyline
        points={line}
        fill="none"
        stroke="#ef4444"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function formatDetailBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatNetworkRate(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${Math.round(value)} B/s`;
  if (value < 1024 * 1024) {
    const kilobytes = value / 1024;
    return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)} KB/s`;
  }
  const megabytes = value / 1024 / 1024;
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB/s`;
}

function DetailBar({ value, tone = "bg-sky-400" }) {
  return (
    <span className="block h-2 flex-1 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700">
      <span
        className={`block h-full ${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }}
      />
    </span>
  );
}

function MemorySegmentBar({ memory }) {
  const total = Math.max(Number(memory?.total) || 0, 1);
  const segments = [
    ["Kernel", memory?.categories?.wired, "bg-sky-400"],
    ["Active", memory?.categories?.active, "bg-red-400"],
    ["Cache", memory?.categories?.compressed, "bg-violet-500"],
    ["Free", memory?.categories?.free, "bg-neutral-200 dark:bg-neutral-700"],
  ];
  return (
    <div className="flex h-5 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700">
      {segments.map(([label, value, color]) => (
        <span
          key={label}
          className={color}
          style={{ width: `${Math.max(0, (Number(value) || 0) / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

function PopoverSkeleton() {
  return (
    <div className="space-y-3 p-3" aria-label="Loading details">
      <div className="h-28 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800" />
      <div className="space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-3 w-full animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      </div>
    </div>
  );
}

function MemoryPopover({ metrics, details, loading, onClose }) {
  const memory = details?.memory || metrics?.memory;
  const processes = Array.isArray(details?.processes) ? details.processes : [];
  const pressure = Number(details?.pressure) || 0;
  const swap = details?.swap;
  const paging = details?.paging || {};
  return (
    <div className="absolute bottom-full right-0 z-50 mb-2 w-[340px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-neutral-300 bg-white text-left text-neutral-700 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
      <div className="relative flex items-center justify-center border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <strong className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Memory details</strong>
        <button
          type="button"
          aria-label="Close memory details"
          className="absolute right-2 inline-flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {loading ? <PopoverSkeleton /> : <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        <section className="space-y-2 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Memory pressure</span>
            <strong>{pressure.toFixed(1)}%</strong>
          </div>
          <DetailBar value={pressure} tone="bg-sky-400" />
          <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>Used memory</span>
            <span>{memory ? `${Number(memory.percent).toFixed(1)}% · ${formatDetailBytes(memory.used)}` : "—"}</span>
          </div>
        </section>

        <section className="space-y-2 px-3 py-2.5">
          <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Memory</h3>
          <MemorySegmentBar memory={memory} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {[
              ["Kernel", memory?.categories?.wired, "bg-sky-400"],
              ["Active", memory?.categories?.active, "bg-red-400"],
              ["Cache", memory?.categories?.compressed, "bg-violet-500"],
              ["Free", memory?.categories?.free, "bg-neutral-300"],
            ].map(([label, value, color]) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
                <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
                <strong className="ml-auto">{formatDetailBytes(value)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="px-3 py-2.5">
          <h3 className="mb-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200">Top memory processes</h3>
          <div className="space-y-1">
            {processes.length ? processes.slice(0, 6).map((process) => (
              <div key={`${process.pid}-${process.name}`} className="flex items-center gap-2 text-xs">
                <span className="flex h-4 w-4 items-center justify-center rounded bg-neutral-800 text-[9px] text-white">›_</span>
                <span className="min-w-0 flex-1 truncate">{process.name}</span>
                <strong className="tabular-nums">{formatDetailBytes(process.bytes)}</strong>
              </div>
            )) : <p className="text-xs text-neutral-500">Process data unavailable</p>}
          </div>
        </section>

        <section className="space-y-2 px-3 py-2.5">
          <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Swap memory</h3>
          <DetailBar value={swap?.percent} tone="bg-sky-400" />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {swap ? `${formatDetailBytes(swap.used)} of ${formatDetailBytes(swap.total)}` : "No swap configured"}
          </p>
        </section>

        <section className="px-3 py-2.5">
          <h3 className="mb-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200">Paging</h3>
          <div className="grid grid-cols-2 gap-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span>Page ins total</span><strong className="text-right text-neutral-700 dark:text-neutral-200">{formatDetailBytes((paging.pgpgin || 0) * 1024)}</strong>
            <span>Page outs total</span><strong className="text-right text-neutral-700 dark:text-neutral-200">{formatDetailBytes((paging.pgpgout || 0) * 1024)}</strong>
          </div>
        </section>
      </div>}
    </div>
  );
}

function TemperatureSensorsPopover({ sensors, loading, onClose }) {
  return (
    <div className="absolute bottom-full right-0 z-50 mb-2 w-[340px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-neutral-300 bg-white text-left text-neutral-700 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
      <div className="relative flex items-center justify-center border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <strong className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Temperature sensors
        </strong>
        <button
          type="button"
          aria-label="Close temperature sensors"
          className="absolute right-2 inline-flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      <div className="space-y-2 p-3">
        {loading ? (
          <PopoverSkeleton />
        ) : sensors.length ? (
          sensors.map((sensor) => {
            const temperature = Number(sensor.temperature);
            const fill = Math.max(8, Math.min(100, ((temperature - 20) / 80) * 100));
            const tone = temperature >= 80 ? "bg-rose-400" : temperature >= 65 ? "bg-amber-400" : "bg-sky-400";
            return (
              <div key={`${sensor.source}-${sensor.name}`} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-neutral-500 dark:text-neutral-400">
                  {sensor.name}
                </span>
                <strong className="w-12 text-right tabular-nums text-neutral-700 dark:text-neutral-200">
                  {Number.isFinite(temperature) ? `${temperature.toFixed(1)}°` : "—"}
                </strong>
                <span className="h-3 w-24 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700">
                  <span className={`block h-full ${tone}`} style={{ width: `${fill}%` }} />
                </span>
              </div>
            );
          })
        ) : (
          <p className="text-center text-xs text-neutral-500">
            No temperature sensors are exposed by this host.
          </p>
        )}
      </div>
    </div>
  );
}

function NetworkHistoryChart({ download, upload }) {
  const down = download.length ? download : [0];
  const up = upload.length ? upload : [0];
  const peak = Math.max(...down, ...up, 1);
  const points = (values) => values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 92 - (Math.max(0, Number(value) || 0) / peak) * 78;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-28 w-full rounded-md bg-neutral-100 dark:bg-neutral-800" aria-label="Network throughput history" role="img">
      <polyline points={points(up)} fill="none" stroke="#ef4444" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <polyline points={points(down)} fill="none" stroke="#38bdf8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function NetworkPopover({ metrics, details, download, upload, loading, onClose }) {
  const network = metrics?.network || {};
  const connected = details?.interfaces?.filter((item) => item.connected) || [];
  const disconnected = details?.interfaces?.filter((item) => !item.connected) || [];
  const peakDownload = Math.max(...download, 0);
  const peakUpload = Math.max(...upload, 0);
  return (
    <div className="absolute bottom-full right-0 z-50 mb-2 w-[340px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-neutral-300 bg-white text-left text-neutral-700 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
      <div className="relative flex items-center justify-center border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <strong className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Network details</strong>
        <button type="button" aria-label="Close network details" className="absolute right-2 inline-flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      {loading ? <PopoverSkeleton /> : <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        <section className="space-y-2 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500 dark:text-neutral-400">Public IP</span>
            <strong>{details?.public_ip || "Unavailable"}</strong>
          </div>
          <NetworkHistoryChart download={download} upload={upload} />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-red-500">↑ Upload</span><strong className="float-right">{formatNetworkRate(network.upload)}</strong></div>
            <div><span className="text-sky-500">↓ Download</span><strong className="float-right">{formatNetworkRate(network.download)}</strong></div>
            <div className="text-neutral-500">Peak ↑ <strong className="float-right text-neutral-700 dark:text-neutral-200">{formatNetworkRate(peakUpload)}</strong></div>
            <div className="text-neutral-500">Peak ↓ <strong className="float-right text-neutral-700 dark:text-neutral-200">{formatNetworkRate(peakDownload)}</strong></div>
          </div>
        </section>
        <section className="px-3 py-2.5">
          <h3 className="mb-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200">Connected interfaces</h3>
          <div className="space-y-1">
            {connected.length ? connected.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium">{item.name}</span>
                <span className="ml-auto text-neutral-500 dark:text-neutral-400">{item.address || "No IPv4"}</span>
              </div>
            )) : <p className="text-xs text-neutral-500">No connected interface detected</p>}
          </div>
        </section>
        <section className="px-3 py-2.5">
          <h3 className="mb-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200">Disconnected interfaces</h3>
          <div className="space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            {disconnected.length ? disconnected.map((item) => <div key={item.name}>{item.name}</div>) : <p>No disconnected interfaces</p>}
          </div>
        </section>
      </div>}
    </div>
  );
}

function DiskPopover({ details, loading, onClose }) {
  const disk = details?.disks?.[0];
  const processes = Array.isArray(details?.processes) ? details.processes : [];
  return (
    <div className="absolute bottom-full right-0 z-50 mb-2 w-[340px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-neutral-300 bg-white text-left text-neutral-700 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
      <div className="relative flex items-center justify-center border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <strong className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Disk details</strong>
        <button type="button" aria-label="Close disk details" className="absolute right-2 inline-flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      {loading ? <PopoverSkeleton /> : <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        <section className="space-y-2 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{disk?.name || "Root filesystem"}</span>
            <strong>{disk ? `${Number(disk.percent).toFixed(1)}% used` : "—"}</strong>
          </div>
          <DetailBar value={disk?.percent} tone="bg-sky-400" />
          <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>{disk ? `${formatDetailBytes(disk.free)} free` : "—"}</span>
            <span>{disk ? formatDetailBytes(disk.total) : "—"}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <span className="text-sky-500">R <strong className="float-right text-neutral-700 dark:text-neutral-200">{formatNetworkRate(details?.io?.read)}</strong></span>
            <span className="text-red-500">W <strong className="float-right text-neutral-700 dark:text-neutral-200">{formatNetworkRate(details?.io?.write)}</strong></span>
          </div>
        </section>
        <section className="px-3 py-2.5">
          <h3 className="mb-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200">Top disk processes</h3>
          <div className="space-y-1">
            {processes.length ? processes.slice(0, 6).map((process) => (
              <div key={`${process.pid}-${process.name}`} className="grid grid-cols-[minmax(0,1fr)_68px_68px] items-center gap-2 text-xs">
                <span className="truncate">{process.name}</span>
                <span className="text-right text-sky-500">{formatNetworkRate(process.read)}</span>
                <span className="text-right text-red-500">{formatNetworkRate(process.write)}</span>
              </div>
            )) : <p className="text-xs text-neutral-500">No disk activity detected</p>}
          </div>
        </section>
      </div>}
    </div>
  );
}

function CpuPopover({ metrics, details, history, loading, onClose }) {
  const cpu = metrics?.cpu;
  const detailCpu = details?.cpu || {};
  const memory = details?.memory || metrics?.memory;
  const processes = Array.isArray(details?.processes) ? details.processes : [];
  const processorPercent = detailCpu.percent ?? cpu?.percent ?? 0;
  const peakLoad = Math.max(
    ...history.map((value) => Number(value) || 0),
    Number(processorPercent) || 0,
    0,
  );
  return (
    <div className="absolute bottom-full right-0 z-50 mb-2 w-[340px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-neutral-300 bg-white text-left text-neutral-700 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
      <div className="flex items-center justify-center border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <strong className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">CPU details</strong>
        <button
          type="button"
          aria-label="Close CPU details"
          className="absolute right-2 inline-flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {loading ? <PopoverSkeleton /> : <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        <section className="p-3">
          <CpuHistoryChart values={history} />
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            {[
              ["User", detailCpu.user, "bg-sky-400"],
              ["System", detailCpu.system, "bg-red-400"],
              ["Idle", detailCpu.idle, "bg-neutral-300"],
            ].map(([label, value, color]) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
                <span className="truncate text-neutral-500 dark:text-neutral-400">{label}</span>
                <strong className="ml-auto text-neutral-700 dark:text-neutral-200">
                  {Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "—"}
                </strong>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>Peak Load</span>
            <strong className="tabular-nums text-neutral-700 dark:text-neutral-200">
              {peakLoad.toFixed(1)}%
            </strong>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>Uptime</span>
            <strong className="font-normal text-neutral-700 dark:text-neutral-200">
              {formatDuration(details?.uptime_seconds)}
            </strong>
          </div>
        </section>

        <section className="px-3 py-2.5">
          <h3 className="mb-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200">Top processes</h3>
          <div className="space-y-1">
            {processes.length ? processes.slice(0, 6).map((process) => (
              <div key={`${process.pid}-${process.name}`} className="flex items-center gap-2 text-xs">
                <span className="flex h-4 w-4 items-center justify-center rounded bg-neutral-800 text-[9px] text-white">›_</span>
                <span className="min-w-0 flex-1 truncate">{process.name}</span>
                <strong className="tabular-nums">{Number(process.cpu || 0).toFixed(1)}%</strong>
              </div>
            )) : <p className="text-center text-xs text-neutral-500">Process data unavailable</p>}
          </div>
        </section>

        <section className="px-3 py-2.5">
          <h3 className="mb-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200">Processor</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-20 text-neutral-500 dark:text-neutral-400">Memory</span>
              <DetailBar value={memory?.percent} tone="bg-sky-400" />
              <strong className="w-12 text-right tabular-nums">{memory ? `${Number(memory.percent).toFixed(1)}%` : "—"}</strong>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 text-neutral-500 dark:text-neutral-400">Processor</span>
              <DetailBar value={processorPercent} tone="bg-sky-400" />
              <strong className="w-12 text-right tabular-nums">{Number(processorPercent).toFixed(1)}%</strong>
            </div>
            <p className="text-right text-xs text-neutral-500 dark:text-neutral-400">
              {details?.processor?.cores || "—"} logical cores · {formatDetailBytes(memory?.used)} used
            </p>
          </div>
        </section>

      </div>}
    </div>
  );
}

export default function GlobalJobStatusBar({
  onOpenTerminal,
  onOpenLogs,
  onOpenServer,
  onOpenService,
  terminalOpen = false,
  panel = "terminal",
}) {
  const [jobs, setJobs] = React.useState([]);
  const [services, setServices] = React.useState([]);
  const [shieldPolicy, setShieldPolicy] = React.useState(null);
  const [logSummary, setLogSummary] = React.useState(null);
  const [terminalSessions, setTerminalSessions] = React.useState(0);
  const [uploadState, setUploadState] = React.useState(null);
  const [metrics, setMetrics] = React.useState(null);
  const [cpuPopoverOpen, setCpuPopoverOpen] = React.useState(false);
  const [cpuPopoverMetrics, setCpuPopoverMetrics] = React.useState(null);
  const [cpuPopoverDetails, setCpuPopoverDetails] = React.useState(null);
  const [cpuPopoverHistory, setCpuPopoverHistory] = React.useState([]);
  const [cpuPopoverLoading, setCpuPopoverLoading] = React.useState(false);
  const [memoryPopoverOpen, setMemoryPopoverOpen] = React.useState(false);
  const [memoryPopoverDetails, setMemoryPopoverDetails] = React.useState(null);
  const [memoryPopoverLoading, setMemoryPopoverLoading] = React.useState(false);
  const [networkPopoverOpen, setNetworkPopoverOpen] = React.useState(false);
  const [networkPopoverDetails, setNetworkPopoverDetails] = React.useState(null);
  const [networkPopoverLoading, setNetworkPopoverLoading] = React.useState(false);
  const [networkHistory, setNetworkHistory] = React.useState({ download: [], upload: [] });
  const [diskPopoverOpen, setDiskPopoverOpen] = React.useState(false);
  const [diskPopoverDetails, setDiskPopoverDetails] = React.useState(null);
  const [diskPopoverLoading, setDiskPopoverLoading] = React.useState(false);
  const [temperaturePopoverOpen, setTemperaturePopoverOpen] = React.useState(false);
  const [temperatureSensors, setTemperatureSensors] = React.useState([]);
  const [temperatureSensorsLoading, setTemperatureSensorsLoading] = React.useState(false);
  const [metricHistory, setMetricHistory] = React.useState({
    cpu: [],
    memory: [],
    disk: [],
  });
  const activeJob = jobs.find(
    (job) => job.status === "running" || job.status === "queued",
  );
  const job = activeJob || jobs[0];

  React.useEffect(() => {
    const onUploadStatus = (event) => {
      const detail = event.detail;
      if (!detail) return;
      setUploadState(detail.active ? detail : null);
    };
    window.addEventListener("serverengine:file-upload", onUploadStatus);
    return () =>
      window.removeEventListener("serverengine:file-upload", onUploadStatus);
  }, []);

  React.useEffect(() => {
    if (!cpuPopoverOpen) {
      setCpuPopoverMetrics(null);
      setCpuPopoverDetails(null);
      setCpuPopoverHistory([]);
      return undefined;
    }
    let alive = true;
    setCpuPopoverLoading(true);
    setCpuPopoverMetrics(metrics);
    setCpuPopoverHistory(metricHistory.cpu);
    apiRequest("/api/v1/system/cpu-details")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (alive && value) setCpuPopoverDetails(value);
        if (alive) setCpuPopoverLoading(false);
      })
      .catch(() => {});
    apiRequest("/api/v1/metrics/history?window=30m")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (!alive) return;
        const samples = Array.isArray(value?.samples) ? value.samples : [];
        setCpuPopoverHistory(
          samples
            .map((sample) => sample.cpu?.percent)
            .filter(Number.isFinite),
        );
      })
      .catch(() => {});
    const onMetrics = (event) => {
      const next = event.detail;
      if (!next) return;
      setCpuPopoverMetrics(next);
      if (next.cpu || Array.isArray(next.processes)) {
        setCpuPopoverDetails((current) => (current
          ? {
              ...current,
              cpu: { ...current.cpu, ...next.cpu },
              processes: Array.isArray(next.processes)
                ? next.processes
                : current.processes,
            }
          : current));
      }
      setCpuPopoverHistory((current) =>
        [...current, next.cpu?.percent].filter(Number.isFinite).slice(-180),
      );
    };
    window.addEventListener("serverengine:metrics-updated", onMetrics);
    return () => {
      alive = false;
      window.removeEventListener("serverengine:metrics-updated", onMetrics);
    };
    // This effect intentionally runs once per open session. The shared metrics
    // event bridge keeps the graph current without repeatedly fetching process
    // snapshots while the panel remains open.
  }, [cpuPopoverOpen]);

  React.useEffect(() => {
    if (!memoryPopoverOpen) {
      setMemoryPopoverDetails(null);
      return undefined;
    }
    let alive = true;
    setMemoryPopoverLoading(true);
    apiRequest("/api/v1/system/memory-details")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (alive && value) setMemoryPopoverDetails(value);
        if (alive) setMemoryPopoverLoading(false);
      })
      .catch(() => {});
    const onMetrics = (event) => {
      const next = event.detail;
      if (!next?.memory) return;
      setMemoryPopoverDetails((current) =>
        current
          ? { ...current, memory: { ...current.memory, ...next.memory } }
          : current,
      );
    };
    window.addEventListener("serverengine:metrics-updated", onMetrics);
    return () => {
      alive = false;
      window.removeEventListener("serverengine:metrics-updated", onMetrics);
    };
  }, [memoryPopoverOpen]);

  React.useEffect(() => {
    if (!networkPopoverOpen) {
      setNetworkPopoverDetails(null);
      return undefined;
    }
    let alive = true;
    setNetworkPopoverLoading(true);
    apiRequest("/api/v1/system/network-details")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (alive && value) setNetworkPopoverDetails(value);
        if (alive) setNetworkPopoverLoading(false);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [networkPopoverOpen]);

  React.useEffect(() => {
    if (!diskPopoverOpen) {
      setDiskPopoverDetails(null);
      return undefined;
    }
    let alive = true;
    setDiskPopoverLoading(true);
    apiRequest("/api/v1/system/disk-details")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (alive && value) setDiskPopoverDetails(value);
        if (alive) setDiskPopoverLoading(false);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [diskPopoverOpen]);

  React.useEffect(() => {
    let alive = true;
    setTemperatureSensorsLoading(true);
    apiRequest("/api/v1/system/temperature-sensors")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (alive && value) setTemperatureSensors(value.sensors || []);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setTemperatureSensorsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    apiRequest("/api/v1/metrics")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (!alive || !value) return;
        setMetrics(value);
        setMetricHistory({
          cpu: Number.isFinite(value.cpu?.percent) ? [value.cpu.percent] : [],
          memory: Number.isFinite(value.memory?.percent)
            ? [value.memory.percent]
            : [],
          disk: Number.isFinite(value.disk?.percent)
            ? [value.disk.percent]
            : [],
        });
        setNetworkHistory({
          download: Number.isFinite(value.network?.download) ? [value.network.download] : [],
          upload: Number.isFinite(value.network?.upload) ? [value.network.upload] : [],
        });
      })
      .catch(() => {});
    const onMetrics = (event) => {
      const next = event.detail;
      if (!next) return;
      setMetrics(next);
      setMetricHistory((current) => ({
        cpu: [...current.cpu, next.cpu?.percent]
          .filter(Number.isFinite)
          .slice(-12),
        memory: [...current.memory, next.memory?.percent]
          .filter(Number.isFinite)
          .slice(-12),
        disk: [...current.disk, next.disk?.percent]
          .filter(Number.isFinite)
          .slice(-12),
      }));
      setNetworkHistory((current) => ({
        download: [...current.download, next.network?.download]
          .filter(Number.isFinite)
          .slice(-60),
        upload: [...current.upload, next.network?.upload]
          .filter(Number.isFinite)
          .slice(-60),
      }));
    };
    window.addEventListener("serverengine:metrics-updated", onMetrics);
    return () => {
      alive = false;
      window.removeEventListener("serverengine:metrics-updated", onMetrics);
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    apiRequest("/api/v1/jobs")
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => alive && Array.isArray(items) && setJobs(items))
      .catch(() => {});
    const onSnapshot = (event) => {
      const items = event.detail?.jobs;
      if (Array.isArray(items)) setJobs(items);
    };
    const onUpdate = (event) => {
      const update = event.detail?.job;
      if (!update) return;
      setJobs((current) => [
        update,
        ...current.filter((item) => item.id !== update.id),
      ]);
    };
    window.addEventListener("serverengine:jobs-snapshot", onSnapshot);
    window.addEventListener("serverengine:jobs-updated", onUpdate);
    return () => {
      alive = false;
      window.removeEventListener("serverengine:jobs-snapshot", onSnapshot);
      window.removeEventListener("serverengine:jobs-updated", onUpdate);
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    apiRequest("/api/v1/logs/summary")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => alive && value && setLogSummary(value))
      .catch(() => {});
    const onLogsUpdated = (event) => {
      if (event.detail?.summary) setLogSummary(event.detail.summary);
    };
    window.addEventListener("serverengine:logs-updated", onLogsUpdated);
    return () => {
      alive = false;
      window.removeEventListener("serverengine:logs-updated", onLogsUpdated);
    };
  }, []);

  React.useEffect(() => {
    const onTerminalStatus = (event) =>
      setTerminalSessions(Number(event.detail?.connected || 0));
    window.addEventListener("serverengine:terminal-status", onTerminalStatus);
    return () =>
      window.removeEventListener(
        "serverengine:terminal-status",
        onTerminalStatus,
      );
  }, []);

  React.useEffect(() => {
    let alive = true;
    apiRequest("/api/v1/application-shield/overview")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => alive && value?.policy && setShieldPolicy(value.policy))
      .catch(() => {});
    const onPolicy = (event) => {
      if (event.detail) setShieldPolicy(event.detail);
    };
    window.addEventListener("serverengine:application-shield-policy", onPolicy);
    return () => {
      alive = false;
      window.removeEventListener(
        "serverengine:application-shield-policy",
        onPolicy,
      );
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    apiRequest("/api/v1/services/installed")
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => alive && Array.isArray(items) && setServices(items))
      .catch(() => {});
    const onServiceStatus = (event) => {
      const detail = event.detail || {};
      if (
        !detail.serviceId ||
        !["start", "stop", "restart"].includes(detail.action)
      )
        return;
      if (!["succeeded", "failed", "cancelled"].includes(detail.status)) return;
      setServices((current) =>
        current.map((item) => {
          if (
            item.id !== detail.serviceId &&
            !item.id.startsWith(`${detail.serviceId}@`)
          )
            return item;
          if (detail.status !== "succeeded") return item;
          const running = detail.action !== "stop";
          return { ...item, status: running ? "running" : "stopped", running };
        }),
      );
    };
    window.addEventListener("serverengine:service-status", onServiceStatus);
    return () => {
      alive = false;
      window.removeEventListener(
        "serverengine:service-status",
        onServiceStatus,
      );
    };
  }, []);

  const status = job?.status || "idle";
  const progress = job
    ? Math.max(0, Math.min(100, Number(job.progress || 0)))
    : 0;
  const uploadProgress = uploadState
    ? Math.max(0, Math.min(100, Number(uploadState.progress || 0)))
    : 0;
  const displayStatus = uploadState
    ? `${uploadProgress}%`
    : job
      ? status
      : "Ready";
  const displayTitle = uploadState
    ? `Uploading ${uploadState.name || "files"}`
    : job?.type || "Server Engine";
  const tone = "text-white";
  const profile = {
    id: "global-job-terminal",
    name: "Local Server",
    kind: "local",
    username: "root",
  };
  const webServer = ["nginx", "apache", "openlitespeed", "caddy", "haproxy"]
    .map((id) =>
      services.find((item) => item.id === id || item.id.startsWith(`${id}@`)),
    )
    .find(Boolean);
  const mysql = services.find(
    (item) => item.id === "mysql" || item.id === "mariadb",
  );
  const sqlserver = services.find((item) => item.id === "sqlserver");
  const redis = services.find(
    (item) => item.id === "redis" || item.id === "valkey",
  );
  const shield = services.find((item) => item.id === "modsecurity");
  const logSize = Number(logSummary?.size || 0);
  const logWarningBytes = 50 * 1024 * 1024;
  const logDangerBytes = 100 * 1024 * 1024;
  const logTone =
    logSize >= logDangerBytes
      ? "bg-rose-300"
      : logSize >= logWarningBytes
        ? "bg-amber-300"
        : "bg-emerald-300";
  const logHealth =
    logSize >= logDangerBytes
      ? "Too large"
      : logSize >= logWarningBytes
        ? "Large"
        : "Healthy";
  const maxTemperature = temperatureSensors.length
    ? Math.max(
        ...temperatureSensors.map(
          (sensor) => Number(sensor.temperature) || 0,
        ),
      )
    : 0;
  const primaryTemperature = temperatureSensors.find((sensor) =>
    /cpu|package|core|soc/i.test(sensor.name),
  );
  const displayedTemperature = primaryTemperature || temperatureSensors[0];
  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };
  const formatRate = (bytes) => `${formatBytes(Number(bytes || 0))}/s`;
  const MiniResource = ({
    label,
    value,
    values,
    tone,
    chart = false,
    compactValue = false,
    onClick,
  }) => {
    const current = Math.max(
      0,
      Math.min(100, Number(values[values.length - 1] || 0)),
    );
    return (
      <StatusTooltip label={`${label}: ${value ?? "—"}`}>
        <button
          type="button"
          disabled={!onClick}
          onClick={onClick}
          aria-label={onClick ? `Open ${label} details` : undefined}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded px-1 text-white hover:bg-white/15 disabled:cursor-default"
        >
          <span className="flex flex-col justify-center text-[7px] font-bold leading-[6px] tracking-tight">
            {label.split("").map((letter, index) => (
              <span key={`${label}-${index}`}>{letter}</span>
            ))}
          </span>
          {compactValue ? (
            <span className="text-[10px] font-semibold tabular-nums">
              {value ?? "—"}
            </span>
          ) : chart ? (
            <span className="flex h-5 w-12 items-end gap-px border border-white/35 bg-black/10 px-0.5 pb-0.5">
              {(values.length ? values : [0]).map((sample, index) => (
                <span
                  key={`${label}-${index}`}
                  className={`min-w-0 flex-1 ${tone}`}
                  style={{
                    height: `${Math.max(8, Math.min(100, Number(sample) || 0))}%`,
                  }}
                />
              ))}
            </span>
          ) : (
            <span className="flex h-5 w-2.5 items-end border border-white/35 bg-black/10">
              <span
                className={`block w-full ${tone}`}
                style={{ height: `${Math.max(8, current)}%` }}
              />
            </span>
          )}
        </button>
      </StatusTooltip>
    );
  };
  const StatusTooltip = ({ label, children }) => (
    <span className="group/status-tooltip relative inline-flex">
      <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/status-tooltip:opacity-100 dark:bg-white dark:text-neutral-900">
        {label}
      </span>
      {children}
    </span>
  );
  const serviceButton = (item, Icon) => {
    if (!item) return null;
    const running = item.status === "running" || item.running === true;
    return (
      <StatusTooltip
        label={`${item.name || item.id} is ${running ? "running" : "stopped"}`}
      >
        <button
          type="button"
          aria-label={`Open ${item.name || item.id} configuration`}
          className="inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15"
          onClick={() => onOpenService?.(item)}
        >
          <Icon size={13} />
          <span className="hidden xl:inline">{item.name || item.id}</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${running ? "bg-emerald-300" : "bg-amber-300"}`}
          />
        </button>
      </StatusTooltip>
    );
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-20 h-8 border-t border-white/20 bg-[#1576b8] text-white backdrop-blur">
        <div className="flex h-full w-full items-center gap-2 px-3 md:px-6">
          <span className={`shrink-0 ${tone}`}>
            {statusIcon(uploadState ? "running" : status)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-xs font-semibold text-white">
                {displayTitle}
              </p>
              <span
                className={`shrink-0 text-[11px] font-medium capitalize ${tone}`}
              >
                {displayStatus}
              </span>
            </div>
          </div>
          {serviceButton(webServer, Globe2)}
          {shield && (
            <StatusTooltip
              label={`Application Shield protection ${shieldPolicy?.enabled === true ? "enabled" : "disabled"}`}
            >
              <button
                type="button"
                aria-label="Open Application Shield configuration"
                className="inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15"
                onClick={() => onOpenService?.(shield)}
              >
                <ShieldCheck size={13} />
                <span className="hidden xl:inline">Shield</span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${shieldPolicy?.enabled === true ? "bg-emerald-300" : "bg-amber-300"}`}
                />
              </button>
            </StatusTooltip>
          )}
          {serviceButton(mysql, Database)}
          {serviceButton(sqlserver, Layers3)}
          {serviceButton(redis, Zap)}
          <StatusTooltip
            label={`Logs ${logHealth.toLowerCase()} · ${formatBytes(logSize)}`}
          >
            <button
              type="button"
              aria-label="Open logs"
              className={`inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15 ${terminalOpen && panel === "logs" ? "bg-white/20" : ""}`}
              onClick={onOpenLogs}
            >
              <FileText size={14} />
              Logs
              {logSummary && (
                <span className={`h-1.5 w-1.5 rounded-full ${logTone}`} />
              )}
            </button>
          </StatusTooltip>
          <StatusTooltip
            label={
              terminalSessions > 0
                ? `${terminalSessions} terminal session${terminalSessions === 1 ? "" : "s"} running`
                : "No terminal session running"
            }
          >
            <button
              type="button"
              aria-label="Open terminal"
              className={`inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15 ${terminalOpen && panel === "terminal" ? "bg-white/20" : ""}`}
              onClick={() => onOpenTerminal?.()}
            >
              <TerminalSquare size={14} />
              Terminal
              <span
                className={`h-1.5 w-1.5 rounded-full ${terminalSessions > 0 ? "bg-emerald-300" : "bg-white/40"}`}
              />
            </button>
          </StatusTooltip>
          <StatusTooltip label="Server information healthy">
            <button
              type="button"
              aria-label="Open server information"
              className="inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-white hover:bg-white/15"
              onClick={onOpenServer}
            >
              <Server size={14} />
              Server
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
            </button>
          </StatusTooltip>
          <div className="relative hidden shrink-0 items-center gap-0.5 md:flex">
            {cpuPopoverOpen && (
              <CpuPopover
                metrics={cpuPopoverMetrics || metrics}
                details={cpuPopoverDetails}
                history={cpuPopoverHistory.length ? cpuPopoverHistory : metricHistory.cpu}
                loading={cpuPopoverLoading}
                onClose={() => setCpuPopoverOpen(false)}
              />
            )}
            {memoryPopoverOpen && (
              <MemoryPopover
                metrics={metrics}
                details={memoryPopoverDetails}
                loading={memoryPopoverLoading}
                onClose={() => setMemoryPopoverOpen(false)}
              />
            )}
            {networkPopoverOpen && (
              <NetworkPopover
                metrics={metrics}
                details={networkPopoverDetails}
                download={networkHistory.download}
                upload={networkHistory.upload}
                loading={networkPopoverLoading}
                onClose={() => setNetworkPopoverOpen(false)}
              />
            )}
            {diskPopoverOpen && (
              <DiskPopover
                details={diskPopoverDetails}
                loading={diskPopoverLoading}
                onClose={() => setDiskPopoverOpen(false)}
              />
            )}
            {temperaturePopoverOpen && (
              <TemperatureSensorsPopover
                sensors={temperatureSensors}
                loading={temperatureSensorsLoading}
                onClose={() => setTemperaturePopoverOpen(false)}
              />
            )}
            <MiniResource
              label="CPU"
              value={metrics?.cpu ? `${metrics.cpu.percent.toFixed(1)}%` : "—"}
              values={metricHistory.cpu}
              tone="bg-sky-200"
              chart
              onClick={() => {
                setMemoryPopoverOpen(false);
                setNetworkPopoverOpen(false);
                setDiskPopoverOpen(false);
                setTemperaturePopoverOpen(false);
                setCpuPopoverOpen((value) => !value);
              }}
            />
            <MiniResource
              label="SEN"
              value={displayedTemperature ? `${Number(displayedTemperature.temperature).toFixed(1)}°C` : "—"}
              values={temperatureSensors.length ? [maxTemperature] : []}
              tone="bg-amber-200"
              compactValue
              onClick={() => {
                setCpuPopoverOpen(false);
                setMemoryPopoverOpen(false);
                setNetworkPopoverOpen(false);
                setDiskPopoverOpen(false);
                setTemperaturePopoverOpen((value) => !value);
              }}
            />
            <MiniResource
              label="MEM"
              value={
                metrics?.memory ? `${metrics.memory.percent.toFixed(1)}%` : "—"
              }
              values={metricHistory.memory}
              tone="bg-white"
              onClick={() => {
                setCpuPopoverOpen(false);
                setNetworkPopoverOpen(false);
                setDiskPopoverOpen(false);
                setTemperaturePopoverOpen(false);
                setMemoryPopoverOpen((value) => !value);
              }}
            />
            <MiniResource
              label="SSD"
              value={metrics?.disk ? `${metrics.disk.percent.toFixed(1)}%` : "—"}
              values={metricHistory.disk}
              tone="bg-white"
              onClick={() => {
                setCpuPopoverOpen(false);
                setMemoryPopoverOpen(false);
                setNetworkPopoverOpen(false);
                setTemperaturePopoverOpen(false);
                setDiskPopoverOpen((value) => !value);
              }}
            />
            <StatusTooltip
              label={`Network ↓ ${formatRate(metrics?.network?.download)} · ↑ ${formatRate(metrics?.network?.upload)}`}
            >
              <button
                type="button"
                className="inline-flex h-6 w-[88px] shrink-0 flex-col justify-center rounded px-1.5 text-[9px] font-semibold leading-3 tabular-nums text-white hover:bg-white/15"
                aria-label="Open network details"
                onClick={() => {
                  setCpuPopoverOpen(false);
                  setMemoryPopoverOpen(false);
                  setTemperaturePopoverOpen(false);
                  setNetworkPopoverOpen((value) => !value);
                  setDiskPopoverOpen(false);
                }}
              >
                <span className="flex items-center justify-end gap-1">
                  <ArrowDown size={11} className="-rotate-45" />
                  {formatRate(metrics?.network?.download)}
                </span>
                <span className="flex items-center justify-end gap-1">
                  <ArrowUp size={11} className="rotate-45" />
                  {formatRate(metrics?.network?.upload)}
                </span>
              </button>
            </StatusTooltip>
          </div>
        </div>
      </div>
    </>
  );
}
