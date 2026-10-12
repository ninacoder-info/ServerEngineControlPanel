import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BellRing,
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
import { showToast } from "../../components/Toast";

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
function Trend({
  values,
  color = "text-blue-500",
  fill = "fill-blue-500/10",
  unit = "",
  formatValue,
}) {
  const [hovered, setHovered] = React.useState(null);
  const points =
    values.length > 0 ? (values.length > 1 ? values : [0, ...values]) : [0, 0];
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
    <div className="relative">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-24 w-full"
        aria-hidden="true"
        onMouseLeave={() => setHovered(null)}
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
        {points.map((value, index) => {
          const x = (index / (points.length - 1)) * 100;
          const y = 36 - ((value - min) / range) * 29;
          return (
            <circle
              key={`${index}-${value}`}
              cx={x}
              cy={y}
              r="4"
              className="fill-current text-neutral-700 opacity-0 hover:opacity-100 dark:text-neutral-200"
              vectorEffect="non-scaling-stroke"
              onMouseEnter={() => setHovered({ index, value, x, y })}
            />
          );
        })}
      </svg>
      {hovered && (
        <span
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900"
          style={{ left: `${hovered.x}%`, top: `${(hovered.y / 40) * 100}%` }}
        >
          {formatValue
            ? formatValue(hovered.value)
            : `${Number(hovered.value).toFixed(2)}${unit}`}
        </span>
      )}
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  detail,
  values,
  color,
  fill,
  windowLabel,
  trendUnit,
  trendFormatter,
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          <Icon size={16} />
          {label}
        </span>
        <span className="text-xs text-neutral-400">{windowLabel}</span>
      </div>
      <strong className="mt-4 block text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {value}
      </strong>
      <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
        {detail}
      </span>
      <div className="mt-3">
        <Trend
          values={values}
          color={color}
          fill={fill}
          unit={trendUnit}
          formatValue={trendFormatter}
        />
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

function LynisWorkspace({
  policy,
  updatePolicy,
  onSave,
  saved,
  onScan,
  scanning,
}) {
  const checks = [
    [
      "auditServices",
      "Services and boot",
      "Review exposed daemons, startup services, and insecure defaults.",
    ],
    [
      "auditNetworking",
      "Networking",
      "Check firewall posture, listening ports, protocol settings, and IPv6.",
    ],
    [
      "auditStorage",
      "Filesystems and storage",
      "Review permissions, mounts, temporary directories, and disk policy.",
    ],
    [
      "auditAuthentication",
      "Authentication",
      "Check SSH, password policy, users, groups, sudo, and MFA readiness.",
    ],
    [
      "auditWebStack",
      "Web stack",
      "Review Nginx, Apache, PHP, TLS, headers, and hosted website exposure.",
    ],
  ];
  return (
    <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck
              size={19}
              className="text-blue-600 dark:text-blue-400"
            />
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Lynis hardening audit
            </h3>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Scan the host for hardening opportunities, prioritize warnings, and
            keep remediation work visible without changing the server
            automatically.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Last scan: Not run
          </span>
          <button
            type="button"
            onClick={onScan}
            disabled={scanning}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ClipboardCheck size={15} />
            {scanning ? "Scanning…" : "Run audit"}
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Hardening index
          </span>
          <strong className="mt-1 block text-2xl text-neutral-900 dark:text-neutral-100">
            —
          </strong>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Run an audit to calculate
          </span>
        </div>
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Warnings
          </span>
          <strong className="mt-1 block text-2xl text-amber-600">—</strong>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Awaiting host results
          </span>
        </div>
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Suggestions
          </span>
          <strong className="mt-1 block text-2xl text-blue-600">—</strong>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Prioritized after scanning
          </span>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {checks.map(([key, label, description]) => (
          <label
            key={key}
            className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600"
              checked={policy[key]}
              onChange={(event) => updatePolicy(key, event.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                {label}
              </span>
              <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                {description}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Audit schedule
          <select
            className="mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            value={policy.schedule}
            onChange={(event) => updatePolicy("schedule", event.target.value)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="manual">Manual only</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Audit profile
          <select
            className="mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            value={policy.profile}
            onChange={(event) => updatePolicy("profile", event.target.value)}
          >
            <option value="server">Server baseline</option>
            <option value="web">Web hosting</option>
            <option value="strict">Strict production</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-blue-600"
            checked={policy.notifyOnWarnings}
            onChange={(event) =>
              updatePolicy("notifyOnWarnings", event.target.checked)
            }
          />
          Notify on warnings
        </label>
      </div>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Scan paths
        <textarea
          className="mt-1.5 min-h-20 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          value={policy.scanPaths}
          onChange={(event) => updatePolicy("scanPaths", event.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Lynis will report recommendations first; no hardening change is
          applied automatically.
        </p>
        <button
          type="button"
          onClick={onSave}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {saved ? <CheckCircle2 size={15} /> : <ClipboardCheck size={15} />}
          {saved ? "Saved" : "Save audit policy"}
        </button>
      </div>
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

function NodeExporterWorkspace({
  policy,
  updatePolicy,
  onSave,
  saved,
  onTest,
  testing,
}) {
  const collectors = [
    ["system", "System", "CPU, memory, load, uptime, and kernel statistics."],
    [
      "filesystem",
      "Filesystem",
      "Disk capacity, inode usage, and mount availability.",
    ],
    [
      "network",
      "Network",
      "Interface traffic, errors, drops, and connection counters.",
    ],
    [
      "processes",
      "Processes",
      "Process counts, states, and resource pressure.",
    ],
    [
      "textfile",
      "Textfile collector",
      "Read custom application metrics from a controlled directory.",
    ],
  ];
  return (
    <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={19} className="text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Prometheus Node Exporter
            </h3>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Expose host metrics for Prometheus without exposing the metrics
            endpoint publicly by default.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            {testing ? "Testing…" : "Not tested"}
          </span>
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Test endpoint
          </button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Bind address
          <input
            className="mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            value={policy.bindAddress}
            onChange={(event) =>
              updatePolicy("bindAddress", event.target.value)
            }
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Scrape interval
          <select
            className="mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            value={policy.interval}
            onChange={(event) => updatePolicy("interval", event.target.value)}
          >
            <option>5s</option>
            <option>15s</option>
            <option>30s</option>
            <option>60s</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Scrape timeout
          <select
            className="mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            value={policy.timeout}
            onChange={(event) => updatePolicy("timeout", event.target.value)}
          >
            <option>5s</option>
            <option>10s</option>
            <option>15s</option>
            <option>30s</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Metrics path
          <input
            className="mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            value={policy.path}
            onChange={(event) => updatePolicy("path", event.target.value)}
          />
        </label>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          Collectors
        </h4>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {collectors.map(([key, label, description]) => (
            <label
              key={key}
              className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600"
                checked={policy[key]}
                onChange={(event) => updatePolicy(key, event.target.checked)}
              />
              <span>
                <span className="block text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  {label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                  {description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Metric labels
        <input
          className="mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          value={policy.labels}
          onChange={(event) => updatePolicy("labels", event.target.value)}
          placeholder="environment=production,region=eu"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          The exporter is bound to localhost by default. Add firewall or
          reverse-proxy access deliberately.
        </p>
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-blue-600"
              checked={policy.enabled}
              onChange={(event) =>
                updatePolicy("enabled", event.target.checked)
              }
            />
            Enabled
          </label>
          <button
            type="button"
            onClick={onSave}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {saved ? "Saved" : "Save exporter settings"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ThresholdPolicyModal({
  thresholds,
  setThresholds,
  saving,
  onSave,
  onClose,
}) {
  const fields = [
    [
      "cpu_warning",
      "CPU warning",
      "%",
      0,
      100,
      1,
      "Show attention when CPU usage reaches this percentage.",
    ],
    [
      "memory_warning",
      "Memory warning",
      "%",
      0,
      100,
      1,
      "Show attention when used memory reaches this percentage.",
    ],
    [
      "disk_critical",
      "Disk critical",
      "%",
      0,
      100,
      1,
      "Show attention when the monitored disk reaches this percentage.",
    ],
    [
      "load_warning",
      "Load warning",
      "load",
      0,
      16,
      0.1,
      "Show attention when the one-minute load reaches this value.",
    ],
  ];
  const update = (key, value) => {
    const parsed = Number(value);
    setThresholds((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? parsed : 0,
    }));
  };
  const save = async () => {
    if (await onSave()) onClose();
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="threshold-policy-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <h3
              id="threshold-policy-title"
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Threshold policy
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Choose when Server Engine marks the host as needing attention.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close threshold policy"
            className="cursor-pointer rounded-md p-1.5 text-xl leading-none text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          {fields.map(([key, label, unit, min, max, step, description]) => (
            <label key={key} className="block">
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                <span>{label}</span>
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {Number(thresholds[key] ?? min).toFixed(
                    unit === "load" ? 1 : 0,
                  )}
                  {unit === "load" ? "" : unit}
                </span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={thresholds[key] ?? ""}
                onChange={(event) => update(key, event.target.value)}
                className="mt-3 block h-2 w-full cursor-pointer accent-neutral-900 dark:accent-neutral-100"
              />
              <span className="mt-2 block text-xs text-neutral-500 dark:text-neutral-400">
                {description}
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-3 border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            {saving && <RefreshCw size={15} className="animate-spin" />}
            {saving ? "Saving…" : "Save policy"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ServerHealthSkeleton() {
  return (
    <div className="animate-pulse space-y-7" aria-label="Loading server health">
      <header className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div className="space-y-3">
          <div className="h-4 w-28 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-9 w-48 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-[34rem] max-w-full rounded bg-neutral-100 dark:bg-neutral-800/70" />
        </div>
        <div className="h-10 w-32 rounded-md bg-neutral-200 dark:bg-neutral-800" />
      </header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="h-4 w-28 rounded bg-neutral-100 dark:bg-neutral-800/70" />
            <div className="mt-5 h-8 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="mt-2 h-3 w-36 rounded bg-neutral-100 dark:bg-neutral-800/70" />
          </div>
        ))}
      </section>
      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="space-y-2">
          <div className="h-5 w-36 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-3 w-80 max-w-full rounded bg-neutral-100 dark:bg-neutral-800/70" />
        </div>
        <div className="mt-6 h-48 rounded-md bg-neutral-100 dark:bg-neutral-800/70" />
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <section
            key={index}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="space-y-2">
              <div className="h-5 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-3 w-64 rounded bg-neutral-100 dark:bg-neutral-800/70" />
            </div>
            <div className="mt-5 space-y-4">
              {Array.from({ length: 4 }).map((__, row) => (
                <div key={row} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-neutral-100 dark:bg-neutral-800/70" />
                  <div className="h-4 flex-1 rounded bg-neutral-100 dark:bg-neutral-800/70" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function ServerHealthPage() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = React.useState(null);
  const [metricsLoading, setMetricsLoading] = React.useState(true);
  const [history, setHistory] = React.useState({
    cpu: [],
    memory: [],
    disk: [],
    network: [],
  });
  const [range, setRange] = React.useState("5m");
  const [installedServices, setInstalledServices] = React.useState([]);
  const [thresholds, setThresholds] = React.useState({
    cpu_warning: 70,
    memory_warning: 80,
    disk_critical: 90,
    load_warning: 1,
  });
  const [thresholdsOpen, setThresholdsOpen] = React.useState(false);
  const [thresholdsSaving, setThresholdsSaving] = React.useState(false);
  const [malware, setMalware] = React.useState(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("serverengine:malware-policy") || "null",
        ) || {
          enabled: true,
          schedule: "daily",
          paths: "/server-engine/www",
          signatures: "daily",
          quarantine: true,
          realTime: false,
          exclusions: "",
        }
      );
    } catch {
      return {
        enabled: true,
        schedule: "daily",
        paths: "/server-engine/www",
        signatures: "daily",
        quarantine: true,
        realTime: false,
        exclusions: "",
      };
    }
  });
  const [malwareMessage, setMalwareMessage] = React.useState("");
  // ClamAV configuration is owned by the Malware Scanner modal. Keep the
  // legacy values readable for old stored profiles, but do not render the old
  // Health-page editor anymore.
  const [clamav, setClamav] = React.useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("serverengine:clamav") || "null") || {
          enabled: true,
          schedule: "daily",
          signatures: "daily",
          paths: "/server-engine/www",
          scanUploads: true,
          archives: true,
          pua: false,
          maxSize: "100 MB",
          quarantine: true,
        }
      );
    } catch {
      return {
        enabled: true,
        schedule: "daily",
        signatures: "daily",
        paths: "/server-engine/www",
        scanUploads: true,
        archives: true,
        pua: false,
        maxSize: "100 MB",
        quarantine: true,
      };
    }
  });
  const [clamavMessage, setClamavMessage] = React.useState("");
  const [lynis, setLynis] = React.useState(() => {
    try {
      return {
        ...defaultLynisPolicy,
        ...JSON.parse(
          localStorage.getItem("serverengine:lynis-policy") || "{}",
        ),
      };
    } catch {
      return defaultLynisPolicy;
    }
  });
  const [lynisSaved, setLynisSaved] = React.useState(false);
  const [lynisScanning, setLynisScanning] = React.useState(false);
  const applyHistory = React.useCallback((samples) => {
    setHistory({
      cpu: samples.map((sample) => sample.cpu?.percent).filter(Number.isFinite),
      memory: samples
        .map((sample) => sample.memory?.percent)
        .filter(Number.isFinite),
      disk: samples
        .map((sample) => sample.disk?.percent)
        .filter(Number.isFinite),
      network: samples.map(
        (sample) =>
          (sample.network?.download || 0) + (sample.network?.upload || 0),
      ),
    });
  }, []);
  const loadHealthConfiguration = React.useCallback(async () => {
    const [servicesResponse, thresholdsResponse] = await Promise.all([
      apiRequest("/api/v1/services/installed"),
      apiRequest("/api/v1/health/thresholds"),
    ]);
    if (servicesResponse.ok) {
      const value = await servicesResponse.json();
      setInstalledServices(Array.isArray(value) ? value : []);
    }
    if (thresholdsResponse.ok) setThresholds(await thresholdsResponse.json());
  }, []);
  const load = React.useCallback(async () => {
    try {
      const [metricsResponse, historyResponse] = await Promise.all([
        apiRequest("/api/v1/metrics"),
        apiRequest(`/api/v1/metrics/history?window=${range}`),
      ]);
      if (metricsResponse.ok) setMetrics(await metricsResponse.json());
      if (historyResponse.ok) {
        const historyBody = await historyResponse.json();
        applyHistory(
          Array.isArray(historyBody.samples) ? historyBody.samples : [],
        );
      }
    } finally {
      setMetricsLoading(false);
    }
  }, [applyHistory, range]);
  React.useEffect(() => {
    load();
    loadHealthConfiguration();
    const onMetrics = (event) => {
      const next = event.detail;
      if (!next) return;
      setMetrics(next);
      setHistory((previous) => ({
        cpu: [...previous.cpu, next.cpu?.percent]
          .filter(Number.isFinite)
          .slice(-1440),
        memory: [...previous.memory, next.memory?.percent]
          .filter(Number.isFinite)
          .slice(-1440),
        disk: [...previous.disk, next.disk?.percent]
          .filter(Number.isFinite)
          .slice(-1440),
        network: [
          ...previous.network,
          (next.network?.download || 0) + (next.network?.upload || 0),
        ].slice(-1440),
      }));
    };
    window.addEventListener("serverengine:metrics-updated", onMetrics);
    const onServiceStatus = () => loadHealthConfiguration();
    const onThresholds = (event) => event.detail && setThresholds(event.detail);
    window.addEventListener("serverengine:service-status", onServiceStatus);
    window.addEventListener("serverengine:health-thresholds", onThresholds);
    return () => {
      window.removeEventListener("serverengine:metrics-updated", onMetrics);
      window.removeEventListener(
        "serverengine:service-status",
        onServiceStatus,
      );
      window.removeEventListener(
        "serverengine:health-thresholds",
        onThresholds,
      );
    };
  }, [load, loadHealthConfiguration]);
  const cpu = metrics?.cpu;
  const memory = metrics?.memory;
  const disk = metrics?.disk;
  const network = metrics?.network;
  const updateMalware = (key, value) =>
    setMalware((current) => ({ ...current, [key]: value }));
  const saveMalware = () => {
    localStorage.setItem(
      "serverengine:malware-policy",
      JSON.stringify(malware),
    );
    setMalwareMessage("Malware scanner policy saved for this panel profile.");
  };
  const updateClamav = (key, value) =>
    setClamav((current) => ({ ...current, [key]: value }));
  const saveClamav = () => {
    localStorage.setItem("serverengine:clamav", JSON.stringify(clamav));
    setClamavMessage("ClamAV settings saved for this panel profile.");
  };
  const updateLynis = (key, value) =>
    setLynis((current) => ({ ...current, [key]: value }));
  const saveLynis = () => {
    localStorage.setItem("serverengine:lynis-policy", JSON.stringify(lynis));
    setLynisSaved(true);
    window.setTimeout(() => setLynisSaved(false), 3000);
  };
  const runLynis = () => {
    setLynisScanning(true);
    window.setTimeout(() => setLynisScanning(false), 1400);
  };
  const saveThresholds = async () => {
    setThresholdsSaving(true);
    try {
      const response = await apiRequest("/api/v1/health/thresholds", {
        method: "PUT",
        body: JSON.stringify(thresholds),
      });
      if (response.ok) {
        setThresholds(await response.json());
        showToast("Threshold policy saved.", "success");
        return true;
      }
      showToast("Unable to save threshold policy.", "error");
      return false;
    } catch (error) {
      showToast(error.message || "Unable to save threshold policy.", "error");
      return false;
    } finally {
      setThresholdsSaving(false);
    }
  };
  const serviceRows = installedServices.map((service) => {
    const icon = service.id.startsWith("php")
      ? TerminalSquare
      : service.id.includes("mysql") ||
          service.id.includes("postgres") ||
          service.id.includes("redis") ||
          service.id.includes("mongo")
        ? Database
        : service.id === "nginx" ||
            service.id === "apache" ||
            service.id === "caddy"
          ? Network
          : Server;
    return { ...service, icon };
  });
  const thresholdBreaches = [
    cpu?.percent >= thresholds.cpu_warning,
    memory?.percent >= thresholds.memory_warning,
    disk?.percent >= thresholds.disk_critical,
    cpu?.load1 >= thresholds.load_warning,
  ].filter(Boolean).length;
  const healthState = thresholdBreaches ? "Attention" : "Operational";
  if (metricsLoading && !metrics) return <ServerHealthSkeleton />;
  return (
    <div className="space-y-7">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Server status
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Server health
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-neutral-500 dark:text-neutral-400">
            Monitor resource pressure, service readiness, load trends, and
            infrastructure signals before they affect hosted websites.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
        >
          <RefreshCw size={16} />
          Refresh now
        </button>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div
          className={`rounded-xl border p-5 shadow-sm ${thresholdBreaches ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"}`}
        >
          <div
            className={`flex items-center gap-2 text-sm font-semibold ${thresholdBreaches ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}
          >
            {thresholdBreaches ? (
              <AlertTriangle size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
            Overall status
          </div>
          <strong
            className={`mt-4 block text-2xl ${thresholdBreaches ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}`}
          >
            {healthState}
          </strong>
          <p
            className={`mt-1 text-xs ${thresholdBreaches ? "text-amber-700/80 dark:text-amber-400/80" : "text-emerald-700/80 dark:text-emerald-400/80"}`}
          >
            {thresholdBreaches
              ? `${thresholdBreaches} configured threshold${thresholdBreaches === 1 ? "" : "s"} exceeded`
              : "No configured threshold exceeded"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">
            <Clock3 size={17} />
            Load average
          </div>
          <strong className="mt-4 block text-2xl text-neutral-900 dark:text-neutral-100">
            {cpu ? cpu.load1.toFixed(2) : "—"}
          </strong>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            1 minute ·{" "}
            {cpu
              ? `${cpu.load5.toFixed(2)} / ${cpu.load15.toFixed(2)} at 5 / 15 min`
              : "Collecting sample…"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">
            <AlertTriangle size={17} />
            Attention queue
          </div>
          <strong className="mt-4 block text-2xl text-neutral-900 dark:text-neutral-100">
            {
              serviceRows.filter(
                (item) =>
                  item.status === "stopped" || item.status === "not-installed",
              ).length
            }
          </strong>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Installed services stopped or unavailable
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">
            <Server size={17} />
            Last sample
          </div>
          <strong className="mt-4 block text-2xl text-neutral-900 dark:text-neutral-100">
            {metrics ? "Live" : "—"}
          </strong>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Server sample stream · 5-second interval
          </p>
        </div>
      </section>
      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Resource trends
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Historical samples are stored by Server Engine for seven days and
              delivered from the server.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 min-h-9 rounded-md border border-neutral-300 p-1 dark:border-neutral-700">
              {[
                ["5m", "5 min"],
                ["1h", "1 hour"],
                ["6h", "6 hours"],
                ["24h", "24 hours"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setRange(id)}
                  className={`h-full rounded px-3 text-xs font-semibold ${range === id ? "bg-blue-600 text-white" : "text-neutral-500 dark:text-neutral-400"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setThresholdsOpen(true)}
              title="Configure threshold policy"
              aria-label="Configure threshold policy"
              className="inline-flex h-9 min-h-9 max-h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-neutral-300 p-0 text-neutral-600 leading-none hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <BellRing size={16} />
            </button>
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
            windowLabel={
              {
                "5m": "5 min",
                "1h": "1 hour",
                "6h": "6 hours",
                "24h": "24 hours",
              }[range]
            }
            color="text-blue-500"
            fill="fill-blue-500/10"
            trendUnit="%"
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
            windowLabel={
              {
                "5m": "5 min",
                "1h": "1 hour",
                "6h": "6 hours",
                "24h": "24 hours",
              }[range]
            }
            color="text-violet-500"
            fill="fill-violet-500/10"
            trendUnit="%"
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
            windowLabel={
              {
                "5m": "5 min",
                "1h": "1 hour",
                "6h": "6 hours",
                "24h": "24 hours",
              }[range]
            }
            color="text-amber-500"
            fill="fill-amber-500/10"
            trendUnit="%"
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
            windowLabel={
              {
                "5m": "5 min",
                "1h": "1 hour",
                "6h": "6 hours",
                "24h": "24 hours",
              }[range]
            }
            color="text-emerald-500"
            fill="fill-emerald-500/10"
            trendFormatter={(sample) => `${formatBytes(sample)}/s`}
          />
        </div>
      </section>
      <section>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Service status
              </h3>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Live managed service state from Server Engine. Start, stop, and
                restart services from their configuration panels.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/logs")}
              className="cursor-pointer text-sm font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              View logs
            </button>
          </div>
          <div className="mt-4 grid gap-x-8 md:grid-cols-2">
            {serviceRows.length ? (
              serviceRows.map(({ id, name, version, status, icon: Icon }) => {
                const isNodeRuntime =
                  id === "nodejs" || id.startsWith("nodejs@");
                const displayStatus =
                  isNodeRuntime && status !== "running" ? "Installed" : status;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-3 border-b border-neutral-200 py-3 last:border-0 dark:border-neutral-800"
                  >
                    <Icon size={17} className="text-neutral-400" />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm font-medium text-neutral-800 dark:text-neutral-200">
                        {name}
                      </strong>
                      <small className="text-xs text-neutral-500 dark:text-neutral-400">
                        {version
                          ? `${displayStatus} · v${version}`
                          : displayStatus}
                      </small>
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${isNodeRuntime || status === "running" ? "bg-emerald-500" : status === "stopped" ? "bg-amber-500" : "bg-neutral-400"}`}
                    />
                  </div>
                );
              })
            ) : (
              <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
                No managed services are installed yet.
              </p>
            )}
          </div>
        </div>
      </section>
      {thresholdsOpen && (
        <ThresholdPolicyModal
          thresholds={thresholds}
          setThresholds={setThresholds}
          saving={thresholdsSaving}
          onSave={saveThresholds}
          onClose={() => setThresholdsOpen(false)}
        />
      )}
      {false && window.location.hash === "#clamav" && (
        <span id="clamav" className="block scroll-mt-24" aria-hidden="true" />
      )}
      {false && window.location.hash === "#clamav" && (
        <section className="space-y-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              ClamAV antivirus scanner
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
              Use ClamAV signatures to scan webroots, uploads, archives, and
              mail attachments. ClamAV findings are reported separately from
              heuristic malware and webshell detection.
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-blue-600"
              checked={clamav.enabled}
              onChange={(event) =>
                updateClamav("enabled", event.target.checked)
              }
            />
            <span>
              <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Enable ClamAV scanning
              </span>
              <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                Run signature-based scans according to the selected schedule.
              </span>
            </span>
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Scan schedule
              <select
                className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={clamav.schedule}
                onChange={(event) =>
                  updateClamav("schedule", event.target.value)
                }
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Signature updates
              <select
                className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={clamav.signatures}
                onChange={(event) =>
                  updateClamav("signatures", event.target.value)
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Maximum file size
              <input
                className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={clamav.maxSize}
                onChange={(event) =>
                  updateClamav("maxSize", event.target.value)
                }
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Scan paths
              <textarea
                className="mt-1.5 min-h-20 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={clamav.paths}
                onChange={(event) => updateClamav("paths", event.target.value)}
                placeholder="One path per line"
              />
            </label>
          </div>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-blue-600"
                checked={clamav.scanUploads}
                onChange={(event) =>
                  updateClamav("scanUploads", event.target.checked)
                }
              />
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Scan uploaded files before publishing
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-blue-600"
                checked={clamav.archives}
                onChange={(event) =>
                  updateClamav("archives", event.target.checked)
                }
              />
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Scan inside archives
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-blue-600"
                checked={clamav.pua}
                onChange={(event) => updateClamav("pua", event.target.checked)}
              />
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Detect potentially unwanted applications
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-blue-600"
                checked={clamav.quarantine}
                onChange={(event) =>
                  updateClamav("quarantine", event.target.checked)
                }
              />
              <span>
                <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Quarantine infected files
                </span>
                <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                  Keep originals outside the webroot for review instead of
                  deleting them.
                </span>
              </span>
            </label>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {clamavMessage ||
                "ClamAV engine integration will report signature matches and scan history here."}
            </p>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={saveClamav}
            >
              Save ClamAV settings
            </button>
          </div>
        </section>
      )}
      {window.location.hash === "#lynis" && (
        <LynisWorkspace
          policy={lynis}
          updatePolicy={updateLynis}
          onSave={saveLynis}
          saved={lynisSaved}
          onScan={runLynis}
          scanning={lynisScanning}
        />
      )}
      {window.location.hash === "#malware" && (
        <section className="space-y-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Website malware scanner
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
              Scan website files for known malware, webshell patterns,
              suspicious PHP, altered core files, and unexpected executable
              content. Quarantine is kept separate from the running webroot.
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-blue-600"
              checked={malware.enabled}
              onChange={(event) =>
                updateMalware("enabled", event.target.checked)
              }
            />
            <span>
              <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Enable scheduled scanning
              </span>
              <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                Run scans automatically and keep the latest result for review.
              </span>
            </span>
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Scan schedule
              <select
                className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={malware.schedule}
                onChange={(event) =>
                  updateMalware("schedule", event.target.value)
                }
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Signature updates
              <select
                className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                value={malware.signatures}
                onChange={(event) =>
                  updateMalware("signatures", event.target.value)
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="manual">Manual</option>
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Scan paths
            <textarea
              className="mt-1.5 min-h-24 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              value={malware.paths}
              onChange={(event) => updateMalware("paths", event.target.value)}
              placeholder="One website root per line"
            />
          </label>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-blue-600"
                checked={malware.quarantine}
                onChange={(event) =>
                  updateMalware("quarantine", event.target.checked)
                }
              />
              <span>
                <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Quarantine detected files
                </span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                  Move suspicious files into a protected quarantine area instead
                  of deleting them.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-blue-600"
                checked={malware.realTime}
                onChange={(event) =>
                  updateMalware("realTime", event.target.checked)
                }
              />
              <span>
                <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Real-time file monitoring
                </span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                  Watch uploads and changed files when a compatible host
                  scanning agent is available.
                </span>
              </span>
            </label>
          </div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Exclusions
            <textarea
              className="mt-1.5 min-h-24 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              value={malware.exclusions}
              onChange={(event) =>
                updateMalware("exclusions", event.target.value)
              }
              placeholder="One path or pattern per line"
            />
          </label>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {malwareMessage ||
                "Scanner engine integration will report findings and quarantine events here."}
            </p>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={saveMalware}
            >
              Save scanner policy
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
