import React from "react";
import {
  Activity,
  Database,
  FileCog,
  Gauge,
  Network,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";
import Toast from "../../components/Toast";
import useServiceSocketStatus from "../../hooks/useServiceSocketStatus";

const tabs = [
  ["runtime", "Runtime", Activity],
  ["overview", "Overview", Database],
  ["connection", "Connection", Network],
  ["resources", "Resources", Gauge],
  ["security", "Security", ShieldCheck],
  ["configuration", "Configuration", FileCog],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  edition: "Developer",
  bindAddress: "127.0.0.1",
  port: 1433,
  memoryLimit: 2048,
  maxDop: 0,
  agent: false,
  hadr: false,
  collation: "SQL_Latin1_General_CP1_CI_AS",
  dataDirectory: "/opt/server-engine/services/sqlserver/data",
  backupDirectory: "/opt/server-engine/services/sqlserver/backups",
};

function Field({ label, children, hint }) {
  return (
    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">{hint}</span>}
    </label>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 cursor-pointer accent-blue-600" />
      <span>
        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">{description}</span>
      </span>
    </label>
  );
}

function read(text, key, fallback) {
  return text.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "mi"))?.[1]?.trim() || fallback;
}

function parseConfig(text) {
  return {
    edition: read(text, "MSSQL_PID", defaults.edition),
    bindAddress: read(text, "SE_BIND_ADDRESS", defaults.bindAddress),
    port: Number(read(text, "MSSQL_TCP_PORT", defaults.port)),
    memoryLimit: Number(read(text, "MSSQL_MEMORY_LIMIT_MB", defaults.memoryLimit)),
    maxDop: Number(read(text, "SE_MAXDOP", defaults.maxDop)),
    agent: read(text, "MSSQL_AGENT_ENABLED", "false") === "true",
    hadr: read(text, "MSSQL_ENABLE_HADR", "false") === "true",
    collation: read(text, "MSSQL_COLLATION", defaults.collation),
    dataDirectory: read(text, "SE_DATA_DIRECTORY", defaults.dataDirectory),
    backupDirectory: read(text, "SE_BACKUP_DIRECTORY", defaults.backupDirectory),
  };
}

function buildConfig(values) {
  return `# Server Engine SQL Server runtime configuration
# Changes to container environment settings are applied on the next managed container recreation.
MSSQL_PID=${values.edition}
MSSQL_TCP_PORT=${values.port}
MSSQL_MEMORY_LIMIT_MB=${values.memoryLimit}
MSSQL_AGENT_ENABLED=${values.agent}
MSSQL_ENABLE_HADR=${values.hadr}
MSSQL_COLLATION=${values.collation}
SE_BIND_ADDRESS=${values.bindAddress}
SE_MAXDOP=${values.maxDop}
SE_DATA_DIRECTORY=${values.dataDirectory}
SE_BACKUP_DIRECTORY=${values.backupDirectory}
`;
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-1 border-b border-neutral-200 py-3 last:border-b-0 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{label}</span>
      <code className="break-all text-xs text-neutral-700 dark:text-neutral-300 sm:text-right">{value}</code>
    </div>
  );
}

export default function SqlServerConfigModal({ service, installed, onClose }) {
  const installedItem = Array.isArray(installed) ? installed.find((item) => item?.status === "running") || installed[0] : installed;
  const { status: liveStatus, action, setAction } = useServiceSocketStatus("sqlserver", installedItem?.status);
  const [tab, setTab] = React.useState("runtime");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [values, setValues] = React.useState(defaults);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const [startupEnabled, setStartupEnabled] = React.useState(false);
  const running = liveStatus === "running";
  const setValue = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  React.useEffect(() => {
    apiRequest("/api/v1/services/sqlserver/configuration")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (!value) return;
        setConfig(value);
        setText(value.content || "");
        setValues({ ...defaults, ...parseConfig(value.content || "") });
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    apiRequest("/api/v1/services/sqlserver/startup")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => value && setStartupEnabled(Boolean(value.enabled)))
      .catch(() => {});
  }, []);

  const serviceAction = async (actionName) => {
    setAction(actionName);
    const response = await apiRequest("/api/v1/services/sqlserver/action", {
      method: "POST",
      body: JSON.stringify({ action: actionName }),
    });
    if (!response.ok) {
      setToast({ type: "error", message: await readApiError(response) });
      setAction("");
      return;
    }
    setToast({ type: "success", message: `${actionName === "stop" ? "Stopping" : actionName === "restart" ? "Restarting" : "Starting"} SQL Server…` });
  };

  const save = async () => {
    setBusy(true);
    const content = buildConfig(values);
    const response = await apiRequest("/api/v1/services/sqlserver/configuration", {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    const body = response.ok ? await response.json() : { message: await readApiError(response) };
    if (response.ok) {
      setText(content);
      setMessage("Configuration saved. Recreate the managed SQL Server container to apply environment changes.");
      setToast({ type: "success", message: "SQL Server configuration saved." });
    } else {
      setToast({ type: "error", message: body.message || "Unable to save SQL Server configuration." });
    }
    setBusy(false);
  };

  const saveStartupPolicy = async (enabled) => {
    setStartupEnabled(enabled);
    const response = await apiRequest("/api/v1/services/sqlserver/startup", {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
    const body = response.ok ? await response.json() : { message: await readApiError(response) };
    if (!response.ok) {
      setStartupEnabled(!enabled);
      setToast({ type: "error", message: body.message || "Unable to save startup preference." });
      return;
    }
    setToast({ type: "success", message: enabled ? "SQL Server will start with Server Engine." : "SQL Server will stay stopped at startup." });
  };

  const statusLabel = action ? `${action[0].toUpperCase()}${action.slice(1)}…` : running ? "Running" : installedItem ? "Stopped" : "Not installed";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl dark:bg-neutral-900">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <Database size={20} className="text-violet-600 dark:text-violet-400" />
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Microsoft SQL Server</h2>
            </div>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Docker-managed SQL Server on Linux · {installedItem?.version || "No image installed"}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 cursor-pointer place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100" aria-label="Close SQL Server configuration"><X size={18} /></button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200 px-4 dark:border-neutral-800">
          {tabs.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex h-11 shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"}`}><Icon size={15} />{label}</button>)}
        </nav>
        <main className="max-h-[calc(100vh-13rem)] overflow-y-auto p-6">
          {tab === "overview" && <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">SQL Server instance</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">The panel manages SQL Server as an isolated Docker container with a persistent data volume.</p></div><span className={`inline-flex items-center gap-2 text-sm font-semibold ${running ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400"}`}><span className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-neutral-400"}`} />{statusLabel}</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"><p className="text-xs text-neutral-500 dark:text-neutral-400">Container</p><p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">server-engine-sqlserver</p></div><div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"><p className="text-xs text-neutral-500 dark:text-neutral-400">Edition</p><p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{values.edition}</p></div><div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"><p className="text-xs text-neutral-500 dark:text-neutral-400">Endpoint</p><p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{values.bindAddress}:{values.port}</p></div><div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"><p className="text-xs text-neutral-500 dark:text-neutral-400">Storage</p><p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">Persistent</p></div></div><div className="flex flex-wrap gap-3"><button type="button" className={`${buttonClass} ${running ? "border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30" : "bg-blue-600 text-white hover:bg-blue-700"}`} disabled={Boolean(action) || !installedItem} onClick={() => serviceAction(running ? "stop" : "start")}>{action ? `${statusLabel}` : running ? "Stop SQL Server" : "Start SQL Server"}</button>{running && <button type="button" className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800`} disabled={Boolean(action)} onClick={() => serviceAction("restart")}><RefreshCw size={14} />Restart</button>}</div></div>}
          {tab === "connection" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Connection</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">SQL Server is published on the host through Docker. Keep it on loopback unless a trusted remote client requires access.</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Host bind address" hint="Changing this affects the next managed container recreation."><input className={inputClass} value={values.bindAddress} onChange={(event) => setValue("bindAddress", event.target.value)} /></Field><Field label="SQL Server TCP port"><input className={inputClass} type="number" min="1" max="65535" value={values.port} onChange={(event) => setValue("port", Number(event.target.value))} /></Field><Field label="Default collation"><input className={inputClass} value={values.collation} onChange={(event) => setValue("collation", event.target.value)} /></Field></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">The Linux container uses SQL authentication. Windows Authentication is not available in this isolated deployment.</div><div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save connection settings"}</button></div></div>}
          {tab === "resources" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Resources and engine behavior</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Set safe container limits and SQL Server runtime flags for the next recreation.</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Memory limit (MB)" hint="This is the Docker container memory ceiling."><input className={inputClass} type="number" min="512" value={values.memoryLimit} onChange={(event) => setValue("memoryLimit", Number(event.target.value))} /></Field><Field label="MAXDOP"><select className={`${inputClass} bg-white dark:bg-neutral-950`} value={values.maxDop} onChange={(event) => setValue("maxDop", Number(event.target.value))}><option value="0">Automatic</option><option value="1">1</option><option value="2">2</option><option value="4">4</option><option value="8">8</option></select></Field><Field label="Edition"><select className={`${inputClass} bg-white dark:bg-neutral-950`} value={values.edition} onChange={(event) => setValue("edition", event.target.value)}><option>Developer</option><option>Express</option><option>Web</option><option>Standard</option></select></Field></div><Toggle label="SQL Server Agent" description="Enable SQL Server Agent support when the selected image supports it." checked={values.agent} onChange={(value) => setValue("agent", value)} /><Toggle label="Always On availability groups" description="Enable HADR flags for supported deployments; this does not create a replica by itself." checked={values.hadr} onChange={(value) => setValue("hadr", value)} /><div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save resource settings"}</button></div></div>}
          {tab === "security" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Security</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Credentials remain in the managed service directory and are not rendered into the browser.</p></div><Row label="Authentication" value="SQL authentication · sa" /><Row label="Credential file" value="/opt/server-engine/services/sqlserver/sa-password" /><Row label="Container network" value="Loopback published port" /><div className="rounded-lg border border-neutral-200 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">The SA password is generated during installation and stored with restrictive permissions. Rotate it from the credential management workflow before exposing SQL Server beyond localhost.</div></div>}
          {tab === "runtime" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Runtime</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Container lifecycle and persistent paths managed by Server Engine.</p></div><label className="flex cursor-pointer items-start gap-3 border-y border-neutral-200 py-4 dark:border-neutral-800"><input type="checkbox" checked={startupEnabled} onChange={(event) => saveStartupPolicy(event.target.checked)} className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600" /><span><span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">Start with Server Engine</span><span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">Automatically start the managed SQL Server container when the host starts Server Engine.</span></span></label><Row label="Image" value={`mcr.microsoft.com/mssql/server:${installedItem?.version || "—"}`} /><Row label="Container" value="server-engine-sqlserver" /><Row label="Data directory" value={values.dataDirectory} /><Row label="Backup directory" value={values.backupDirectory} /><Row label="Docker restart policy" value="unless-stopped" /><div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save runtime settings"}</button></div></div>}
          {tab === "configuration" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Managed configuration</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Server Engine stores the SQL Server container settings here. Environment changes apply when the managed container is recreated.</p><code className="mt-2 block text-xs text-neutral-500 dark:text-neutral-400">{config?.config_path || "/opt/server-engine/services/sqlserver/conf/service.conf"}</code></div><ConfigEditor path="service.conf" value={text} onChange={setText} /><div className="flex justify-end"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => { setBusy(true); apiRequest("/api/v1/services/sqlserver/configuration", { method: "PUT", body: JSON.stringify({ content: text }) }).then(async (response) => { const body = response.ok ? await response.json() : { message: await readApiError(response) }; setToast({ type: response.ok ? "success" : "error", message: response.ok ? "SQL Server configuration saved." : body.message }); setBusy(false); }); }}>{busy ? "Saving…" : "Save configuration"}</button></div></div>}
          {message && <p className="text-sm text-neutral-600 dark:text-neutral-300">{message}</p>}
        </main>
      </section>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
