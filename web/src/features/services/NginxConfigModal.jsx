import React from "react";
import {
  Activity,
  Code2,
  Gauge,
  Globe2,
  Layers3,
  RefreshCw,
  ScrollText,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";

const tabs = [
  ["settings", "Settings", Globe2],
  ["performance", "Performance", Gauge],
  ["security", "Security", ShieldCheck],
  ["sites", "Sites", Layers3],
  ["configuration", "nginx.conf", Code2],
  ["runtime", "Runtime", Activity],
  ["error-log", "Error log", RefreshCw],
  ["response-log", "Response log", ScrollText],
];
const inputClass = "mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:text-slate-100";
const buttonClass = "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold";

function Field({ label, children }) {
  return <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}{children}</label>;
}
function Toggle({ label, description, checked, onChange }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-slate-200 py-3 last:border-b-0 dark:border-slate-800"><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600" /></label>;
}
function Row({ label, value, hint }) {
  return <div className="flex w-full items-start justify-between gap-4 border-b border-slate-200 py-3 last:border-b-0 dark:border-slate-800"><div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>{hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}</div><strong className="text-right text-sm text-slate-700 dark:text-slate-300">{value}</strong></div>;
}

function IndexFilesField({ value, onChange }) {
  const [draft, setDraft] = React.useState("");
  const items = value.split(/\s+/).filter(Boolean);
  function addItem() {
    const next = draft.trim();
    if (!next || items.includes(next)) return;
    onChange([...items, next].join(" "));
    setDraft("");
  }
  function removeItem(item) {
    onChange(items.filter((current) => current !== item).join(" "));
  }
  return (
    <div className="mt-1.5 rounded-md border border-slate-300 px-2 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {item}
            <button type="button" aria-label={`Remove ${item}`} className="cursor-pointer text-slate-400 hover:text-slate-700 dark:hover:text-slate-100" onMouseDown={(event) => event.preventDefault()} onClick={() => removeItem(item)}>×</button>
          </span>
        ))}
        <input className="min-w-[9rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-900 outline-none dark:text-slate-100" value={draft} placeholder="Type a file and press Enter" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addItem(); } }} />
        <button type="button" className="cursor-pointer px-1 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={addItem}>Add</button>
      </div>
    </div>
  );
}

function Settings({ config, busy, message, onSave }) {
  const [values, setValues] = React.useState({ listen: "80", root: "/opt/server-engine/www", index: "index.php index.html index.htm", php: "Enabled", proxy: "Enabled" });
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nginx web server settings</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Configure the default web root, request routing, PHP-FPM handling, and static file behavior.</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="HTTP port"><input className={inputClass} type="number" value={values.listen} onChange={(event) => set("listen", event.target.value)} /></Field><Field label="Default website root"><input className={inputClass} value={values.root} onChange={(event) => set("root", event.target.value)} /></Field><Field label="Index files"><IndexFilesField value={values.index} onChange={(value) => set("index", value)} /></Field><Field label="PHP-FPM routing"><select className={`${inputClass} bg-white dark:bg-slate-900`} value={values.php} onChange={(event) => set("php", event.target.value)}><option>Enabled</option><option>Disabled</option></select></Field><Field label="Reverse proxy support"><select className={`${inputClass} bg-white dark:bg-slate-900`} value={values.proxy} onChange={(event) => set("proxy", event.target.value)}><option>Enabled</option><option>Disabled</option></select></Field></div><div className="border-t border-slate-200 pt-2 dark:border-slate-800"><Row label="Configuration file" value={config?.config_path || "/opt/server-engine/services/nginx/conf/nginx.conf"} /><Row label="Virtual hosts" value="Managed per website" hint="Website configurations are kept under conf/sites/*.conf." /><Row label="Validation" value="Checked before save" /></div>{message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}<div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => onSave(values)}>{busy ? "Saving…" : "Save Nginx settings"}</button></div></div>;
}

function Performance({ busy, message, onSave }) {
  const [values, setValues] = React.useState({ workers: "auto", connections: "4096", keepalive: "65", upload: "64m", proxy: "60", gzip: true, sendfile: true, http2: true });
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nginx performance</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tune worker capacity, connection reuse, uploads, proxy timeouts, and response delivery for live websites.</p></div><div className="grid gap-4 sm:grid-cols-3"><Field label="Worker processes"><select className={`${inputClass} bg-white dark:bg-slate-900`} value={values.workers} onChange={(event) => set("workers", event.target.value)}><option value="auto">auto</option><option value="1">1</option><option value="2">2</option><option value="4">4</option></select></Field><Field label="Worker connections"><input className={inputClass} type="number" value={values.connections} onChange={(event) => set("connections", event.target.value)} /></Field><Field label="Keep-alive timeout (seconds)"><input className={inputClass} type="number" value={values.keepalive} onChange={(event) => set("keepalive", event.target.value)} /></Field><Field label="Maximum upload"><input className={inputClass} value={values.upload} onChange={(event) => set("upload", event.target.value)} /></Field><Field label="Proxy read timeout (seconds)"><input className={inputClass} type="number" value={values.proxy} onChange={(event) => set("proxy", event.target.value)} /></Field></div><div className="border-t border-slate-200 dark:border-slate-800"><Toggle label="Gzip compression" description="Compress text responses and preserve the correct cache variation." checked={values.gzip} onChange={(value) => set("gzip", value)} /><Toggle label="Sendfile" description="Use the kernel fast path for static file delivery." checked={values.sendfile} onChange={(value) => set("sendfile", value)} /><Toggle label="HTTP/2" description="Enable multiplexed TLS connections for supported sites." checked={values.http2} onChange={(value) => set("http2", value)} /></div>{message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}<div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => onSave(values)}>{busy ? "Saving…" : "Save performance profile"}</button></div></div>;
}

function Security() {
  const [values, setValues] = React.useState({ tokens: true, headers: true, tls: true, listing: false, limits: true });
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nginx security profile</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Safe defaults for TLS, headers, request limits, and information disclosure.</p></div><div className="border-t border-slate-200 dark:border-slate-800"><Toggle label="Hide server version" description="Remove the Nginx version from response headers and error pages." checked={values.tokens} onChange={(value) => set("tokens", value)} /><Toggle label="Security response headers" description="Apply nosniff, frame protection, referrer policy, and permissions policy." checked={values.headers} onChange={(value) => set("headers", value)} /><Toggle label="Modern TLS policy" description="Allow TLS 1.2 and TLS 1.3 while disabling obsolete protocols." checked={values.tls} onChange={(value) => set("tls", value)} /><Toggle label="Request limits" description="Protect headers, bodies, and slow clients from exhausting workers." checked={values.limits} onChange={(value) => set("limits", value)} /><Toggle label="Directory listing" description="Keep directory indexes disabled unless a site explicitly enables them." checked={values.listing} onChange={(value) => set("listing", value)} /></div><div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}>Save security profile</button></div></div>;
}

function Sites({ setMessage }) {
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nginx virtual hosts</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Each website receives its own server block, document root, access log, error log, and optional TLS certificate.</p></div><div className="flex items-start gap-3 border-y border-slate-200 py-5 dark:border-slate-800"><Globe2 size={20} className="mt-0.5 text-blue-600" /><div><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Website configurations are managed from Websites</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create a website to generate a validated Nginx server block.</p><button type="button" className="mt-3 cursor-pointer text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={() => setMessage("Create a website from Websites to generate its Nginx server block.")}>Open Websites</button></div></div></div>;
}

export default function NginxConfigModal({ service, installed, onClose }) {
  const current = (Array.isArray(installed) ? installed : [installed]).filter(Boolean)[0];
  const [runtimeStatus, setRuntimeStatus] = React.useState(current?.status || "not installed");
  const [runtimeVersion, setRuntimeVersion] = React.useState(current?.version || "");
  React.useEffect(() => {
    setRuntimeStatus(current?.status || "not installed");
    setRuntimeVersion(current?.version || "");
  }, [current?.status, current?.version]);
  const running = runtimeStatus === "running";
  const [tab, setTab] = React.useState("settings");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [logs, setLogs] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState("");
  React.useEffect(() => { apiRequest("/api/v1/services/nginx/configuration").then((response) => response.ok ? response.json() : null).then((value) => { setConfig(value); setText(value?.content || ""); }).catch(() => {}); }, []);
  const loadLogs = React.useCallback(() => apiRequest(`/api/v1/services/nginx/logs?lines=150&kind=${tab === "response-log" ? "response" : "error"}`).then((response) => response.ok ? response.json() : null).then(setLogs).catch(() => {}), [tab]);
  React.useEffect(() => { if (!["error-log", "response-log"].includes(tab)) return undefined; loadLogs(); const timer = window.setInterval(loadLogs, 2500); return () => window.clearInterval(timer); }, [tab, loadLogs]);
  async function save(content = text) { setBusy(true); const response = await apiRequest("/api/v1/services/nginx/configuration", { method: "PUT", body: JSON.stringify({ content }) }); const body = response.ok ? await response.json() : { message: await readApiError(response) }; if (response.ok) setText(content); setMessage(body.saved ? `Saved. Backup created at ${body.backup || "the Nginx backup directory"}.` : body.message); setBusy(false); }
  function replaceDirective(content, directive, value) { const pattern = new RegExp(`^${directive}\\s+.*$`, "mi"); return pattern.test(content) ? content.replace(pattern, `${directive} ${value}`) : `${content.trimEnd()}\n${directive} ${value}\n`; }
  function savePerformance(values) { let next = text; const directives = { worker_processes: values.workers, worker_connections: values.connections, keepalive_timeout: values.keepalive, client_max_body_size: values.upload, sendfile: values.sendfile ? "on" : "off", gzip: values.gzip ? "on" : "off" }; Object.entries(directives).forEach(([key, value]) => { next = replaceDirective(next, key, value); }); save(next); }
async function serviceAction(actionName) { setAction(actionName); const response = await apiRequest("/api/v1/services/nginx/action", { method: "POST", body: JSON.stringify({ action: actionName }) }); const body = response.ok ? await response.json() : { message: await readApiError(response) }; if (!response.ok || !body.job_id) { setMessage(body.message || "Nginx action failed."); setAction(""); return; } let finalJob; for (let attempt = 0; attempt < 30; attempt += 1) { await new Promise((resolve) => window.setTimeout(resolve, 700)); const jobs = await apiRequest("/api/v1/jobs").then((result) => result.ok ? result.json() : []); finalJob = jobs.find((job) => job.id === body.job_id); if (finalJob && ["succeeded", "failed", "cancelled"].includes(finalJob.status)) break; } if (finalJob?.status === "succeeded") { const refreshed = await apiRequest("/api/v1/services/installed"); if (refreshed.ok) { const detected = await refreshed.json(); const next = detected.find((item) => item.id === "nginx"); setRuntimeStatus(next?.status || "stopped"); setRuntimeVersion(next?.version || runtimeVersion); } } else if (finalJob?.message) setMessage(finalJob.message); setAction(""); }
  const primary = running ? "stop" : "start";
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Nginx</h2><p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><span className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`} />{runtimeStatus}{runtimeVersion && ` · v${runtimeVersion}`}</p></div><button type="button" aria-label="Close Nginx configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={onClose}><X size={18} /></button></div><div className="mt-6 flex gap-5 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800">{tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}><Icon size={15} />{label}</button>)}</div><div className="pt-5">{tab === "settings" && <Settings config={config} busy={busy} message={message} onSave={(values) => save(replaceDirective(text, "listen", values.listen))} />}{tab === "performance" && <Performance busy={busy} message={message} onSave={savePerformance} />}{tab === "security" && <Security />}{tab === "sites" && <Sites setMessage={setMessage} />}{tab === "configuration" && <div className="space-y-4"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nginx configuration</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Edit the main file here. Website server blocks remain managed per website.</p><code className="mt-2 block text-xs text-slate-500 dark:text-slate-400">{config?.config_path || "/opt/server-engine/services/nginx/conf/nginx.conf"}</code></div><ConfigEditor path="nginx.conf" value={text} onChange={setText} /><div className="flex justify-end gap-3"><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={() => setText(config?.content || "")}>Reset edits</button><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => save()}>{busy ? "Saving…" : "Save configuration"}</button></div>{message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}</div>}{tab === "runtime" && <div className="space-y-5"><div className="flex items-start gap-3"><Server size={19} className="mt-0.5 text-blue-600" /><div className="min-w-0 flex-1"><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nginx runtime</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Control the Nginx master process and inspect its isolated runtime paths.</p><div className="mt-4 w-full"><Row label="Worker model" value="Configured in Performance" /><Row label="PID file" value="logs/nginx.pid" /><Row label="Error log" value="logs/error.log" /><Row label="Response log" value="logs/access.log" /></div><div className="mt-4 flex gap-3"><button type="button" className={`${buttonClass} ${primary === "stop" ? "border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300" : "bg-blue-600 text-white hover:bg-blue-700"}`} disabled={Boolean(action)} onClick={() => serviceAction(primary)}>{action === primary ? `${primary === "start" ? "Starting" : "Stopping"}…` : primary === "start" ? "Start" : "Stop"}</button>{running && <button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} disabled={Boolean(action)} onClick={() => serviceAction("restart")}>{action === "restart" ? "Restarting…" : "Restart"}</button>}</div></div></div>{message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}</div>}{["error-log", "response-log"].includes(tab) && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nginx {tab === "response-log" ? "response log" : "error log"}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{logs?.path || "Loading…"}</p></div><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={loadLogs}><RefreshCw size={14} />Reload</button></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-300">{logs?.available ? logs.lines.join("\n") || "No log lines recorded." : "No log exists yet."}</pre></div>}</div></section></div>;
}
