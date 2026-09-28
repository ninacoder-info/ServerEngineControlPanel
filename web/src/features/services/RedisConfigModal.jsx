import React from "react";
import {
  Activity,
  Database,
  FileCog,
  Gauge,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";

const tabs = [
  ["settings", "Server settings", Database],
  ["memory", "Memory & eviction", Gauge],
  ["persistence", "Persistence", HardDrive],
  ["security", "Security", ShieldCheck],
  ["replication", "Replication", Workflow],
  ["runtime", "Runtime", Activity],
  ["logs", "Log", RefreshCw],
  ["configuration", "redis.conf", FileCog],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  bind: "127.0.0.1 ::1",
  port: 6379,
  maxmemory: "256mb",
  policy: "allkeys-lru",
  appendonly: false,
  appendfsync: "everysec",
  rdb: true,
  protectedMode: true,
  requirepass: "",
  tls: false,
  replicaof: "",
  replBacklog: "1mb",
};

function Field({ label, children, hint }) {
  return (
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 cursor-pointer accent-blue-600" />
      <span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span></span>
    </label>
  );
}

function SaveButton({ busy, children, onClick }) {
  return <div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={onClick}>{busy ? "Saving…" : children}</button></div>;
}

function Row({ label, value }) {
  return <div className="flex flex-col gap-1 border-b border-slate-200 py-3 last:border-b-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><span className="text-sm text-slate-500 dark:text-slate-400">{label}</span><code className="break-all text-xs text-slate-700 dark:text-slate-300 sm:text-right">{value}</code></div>;
}

function read(text, key, fallback) {
  return text.match(new RegExp(`^${key}\\s+(.+)$`, "mi"))?.[1]?.trim() || fallback;
}

function parseConfig(text) {
  const replica = read(text, "replicaof", "");
  return {
    bind: read(text, "bind", defaults.bind),
    port: Number(read(text, "port", defaults.port)),
    maxmemory: read(text, "maxmemory", defaults.maxmemory),
    policy: read(text, "maxmemory-policy", defaults.policy),
    appendonly: read(text, "appendonly", "no") === "yes",
    appendfsync: read(text, "appendfsync", defaults.appendfsync),
    rdb: Boolean(text.match(/^save\s+\d+/mi)),
    protectedMode: read(text, "protected-mode", "yes") === "yes",
    requirepass: read(text, "requirepass", ""),
    tls: Number(read(text, "tls-port", "0")) > 0,
    replicaof: replica,
    replBacklog: read(text, "repl-backlog-size", defaults.replBacklog),
  };
}

function replaceLine(text, key, value) {
  const line = `${key} ${value}`.trimEnd();
  const pattern = new RegExp(`^${key}\\s+.*$`, "mi");
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
}

function buildConfig(values, text) {
  let next = text || "# Server Engine Redis configuration\n";
  const entries = {
    bind: values.bind,
    port: values.port,
    "protected-mode": values.protectedMode ? "yes" : "no",
    maxmemory: values.maxmemory,
    "maxmemory-policy": values.policy,
    appendonly: values.appendonly ? "yes" : "no",
    appendfsync: values.appendfsync,
    "repl-backlog-size": values.replBacklog,
  };
  Object.entries(entries).forEach(([key, value]) => { next = replaceLine(next, key, String(value)); });
  next = values.rdb ? replaceLine(next, "save", "900 1") : next.replace(/^save\s+.*$/gmi, "save \"\"");
  next = values.requirepass ? replaceLine(next, "requirepass", values.requirepass) : next.replace(/^requirepass\s+.*$/gmi, "");
  next = values.replicaof ? replaceLine(next, "replicaof", values.replicaof) : next.replace(/^replicaof\s+.*$/gmi, "");
  return next;
}

function Settings({ values, setValue, save, busy }) {
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Redis server settings</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Configure the local listener and the isolated Redis data directory.</p></div><div className="space-y-4"><Field label="Bind addresses" hint="Keep Redis on loopback unless trusted application servers need network access."><input className={inputClass} value={values.bind} onChange={(event) => setValue("bind", event.target.value)} /></Field><Field label="Redis port"><input className={inputClass} type="number" min="1" max="65535" value={values.port} onChange={(event) => setValue("port", Number(event.target.value))} /></Field><Field label="Data directory"><input className={inputClass} value="/opt/server-engine/services/redis/data" readOnly /></Field></div><SaveButton busy={busy} onClick={save}>Save server settings</SaveButton></div>;
}

function Memory({ values, setValue, save, busy }) {
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Memory and eviction</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Set a hard memory ceiling so Redis does not consume all available server memory.</p></div><div className="space-y-4"><Field label="Maximum memory" hint="Leave headroom for the OS, Redis overhead, persistence forks, and the application."><input className={inputClass} value={values.maxmemory} onChange={(event) => setValue("maxmemory", event.target.value)} /></Field><Field label="Eviction policy"><select className={inputClass} value={values.policy} onChange={(event) => setValue("policy", event.target.value)}><option value="noeviction">No eviction</option><option value="allkeys-lru">All keys · LRU</option><option value="allkeys-lfu">All keys · LFU</option><option value="volatile-lru">Expiring keys · LRU</option><option value="volatile-ttl">Expiring keys · shortest TTL</option></select></Field></div><SaveButton busy={busy} onClick={save}>Save memory policy</SaveButton></div>;
}

function Persistence({ values, setValue, save, busy }) {
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Redis persistence</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose the durability profile for cache, sessions, queues, or application data.</p></div><div className="space-y-4"><Toggle label="RDB snapshots" description="Create point-in-time dump.rdb snapshots based on write activity." checked={values.rdb} onChange={(value) => setValue("rdb", value)} /><Toggle label="Append-only file" description="Record write commands for stronger restart durability than snapshots alone." checked={values.appendonly} onChange={(value) => setValue("appendonly", value)} /><Field label="AOF fsync policy"><select className={inputClass} value={values.appendfsync} onChange={(event) => setValue("appendfsync", event.target.value)}><option value="everysec">Every second</option><option value="always">Every write</option><option value="no">Operating system decides</option></select></Field></div><SaveButton busy={busy} onClick={save}>Save persistence</SaveButton></div>;
}

function Security({ values, setValue, save, busy }) {
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Redis security</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Redis should normally be private to the application host. Use ACLs for per-user permissions and keep the port firewalled.</p></div><div className="space-y-4"><Toggle label="Protected mode" description="Reject unsafe remote access when Redis is exposed without a secure authentication setup." checked={values.protectedMode} onChange={(value) => setValue("protectedMode", value)} /><Field label="Default user password" hint="Legacy password authentication. For multi-user access, manage an ACL file in the advanced configuration."><input className={inputClass} type="password" value={values.requirepass} onChange={(event) => setValue("requirepass", event.target.value)} placeholder="Leave blank to keep unchanged" /></Field><Toggle label="TLS listener" description="Enable only after TLS certificate and key paths are configured in redis.conf." checked={values.tls} onChange={(value) => setValue("tls", value)} /></div><SaveButton busy={busy} onClick={save}>Save security</SaveButton></div>;
}

function Replication({ values, setValue, save, busy }) {
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Redis replication</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Configure this instance as a replica of another Redis server when you need a read copy or failover preparation.</p></div><div className="space-y-4"><Field label="Primary server" hint="Enter `host port`, or leave empty to run as a standalone primary."><input className={inputClass} value={values.replicaof} onChange={(event) => setValue("replicaof", event.target.value)} placeholder="Leave empty for standalone" /></Field><Field label="Replication backlog size"><input className={inputClass} value={values.replBacklog} onChange={(event) => setValue("replBacklog", event.target.value)} /></Field></div><SaveButton busy={busy} onClick={save}>Save replication</SaveButton></div>;
}

function Runtime({ current, action, onAction, configPath }) {
  const running = current?.status === "running";
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Redis runtime</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Control the isolated Redis process and inspect its managed paths.</p></div><div><Row label="Status" value={current?.status || "unknown"} /><Row label="Version" value={current?.version ? `v${current.version}` : "—"} /><Row label="Configuration" value={configPath} /><Row label="Data directory" value="/opt/server-engine/services/redis/data" /><Row label="Port" value="6379" /></div><div className="flex gap-3"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={Boolean(action)} onClick={() => onAction(running ? "restart" : "start")}>{action ? `${action[0].toUpperCase()}${action.slice(1)}ing…` : running ? "Restart" : "Start"}</button>{running && <button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} disabled={Boolean(action)} onClick={() => onAction("stop")}>{action === "stop" ? "Stopping…" : "Stop"}</button>}</div></div>;
}

export default function RedisConfigModal({ installed, onClose }) {
  const current = Array.isArray(installed) ? installed.find((item) => item.status === "running") || installed[0] : installed;
  const [tab, setTab] = React.useState("settings");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [values, setValues] = React.useState(defaults);
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [logs, setLogs] = React.useState(null);
  const loadConfig = React.useCallback(() => apiRequest("/api/v1/services/redis/configuration").then((response) => response.ok ? response.json() : null).then((value) => { if (!value) return; setConfig(value); setText(value.content || ""); setValues((currentValues) => ({ ...currentValues, ...parseConfig(value.content || "") })); }).catch(() => {}), []);
  React.useEffect(() => { loadConfig(); }, [loadConfig]);
  React.useEffect(() => { if (tab !== "logs") return undefined; const load = () => apiRequest("/api/v1/services/redis/logs?page_size=50").then((response) => response.ok ? response.json() : null).then(setLogs).catch(() => {}); load(); const timer = window.setInterval(load, 2000); return () => window.clearInterval(timer); }, [tab]);
  const setValue = (key, value) => setValues((currentValues) => ({ ...currentValues, [key]: value }));
  const save = async (content = buildConfig(values, text)) => { setBusy(true); const response = await apiRequest("/api/v1/services/redis/configuration", { method: "PUT", body: JSON.stringify({ content }) }); const body = response.ok ? await response.json() : { message: await readApiError(response) }; setMessage(response.ok ? "Redis configuration saved. Restart the service to apply runtime changes." : body.message); if (response.ok) setText(content); setBusy(false); };
  const serviceAction = async (actionName) => { setAction(actionName); setMessage(`${actionName[0].toUpperCase()}${actionName.slice(1)}ing Redis…`); const response = await apiRequest("/api/v1/services/redis/action", { method: "POST", body: JSON.stringify({ action: actionName }) }); const body = response.ok ? await response.json() : { message: await readApiError(response) }; if (!response.ok || !body.job_id) { setMessage(body.message || "Redis action failed."); setAction(""); return; } let finalJob; for (let attempt = 0; attempt < 30; attempt += 1) { await new Promise((resolve) => window.setTimeout(resolve, 500)); const jobs = await apiRequest("/api/v1/jobs").then((result) => result.ok ? result.json() : []); finalJob = jobs.find((job) => job.id === body.job_id); if (finalJob && ["succeeded", "failed", "cancelled"].includes(finalJob.status)) break; } setMessage(finalJob?.message || `Redis ${actionName} request finished.`); setAction(""); };
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8"><section className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="redis-title"><div className="flex items-start justify-between gap-4"><div><h2 id="redis-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Redis</h2><p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><span className={`h-2 w-2 rounded-full ${current?.status === "running" ? "bg-emerald-500" : "bg-amber-500"}`} />{current?.status || "stopped"}{current?.version && ` · v${current.version}`}</p></div><button type="button" aria-label="Close Redis configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={onClose}><X size={18} /></button></div><div className="mt-6 flex gap-5 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800">{tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}><Icon size={15} />{label}</button>)}</div><div className="pt-5">{tab === "settings" && <Settings values={values} setValue={setValue} save={() => save()} busy={busy} />}{tab === "memory" && <Memory values={values} setValue={setValue} save={() => save()} busy={busy} />}{tab === "persistence" && <Persistence values={values} setValue={setValue} save={() => save()} busy={busy} />}{tab === "security" && <Security values={values} setValue={setValue} save={() => save()} busy={busy} />}{tab === "replication" && <Replication values={values} setValue={setValue} save={() => save()} busy={busy} />}{tab === "runtime" && <Runtime current={current} action={action} onAction={serviceAction} configPath={config?.config_path || "/opt/server-engine/services/redis/conf/redis.conf"} />}{tab === "logs" && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Redis log</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{logs?.path || "Loading…"}</p></div><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={() => apiRequest("/api/v1/services/redis/logs?page_size=50").then((response) => response.ok ? response.json() : null).then(setLogs)}><RefreshCw size={14} />Reload</button></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-300">{logs?.available ? logs.lines.join("\n") || "No log lines recorded." : logs ? "No log exists yet." : "Loading…"}</pre></div>}{tab === "configuration" && <div className="space-y-4"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Redis configuration</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Edit advanced Redis directives directly. Guided controls remain available in the other tabs.</p><code className="mt-2 block break-all text-xs text-slate-500 dark:text-slate-400">{config?.config_path || "/opt/server-engine/services/redis/conf/redis.conf"}</code></div><ConfigEditor path="redis.conf" value={text} onChange={setText} /><div className="flex justify-end gap-3"><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={loadConfig}>Reset edits</button><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => save()}>{busy ? "Saving…" : "Save redis.conf"}</button></div></div>}</div>{message && <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">{message}</p>}</section></div>;
}
