import React from "react";
import {
  Activity,
  BarChart3,
  FileCog,
  Gauge,
  Globe2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";
import Toast from "../../components/Toast";

const tabs = [
  ["listeners", "Listeners", Globe2],
  ["backends", "Backend pools", Activity],
  ["health", "Health checks", ShieldCheck],
  ["performance", "Performance", Gauge],
  ["stats", "Stats", BarChart3],
  ["runtime", "Runtime", Activity],
  ["logs", "Logs", RefreshCw],
  ["configuration", "haproxy.cfg", FileCog],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  bindAddress: "127.0.0.1",
  frontendPort: 8080,
  statsPort: 8404,
  balance: "roundrobin",
  backendAddress: "127.0.0.1:8080",
  healthPath: "/health",
  checkInterval: "3s",
  fall: 3,
  rise: 2,
  maxConnections: 4096,
  connectTimeout: "5s",
  clientTimeout: "30s",
  serverTimeout: "30s",
  tlsVerify: true,
};

function Field({ label, children, hint }) {
  return <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}{children}{hint && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500 dark:text-slate-400">{hint}</span>}</label>;
}

function Toggle({ label, description, checked, onChange }) {
  return <label className="flex cursor-pointer items-start gap-3 py-1"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 cursor-pointer accent-blue-600" /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span></span></label>;
}

function Row({ label, value }) {
  return <div className="flex flex-col gap-1 border-b border-slate-200 py-3 last:border-b-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><span className="text-sm text-slate-500 dark:text-slate-400">{label}</span><code className="break-all text-xs text-slate-700 dark:text-slate-300 sm:text-right">{value}</code></div>;
}

function read(text, key, fallback) {
  const match = text.match(new RegExp(`^\\s*${key}\\s+(.+)$`, "mi"));
  return match?.[1]?.trim() || fallback;
}

function parseConfig(text) {
  const address = text.match(/bind\s+([^\s:]+):?(\d+)?/i);
  const backend = text.match(/server\s+app1\s+([^\s]+)/i);
  return {
    bindAddress: address?.[1] || defaults.bindAddress,
    frontendPort: Number(address?.[2]) || defaults.frontendPort,
    statsPort: Number(text.match(/bind\s+127\.0\.0\.1:(\d+)/i)?.[1]) || defaults.statsPort,
    balance: read(text, "balance", defaults.balance),
    backendAddress: backend?.[1] || defaults.backendAddress,
    healthPath: text.match(/option httpchk GET\s+([^\n]+)/i)?.[1]?.trim() || defaults.healthPath,
    checkInterval: read(text, "inter", defaults.checkInterval),
    fall: Number(read(text, "fall", defaults.fall)) || defaults.fall,
    rise: Number(read(text, "rise", defaults.rise)) || defaults.rise,
    maxConnections: Number(read(text, "maxconn", defaults.maxConnections)) || defaults.maxConnections,
    connectTimeout: read(text, "timeout connect", defaults.connectTimeout),
    clientTimeout: read(text, "timeout client", defaults.clientTimeout),
    serverTimeout: read(text, "timeout server", defaults.serverTimeout),
    tlsVerify: !text.includes("verify none"),
  };
}

function buildConfig(values, root = "/opt/server-engine/services/haproxy") {
  return `# Server Engine HAProxy configuration
global
    log stdout format raw local0
    stats socket ${root}/run/admin.sock mode 660 level admin
    maxconn ${values.maxConnections}

defaults
    mode http
    log global
    option httplog
    option redispatch
    timeout connect ${values.connectTimeout}
    timeout client ${values.clientTimeout}
    timeout server ${values.serverTimeout}
    timeout check 5s
    default-server inter ${values.checkInterval} fall ${values.fall} rise ${values.rise}

frontend http_front
    bind ${values.bindAddress}:${values.frontendPort}
    default_backend web_back

backend web_back
    balance ${values.balance}
    option httpchk GET ${values.healthPath}
    server app1 ${values.backendAddress} check

listen stats
    bind 127.0.0.1:${values.statsPort}
    stats enable
    stats uri /stats
    stats refresh 10s
`;
}

function SaveButton({ busy, onClick, children }) {
  return <div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={onClick}>{busy ? "Saving…" : children}</button></div>;
}

export default function HaProxyConfigModal({ installed, onClose }) {
  const current = Array.isArray(installed) ? installed.find((item) => item.status === "running") || installed[0] : installed;
  const [tab, setTab] = React.useState("listeners");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [values, setValues] = React.useState(defaults);
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const [logs, setLogs] = React.useState(null);
  const loadConfig = React.useCallback(() => apiRequest("/api/v1/services/haproxy/configuration").then((response) => response.ok ? response.json() : null).then((value) => { if (!value) return; setConfig(value); setText(value.content || ""); setValues((currentValues) => ({ ...currentValues, ...parseConfig(value.content || "") })); }).catch(() => {}), []);
  React.useEffect(() => { loadConfig(); }, [loadConfig]);
  React.useEffect(() => { if (tab !== "logs") return undefined; const load = () => apiRequest("/api/v1/services/haproxy/logs?page_size=50").then((response) => response.ok ? response.json() : null).then(setLogs).catch(() => {}); load(); const timer = window.setInterval(load, 3000); return () => window.clearInterval(timer); }, [tab]);
  const setValue = (key, value) => setValues((currentValues) => ({ ...currentValues, [key]: value }));
  const save = async (content = buildConfig(values)) => { setBusy(true); const response = await apiRequest("/api/v1/services/haproxy/configuration", { method: "PUT", body: JSON.stringify({ content }) }); const body = response.ok ? await response.json() : { message: await readApiError(response) }; setToast({ type: response.ok ? "success" : "error", message: response.ok ? "HAProxy configuration saved. Validate and restart HAProxy to apply it." : body.message }); if (response.ok) setText(content); setBusy(false); };
  const serviceAction = async (actionName) => { setAction(actionName); const response = await apiRequest("/api/v1/services/haproxy/action", { method: "POST", body: JSON.stringify({ action: actionName }) }); const body = response.ok ? await response.json() : { message: await readApiError(response) }; if (!response.ok || !body.job_id) { setToast({ type: "error", message: body.message || "HAProxy action failed." }); setAction(""); return; } let finalJob; for (let attempt = 0; attempt < 30; attempt += 1) { await new Promise((resolve) => window.setTimeout(resolve, 500)); const jobs = await apiRequest("/api/v1/jobs").then((result) => result.ok ? result.json() : []); finalJob = jobs.find((job) => job.id === body.job_id); if (finalJob && ["succeeded", "failed", "cancelled"].includes(finalJob.status)) break; } setToast({ type: finalJob?.status === "succeeded" ? "success" : "error", message: finalJob?.message || `HAProxy ${actionName} request finished.` }); setAction(""); };
  const running = current?.status === "running";
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8"><section className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="haproxy-title"><div className="flex items-start justify-between gap-4"><div><h2 id="haproxy-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">HAProxy</h2><p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><span className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`} />{current?.status || "stopped"}{current?.version && ` · v${current.version}`}</p></div><button type="button" aria-label="Close HAProxy configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={onClose}><X size={18} /></button></div><div className="mt-6 flex gap-5 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800">{tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}><Icon size={15} />{label}</button>)}</div><div className="pt-5">{tab === "listeners" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Frontend listeners</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Accept client traffic on a frontend, then route it to a backend pool. Keep administrative stats bound to loopback.</p></div><Field label="Bind address"><input className={inputClass} value={values.bindAddress} onChange={(event) => setValue("bindAddress", event.target.value)} /></Field><Field label="Frontend port"><input className={inputClass} type="number" min="1" max="65535" value={values.frontendPort} onChange={(event) => setValue("frontendPort", Number(event.target.value))} /></Field><Field label="Stats port" hint="The stats listener remains on 127.0.0.1 by default."><input className={inputClass} type="number" min="1" max="65535" value={values.statsPort} onChange={(event) => setValue("statsPort", Number(event.target.value))} /></Field><SaveButton busy={busy} onClick={() => save()}>Save listeners</SaveButton></div>}{tab === "backends" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Backend pool</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Define how HAProxy distributes requests across application servers.</p></div><Field label="Load-balancing policy"><select className={inputClass} value={values.balance} onChange={(event) => setValue("balance", event.target.value)}><option value="roundrobin">Round robin</option><option value="leastconn">Least connections</option><option value="source">Client source</option><option value="first">First available</option></select></Field><Field label="Default backend server" hint="Add more servers in haproxy.cfg or the website proxy settings when the pool grows."><input className={inputClass} value={values.backendAddress} onChange={(event) => setValue("backendAddress", event.target.value)} /></Field><SaveButton busy={busy} onClick={() => save()}>Save backend pool</SaveButton></div>}{tab === "health" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Health checks</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Unhealthy servers are removed from rotation and returned after successful checks.</p></div><Field label="HTTP health path"><input className={inputClass} value={values.healthPath} onChange={(event) => setValue("healthPath", event.target.value)} /></Field><Field label="Check interval"><input className={inputClass} value={values.checkInterval} onChange={(event) => setValue("checkInterval", event.target.value)} /></Field><Field label="Failed checks before removal"><input className={inputClass} type="number" min="1" value={values.fall} onChange={(event) => setValue("fall", Number(event.target.value))} /></Field><Field label="Successful checks before recovery"><input className={inputClass} type="number" min="1" value={values.rise} onChange={(event) => setValue("rise", Number(event.target.value))} /></Field><SaveButton busy={busy} onClick={() => save()}>Save health checks</SaveButton></div>}{tab === "performance" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Performance and timeouts</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Protect the proxy from slow clients while leaving enough time for application responses.</p></div><Field label="Maximum connections"><input className={inputClass} type="number" min="128" value={values.maxConnections} onChange={(event) => setValue("maxConnections", Number(event.target.value))} /></Field><Field label="Connect timeout"><input className={inputClass} value={values.connectTimeout} onChange={(event) => setValue("connectTimeout", event.target.value)} /></Field><Field label="Client timeout"><input className={inputClass} value={values.clientTimeout} onChange={(event) => setValue("clientTimeout", event.target.value)} /></Field><Field label="Server timeout"><input className={inputClass} value={values.serverTimeout} onChange={(event) => setValue("serverTimeout", event.target.value)} /></Field><SaveButton busy={busy} onClick={() => save()}>Save performance</SaveButton></div>}{tab === "stats" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Statistics and runtime API</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Inspect frontends, backends, server health, sessions, and connection counters through the local stats endpoint.</p></div><Row label="Stats dashboard" value={`http://127.0.0.1:${values.statsPort}/stats`} /><Row label="Runtime socket" value="/opt/server-engine/services/haproxy/run/admin.sock" /><Row label="Refresh interval" value="10 seconds" /><div className="rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">The stats dashboard is loopback-only by default. Expose it through an authenticated website only if remote operations are required.</div><SaveButton busy={busy} onClick={() => save()}>Save stats settings</SaveButton></div>}{tab === "runtime" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">HAProxy runtime</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Validate the configuration before starting HAProxy and manage the isolated process.</p></div><div><Row label="Status" value={current?.status || "unknown"} /><Row label="Version" value={current?.version ? `v${current.version}` : "—"} /><Row label="Configuration" value={config?.config_path || "/opt/server-engine/services/haproxy/conf/haproxy.cfg"} /><Row label="Runtime socket" value="/opt/server-engine/services/haproxy/run/admin.sock" /><Row label="Process log" value="/opt/server-engine/services/haproxy/logs/haproxy.log" /></div><div className="flex gap-3"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={Boolean(action)} onClick={() => serviceAction(running ? "restart" : "start")}>{action ? `${action[0].toUpperCase()}${action.slice(1)}ing…` : running ? "Restart" : "Start"}</button>{running && <button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} disabled={Boolean(action)} onClick={() => serviceAction("stop")}>{action === "stop" ? "Stopping…" : "Stop"}</button>}</div></div>}{tab === "logs" && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">HAProxy logs</h3><p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{logs?.path || "Loading…"}</p></div><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={() => apiRequest("/api/v1/services/haproxy/logs?page_size=50").then((response) => response.ok ? response.json() : null).then(setLogs)}><RefreshCw size={14} />Reload</button></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-300">{logs?.available ? logs.lines.join("\n") || "No log lines recorded." : logs ? "No log exists yet." : "Loading…"}</pre></div>}{tab === "configuration" && <div className="space-y-4"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">haproxy.cfg</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Edit the full HAProxy configuration. Server Engine validates it before a runtime start or restart.</p><code className="mt-2 block break-all text-xs text-slate-500 dark:text-slate-400">{config?.config_path || "/opt/server-engine/services/haproxy/conf/haproxy.cfg"}</code></div><ConfigEditor path="haproxy.cfg" value={text} onChange={setText} /><div className="flex justify-end gap-3"><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={loadConfig}>Reset edits</button><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => save(text)}>{busy ? "Saving…" : "Save haproxy.cfg"}</button></div></div>}</div><Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} /></section></div>;
}
