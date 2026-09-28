import React from "react";
import {
  Activity,
  FileCog,
  Gauge,
  Globe2,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";

const tabs = [
  ["settings", "Settings", Globe2],
  ["listeners", "Listeners", Activity],
  ["performance", "Performance", Gauge],
  ["security", "Security", ShieldCheck],
  ["runtime", "Runtime", TerminalSquare],
  ["logs", "Logs", RefreshCw],
  ["configuration", "httpd_config.conf", FileCog],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  httpPort: 80,
  httpsPort: 443,
  workers: "auto",
  connections: 10000,
  keepalive: 5,
  compression: true,
  brotli: true,
  cache: true,
  serverSignature: false,
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

function Row({ label, value }) {
  return <div className="flex flex-col gap-1 border-b border-slate-200 py-3 last:border-b-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><span className="text-sm text-slate-500 dark:text-slate-400">{label}</span><code className="break-all text-xs text-slate-700 dark:text-slate-300 sm:text-right">{value}</code></div>;
}

function read(text, key, fallback) {
  const match = text.match(new RegExp(`^${key}\\s+(.+)$`, "mi"));
  return match?.[1]?.trim() || fallback;
}

function parseConfig(text) {
  return {
    httpPort: Number(read(text, "address", "*:80").split(":").pop()) || defaults.httpPort,
    workers: read(text, "workerProcesses", defaults.workers),
    connections: Number(read(text, "maxConnections", defaults.connections)) || defaults.connections,
    keepalive: Number(read(text, "keepAliveTimeout", defaults.keepalive)) || defaults.keepalive,
    compression: read(text, "enableGzip", "1") !== "0",
    brotli: read(text, "enableBr", "1") !== "0",
    cache: text.includes("cache") ? !text.includes("enableCache 0") : defaults.cache,
    serverSignature: read(text, "showVersion", "0") === "1",
  };
}

function buildConfig(values, root = "/opt/server-engine/services/openlitespeed") {
  return `# Server Engine OpenLiteSpeed configuration
serverName ServerEngine
user serverengine
group serverengine
workerProcesses ${values.workers}
maxConnections ${values.connections}
keepAliveTimeout ${values.keepalive}
enableGzip ${values.compression ? 1 : 0}
enableBr ${values.brotli ? 1 : 0}
enableCache ${values.cache ? 1 : 0}
showVersion ${values.serverSignature ? 1 : 0}
listener HTTP {
  address *:${values.httpPort}
  secure 0
  map default *
}
listener HTTPS {
  address *:${values.httpsPort}
  secure 1
  map default *
}
virtualHost default {
  vhRoot ${root}/www
  configFile ${root}/conf/vhosts/default/vhost.conf
  allowSymbolLink 1
  enableScript 1
}
errorlog ${root}/logs/error.log { logLevel NOTICE rollingSize 10M keepDays 30 }
accesslog ${root}/logs/access.log { logFormat "%h %l %u %t \\\"%r\\\" %>s %b" rollingSize 10M keepDays 30 }
`;
}

function SaveButton({ busy, onClick, children }) {
  return <div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={onClick}>{busy ? "Saving…" : children}</button></div>;
}

export default function OpenLiteSpeedConfigModal({ installed, onClose }) {
  const current = Array.isArray(installed) ? installed.find((item) => item.status === "running") || installed[0] : installed;
  const [tab, setTab] = React.useState("settings");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [values, setValues] = React.useState(defaults);
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [logs, setLogs] = React.useState(null);

  const loadConfig = React.useCallback(() => apiRequest("/api/v1/services/openlitespeed/configuration").then((response) => response.ok ? response.json() : null).then((value) => { if (!value) return; setConfig(value); setText(value.content || ""); setValues((currentValues) => ({ ...currentValues, ...parseConfig(value.content || "") })); }).catch(() => {}), []);
  React.useEffect(() => { loadConfig(); }, [loadConfig]);
  React.useEffect(() => { if (tab !== "logs") return undefined; const load = () => apiRequest("/api/v1/services/openlitespeed/logs?page_size=50").then((response) => response.ok ? response.json() : null).then(setLogs).catch(() => {}); load(); const timer = window.setInterval(load, 3000); return () => window.clearInterval(timer); }, [tab]);
  const setValue = (key, value) => setValues((currentValues) => ({ ...currentValues, [key]: value }));
  const save = async (content = buildConfig(values)) => { setBusy(true); const response = await apiRequest("/api/v1/services/openlitespeed/configuration", { method: "PUT", body: JSON.stringify({ content }) }); const body = response.ok ? await response.json() : { message: await readApiError(response) }; setMessage(response.ok ? "OpenLiteSpeed configuration saved. Restart the server to apply it." : body.message); if (response.ok) setText(content); setBusy(false); };
  const serviceAction = async (actionName) => { setAction(actionName); const response = await apiRequest("/api/v1/services/openlitespeed/action", { method: "POST", body: JSON.stringify({ action: actionName }) }); const body = response.ok ? await response.json() : { message: await readApiError(response) }; if (!response.ok || !body.job_id) { setMessage(body.message || "OpenLiteSpeed action failed."); setAction(""); return; } let finalJob; for (let attempt = 0; attempt < 30; attempt += 1) { await new Promise((resolve) => window.setTimeout(resolve, 500)); const jobs = await apiRequest("/api/v1/jobs").then((result) => result.ok ? result.json() : []); finalJob = jobs.find((job) => job.id === body.job_id); if (finalJob && ["succeeded", "failed", "cancelled"].includes(finalJob.status)) break; } setMessage(finalJob?.message || `OpenLiteSpeed ${actionName} request finished.`); setAction(""); };
  const running = current?.status === "running";

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8"><section className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="openlitespeed-title"><div className="flex items-start justify-between gap-4"><div><h2 id="openlitespeed-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">OpenLiteSpeed</h2><p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><span className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`} />{current?.status || "stopped"}{current?.version && ` · v${current.version}`}</p></div><button type="button" aria-label="Close OpenLiteSpeed configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={onClose}><X size={18} /></button></div><div className="mt-6 flex gap-5 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800">{tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}><Icon size={15} />{label}</button>)}</div><div className="pt-5">{tab === "settings" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">OpenLiteSpeed server settings</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Configure the event-driven web server, default virtual host, and production-safe request behavior.</p></div><Field label="HTTP port"><input className={inputClass} type="number" min="1" max="65535" value={values.httpPort} onChange={(event) => setValue("httpPort", Number(event.target.value))} /></Field><Field label="HTTPS port"><input className={inputClass} type="number" min="1" max="65535" value={values.httpsPort} onChange={(event) => setValue("httpsPort", Number(event.target.value))} /></Field><Field label="Worker model" hint="OpenLiteSpeed uses an event-driven worker model; keep auto unless you are tuning a dedicated host."><input className={inputClass} value={values.workers} onChange={(event) => setValue("workers", event.target.value)} /></Field><SaveButton busy={busy} onClick={() => save()}>Save server settings</SaveButton></div>}{tab === "listeners" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Listeners</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">HTTP and HTTPS listeners map incoming hostnames to the default virtual host. Website-specific mappings are managed with the website.</p></div><Row label="HTTP listener" value={`*: ${values.httpPort}`} /><Row label="HTTPS listener" value={`*: ${values.httpsPort}`} /><Row label="Virtual host mapping" value="default" /><SaveButton busy={busy} onClick={() => save()}>Save listeners</SaveButton></div>}{tab === "performance" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Performance</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tune concurrency, keepalive behavior, compression, and built-in page caching for live websites.</p></div><Field label="Maximum connections"><input className={inputClass} type="number" min="128" value={values.connections} onChange={(event) => setValue("connections", Number(event.target.value))} /></Field><Field label="Keepalive timeout (seconds)"><input className={inputClass} type="number" min="1" value={values.keepalive} onChange={(event) => setValue("keepalive", Number(event.target.value))} /></Field><Toggle label="Gzip compression" description="Compress text responses when supported by the client." checked={values.compression} onChange={(value) => setValue("compression", value)} /><Toggle label="Brotli compression" description="Prefer Brotli for modern browsers and static assets." checked={values.brotli} onChange={(value) => setValue("brotli", value)} /><Toggle label="LiteSpeed Cache" description="Enable the built-in cache layer; application-specific cache rules still belong to the website." checked={values.cache} onChange={(value) => setValue("cache", value)} /><SaveButton busy={busy} onClick={() => save()}>Save performance</SaveButton></div>}{tab === "security" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Security</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Keep server details private and let website SSL settings manage certificates and secure listeners.</p></div><Toggle label="Hide server version" description="Do not expose the OpenLiteSpeed version in response headers and error pages." checked={!values.serverSignature} onChange={(value) => setValue("serverSignature", !value)} /><div className="rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">TLS certificates and SNI mappings are configured per website. Do not place private keys in the global server configuration.</div><SaveButton busy={busy} onClick={() => save()}>Save security</SaveButton></div>}{tab === "runtime" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Runtime</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Control the isolated OpenLiteSpeed process and inspect its managed paths.</p></div><div><Row label="Status" value={current?.status || "unknown"} /><Row label="Version" value={current?.version ? `v${current.version}` : "—"} /><Row label="Configuration" value={config?.config_path || "/opt/server-engine/services/openlitespeed/conf/httpd_config.conf"} /><Row label="Webroot" value="/opt/server-engine/services/openlitespeed/www" /><Row label="Access log" value="/opt/server-engine/services/openlitespeed/logs/access.log" /><Row label="Error log" value="/opt/server-engine/services/openlitespeed/logs/error.log" /></div><div className="flex gap-3"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={Boolean(action)} onClick={() => serviceAction(running ? "restart" : "start")}>{action ? `${action[0].toUpperCase()}${action.slice(1)}ing…` : running ? "Restart" : "Start"}</button>{running && <button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} disabled={Boolean(action)} onClick={() => serviceAction("stop")}>{action === "stop" ? "Stopping…" : "Stop"}</button>}</div></div>}{tab === "logs" && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">OpenLiteSpeed logs</h3><p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{logs?.path || "Loading…"}</p></div><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={() => apiRequest("/api/v1/services/openlitespeed/logs?page_size=50").then((response) => response.ok ? response.json() : null).then(setLogs)}><RefreshCw size={14} />Reload</button></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-300">{logs?.available ? logs.lines.join("\n") || "No log lines recorded." : logs ? "No log exists yet." : "Loading…"}</pre></div>}{tab === "configuration" && <div className="space-y-4"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Server configuration</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Edit the OpenLiteSpeed configuration directly. Guided controls remain available in the other tabs.</p><code className="mt-2 block break-all text-xs text-slate-500 dark:text-slate-400">{config?.config_path || "/opt/server-engine/services/openlitespeed/conf/httpd_config.conf"}</code></div><ConfigEditor path="httpd_config.conf" value={text} onChange={setText} /><div className="flex justify-end gap-3"><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={loadConfig}>Reset edits</button><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => save(text)}>{busy ? "Saving…" : "Save configuration"}</button></div></div>}</div>{message && <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">{message}</p>}</section></div>;
}
