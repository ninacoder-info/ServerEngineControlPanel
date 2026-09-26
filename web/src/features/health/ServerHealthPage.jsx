import React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { apiRequest } from "../../lib/api";

const services = [
  ["Core API", "Operational", "success", Server],
  ["Host agent", "Not connected", "pending", Activity],
  ["Web server", "Agent required", "pending", GlobeIcon],
  ["PHP runtime", "Agent required", "pending", TerminalSquare],
  ["Database services", "Agent required", "pending", Database],
  ["SSH access", "Agent required", "pending", ShieldCheck],
];
function GlobeIcon({ size = 17 }) {
  return <Network size={size} />;
}
function formatBytes(value) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1024) return `${value.toFixed(0)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value;
  let index = -1;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount >= 10 ? amount.toFixed(1) : amount.toFixed(2)} ${units[index]}`;
}
function Trend({ values, color = "text-blue-500", fill = "fill-blue-500/10" }) {
  const points = values.length > 1 ? values : [0, ...values];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const line = points
    .map(
      (value, index) =>
        `${(index / (points.length - 1)) * 100},${36 - ((value - min) / range) * 29}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="h-24 w-full"
      aria-hidden="true"
    >
      <polygon
        points={`0,40 ${line} 100,40`}
        className={`${fill} opacity-70`}
      />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={color}
      />
    </svg>
  );
}
function Metric({ icon: Icon, label, value, detail, values, color, fill }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
          <Icon size={16} />
          {label}
        </span>
        <span className="text-xs text-slate-400">5 min</span>
      </div>
      <strong className="mt-4 block text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </strong>
      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
        {detail}
      </span>
      <div className="mt-3">
        <Trend values={values} color={color} fill={fill} />
      </div>
    </div>
  );
}

export default function ServerHealthPage() {
  const [metrics, setMetrics] = React.useState(null);
  const [history, setHistory] = React.useState({
    cpu: [],
    memory: [],
    disk: [],
    network: [],
  });
  const [range, setRange] = React.useState("5m");
  const load = React.useCallback(async () => {
    const response = await apiRequest("/api/v1/metrics");
    if (!response.ok) return;
    const next = await response.json();
    setMetrics(next);
    setHistory((previous) => ({
      cpu: [...previous.cpu, next.cpu.percent].slice(-60),
      memory: [...previous.memory, next.memory.percent].slice(-60),
      disk: [...previous.disk, next.disk.percent].slice(-60),
      network: [
        ...previous.network,
        next.network.download + next.network.upload,
      ].slice(-60),
    }));
  }, []);
  React.useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);
  const cpu = metrics?.cpu;
  const memory = metrics?.memory;
  const disk = metrics?.disk;
  const network = metrics?.network;
  return (
    <div className="space-y-7">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Server status
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Server health
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500 dark:text-slate-400">
            Monitor resource pressure, service readiness, load trends, and
            infrastructure signals before they affect hosted websites.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
        >
          <RefreshCw size={16} />
          Refresh now
        </button>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 size={18} />
            Overall status
          </div>
          <strong className="mt-4 block text-2xl text-emerald-800 dark:text-emerald-300">
            Operational
          </strong>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
            No critical threshold detected
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            <Clock3 size={17} />
            Load average
          </div>
          <strong className="mt-4 block text-2xl text-slate-900 dark:text-slate-100">
            {cpu ? cpu.load1.toFixed(2) : "—"}
          </strong>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            1 minute ·{" "}
            {cpu
              ? `${cpu.load5.toFixed(2)} / ${cpu.load15.toFixed(2)} at 5 / 15 min`
              : "Collecting sample…"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            <AlertTriangle size={17} />
            Attention queue
          </div>
          <strong className="mt-4 block text-2xl text-slate-900 dark:text-slate-100">
            {services.filter((item) => item[2] === "pending").length}
          </strong>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Host-agent checks awaiting integration
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            <Server size={17} />
            Last sample
          </div>
          <strong className="mt-4 block text-2xl text-slate-900 dark:text-slate-100">
            {metrics ? "Live" : "—"}
          </strong>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Polling every 5 seconds
          </p>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Resource trends
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Live samples are retained in the browser for the selected
              monitoring window.
            </p>
          </div>
          <div className="flex rounded-md border border-slate-300 p-1 dark:border-slate-700">
            {[
              ["5m", "5 min"],
              ["1h", "1 hour"],
              ["6h", "6 hours"],
              ["24h", "24 hours"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setRange(id)}
                className={`rounded px-3 py-1.5 text-xs font-semibold ${range === id ? "bg-blue-600 text-white" : "text-slate-500 dark:text-slate-400"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-4">
          <Metric
            icon={Cpu}
            label="CPU usage"
            value={cpu ? `${cpu.percent.toFixed(1)}%` : "—"}
            detail={
              cpu ? `Load ${cpu.load1.toFixed(2)}` : "Waiting for metrics"
            }
            values={history.cpu}
            color="text-blue-500"
            fill="fill-blue-500/10"
          />
          <Metric
            icon={MemoryStick}
            label="Memory"
            value={memory ? `${memory.percent.toFixed(1)}%` : "—"}
            detail={
              memory
                ? `${formatBytes(memory.used)} of ${formatBytes(memory.total)}`
                : "Waiting for metrics"
            }
            values={history.memory}
            color="text-violet-500"
            fill="fill-violet-500/10"
          />
          <Metric
            icon={HardDrive}
            label="Disk usage"
            value={disk ? `${disk.percent.toFixed(1)}%` : "—"}
            detail={
              disk
                ? `${formatBytes(disk.used)} of ${formatBytes(disk.total)}`
                : "Waiting for metrics"
            }
            values={history.disk}
            color="text-amber-500"
            fill="fill-amber-500/10"
          />
          <Metric
            icon={Network}
            label="Network I/O"
            value={network ? `↓ ${formatBytes(network.download)}/s` : "—"}
            detail={
              network
                ? `↑ ${formatBytes(network.upload)}/s upload`
                : "Waiting for metrics"
            }
            values={history.network}
            color="text-emerald-500"
            fill="fill-emerald-500/10"
          />
        </div>
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Service status
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                The host agent will report process health and restart state
                here.
              </p>
            </div>
            <button className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              View logs
            </button>
          </div>
          <div className="mt-4 grid gap-x-8 md:grid-cols-2">
            {services.map(([name, status, state, Icon]) => (
              <div
                key={name}
                className="flex items-center gap-3 border-b border-slate-200 py-3 last:border-0 dark:border-slate-800"
              >
                <Icon size={17} className="text-slate-400" />
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                    {name}
                  </strong>
                  <small className="text-xs text-slate-500 dark:text-slate-400">
                    {status}
                  </small>
                </span>
                <span
                  className={`h-2 w-2 rounded-full ${state === "success" ? "bg-emerald-500" : "bg-slate-400"}`}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <ShieldCheck size={19} className="text-blue-500" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Threshold policy
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Recommended alert bands.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-4 text-sm">
            <div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>CPU warning</span>
                <strong className="text-amber-600 dark:text-amber-400">
                  70%
                </strong>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                <span className="block h-full w-[70%] rounded-full bg-amber-500" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Memory warning</span>
                <strong className="text-amber-600 dark:text-amber-400">
                  80%
                </strong>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                <span className="block h-full w-[80%] rounded-full bg-amber-500" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Disk critical</span>
                <strong className="text-red-600 dark:text-red-400">90%</strong>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                <span className="block h-full w-[90%] rounded-full bg-red-500" />
              </div>
            </div>
          </div>
          <button className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400">
            Configure alerts <ChevronRightIcon />
          </button>
        </div>
      </section>
      {range !== "5m" && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          Longer history will be available when the monitoring agent persists
          samples on the server.
        </div>
      )}
    </div>
  );
}
function ChevronRightIcon() {
  return <span aria-hidden="true">→</span>;
}
