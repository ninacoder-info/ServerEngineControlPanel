import React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
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

const defaultLynisPolicy = {
  enabled: true,
  schedule: "weekly",
  profile: "server",
  scanPaths: "/etc,/opt/server-engine,/server-engine",
  auditServices: true,
  auditNetworking: true,
  auditStorage: true,
  auditAuthentication: true,
  auditWebStack: true,
  notifyOnWarnings: true,
};

function LynisWorkspace({ policy, updatePolicy, onSave, saved, onScan, scanning }) {
  const checks = [
    ["auditServices", "Services and boot", "Review exposed daemons, startup services, and insecure defaults."],
    ["auditNetworking", "Networking", "Check firewall posture, listening ports, protocol settings, and IPv6."],
    ["auditStorage", "Filesystems and storage", "Review permissions, mounts, temporary directories, and disk policy."],
    ["auditAuthentication", "Authentication", "Check SSH, password policy, users, groups, sudo, and MFA readiness."],
    ["auditWebStack", "Web stack", "Review Nginx, Apache, PHP, TLS, headers, and hosted website exposure."],
  ];
  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck size={19} className="text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Lynis hardening audit</h3>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Scan the host for hardening opportunities, prioritize warnings, and keep remediation work visible without changing the server automatically.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">Last scan: Not run</span>
          <button type="button" onClick={onScan} disabled={scanning} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            <ClipboardCheck size={15} />
            {scanning ? "Scanning…" : "Run audit"}
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500 dark:text-slate-400">Hardening index</span><strong className="mt-1 block text-2xl text-slate-900 dark:text-slate-100">—</strong><span className="text-xs text-slate-500 dark:text-slate-400">Run an audit to calculate</span></div>
        <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500 dark:text-slate-400">Warnings</span><strong className="mt-1 block text-2xl text-amber-600">—</strong><span className="text-xs text-slate-500 dark:text-slate-400">Awaiting host results</span></div>
        <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500 dark:text-slate-400">Suggestions</span><strong className="mt-1 block text-2xl text-blue-600">—</strong><span className="text-xs text-slate-500 dark:text-slate-400">Prioritized after scanning</span></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {checks.map(([key, label, description]) => (
          <label key={key} className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-4 dark:border-slate-800">
            <input type="checkbox" className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600" checked={policy[key]} onChange={(event) => updatePolicy(key, event.target.checked)} />
            <span><span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span></span>
          </label>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Audit schedule<select className="mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={policy.schedule} onChange={(event) => updatePolicy("schedule", event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="manual">Manual only</option></select></label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Audit profile<select className="mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={policy.profile} onChange={(event) => updatePolicy("profile", event.target.value)}><option value="server">Server baseline</option><option value="web">Web hosting</option><option value="strict">Strict production</option></select></label>
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700 dark:text-slate-300"><input type="checkbox" className="h-4 w-4 cursor-pointer accent-blue-600" checked={policy.notifyOnWarnings} onChange={(event) => updatePolicy("notifyOnWarnings", event.target.checked)} />Notify on warnings</label>
      </div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Scan paths<textarea className="mt-1.5 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={policy.scanPaths} onChange={(event) => updatePolicy("scanPaths", event.target.value)} /></label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">Lynis will report recommendations first; no hardening change is applied automatically.</p><button type="button" onClick={onSave} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{saved ? <CheckCircle2 size={15} /> : <ClipboardCheck size={15} />}{saved ? "Saved" : "Save audit policy"}</button></div>
    </section>
  );
}

const defaultExporterPolicy = {
  enabled: true,
  bindAddress: "127.0.0.1:9100",
  interval: "15s",
  timeout: "10s",
  path: "/metrics",
  system: true,
  filesystem: true,
  network: true,
  processes: true,
  textfile: false,
  labels: "environment=production",
};

function NodeExporterWorkspace({ policy, updatePolicy, onSave, saved, onTest, testing }) {
  const collectors = [
    ["system", "System", "CPU, memory, load, uptime, and kernel statistics."],
    ["filesystem", "Filesystem", "Disk capacity, inode usage, and mount availability."],
    ["network", "Network", "Interface traffic, errors, drops, and connection counters."],
    ["processes", "Processes", "Process counts, states, and resource pressure."],
    ["textfile", "Textfile collector", "Read custom application metrics from a controlled directory."],
  ];
  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div><div className="flex items-center gap-2"><Activity size={19} className="text-blue-600 dark:text-blue-400" /><h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Prometheus Node Exporter</h3></div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Expose host metrics for Prometheus without exposing the metrics endpoint publicly by default.</p></div>
        <div className="flex items-center gap-3"><span className="text-sm text-slate-500 dark:text-slate-400">{testing ? "Testing…" : "Not tested"}</span><button type="button" onClick={onTest} disabled={testing} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Test endpoint</button></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bind address<input className="mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={policy.bindAddress} onChange={(event) => updatePolicy("bindAddress", event.target.value)} /></label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Scrape interval<select className="mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={policy.interval} onChange={(event) => updatePolicy("interval", event.target.value)}><option>5s</option><option>15s</option><option>30s</option><option>60s</option></select></label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Scrape timeout<select className="mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={policy.timeout} onChange={(event) => updatePolicy("timeout", event.target.value)}><option>5s</option><option>10s</option><option>15s</option><option>30s</option></select></label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Metrics path<input className="mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={policy.path} onChange={(event) => updatePolicy("path", event.target.value)} /></label>
      </div>
      <div><h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Collectors</h4><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{collectors.map(([key, label, description]) => <label key={key} className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-4 dark:border-slate-800"><input type="checkbox" className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600" checked={policy[key]} onChange={(event) => updatePolicy(key, event.target.checked)} /><span><span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span></span></label>)}</div></div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Metric labels<input className="mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={policy.labels} onChange={(event) => updatePolicy("labels", event.target.value)} placeholder="environment=production,region=eu" /></label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">The exporter is bound to localhost by default. Add firewall or reverse-proxy access deliberately.</p><div className="flex items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"><input type="checkbox" className="h-4 w-4 cursor-pointer accent-blue-600" checked={policy.enabled} onChange={(event) => updatePolicy("enabled", event.target.checked)} />Enabled</label><button type="button" onClick={onSave} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{saved ? "Saved" : "Save exporter settings"}</button></div></div>
    </section>
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
  const [malware, setMalware] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("serverengine:malware-policy") || "null") || { enabled: true, schedule: "daily", paths: "/server-engine/www", signatures: "daily", quarantine: true, realTime: false, exclusions: "" };
    } catch {
      return { enabled: true, schedule: "daily", paths: "/server-engine/www", signatures: "daily", quarantine: true, realTime: false, exclusions: "" };
    }
  });
  const [malwareMessage, setMalwareMessage] = React.useState("");
  const [clamav, setClamav] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("serverengine:clamav") || "null") || { enabled: true, schedule: "daily", signatures: "daily", paths: "/server-engine/www", scanUploads: true, archives: true, pua: false, maxSize: "100 MB", quarantine: true };
    } catch {
      return { enabled: true, schedule: "daily", signatures: "daily", paths: "/server-engine/www", scanUploads: true, archives: true, pua: false, maxSize: "100 MB", quarantine: true };
    }
  });
  const [clamavMessage, setClamavMessage] = React.useState("");
  const [lynis, setLynis] = React.useState(() => {
    try {
      return { ...defaultLynisPolicy, ...JSON.parse(localStorage.getItem("serverengine:lynis-policy") || "{}") };
    } catch {
      return defaultLynisPolicy;
    }
  });
  const [lynisSaved, setLynisSaved] = React.useState(false);
  const [lynisScanning, setLynisScanning] = React.useState(false);
  const [exporter, setExporter] = React.useState(() => {
    try { return { ...defaultExporterPolicy, ...JSON.parse(localStorage.getItem("serverengine:node-exporter") || "{}") }; } catch { return defaultExporterPolicy; }
  });
  const [exporterSaved, setExporterSaved] = React.useState(false);
  const [exporterTesting, setExporterTesting] = React.useState(false);
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
  const updateMalware = (key, value) => setMalware((current) => ({ ...current, [key]: value }));
  const saveMalware = () => {
    localStorage.setItem("serverengine:malware-policy", JSON.stringify(malware));
    setMalwareMessage("Malware scanner policy saved for this panel profile.");
  };
  const updateClamav = (key, value) => setClamav((current) => ({ ...current, [key]: value }));
  const saveClamav = () => { localStorage.setItem("serverengine:clamav", JSON.stringify(clamav)); setClamavMessage("ClamAV settings saved for this panel profile."); };
  const updateLynis = (key, value) => setLynis((current) => ({ ...current, [key]: value }));
  const saveLynis = () => { localStorage.setItem("serverengine:lynis-policy", JSON.stringify(lynis)); setLynisSaved(true); window.setTimeout(() => setLynisSaved(false), 3000); };
  const runLynis = () => { setLynisScanning(true); window.setTimeout(() => setLynisScanning(false), 1400); };
  const updateExporter = (key, value) => setExporter((current) => ({ ...current, [key]: value }));
  const saveExporter = () => { localStorage.setItem("serverengine:node-exporter", JSON.stringify(exporter)); setExporterSaved(true); window.setTimeout(() => setExporterSaved(false), 3000); };
  const testExporter = () => { setExporterTesting(true); window.setTimeout(() => setExporterTesting(false), 1200); };
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
      {window.location.hash === "#clamav" && (
        <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div><h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ClamAV antivirus scanner</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Use ClamAV signatures to scan webroots, uploads, archives, and mail attachments. ClamAV findings are reported separately from heuristic malware and webshell detection.</p></div>
          <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={clamav.enabled} onChange={(event) => updateClamav("enabled", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Enable ClamAV scanning</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Run signature-based scans according to the selected schedule.</span></span></label>
          <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Scan schedule<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={clamav.schedule} onChange={(event) => updateClamav("schedule", event.target.value)}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Signature updates<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={clamav.signatures} onChange={(event) => updateClamav("signatures", event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="manual">Manual</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Maximum file size<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={clamav.maxSize} onChange={(event) => updateClamav("maxSize", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Scan paths<textarea className="mt-1.5 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={clamav.paths} onChange={(event) => updateClamav("paths", event.target.value)} placeholder="One path per line" /></label></div>
          <div className="space-y-3"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={clamav.scanUploads} onChange={(event) => updateClamav("scanUploads", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">Scan uploaded files before publishing</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={clamav.archives} onChange={(event) => updateClamav("archives", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">Scan inside archives</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={clamav.pua} onChange={(event) => updateClamav("pua", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">Detect potentially unwanted applications</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={clamav.quarantine} onChange={(event) => updateClamav("quarantine", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Quarantine infected files</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Keep originals outside the webroot for review instead of deleting them.</span></span></label></div>
          <div className="flex items-center justify-between gap-4"><p className="text-sm text-slate-500 dark:text-slate-400">{clamavMessage || "ClamAV engine integration will report signature matches and scan history here."}</p><button type="button" className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={saveClamav}>Save ClamAV settings</button></div>
        </section>
      )}
      {window.location.hash === "#lynis" && (
        <LynisWorkspace policy={lynis} updatePolicy={updateLynis} onSave={saveLynis} saved={lynisSaved} onScan={runLynis} scanning={lynisScanning} />
      )}
      {window.location.hash === "#node-exporter" && (
        <NodeExporterWorkspace policy={exporter} updatePolicy={updateExporter} onSave={saveExporter} saved={exporterSaved} onTest={testExporter} testing={exporterTesting} />
      )}
      {window.location.hash === "#malware" && (
        <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Website malware scanner</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Scan website files for known malware, webshell patterns, suspicious PHP, altered core files, and unexpected executable content. Quarantine is kept separate from the running webroot.</p>
          </div>
          <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={malware.enabled} onChange={(event) => updateMalware("enabled", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Enable scheduled scanning</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Run scans automatically and keep the latest result for review.</span></span></label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Scan schedule<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={malware.schedule} onChange={(event) => updateMalware("schedule", event.target.value)}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Signature updates<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={malware.signatures} onChange={(event) => updateMalware("signatures", event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="manual">Manual</option></select></label>
          </div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Scan paths<textarea className="mt-1.5 min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={malware.paths} onChange={(event) => updateMalware("paths", event.target.value)} placeholder="One website root per line" /></label>
          <div className="space-y-3"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={malware.quarantine} onChange={(event) => updateMalware("quarantine", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Quarantine detected files</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Move suspicious files into a protected quarantine area instead of deleting them.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={malware.realTime} onChange={(event) => updateMalware("realTime", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Real-time file monitoring</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Watch uploads and changed files when a compatible host scanning agent is available.</span></span></label></div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Exclusions<textarea className="mt-1.5 min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={malware.exclusions} onChange={(event) => updateMalware("exclusions", event.target.value)} placeholder="One path or pattern per line" /></label>
          <div className="flex items-center justify-between gap-4"><p className="text-sm text-slate-500 dark:text-slate-400">{malwareMessage || "Scanner engine integration will report findings and quarantine events here."}</p><button type="button" className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={saveMalware}>Save scanner policy</button></div>
        </section>
      )}
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
