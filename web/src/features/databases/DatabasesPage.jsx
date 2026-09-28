import React from "react";
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Database,
  ExternalLink,
  HardDrive,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";

const engines = [
  {
    id: "mysql",
    name: "MySQL",
    description: "Relational database for common PHP and web applications.",
    color: "text-orange-500",
    background: "bg-orange-50 dark:bg-orange-950/30",
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    description: "Advanced relational database with strong SQL features.",
    color: "text-blue-500",
    background: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    id: "mongodb",
    name: "MongoDB",
    description: "Document database for flexible application data.",
    color: "text-emerald-500",
    background: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    id: "redis",
    name: "Redis",
    description: "Fast in-memory store for cache, queues, and sessions.",
    color: "text-red-500",
    background: "bg-red-50 dark:bg-red-950/30",
  },
  {
    id: "sqlserver",
    name: "SQL Server",
    description: "Microsoft relational database engine.",
    color: "text-violet-500",
    background: "bg-violet-50 dark:bg-violet-950/30",
  },
];

const field =
  "mt-2 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const card =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";

function MongoWorkspace() {
  const initial = {
    bindAddress: "127.0.0.1",
    port: "27017",
    dbPath: "/server-engine/data/mongodb",
    logPath: "/server-engine/logs/mongodb/mongod.log",
    storageEngine: "WiredTiger",
    cacheSize: "50% of RAM",
    oplogSize: "5 GB",
    auth: true,
    tls: false,
    journaling: true,
    backups: "Daily",
  };
  const [settings, setSettings] = React.useState(() => {
    try { return { ...initial, ...JSON.parse(localStorage.getItem("serverengine:mongodb") || "{}") }; } catch { return initial; }
  });
  const [saved, setSaved] = React.useState(false);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const save = () => { localStorage.setItem("serverengine:mongodb", JSON.stringify(settings)); setSaved(true); window.setTimeout(() => setSaved(false), 3000); };
  const input = "mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  return (
    <section className={`${card} order-1 space-y-5`}>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex items-center gap-2"><Database size={19} className="text-emerald-500" /><h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">MongoDB configuration</h3><span className="text-xs font-semibold text-slate-500">v8.2</span></div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Configure the document database runtime, storage, security, backups, and application connection defaults.</p></div><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><span className="h-2 w-2 rounded-full bg-slate-400" />Stopped</span></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500">Databases</span><strong className="mt-1 block text-2xl text-slate-900 dark:text-slate-100">—</strong><span className="text-xs text-slate-500">Connect the runtime to inspect</span></div><div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500">Storage engine</span><strong className="mt-1 block text-lg text-slate-900 dark:text-slate-100">WiredTiger</strong><span className="text-xs text-slate-500">Recommended for production</span></div><div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500">Replica set</span><strong className="mt-1 block text-lg text-amber-600">Standalone</strong><span className="text-xs text-slate-500">Replication not configured</span></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bind address<input className={input} value={settings.bindAddress} onChange={(event) => set("bindAddress", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Port<input className={input} value={settings.port} onChange={(event) => set("port", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Storage engine<select className={input} value={settings.storageEngine} onChange={(event) => set("storageEngine", event.target.value)}><option>WiredTiger</option><option>In-memory</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cache allocation<select className={input} value={settings.cacheSize} onChange={(event) => set("cacheSize", event.target.value)}><option>25% of RAM</option><option>50% of RAM</option><option>60% of RAM</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Data directory<input className={`${input} font-mono text-xs`} value={settings.dbPath} onChange={(event) => set("dbPath", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Log file<input className={`${input} font-mono text-xs`} value={settings.logPath} onChange={(event) => set("logPath", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Oplog size<select className={input} value={settings.oplogSize} onChange={(event) => set("oplogSize", event.target.value)}><option>1 GB</option><option>5 GB</option><option>10 GB</option><option>20 GB</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Backup schedule<select className={input} value={settings.backups} onChange={(event) => set("backups", event.target.value)}><option>Manual</option><option>Daily</option><option>Weekly</option></select></label></div>
      <div className="grid gap-3 md:grid-cols-3"><label className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.auth} onChange={(event) => set("auth", event.target.checked)} /><span><strong className="block text-slate-800 dark:text-slate-200">Access control</strong><span className="mt-1 block text-xs text-slate-500">Require authenticated database users.</span></span></label><label className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.tls} onChange={(event) => set("tls", event.target.checked)} /><span><strong className="block text-slate-800 dark:text-slate-200">TLS connections</strong><span className="mt-1 block text-xs text-slate-500">Encrypt client and replica traffic.</span></span></label><label className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.journaling} onChange={(event) => set("journaling", event.target.checked)} /><span><strong className="block text-slate-800 dark:text-slate-200">Journaling</strong><span className="mt-1 block text-xs text-slate-500">Protect writes during an unexpected restart.</span></span></label></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">MongoDB runtime actions and backup execution will connect to the host agent later.</p><button type="button" onClick={save} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{saved ? "Saved" : "Save MongoDB settings"}</button></div>
    </section>
  );
}

function SqlServerWorkspace() {
  const initial = {
    edition: "Developer",
    bindAddress: "127.0.0.1",
    port: "1433",
    dataPath: "/server-engine/data/sqlserver",
    backupPath: "/server-engine/backups/sqlserver",
    memoryLimit: "2 GB",
    maxDop: "Auto",
    authMode: "Mixed authentication",
    tls: false,
    agent: true,
    backups: "Daily",
  };
  const [settings, setSettings] = React.useState(() => {
    try { return { ...initial, ...JSON.parse(localStorage.getItem("serverengine:sqlserver") || "{}") }; } catch { return initial; }
  });
  const [saved, setSaved] = React.useState(false);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const save = () => { localStorage.setItem("serverengine:sqlserver", JSON.stringify(settings)); setSaved(true); window.setTimeout(() => setSaved(false), 3000); };
  const input = "mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  return (
    <section className={`${card} order-1 space-y-5`}>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex items-center gap-2"><Database size={19} className="text-violet-500" /><h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Microsoft SQL Server</h3><span className="text-xs font-semibold text-slate-500">2022</span></div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Manage the SQL Server runtime, connection policy, resource limits, encryption, and scheduled backups.</p></div><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><span className="h-2 w-2 rounded-full bg-slate-400" />Stopped</span></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500">Databases</span><strong className="mt-1 block text-2xl text-slate-900 dark:text-slate-100">—</strong><span className="text-xs text-slate-500">Connect the runtime to inspect</span></div><div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500">Edition</span><strong className="mt-1 block text-lg text-slate-900 dark:text-slate-100">{settings.edition}</strong><span className="text-xs text-slate-500">License selection</span></div><div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500">Backups</span><strong className="mt-1 block text-lg text-emerald-600">{settings.backups}</strong><span className="text-xs text-slate-500">Configured schedule</span></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Edition<select className={input} value={settings.edition} onChange={(event) => set("edition", event.target.value)}><option>Developer</option><option>Express</option><option>Web</option><option>Standard</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bind address<input className={input} value={settings.bindAddress} onChange={(event) => set("bindAddress", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">TCP port<input className={input} value={settings.port} onChange={(event) => set("port", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Authentication<select className={input} value={settings.authMode} onChange={(event) => set("authMode", event.target.value)}><option>Windows authentication</option><option>Mixed authentication</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Memory limit<select className={input} value={settings.memoryLimit} onChange={(event) => set("memoryLimit", event.target.value)}><option>1 GB</option><option>2 GB</option><option>4 GB</option><option>8 GB</option><option>Use available memory</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">MAXDOP<select className={input} value={settings.maxDop} onChange={(event) => set("maxDop", event.target.value)}><option>Auto</option><option>1</option><option>2</option><option>4</option><option>8</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Data directory<input className={`${input} font-mono text-xs`} value={settings.dataPath} onChange={(event) => set("dataPath", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Backup directory<input className={`${input} font-mono text-xs`} value={settings.backupPath} onChange={(event) => set("backupPath", event.target.value)} /></label></div>
      <div className="grid gap-3 md:grid-cols-3"><label className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.tls} onChange={(event) => set("tls", event.target.checked)} /><span><strong className="block text-slate-800 dark:text-slate-200">Encrypt connections</strong><span className="mt-1 block text-xs text-slate-500">Require TLS for client traffic.</span></span></label><label className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.agent} onChange={(event) => set("agent", event.target.checked)} /><span><strong className="block text-slate-800 dark:text-slate-200">SQL Server Agent</strong><span className="mt-1 block text-xs text-slate-500">Enable scheduled jobs and maintenance tasks.</span></span></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Backup schedule<select className={input} value={settings.backups} onChange={(event) => set("backups", event.target.value)}><option>Manual</option><option>Daily</option><option>Weekly</option></select></label></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">SQL Server runs in a supported isolated deployment. Runtime and backup actions will connect to the host agent later.</p><button type="button" onClick={save} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{saved ? "Saved" : "Save SQL Server settings"}</button></div>
    </section>
  );
}

function EngineCard({ engine, selected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(engine.id)}
      className={`flex min-w-56 flex-1 items-start gap-3 rounded-lg border p-4 text-left transition ${selected ? "border-blue-500 ring-2 ring-blue-500/15" : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"} bg-white dark:bg-slate-900`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${engine.background} ${engine.color}`}
      >
        <Database size={18} />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
          {engine.name}
        </strong>
        <small className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
          {engine.description}
        </small>
        <small
          className={`mt-2 block text-xs font-semibold ${engine.installed ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}
        >
          {engine.installed
            ? engine.running
              ? "Installed · Running"
              : "Installed · Stopped"
            : "Not installed"}
        </small>
      </span>
    </button>
  );
}

function CreateDatabase({ onClose, onCreate }) {
  const [form, setForm] = React.useState({
    name: "",
    engine: "mysql",
    username: "",
    password: "",
    backup: "daily",
  });
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate({ ...form, id: crypto.randomUUID(), status: "Ready" });
          onClose();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Database provisioning
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Create database
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Define the engine, owner credentials, and backup policy for a new
              database.
            </p>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Database name
            <input
              className={field}
              required
              value={form.name}
              onChange={(event) => change("name", event.target.value)}
              placeholder="production_app"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Database engine
            <select
              className={field}
              value={form.engine}
              onChange={(event) => change("engine", event.target.value)}
            >
              {engines.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Owner username
            <input
              className={field}
              required
              value={form.username}
              onChange={(event) => change("username", event.target.value)}
              placeholder="app_user"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Owner password
            <input
              className={field}
              required
              type="password"
              value={form.password}
              onChange={(event) => change("password", event.target.value)}
              placeholder="Generate a secure password"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">
            Backup schedule
            <select
              className={field}
              value={form.backup}
              onChange={(event) => change("backup", event.target.value)}
            >
              <option value="daily">Daily · retain 7 copies</option>
              <option value="weekly">Weekly · retain 4 copies</option>
              <option value="manual">Manual backups only</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-500" />
          <span>
            Credentials are shown once in the UI and should be stored in your
            application secret manager.
          </span>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <CirclePlus size={16} />
            Create database
          </button>
        </div>
      </form>
    </div>
  );
}

export default function DatabasesPage() {
  const [databases, setDatabases] = React.useState([]);
  const [engineCatalog, setEngineCatalog] = React.useState(
    engines.map((engine) => ({ ...engine, installed: false, running: false })),
  );
  const [engine, setEngine] = React.useState("mysql");
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const defaultEngineSelected = React.useRef(false);
  React.useEffect(() => {
    let alive = true;
    const load = () => {
      setLoading(true);
      Promise.all([
        apiRequest("/api/v1/databases/engines").then((response) =>
          response.json(),
        ),
        apiRequest(
          `/api/v1/databases?engine=${encodeURIComponent(engine)}`,
        ).then((response) => response.json()),
      ])
        .then(([catalog, inventory]) => {
          if (!alive) return;
          setEngineCatalog(
            catalog.map((item) => ({
              ...engines.find((candidate) => candidate.id === item.id),
              ...item,
            })),
          );
          if (!defaultEngineSelected.current) {
            const preferred =
              catalog.find((item) => item.id === "mysql" && item.installed) ||
              catalog.find((item) => item.installed) ||
              catalog[0];
            if (preferred && preferred.id !== engine) setEngine(preferred.id);
            defaultEngineSelected.current = true;
          }
          setDatabases(inventory.databases || []);
          setNotice(inventory.error || "");
        })
        .catch(() => alive && setNotice("Unable to load database inventory."))
        .finally(() => alive && setLoading(false));
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [engine]);
  React.useEffect(() => setPage(1), [engine, query]);
  const visible = databases.filter(
    (item) =>
      item.engine === engine &&
      `${item.name} ${item.username}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selectedEngine = engineCatalog.find((item) => item.id === engine);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize);
  const storage = databases.reduce(
    (total, item) => total + (item.size || 0),
    0,
  );
  const formatBytes = (bytes) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );
    return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
  };
  return (
    <div className="flex flex-col gap-7">
      {window.location.hash === "#mongodb" && <MongoWorkspace />}
      {window.location.hash === "#sqlserver" && <SqlServerWorkspace />}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Data services
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Databases
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500 dark:text-slate-400">
            Manage database engines, credentials, backups, and application data
            connections from one workspace.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          onClick={() => setModal(true)}
        >
          <CirclePlus size={16} />
          Create database
        </button>
      </div>
      <section className="order-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={card}>
          <div className="flex items-center gap-3">
            <Database className="text-blue-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Total databases
              </small>
              <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">
                {databases.length}
              </strong>
            </span>
          </div>
        </div>
        <div className={card}>
          <div className="flex items-center gap-3">
            <Users className="text-violet-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Database users
              </small>
              <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">
                {new Set(databases.map((item) => item.username)).size}
              </strong>
            </span>
          </div>
        </div>
        <div className={card}>
          <div className="flex items-center gap-3">
            <Archive className="text-emerald-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Scheduled backups
              </small>
              <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">
                {databases.filter((item) => item.backup !== "manual").length}
              </strong>
            </span>
          </div>
        </div>
        <div className={card}>
          <div className="flex items-center gap-3">
            <HardDrive className="text-amber-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Storage used
              </small>
              <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">
                {formatBytes(storage)}
              </strong>
            </span>
          </div>
        </div>
      </section>
      <section className={`${card} order-1`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Database engines
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Choose an engine to narrow the inventory or start a matching
              database.
            </p>
          </div>
          <button className="hidden items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 sm:inline-flex">
            <RefreshCw size={15} />
            Refresh catalog
          </button>
        </div>
        <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
          {engineCatalog.map((item) => (
            <EngineCard
              key={item.id}
              engine={item}
              selected={engine === item.id}
              onSelect={setEngine}
            />
          ))}
        </div>
      </section>
      <section className={`${card} order-3`}>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Database inventory
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {visible.length === 0
                ? "No database records"
                : `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, visible.length)} of ${visible.length} database records`}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex min-w-64 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-400 dark:border-slate-700 dark:bg-slate-950">
              <Search size={16} />
              <input
                className="w-full bg-transparent text-sm text-slate-900 outline-none dark:text-slate-100"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search databases or users"
              />
            </label>
            <button className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
              <ChevronDown size={15} />
              More filters
            </button>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          {selectedEngine && !selectedEngine.installed ? (
            <div className="grid place-items-center border-t border-slate-200 py-16 text-center dark:border-slate-800">
              <Database size={30} className="text-slate-400" />
              <h4 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                {selectedEngine.name} is not installed
              </h4>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                Install {selectedEngine.name} from Services before managing
                databases with this engine.
              </p>
              <a
                href="/services"
                className="mt-5 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Open Services
                <ExternalLink size={15} />
              </a>
            </div>
          ) : loading ? (
            <div className="border-t border-slate-200 py-16 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Loading database inventory…
            </div>
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-3 py-3 font-semibold">Database</th>
                  <th className="px-3 py-3 font-semibold">Engine</th>
                  <th className="px-3 py-3 font-semibold">Owner</th>
                  <th className="px-3 py-3 font-semibold">Backup</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 text-sm dark:border-slate-800"
                  >
                    <td className="px-3 py-4 font-semibold text-slate-900 dark:text-slate-100">
                      {item.name}
                    </td>
                    <td className="px-3 py-4 capitalize text-slate-600 dark:text-slate-400">
                      {item.engine}
                    </td>
                    <td className="px-3 py-4 text-slate-600 dark:text-slate-400">
                      {item.username}
                    </td>
                    <td className="px-3 py-4 text-slate-600 dark:text-slate-400">
                      {item.backup}
                    </td>
                    <td className="px-3 py-4">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-right">
                      <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <MoreHorizontal size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!selectedEngine?.installed && selectedEngine
            ? null
            : !loading &&
              visible.length === 0 && (
                <div className="grid place-items-center border-t border-slate-200 py-16 text-center dark:border-slate-800">
                  <Database size={30} className="text-slate-400" />
                  <h4 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {query ? "No matching databases" : "No databases yet"}
                  </h4>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Create a database to start managing credentials, backups,
                    and application connections.
                  </p>
                  <button
                    className="mt-5 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                    onClick={() => setModal(true)}
                  >
                    <CirclePlus size={16} />
                    Create database
                  </button>
                </div>
              )}
          {!loading && visible.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-200 px-3 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Page {page} of {pageCount}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronLeft size={15} />
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page === pageCount}
                  onClick={() =>
                    setPage((value) => Math.min(pageCount, value + 1))
                  }
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Next
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      {notice && (
        <p className="order-4 text-sm text-slate-600 dark:text-slate-300">
          {notice}
        </p>
      )}
      {modal && (
        <CreateDatabase
          onClose={() => setModal(false)}
          onCreate={async (database) => {
            const response = await apiRequest("/api/v1/databases", {
              method: "POST",
              body: JSON.stringify(database),
            });
            if (!response.ok) {
              setNotice(
                await readApiError(response, "Unable to create database."),
              );
              return;
            }
            setNotice("Database created successfully.");
            setEngine("mysql");
          }}
        />
      )}
    </div>
  );
}
