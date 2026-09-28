import React from "react";
import {
  Activity,
  Check,
  Code2,
  Gauge,
  Globe2,
  Layers3,
  LockKeyhole,
  RefreshCw,
  Server,
  ShieldCheck,
  ScrollText,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";

const tabs = [
  ["overview", "Settings", Globe2],
  ["performance", "Performance", Gauge],
  ["security", "Security", ShieldCheck],
  ["modules", "Modules", Layers3],
  ["vhosts", "Virtual hosts", Globe2],
  ["configuration", "httpd.conf", Code2],
  ["runtime", "Runtime", Activity],
  ["logs", "Error log", RefreshCw],
  ["response-log", "Response log", ScrollText],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:text-slate-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold";

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
      {label}
      {children}
    </label>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-slate-200 py-3 last:border-b-0 dark:border-slate-800">
      <span>
        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
          {label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
      />
    </label>
  );
}

function SummaryRow({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 py-3 last:border-b-0 dark:border-slate-800">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {label}
        </p>
        {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
      <strong className="text-right text-sm font-semibold text-slate-700 dark:text-slate-300">
        {value}
      </strong>
    </div>
  );
}

function Overview({ config, onSave, busy, message }) {
  const [values, setValues] = React.useState({
    listen: "80",
    documentRoot: "/opt/server-engine/www",
    mpm: "event",
    keepAlive: "On",
    compression: "On",
    phpHandler: "PHP-FPM via proxy_fcgi",
  });
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Apache web server configuration
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          A production-ready starting point for websites, PHP applications, reverse proxies, and virtual hosts.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="HTTP port">
          <input className={inputClass} type="number" min="1" max="65535" value={values.listen} onChange={(event) => set("listen", event.target.value)} />
        </Field>
        <Field label="Multi-processing module">
          <select className={`${inputClass} bg-white dark:bg-slate-900`} value={values.mpm} onChange={(event) => set("mpm", event.target.value)}>
            <option value="event">event · recommended</option>
            <option value="worker">worker · threaded</option>
            <option value="prefork">prefork · compatibility</option>
          </select>
        </Field>
        <Field label="Default document root">
          <input className={inputClass} value={values.documentRoot} onChange={(event) => set("documentRoot", event.target.value)} />
        </Field>
        <Field label="PHP request handler">
          <select className={`${inputClass} bg-white dark:bg-slate-900`} value={values.phpHandler} onChange={(event) => set("phpHandler", event.target.value)}>
            <option>PHP-FPM via proxy_fcgi</option>
            <option>Disabled</option>
          </select>
        </Field>
        <Field label="Keep-alive">
          <select className={`${inputClass} bg-white dark:bg-slate-900`} value={values.keepAlive} onChange={(event) => set("keepAlive", event.target.value)}>
            <option>On</option>
            <option>Off</option>
          </select>
        </Field>
        <Field label="Response compression">
          <select className={`${inputClass} bg-white dark:bg-slate-900`} value={values.compression} onChange={(event) => set("compression", event.target.value)}>
            <option>On</option>
            <option>Off</option>
          </select>
        </Field>
      </div>
      <div className="border-t border-slate-200 pt-2 dark:border-slate-800">
        <SummaryRow label="Configuration file" value={config?.config_path || "/opt/server-engine/services/apache/conf/httpd.conf"} />
        <SummaryRow label="Virtual hosts" value="Managed per website" hint="Each website can keep its own document root, TLS certificate, logs, and rewrite rules." />
        <SummaryRow label="TLS baseline" value="TLS 1.2 and 1.3" hint="Older protocols are disabled in the production profile." />
      </div>
      {message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}
      <div className="flex justify-end">
        <button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => onSave(values)}>
          {busy ? "Saving…" : "Save Apache settings"}
        </button>
      </div>
    </div>
  );
}

function Performance({ busy, message, onSave }) {
  const [values, setValues] = React.useState({
    mpm: "event",
    serverLimit: "16",
    threadsPerChild: "25",
    maxRequests: "400",
    minSpareThreads: "75",
    maxSpareThreads: "250",
    keepAliveTimeout: "5",
    keepAliveRequests: "100",
    requestTimeout: "60",
    asyncRequestWorkerFactor: "2",
    compression: true,
    http2: true,
    sendfile: true,
  });
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Performance profile</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tune connection capacity and response handling for live websites without editing Apache directives by hand.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="MPM worker model"><select className={`${inputClass} bg-white dark:bg-slate-900`} value={values.mpm} onChange={(event) => set("mpm", event.target.value)}><option value="event">event · recommended</option><option value="worker">worker</option><option value="prefork">prefork</option></select></Field>
        <Field label="Maximum concurrent requests"><input className={inputClass} type="number" min="25" value={values.maxRequests} onChange={(event) => set("maxRequests", event.target.value)} /></Field>
        <Field label="Threads per child"><input className={inputClass} type="number" min="1" value={values.threadsPerChild} onChange={(event) => set("threadsPerChild", event.target.value)} /></Field>
        <Field label="Server limit"><input className={inputClass} type="number" min="1" value={values.serverLimit} onChange={(event) => set("serverLimit", event.target.value)} /></Field>
        <Field label="Minimum spare threads"><input className={inputClass} type="number" min="1" value={values.minSpareThreads} onChange={(event) => set("minSpareThreads", event.target.value)} /></Field>
        <Field label="Maximum spare threads"><input className={inputClass} type="number" min="1" value={values.maxSpareThreads} onChange={(event) => set("maxSpareThreads", event.target.value)} /></Field>
        <Field label="Keep-alive timeout (seconds)"><input className={inputClass} type="number" min="0" value={values.keepAliveTimeout} onChange={(event) => set("keepAliveTimeout", event.target.value)} /></Field>
        <Field label="Keep-alive requests"><input className={inputClass} type="number" min="0" value={values.keepAliveRequests} onChange={(event) => set("keepAliveRequests", event.target.value)} /></Field>
        <Field label="Request timeout (seconds)"><input className={inputClass} type="number" min="1" value={values.requestTimeout} onChange={(event) => set("requestTimeout", event.target.value)} /></Field>
        <Field label="Async worker factor"><input className={inputClass} type="number" min="1" value={values.asyncRequestWorkerFactor} onChange={(event) => set("asyncRequestWorkerFactor", event.target.value)} /></Field>
      </div>
      <div className="border-t border-slate-200 dark:border-slate-800">
        <Toggle label="HTTP/2" description="Enable multiplexed HTTPS connections for supported virtual hosts." checked={values.http2} onChange={(value) => set("http2", value)} />
        <Toggle label="Response compression" description="Compress text responses with mod_deflate and vary the cache correctly." checked={values.compression} onChange={(value) => set("compression", value)} />
        <Toggle label="Sendfile" description="Use the kernel fast path for static files when the filesystem supports it." checked={values.sendfile} onChange={(value) => set("sendfile", value)} />
      </div>
      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Max concurrent requests should be sized for available memory. Apache’s event MPM requires MaxRequestWorkers to be compatible with ThreadsPerChild.</p>
      {message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}
      <div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => onSave(values)}>{busy ? "Saving…" : "Save performance profile"}</button></div>
    </div>
  );
}

function Security() {
  const [values, setValues] = React.useState({
    serverTokens: true,
    headers: true,
    directoryListing: false,
    hsts: true,
    tls13: true,
    requestLimits: true,
  });
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Apache security profile</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Production defaults for information disclosure, TLS, headers, and request abuse limits.</p>
      </div>
      <div className="border-t border-slate-200 dark:border-slate-800">
        <Toggle label="Hide Apache version" description="Send a minimal Server header and keep module details out of error pages." checked={values.serverTokens} onChange={(value) => set("serverTokens", value)} />
        <Toggle label="Security response headers" description="Apply nosniff, frame protection, referrer policy, and a safe permissions policy." checked={values.headers} onChange={(value) => set("headers", value)} />
        <Toggle label="HSTS for HTTPS sites" description="Tell browsers to use HTTPS after TLS has been confirmed for the domain." checked={values.hsts} onChange={(value) => set("hsts", value)} />
        <Toggle label="TLS 1.3" description="Allow modern TLS while retaining TLS 1.2 for broad client compatibility." checked={values.tls13} onChange={(value) => set("tls13", value)} />
        <Toggle label="Request limits" description="Protect the server from oversized headers, bodies, and slow request exhaustion." checked={values.requestLimits} onChange={(value) => set("requestLimits", value)} />
        <Toggle label="Directory listing" description="Never expose a directory index unless a website explicitly enables it." checked={values.directoryListing} onChange={(value) => set("directoryListing", value)} />
      </div>
      <div className="flex items-start gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400"><LockKeyhole size={17} className="mt-0.5 shrink-0 text-blue-600" /><p>Apache security settings are applied per virtual host where a domain needs a different policy.</p></div>
      <div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}>Save security profile</button></div>
    </div>
  );
}

function Modules() {
  const modules = [
    ["mpm_event", "Event MPM", "Connection scheduling for modern threaded Linux servers.", true],
    ["ssl", "TLS / SSL", "HTTPS certificates and secure virtual hosts.", true],
    ["rewrite", "URL rewriting", "Clean URLs, redirects, and Laravel/WordPress front controllers.", true],
    ["headers", "Response headers", "Security and cache headers.", true],
    ["proxy_fcgi", "PHP-FPM proxy", "Pass PHP requests to the selected PHP-FPM socket.", true],
    ["http2", "HTTP/2", "Multiplexed HTTPS requests.", true],
    ["deflate", "Compression", "Gzip compression for text responses.", true],
    ["expires", "Browser caching", "Expires and Cache-Control helpers for static assets.", false],
    ["status", "Server status", "Optional local-only runtime diagnostics.", false],
  ];
  const [enabled, setEnabled] = React.useState(() => Object.fromEntries(modules.map(([id, , , value]) => [id, value])));
  return (
    <div className="space-y-5">
      <div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Apache modules</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Keep the common web stack ready while making optional features explicit.</p></div>
      <div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {modules.map(([id, name, description]) => <div key={id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">{name} <code className="ml-1 text-xs text-slate-500">{id}</code></p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p></div><button type="button" onClick={() => setEnabled((current) => ({ ...current, [id]: !current[id] }))} className={`${buttonClass} px-2.5 py-1.5 text-xs ${enabled[id] ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}>{enabled[id] && <Check size={14} />} {enabled[id] ? "Enabled" : "Disabled"}</button></div>)}
      </div>
      <div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}>Save module profile</button></div>
    </div>
  );
}

function VirtualHosts({ message, setMessage }) {
  return (
    <div className="space-y-5">
      <div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Virtual hosts</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Each website gets an isolated Apache host definition, document root, logs, and optional TLS certificate.</p></div>
      <div className="flex items-start gap-3 border-y border-slate-200 py-5 dark:border-slate-800"><Globe2 size={20} className="mt-0.5 text-blue-600" /><div><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">No Apache websites configured yet</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create a website to generate its virtual host automatically.</p><button type="button" className="mt-3 cursor-pointer text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={() => setMessage("Create a website from Websites to generate an Apache virtual host.")}>Open Websites</button></div></div>
      {message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}
    </div>
  );
}

export default function ApacheConfigModal({ service, installed, onClose }) {
  const current = (Array.isArray(installed) ? installed : [installed]).filter(Boolean)[0];
  const [runtimeStatus, setRuntimeStatus] = React.useState(current?.status || "not installed");
  const [runtimeVersion, setRuntimeVersion] = React.useState(current?.version || "");
  React.useEffect(() => {
    setRuntimeStatus(current?.status || "not installed");
    setRuntimeVersion(current?.version || "");
  }, [current?.status, current?.version]);
  const running = runtimeStatus === "running";
  const [tab, setTab] = React.useState("overview");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [logs, setLogs] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState("");
  React.useEffect(() => {
    apiRequest("/api/v1/services/apache/configuration").then((response) => (response.ok ? response.json() : null)).then((value) => { setConfig(value); setText(value?.content || ""); }).catch(() => {});
  }, []);
  const loadLogs = React.useCallback(() => apiRequest(`/api/v1/services/apache/logs?lines=150&kind=${tab === "response-log" ? "response" : "error"}`).then((response) => (response.ok ? response.json() : null)).then(setLogs).catch(() => {}), [tab]);
  React.useEffect(() => { if (tab !== "logs") return undefined; loadLogs(); const timer = window.setInterval(loadLogs, 2500); return () => window.clearInterval(timer); }, [tab, loadLogs]);
  async function save(content = text) {
    setBusy(true);
    const response = await apiRequest("/api/v1/services/apache/configuration", { method: "PUT", body: JSON.stringify({ content }) });
    const body = response.ok ? await response.json() : { message: await readApiError(response) };
    if (response.ok) setText(content);
    setMessage(body.saved ? `Saved. Backup created at ${body.backup || "the Apache backup directory"}.` : body.message);
    setBusy(false);
  }
  function replaceDirective(content, directive, value) {
    const pattern = new RegExp(`^${directive}\\s+.*$`, "mi");
    return pattern.test(content)
      ? content.replace(pattern, `${directive} ${value}`)
      : `${content.trimEnd()}\n${directive} ${value}\n`;
  }
  function savePerformance(values) {
    let next = text || "";
    const directives = {
      ServerLimit: values.serverLimit,
      ThreadsPerChild: values.threadsPerChild,
      MaxRequestWorkers: values.maxRequests,
      MinSpareThreads: values.minSpareThreads,
      MaxSpareThreads: values.maxSpareThreads,
      KeepAliveTimeout: values.keepAliveTimeout,
      MaxKeepAliveRequests: values.keepAliveRequests,
      Timeout: values.requestTimeout,
      AsyncRequestWorkerFactor: values.asyncRequestWorkerFactor,
      EnableSendfile: values.sendfile ? "On" : "Off",
    };
    Object.entries(directives).forEach(([directive, value]) => { next = replaceDirective(next, directive, value); });
    save(next);
  }
  async function serviceAction(actionName) {
    setAction(actionName);
    const response = await apiRequest("/api/v1/services/apache/action", { method: "POST", body: JSON.stringify({ action: actionName }) });
    const body = response.ok ? await response.json() : { message: await readApiError(response) };
    if (!response.ok || !body.job_id) { setMessage(body.message || "Apache action failed."); setAction(""); return; }
    let finalJob;
    for (let attempt = 0; attempt < 30; attempt += 1) { await new Promise((resolve) => window.setTimeout(resolve, 700)); const jobs = await apiRequest("/api/v1/jobs").then((result) => result.ok ? result.json() : []); finalJob = jobs.find((job) => job.id === body.job_id); if (finalJob && ["succeeded", "failed", "cancelled"].includes(finalJob.status)) break; }
    if (finalJob?.status === "succeeded") {
      const refreshed = await apiRequest("/api/v1/services/installed");
      if (refreshed.ok) {
        const detected = await refreshed.json();
        const next = detected.find((item) => item.id === "apache");
        setRuntimeStatus(next?.status || "stopped");
        setRuntimeVersion(next?.version || runtimeVersion);
      }
    } else if (finalJob?.message) {
      setMessage(finalJob.message);
    }
    setAction("");
  }
  const primary = running ? "stop" : "start";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Apache HTTP Server</h2><p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><span className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`} />{runtimeStatus}{runtimeVersion && ` · v${runtimeVersion}`}</p></div><button type="button" aria-label="Close Apache configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={onClose}><X size={18} /></button></div>
        <div className="mt-6 flex gap-5 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800">{tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}><Icon size={15} />{label}</button>)}</div>
        <div className="pt-5">
          {tab === "overview" && <Overview config={config} busy={busy} message={message} onSave={(values) => save(text.replace(/^Listen\s+\d+/m, `Listen ${values.listen}`))} />}
          {tab === "performance" && <Performance busy={busy} message={message} onSave={savePerformance} />}
          {tab === "security" && <Security />}
          {tab === "modules" && <Modules />}
          {tab === "vhosts" && <VirtualHosts message={message} setMessage={setMessage} />}
          {tab === "configuration" && <div className="space-y-4"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Apache configuration</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Edit the main file here. Website-specific rules belong in each virtual host.</p><code className="mt-2 block text-xs text-slate-500 dark:text-slate-400">{config?.config_path || "/opt/server-engine/services/apache/conf/httpd.conf"}</code></div><ConfigEditor path="httpd.conf" value={text} onChange={setText} /><div className="flex justify-end gap-3"><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800`} disabled={busy} onClick={() => setText(config?.content || "")}>Reset edits</button><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => save()}>{busy ? "Saving…" : "Save configuration"}</button></div>{message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}</div>}
          {tab === "runtime" && <div className="space-y-5"><div className="flex items-start gap-3"><Server size={19} className="mt-0.5 text-blue-600" /><div className="min-w-0 flex-1"><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Apache runtime</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Control the Apache parent process and keep its isolated runtime healthy.</p><div className="mt-4 w-full space-y-0"><SummaryRow label="Worker model" value="event MPM" hint="Threaded connection handling for modern Linux servers." /><SummaryRow label="PID file" value="run/httpd.pid" /><SummaryRow label="Error log" value="logs/error.log" /><SummaryRow label="Response log" value="logs/access.log" /></div><div className="mt-4 flex gap-3"><button type="button" className={`${buttonClass} ${primary === "stop" ? "border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300" : "bg-blue-600 text-white hover:bg-blue-700"}`} disabled={Boolean(action)} onClick={() => serviceAction(primary)}>{action === primary ? `${primary === "start" ? "Starting" : "Stopping"}…` : primary === "start" ? "Start" : "Stop"}</button>{running && <button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} disabled={Boolean(action)} onClick={() => serviceAction("restart")}>{action === "restart" ? "Restarting…" : "Restart"}</button>}</div></div></div>{message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}</div>}
          {(tab === "logs" || tab === "response-log") && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Apache {tab === "response-log" ? "response log" : "error log"}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{logs?.path || "Loading…"}</p></div><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={loadLogs}><RefreshCw size={14} />Reload</button></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-300">{logs?.available ? logs.lines.join("\n") || `No ${tab === "response-log" ? "response" : "error"} log lines recorded.` : "No log exists yet."}</pre></div>}
        </div>
      </section>
    </div>
  );
}
