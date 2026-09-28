import React from "react";
import {
  Activity,
  Database,
  FileCog,
  Gauge,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";

const tabs = [
  ["configuration", "Configuration", SlidersHorizontal],
  ["storage", "Storage", Database],
  ["security", "Security", ShieldCheck],
  ["performance", "Performance", Gauge],
  ["runtime", "Runtime", Activity],
  ["logs", "Logs", RefreshCw],
  ["file", "mongod.conf", FileCog],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  bindIp: "127.0.0.1",
  port: 27017,
  auth: "disabled",
  tls: "disabled",
  dbPath: "/opt/server-engine/services/mongodb/data",
  cacheSize: "0.5",
  journal: true,
  directoryPerDb: false,
  maxConnections: 1000,
  slowOpThreshold: 100,
  profiling: "slowOp",
};

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block text-xs font-normal leading-5 text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      )}
    </label>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
          {label}
        </span>
        {description && (
          <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 text-sm last:border-0 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="max-w-[70%] break-all text-right font-medium text-slate-900 dark:text-slate-100">
        {value || "—"}
      </span>
    </div>
  );
}

function parseConfig(content) {
  const read = (pattern, fallback) => content.match(pattern)?.[1]?.trim() || fallback;
  const bool = (pattern, fallback) => read(pattern, fallback ? "true" : "false") === "true";
  return {
    bindIp: read(/^\s*bindIp:\s*(.+)$/m, defaults.bindIp),
    port: Number(read(/^\s*port:\s*(\d+)$/m, defaults.port)),
    auth: read(/^\s*authorization:\s*(\w+)$/m, defaults.auth),
    tls: read(/^\s*mode:\s*(\w+)$/m, defaults.tls),
    dbPath: read(/^\s*dbPath:\s*(.+)$/m, defaults.dbPath),
    cacheSize: read(/^\s*cacheSizeGB:\s*([\d.]+)$/m, defaults.cacheSize),
    journal: bool(/^\s*enabled:\s*(true|false)$/m, defaults.journal),
    directoryPerDb: bool(/^\s*directoryPerDB:\s*(true|false)$/m, defaults.directoryPerDb),
    maxConnections: Number(read(/^\s*maxIncomingConnections:\s*(\d+)$/m, defaults.maxConnections)),
    slowOpThreshold: Number(read(/^\s*slowOpThresholdMs:\s*(\d+)$/m, defaults.slowOpThreshold)),
    profiling: read(/^\s*mode:\s*(slowOp|off|all)$/m, defaults.profiling),
  };
}

function buildConfig(values) {
  return `# MongoDB server configuration managed by Server Engine
systemLog:
  destination: file
  path: /opt/server-engine/services/mongodb/logs/mongod.log
  logAppend: true
  verbosity: 0
storage:
  dbPath: ${values.dbPath}
  journal:
    enabled: ${values.journal}
  directoryPerDB: ${values.directoryPerDb}
  wiredTiger:
    engineConfig:
      cacheSizeGB: ${values.cacheSize}
net:
  bindIp: ${values.bindIp}
  port: ${values.port}
  maxIncomingConnections: ${values.maxConnections}
security:
  authorization: ${values.auth}
  tls:
    mode: ${values.tls}
operationProfiling:
  mode: ${values.profiling}
  slowOpThresholdMs: ${values.slowOpThreshold}
processManagement:
  fork: false
`;
}

export default function MongoDbConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed) ? installed[0] : installed;
  const [tab, setTab] = React.useState("configuration");
  const [values, setValues] = React.useState(defaults);
  const [text, setText] = React.useState("");
  const [config, setConfig] = React.useState(null);
  const [logs, setLogs] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const [serviceStatus, setServiceStatus] = React.useState(current?.status || "stopped");

  const loadConfig = React.useCallback(async () => {
    const response = await apiRequest("/api/v1/services/mongodb/configuration");
    if (!response.ok) {
      setToast({ type: "error", message: await readApiError(response, "Unable to load MongoDB configuration.") });
      return;
    }
    const body = await response.json();
    setConfig(body);
    setText(body.content || "");
    setValues(parseConfig(body.content || ""));
  }, []);

  const loadLogs = React.useCallback(async () => {
    const response = await apiRequest("/api/v1/services/mongodb/logs?page_size=50");
    if (response.ok) setLogs(await response.json());
  }, []);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  React.useEffect(() => {
    if (tab !== "logs") return undefined;
    loadLogs();
    const timer = window.setInterval(loadLogs, 2500);
    return () => window.clearInterval(timer);
  }, [loadLogs, tab]);

  const setValue = (key, value) => setValues((currentValue) => ({ ...currentValue, [key]: value }));
  const save = async (content = buildConfig(values), label = "MongoDB configuration saved.") => {
    setBusy(true);
    const response = await apiRequest("/api/v1/services/mongodb/configuration", {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    if (response.ok) {
      setText(content);
      setToast({ type: "success", message: label });
    } else {
      setToast({ type: "error", message: await readApiError(response, "MongoDB configuration could not be saved.") });
    }
    setBusy(false);
    return response.ok;
  };

  const serviceAction = async (actionName) => {
    setAction(actionName);
    const response = await apiRequest("/api/v1/services/mongodb/action", {
      method: "POST",
      body: JSON.stringify({ action: actionName }),
    });
    const body = response.ok ? await response.json() : { message: await readApiError(response) };
    if (!response.ok || !body.job_id) {
      setToast({ type: "error", message: body.message || "MongoDB action failed." });
      setAction("");
      return;
    }
    let finalJob;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      const jobsResponse = await apiRequest("/api/v1/jobs");
      const jobs = jobsResponse.ok ? await jobsResponse.json() : [];
      finalJob = jobs.find((job) => job.id === body.job_id);
      if (finalJob && ["succeeded", "failed", "cancelled"].includes(finalJob.status)) break;
    }
    setToast({ type: finalJob?.status === "succeeded" ? "success" : "error", message: finalJob?.message || `MongoDB ${actionName} request finished.` });
    if (finalJob?.status === "succeeded") {
      setServiceStatus(actionName === "stop" ? "stopped" : "running");
    }
    setAction("");
  };

  const status = serviceStatus;
  const running = status === "running";
  const version = current?.version || service?.versions?.[0]?.version || "—";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <section className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="mongodb-title">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Database size={19} className="text-blue-600 dark:text-blue-400" />
              <h2 id="mongodb-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">MongoDB</h2>
            </div>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><span className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`} />{status} · v{version}</p>
          </div>
          <button type="button" aria-label="Close MongoDB configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex gap-5 overflow-x-auto border-b border-slate-200 px-6 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800">
          {tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}><Icon size={15} />{label}</button>)}
        </div>
        <div className="space-y-5 px-6 py-5">
          {tab === "configuration" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Server configuration</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Set the listener, authentication, and safe defaults for applications connecting to MongoDB.</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Bind address" hint="Use 127.0.0.1 for local applications, or a private interface for another server."><input className={inputClass} value={values.bindIp} onChange={(event) => setValue("bindIp", event.target.value)} /></Field><Field label="Port"><input className={inputClass} type="number" min="1" max="65535" value={values.port} onChange={(event) => setValue("port", Number(event.target.value))} /></Field></div><Field label="Authorization" hint="Enable this after creating an administrator account."><select className={inputClass} value={values.auth} onChange={(event) => setValue("auth", event.target.value)}><option value="disabled">Disabled</option><option value="enabled">Enabled</option></select></Field><Field label="TLS mode" hint="Use requireTLS only after certificates are configured."><select className={inputClass} value={values.tls} onChange={(event) => setValue("tls", event.target.value)}><option value="disabled">Disabled</option><option value="allowTLS">Allow TLS</option><option value="requireTLS">Require TLS</option></select></Field><div className="flex justify-end"><SaveButton saving={busy} onClick={() => save()}>Save configuration</SaveButton></div></div>}
          {tab === "storage" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Storage engine</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tune the data directory, journaling, and WiredTiger layout for production workloads.</p></div><Field label="Database directory"><input className={inputClass} value={values.dbPath} onChange={(event) => setValue("dbPath", event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="WiredTiger cache (GB)" hint="Leave headroom for the operating system and filesystem cache."><input className={inputClass} type="number" min="0.1" step="0.1" value={values.cacheSize} onChange={(event) => setValue("cacheSize", event.target.value)} /></Field><div className="pt-2"><Toggle label="Journaling" description="Keep crash recovery enabled for durable writes." checked={values.journal} onChange={(value) => setValue("journal", value)} /><Toggle label="Directory per database" description="Keep each database in its own directory." checked={values.directoryPerDb} onChange={(value) => setValue("directoryPerDb", value)} /></div></div><div className="flex justify-end"><SaveButton saving={busy} onClick={() => save()}>Save storage settings</SaveButton></div></div>}
          {tab === "security" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Security controls</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Keep MongoDB private by default and require explicit authentication before exposing it.</p></div><Toggle label="Require authenticated users" description="MongoDB will reject unauthenticated database operations when authorization is enabled." checked={values.auth === "enabled"} onChange={(value) => setValue("auth", value ? "enabled" : "disabled")} /><Toggle label="Allow TLS connections" description="Permit encrypted clients while retaining the current local connection policy." checked={values.tls !== "disabled"} onChange={(value) => setValue("tls", value ? "allowTLS" : "disabled")} /><div className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">Create your first administrator before enabling authorization. The panel does not store MongoDB passwords in this configuration file.</div><div className="flex justify-end"><SaveButton saving={busy} onClick={() => save()}>Save security settings</SaveButton></div></div>}
          {tab === "performance" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Performance and diagnostics</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Control connection capacity and collect slow-operation data without logging every request.</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Maximum connections"><input className={inputClass} type="number" min="10" value={values.maxConnections} onChange={(event) => setValue("maxConnections", Number(event.target.value))} /></Field><Field label="Slow operation threshold (ms)" hint="Queries slower than this are recorded when slow profiling is enabled."><input className={inputClass} type="number" min="0" value={values.slowOpThreshold} onChange={(event) => setValue("slowOpThreshold", Number(event.target.value))} /></Field></div><Field label="Profiling mode"><select className={inputClass} value={values.profiling} onChange={(event) => setValue("profiling", event.target.value)}><option value="slowOp">Slow operations only</option><option value="off">Disabled</option><option value="all">All operations (diagnostic only)</option></select></Field><div className="flex justify-end"><SaveButton saving={busy} onClick={() => save()}>Save performance settings</SaveButton></div></div>}
          {tab === "runtime" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">MongoDB runtime</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Control the MongoDB process and inspect the paths used by this installation.</p></div><div><Row label="Status" value={status} /><Row label="Version" value={`v${version}`} /><Row label="Configuration" value={config?.config_path || "/opt/server-engine/services/mongodb/conf/mongod.conf"} /><Row label="Data directory" value={values.dbPath} /><Row label="Log file" value="/opt/server-engine/services/mongodb/logs/mongod.log" /></div><div className="flex gap-3"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={Boolean(action)} onClick={() => serviceAction(running ? "restart" : "start")}>{action ? `${action[0].toUpperCase()}${action.slice(1)}ing…` : running ? "Restart" : "Start"}</button>{running && <button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} disabled={Boolean(action)} onClick={() => serviceAction("stop")}>{action === "stop" ? "Stopping…" : "Stop"}</button>}</div></div>}
          {tab === "logs" && <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">MongoDB logs</h3><p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{logs?.path || "/opt/server-engine/services/mongodb/logs/mongod.log"}</p></div><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={loadLogs}><RefreshCw size={14} />Reload</button></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-300">{logs?.available ? logs.lines.join("\n") || "No log lines recorded." : logs ? "No log exists yet." : "Loading…"}</pre></div>}
          {tab === "file" && <div className="space-y-4"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">mongod.conf</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Edit the complete MongoDB YAML configuration. Validate the file before restarting MongoDB.</p><code className="mt-2 block break-all text-xs text-slate-500 dark:text-slate-400">{config?.config_path || "/opt/server-engine/services/mongodb/conf/mongod.conf"}</code></div><ConfigEditor path="mongod.conf" value={text} onChange={setText} /><div className="flex justify-end gap-3"><button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={loadConfig}>Reset edits</button><SaveButton saving={busy} onClick={() => save(text, "mongod.conf saved.")}>Save mongod.conf</SaveButton></div></div>}
        </div>
      </section>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
