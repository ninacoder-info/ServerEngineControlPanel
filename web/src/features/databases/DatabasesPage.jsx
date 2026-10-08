import React from "react";
import { z } from "zod";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ActionDialog from "../../components/ActionDialog";
import Toast from "../../components/Toast";
import ServiceNotInstalledState from "../../components/ServiceNotInstalledState";
import ServiceStoppedState from "../../components/ServiceStoppedState";
import { useServiceInstallationState } from "../../hooks/useServiceInstallationState";
import ServiceManagerModal from "../services/ServiceManagerModal";
import InstallServiceModal from "../services/InstallServiceModal";
import SecurePasswordInput from "../../components/SecurePasswordInput";
import FormField from "../../components/FormField";

const engines = [
  {
    id: "mysql",
    name: "MySQL",
    description: "Relational database for common PHP and web applications.",
    color: "text-orange-500",
    background: "bg-orange-50 dark:bg-orange-950/30",
  },
  {
    id: "mariadb",
    name: "MariaDB",
    description: "MySQL-compatible relational database for web applications.",
    color: "text-teal-500",
    background: "bg-teal-50 dark:bg-teal-950/30",
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
  "mt-2 block min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const card =
  "rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";

const databaseSchema = z.object({
  name: z.string().trim().min(1, "Database name is required.").max(64, "Database name is too long.").regex(/^[A-Za-z0-9_$-]+$/, "Use only letters, numbers, underscore, hyphen, or dollar sign."),
  engine: z.string().min(1, "Choose a database engine."),
  charset: z.enum(["utf8mb4", "utf8", "latin1", "ascii"]),
  username: z.string().trim().min(1, "Owner username is required.").max(32, "Owner username is too long.").regex(/^[A-Za-z0-9_$-]+$/, "Use only letters, numbers, underscore, hyphen, or dollar sign."),
  password: z.string().min(12, "Use at least 12 characters for the owner password.").max(128, "Owner password is too long."),
  backup: z.enum(["daily", "weekly", "manual"]),
});

const databaseImportSchema = z.object({
  file: z.any().refine((value) => value instanceof File, "Choose a database export file."),
  targetDatabase: z.string().trim().min(1, "A target database is required."),
});

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
  const input = "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  return (
    <section className={`${card} order-1 space-y-5`}>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex items-center gap-2"><Database size={19} className="text-emerald-500" /><h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">MongoDB configuration</h3><span className="text-xs font-semibold text-neutral-500">v8.2</span></div><p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">Configure the document database runtime, storage, security, backups, and application connection defaults.</p></div><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500"><span className="h-2 w-2 rounded-full bg-neutral-400" />Stopped</span></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><span className="text-xs text-neutral-500">Databases</span><strong className="mt-1 block text-2xl text-neutral-900 dark:text-neutral-100">—</strong><span className="text-xs text-neutral-500">Connect the runtime to inspect</span></div><div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><span className="text-xs text-neutral-500">Storage engine</span><strong className="mt-1 block text-lg text-neutral-900 dark:text-neutral-100">WiredTiger</strong><span className="text-xs text-neutral-500">Recommended for production</span></div><div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><span className="text-xs text-neutral-500">Replica set</span><strong className="mt-1 block text-lg text-amber-600">Standalone</strong><span className="text-xs text-neutral-500">Replication not configured</span></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Bind address<input className={input} value={settings.bindAddress} onChange={(event) => set("bindAddress", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Port<input className={input} value={settings.port} onChange={(event) => set("port", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Storage engine<select className={input} value={settings.storageEngine} onChange={(event) => set("storageEngine", event.target.value)}><option>WiredTiger</option><option>In-memory</option></select></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Cache allocation<select className={input} value={settings.cacheSize} onChange={(event) => set("cacheSize", event.target.value)}><option>25% of RAM</option><option>50% of RAM</option><option>60% of RAM</option></select></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Data directory<input className={`${input} font-mono text-xs`} value={settings.dbPath} onChange={(event) => set("dbPath", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Log file<input className={`${input} font-mono text-xs`} value={settings.logPath} onChange={(event) => set("logPath", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Oplog size<select className={input} value={settings.oplogSize} onChange={(event) => set("oplogSize", event.target.value)}><option>1 GB</option><option>5 GB</option><option>10 GB</option><option>20 GB</option></select></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Backup schedule<select className={input} value={settings.backups} onChange={(event) => set("backups", event.target.value)}><option>Manual</option><option>Daily</option><option>Weekly</option></select></label></div>
      <div className="grid gap-3 md:grid-cols-3"><label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.auth} onChange={(event) => set("auth", event.target.checked)} /><span><strong className="block text-neutral-800 dark:text-neutral-200">Access control</strong><span className="mt-1 block text-xs text-neutral-500">Require authenticated database users.</span></span></label><label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.tls} onChange={(event) => set("tls", event.target.checked)} /><span><strong className="block text-neutral-800 dark:text-neutral-200">TLS connections</strong><span className="mt-1 block text-xs text-neutral-500">Encrypt client and replica traffic.</span></span></label><label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.journaling} onChange={(event) => set("journaling", event.target.checked)} /><span><strong className="block text-neutral-800 dark:text-neutral-200">Journaling</strong><span className="mt-1 block text-xs text-neutral-500">Protect writes during an unexpected restart.</span></span></label></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800"><p className="text-xs text-neutral-500 dark:text-neutral-400">MongoDB runtime actions and backup execution will connect to the host agent later.</p><button type="button" onClick={save} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{saved ? "Saved" : "Save MongoDB settings"}</button></div>
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
  const input = "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  return (
    <section className={`${card} order-1 space-y-5`}>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex items-center gap-2"><Database size={19} className="text-violet-500" /><h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Microsoft SQL Server</h3><span className="text-xs font-semibold text-neutral-500">2022</span></div><p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">Manage the SQL Server runtime, connection policy, resource limits, encryption, and scheduled backups.</p></div><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500"><span className="h-2 w-2 rounded-full bg-neutral-400" />Stopped</span></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><span className="text-xs text-neutral-500">Databases</span><strong className="mt-1 block text-2xl text-neutral-900 dark:text-neutral-100">—</strong><span className="text-xs text-neutral-500">Connect the runtime to inspect</span></div><div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><span className="text-xs text-neutral-500">Edition</span><strong className="mt-1 block text-lg text-neutral-900 dark:text-neutral-100">{settings.edition}</strong><span className="text-xs text-neutral-500">License selection</span></div><div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><span className="text-xs text-neutral-500">Backups</span><strong className="mt-1 block text-lg text-emerald-600">{settings.backups}</strong><span className="text-xs text-neutral-500">Configured schedule</span></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Edition<select className={input} value={settings.edition} onChange={(event) => set("edition", event.target.value)}><option>Developer</option><option>Express</option><option>Web</option><option>Standard</option></select></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Bind address<input className={input} value={settings.bindAddress} onChange={(event) => set("bindAddress", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">TCP port<input className={input} value={settings.port} onChange={(event) => set("port", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Authentication<select className={input} value={settings.authMode} onChange={(event) => set("authMode", event.target.value)}><option>Windows authentication</option><option>Mixed authentication</option></select></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Memory limit<select className={input} value={settings.memoryLimit} onChange={(event) => set("memoryLimit", event.target.value)}><option>1 GB</option><option>2 GB</option><option>4 GB</option><option>8 GB</option><option>Use available memory</option></select></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">MAXDOP<select className={input} value={settings.maxDop} onChange={(event) => set("maxDop", event.target.value)}><option>Auto</option><option>1</option><option>2</option><option>4</option><option>8</option></select></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Data directory<input className={`${input} font-mono text-xs`} value={settings.dataPath} onChange={(event) => set("dataPath", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Backup directory<input className={`${input} font-mono text-xs`} value={settings.backupPath} onChange={(event) => set("backupPath", event.target.value)} /></label></div>
      <div className="grid gap-3 md:grid-cols-3"><label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.tls} onChange={(event) => set("tls", event.target.checked)} /><span><strong className="block text-neutral-800 dark:text-neutral-200">Encrypt connections</strong><span className="mt-1 block text-xs text-neutral-500">Require TLS for client traffic.</span></span></label><label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.agent} onChange={(event) => set("agent", event.target.checked)} /><span><strong className="block text-neutral-800 dark:text-neutral-200">SQL Server Agent</strong><span className="mt-1 block text-xs text-neutral-500">Enable scheduled jobs and maintenance tasks.</span></span></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Backup schedule<select className={input} value={settings.backups} onChange={(event) => set("backups", event.target.value)}><option>Manual</option><option>Daily</option><option>Weekly</option></select></label></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800"><p className="text-xs text-neutral-500 dark:text-neutral-400">SQL Server runs in a supported isolated deployment. Runtime and backup actions will connect to the host agent later.</p><button type="button" onClick={save} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{saved ? "Saved" : "Save SQL Server settings"}</button></div>
    </section>
  );
}

function EngineCard({ engine, selected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(engine.id)}
      className={`flex min-w-56 flex-1 items-start gap-3 rounded-lg border p-4 text-left transition ${selected ? "border-blue-500 ring-2 ring-blue-500/15" : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"} bg-white dark:bg-neutral-900`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${engine.background} ${engine.color}`}
      >
        <Database size={18} />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {engine.name}
        </strong>
        <small
          className={`mt-2 block text-xs font-semibold ${engine.installed ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400 dark:text-neutral-500"}`}
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

function CreateDatabase({ engine = "mysql", onClose, onCreate }) {
  const engineName = engines.find((item) => item.id === engine)?.name || engine;
  const [form, setForm] = React.useState({
    name: "",
    charset: "utf8mb4",
    username: "",
    password: "",
    backup: "manual",
  });
  const [errors, setErrors] = React.useState({});
  const [submitting, setSubmitting] = React.useState(false);
  const usernameEdited = React.useRef(false);
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const inputClass = (key) => errors[key]
    ? `${field} border-rose-500 focus:border-rose-500 focus:ring-rose-500/20 dark:border-rose-500`
    : field;
  const submit = async () => {
    const result = databaseSchema.safeParse({ ...form, engine });
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message])));
      return;
    }
    setErrors({});
    setSubmitting(true);
    const created = await onCreate({ ...result.data, id: crypto.randomUUID(), status: "Ready" });
    setSubmitting(false);
    if (created !== false) onClose();
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/60 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        className="w-full max-w-2xl rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Database provisioning
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              Create {engineName} database
            </h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Define the owner credentials and backup policy for a new database.
            </p>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Database name
            <input
              className={inputClass("name")}
              value={form.name}
              onChange={(event) => change("name", event.target.value)}
              onBlur={() => {
                if (!usernameEdited.current && form.name.trim()) {
                  change("username", form.name.trim());
                }
              }}
              placeholder="production_app"
            />
            {errors.name && <span className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-400">{errors.name}</span>}
          </label>
          {engine !== "mongodb" && (
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Character set
              <select
                className={inputClass("charset")}
                value={form.charset}
                onChange={(event) => change("charset", event.target.value)}
              >
                <option value="utf8mb4">utf8mb4 · recommended</option>
                <option value="utf8">utf8 · compatibility</option>
                <option value="latin1">latin1 · legacy</option>
                <option value="ascii">ascii · basic text</option>
              </select>
            </label>
          )}
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Owner username
            <input
              className={inputClass("username")}
              value={form.username}
              onChange={(event) => {
                usernameEdited.current = true;
                change("username", event.target.value);
              }}
              placeholder="app_user"
            />
            {errors.username && <span className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-400">{errors.username}</span>}
          </label>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Owner password
            <SecurePasswordInput className={`${inputClass("password")} mt-0`} value={form.password} onChange={(event) => change("password", event.target.value)} placeholder="Generate a secure password" />
            {errors.password && <span className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-400">{errors.password}</span>}
          </label>
          <div className="text-sm text-neutral-700 dark:text-neutral-300 md:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={form.backup !== "manual"}
                onChange={(event) => change("backup", event.target.checked ? "daily" : "manual")}
                className="h-4 w-4 cursor-pointer accent-blue-600"
              />
              Enable backup schedule
            </label>
            {form.backup !== "manual" && (
              <select
                className={inputClass("backup")}
                value={form.backup}
                onChange={(event) => change("backup", event.target.value)}
              >
                <option value="daily">Daily · retain 7 copies</option>
                <option value="weekly">Weekly · retain 4 copies</option>
              </select>
            )}
            {errors.backup && <span className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-400">{errors.backup}</span>}
          </div>
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-500" />
          <span>
            {engineName} credentials are shown once in the UI and should be stored in your
            application secret manager.
          </span>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70">
            {submitting ? <RefreshCw size={16} className="animate-spin" /> : <CirclePlus size={16} />}
            {submitting ? "Creating…" : "Create database"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DatabaseBackupsModal({ database, archives, creating, onClose, onCreate, onDelete }) {
  if (!database) return null;

  const formatBytes = (bytes) => {
    if (!bytes) return "—";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
  };

  const formatDate = (value) => {
    if (!value) return "Waiting to run";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };

  const statusClass = (status) => {
    if (status === "Verified") return "text-emerald-600 dark:text-emerald-400";
    if (status === "Failed") return "text-rose-600 dark:text-rose-400";
    return "text-amber-600 dark:text-amber-400";
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"
      onMouseDown={(event) => event.target === event.currentTarget && !creating && onClose()}
    >
      <section className="w-full max-w-3xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Archive size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                Database backups
              </p>
              <h2 className="mt-1 truncate text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                {database.name}
              </h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Archives created for this database.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            aria-label="Close database backups"
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X size={17} />
          </button>
        </header>

        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/40">
            <div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Stored archives</span>
              <strong className="mt-0.5 block text-lg text-neutral-900 dark:text-neutral-100">{archives.length}</strong>
            </div>
            <button
              type="button"
              onClick={onCreate}
              disabled={creating}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
            >
              {creating ? <RefreshCw size={15} className="animate-spin" /> : <CirclePlus size={15} />}
              {creating ? "Creating…" : "Create backup"}
            </button>
          </div>

          {archives.length === 0 ? (
            <div className="grid place-items-center py-12 text-center">
              <Archive size={28} className="text-neutral-300 dark:text-neutral-600" />
              <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">No backups yet</h3>
              <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
                Create a backup to archive this database in the Server Engine backup folder.
              </p>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {archives.map((archive) => (
                <div key={archive.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {archive.name || archive.archive_name || `Database backup ${archive.id}`}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {formatDate(archive.completed || archive.created)} · {formatBytes(archive.size)}
                    </p>
                    {archive.error && <p className="mt-1 truncate text-xs text-rose-600 dark:text-rose-400">{archive.error}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`text-xs font-semibold ${statusClass(archive.status)}`}>
                      {archive.status || "Queued"}
                    </span>
                    {archive.status === "Verified" && archive.verified && (
                      <a
                        href={`/api/v1/backups/${encodeURIComponent(archive.id)}/download`}
                        download
                        className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        <Download size={14} />
                        Download
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(archive)}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DatabaseImportModal({ engine, targetDatabase: initialTargetDatabase, submitting, onClose, onSubmit }) {
  const [file, setFile] = React.useState(null);
  const [targetDatabase] = React.useState(initialTargetDatabase || "");
  const [error, setError] = React.useState("");
  const inputRef = React.useRef(null);
  const accepted = ".sql,.gz,.zip,.tar,.tgz";

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <form
        className="w-full max-w-xl rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        onSubmit={(event) => {
          event.preventDefault();
          const validation = databaseImportSchema.safeParse({ file, targetDatabase });
          if (!validation.success) {
            setError(validation.error.issues[0]?.message || "Choose a valid database export.");
            return;
          }
          setError("");
          onSubmit(validation.data);
        }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Database inventory</p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">Import {engine} database</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Queue an import using a file compatible with the selected engine.</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close import dialog" className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200">
            <X size={17} />
          </button>
        </header>
        <div className="space-y-5 p-5">
          <div>
            <FormField label="Backup file" error={error}>
            <div className={`mt-2 flex items-center gap-3 rounded-lg border border-dashed px-4 py-4 ${file ? "border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/20" : "border-neutral-300 dark:border-neutral-700"}`}>
              <Upload size={19} className="shrink-0 text-neutral-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">{file?.name || "Choose a database export"}</p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">MySQL accepts SQL, gzip, ZIP, TAR, TAR.GZ, and TGZ files.</p>
              </div>
              <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">Browse</button>
              <input ref={inputRef} type="file" accept={accepted} className="hidden" onChange={(event) => { setFile(event.target.files?.[0] || null); setError(""); }} />
            </div>
            </FormField>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/40">
            <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Import into database</span>
            <code className="mt-1.5 block text-sm font-semibold text-neutral-900 dark:text-neutral-100">{targetDatabase}</code>
            <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">This target was selected from the database row.</span>
          </div>
        </div>
        <footer className="flex justify-end gap-3 border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <button type="button" onClick={onClose} disabled={submitting} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed dark:text-neutral-300 dark:hover:bg-neutral-800">Cancel</button>
          <button type="submit" disabled={!file || submitting} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
            {submitting ? "Uploading…" : "Import database"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function DatabasesPage() {
  const [databases, setDatabases] = React.useState([]);
  const [engineCatalog, setEngineCatalog] = React.useState(
    engines.map((engine) => ({ ...engine, installed: false, running: false })),
  );
  const [phpMyAdmin, setPhpMyAdmin] = React.useState({ installed: false, running: false });
  const [engine, setEngine] = React.useState("mysql");
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(false);
  const [backupModal, setBackupModal] = React.useState(null);
  const [backupArchives, setBackupArchives] = React.useState([]);
  const [backupCreating, setBackupCreating] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState(null);
  const [importModal, setImportModal] = React.useState(null);
  const [importSubmitting, setImportSubmitting] = React.useState(false);
  const [serviceConfig, setServiceConfig] = React.useState(null);
  const [serviceConfigLoading, setServiceConfigLoading] = React.useState(false);
  const [phpMyAdminInstallService, setPhpMyAdminInstallService] = React.useState(null);
  const [notice, setNotice] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const [actionMenu, setActionMenu] = React.useState(null);
  const [revealedCredentials, setRevealedCredentials] = React.useState({});
  const credentialCache = React.useRef({});
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const databaseServiceState = useServiceInstallationState(engine);
  const pageSize = 10;
  const defaultEngineSelected = React.useRef(false);
  const loadingRequest = React.useRef(false);
  const refreshPending = React.useRef(false);
  const load = React.useCallback(async () => {
    if (loadingRequest.current) {
      refreshPending.current = true;
      return;
    }
    loadingRequest.current = true;
    setLoading(true);
    try {
      const [catalogResponse, inventoryResponse, backupsResponse, phpMyAdminResponse] = await Promise.all([
        apiRequest("/api/v1/databases/engines"),
        apiRequest(`/api/v1/databases?engine=${encodeURIComponent(engine)}`),
        apiRequest("/api/v1/backups"),
        apiRequest("/api/v1/services/phpmyadmin/status"),
      ]);
      const [catalog, inventory, backups, phpMyAdminState] = await Promise.all([
        catalogResponse.json(),
        inventoryResponse.json(),
        backupsResponse.ok ? backupsResponse.json() : Promise.resolve([]),
        phpMyAdminResponse.ok ? phpMyAdminResponse.json() : Promise.resolve({ installed: false, running: false }),
      ]);
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
      setBackupArchives(Array.isArray(backups) ? backups : []);
      setPhpMyAdmin(phpMyAdminState);
      setNotice("");
      if (inventory.error) setToast({ type: "error", message: inventory.error });
    } catch {
      setToast({ type: "error", message: "Unable to load database inventory." });
    } finally {
      loadingRequest.current = false;
      setLoading(false);
      if (refreshPending.current) {
        refreshPending.current = false;
        window.setTimeout(load, 0);
      }
    }
  }, [engine]);
  React.useEffect(() => {
    load();
    const updateServiceStatus = (event) => {
      const detail = event.detail || {};
      if (detail.serviceId === "phpmyadmin") {
        if (detail.status === "succeeded") {
          setPhpMyAdmin((current) => ({ ...current, installed: detail.action === "install" ? true : detail.action === "uninstall" ? false : current.installed, running: detail.action === "start" || detail.action === "restart" ? true : detail.action === "stop" ? false : current.running }));
        }
        return;
      }
      if (!detail.serviceId || !engines.some((item) => item.id === detail.serviceId)) return;
      if (detail.status !== "succeeded") return;
      setEngineCatalog((current) => current.map((item) => {
        if (item.id !== detail.serviceId) return item;
        if (detail.action === "install") return { ...item, installed: true, running: false, status: "stopped" };
        if (detail.action === "uninstall") return { ...item, installed: false, running: false, status: "not-installed" };
        if (["start", "restart", "stop"].includes(detail.action)) {
          const running = detail.action !== "stop";
          return { ...item, running, status: running ? "running" : "stopped" };
        }
        return item;
      }));
    };
    window.addEventListener("serverengine:service-status", updateServiceStatus);
    return () => window.removeEventListener("serverengine:service-status", updateServiceStatus);
  }, [load]);
  React.useEffect(() => setPage(1), [engine, query]);
  const visible = databases.filter(
    (item) =>
      item.engine === engine &&
      `${item.name} ${item.username}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selectedEngine = engineCatalog.find((item) => item.id === engine);
  const isRedis = engine === "redis";
  const canCreateDatabase = Boolean(
    selectedEngine?.installed && selectedEngine.running && !databaseServiceState.loading,
  );
  const engineStopped = Boolean(
    !loading && selectedEngine && databaseServiceState.installed && !selectedEngine.running,
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize);
  const createBackupJob = async (database) => {
    setActionMenu(null);
    const response = await apiRequest(`/api/v1/databases/${database.engine}/${encodeURIComponent(database.name)}/backup-job`, { method: "POST" });
    setNotice(response.ok ? `Daily backup job created for ${database.name}.` : await readApiError(response, "Unable to create backup job."));
  };
  const databaseBackups = (database) => backupArchives.filter(
    (archive) =>
      archive.status !== "Failed" &&
      archive.scope === "database" &&
      (archive.database_name === database.name ||
        archive.target_id === database.name ||
        archive.target_name === database.name),
  );
  const createDatabaseBackup = async (database) => {
    setBackupCreating(true);
    try {
      const response = await apiRequest("/api/v1/backups", {
        method: "POST",
        body: JSON.stringify({
          scope: "database",
          destination: "local",
          compression: "balanced",
          target_type: "database",
          target_id: database.name,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to create database backup."));
      }
      const entry = await response.json();
      setBackupArchives((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
      setToast({ type: "success", message: `Backup for ${database.name} queued.` });
      window.setTimeout(load, 500);
    } catch (error) {
      setToast({ type: "error", message: error.message || "Unable to create database backup." });
    } finally {
      setBackupCreating(false);
    }
  };
  const openPhpMyAdmin = async (database) => {
    setActionMenu(null);
    if (!phpMyAdmin?.installed) {
      setServiceConfigLoading(true);
      try {
        const response = await apiRequest("/api/v1/services/catalog");
        if (!response.ok) {
          throw new Error(await readApiError(response, "Unable to load the phpMyAdmin installer."));
        }
        const catalog = await response.json();
        const service = catalog.find((item) => item.id === "phpmyadmin");
        if (!service) throw new Error("phpMyAdmin is not available in the service catalog.");
        setPhpMyAdminInstallService(service);
      } catch (error) {
        setToast({ type: "error", message: error.message || "Unable to load the phpMyAdmin installer." });
      } finally {
        setServiceConfigLoading(false);
      }
      return;
    }
    if (!phpMyAdmin.running) {
      setToast({ type: "error", message: "Start phpMyAdmin from Services first." });
      return;
    }
    window.open(`/phpmyadmin/index.php?db=${encodeURIComponent(database.name)}&engine=${encodeURIComponent(database.engine)}`, "_blank", "noopener,noreferrer");
  };
  const deleteDatabaseBackup = async (archive) => {
    setConfirmDialog(null);
    try {
      const response = await apiRequest(`/api/v1/backups/${encodeURIComponent(archive.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to delete backup archive."));
      }
      setBackupArchives((current) => current.filter((item) => item.id !== archive.id));
      setToast({ type: "success", message: "Backup archive deleted." });
    } catch (error) {
      setToast({ type: "error", message: error.message || "Unable to delete backup archive." });
    }
  };
  const importDatabase = async ({ file, targetDatabase }) => {
    setImportSubmitting(true);
    try {
      const payload = new FormData();
      payload.append("file", file);
      if (targetDatabase) payload.append("target_database", targetDatabase);
      const response = await apiRequest(`/api/v1/databases/${encodeURIComponent(importModal.engine)}/import`, {
        method: "POST",
        body: payload,
      });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to queue database import."));
      setImportModal(null);
      setToast({ type: "success", message: `Database import for ${file.name} queued.` });
      window.dispatchEvent(new CustomEvent("serverengine:jobs-updated"));
    } catch (error) {
      setToast({ type: "error", message: error.message || "Unable to queue database import." });
    } finally {
      setImportSubmitting(false);
    }
  };
  const openServiceConfig = async () => {
    setServiceConfigLoading(true);
    try {
      const [catalogResponse, installedResponse] = await Promise.all([
        apiRequest("/api/v1/services/catalog"),
        apiRequest("/api/v1/services/installed"),
      ]);
      if (!catalogResponse.ok || !installedResponse.ok) {
        throw new Error("Unable to load the service configuration.");
      }
      const [catalog, installed] = await Promise.all([
        catalogResponse.json(),
        installedResponse.json(),
      ]);
      const service = catalog.find((item) => item.id === engine);
      if (!service) throw new Error(`${selectedEngine?.name || engine} configuration is unavailable.`);
      const versions = installed.filter(
        (item) => item.id === engine || item.id.startsWith(`${engine}@`),
      );
      setServiceConfig({ service, versions });
    } catch (error) {
      setToast({ type: "error", message: error.message || "Unable to load the service configuration." });
    } finally {
      setServiceConfigLoading(false);
    }
  };
  const loadDatabaseCredentials = async (database) => {
    if (credentialCache.current[database.id]) return credentialCache.current[database.id];
    const response = await apiRequest(`/api/v1/databases/${database.engine}/${encodeURIComponent(database.name)}/credentials`);
    if (!response.ok) throw new Error(await readApiError(response, "Unable to load database credentials."));
    const credentials = await response.json();
    credentialCache.current[database.id] = credentials;
    return credentials;
  };
  const copyDatabaseCredential = async (database, credentialKey) => {
    setActionMenu(null);
    try {
      const credentials = await loadDatabaseCredentials(database);
      const value = credentials[credentialKey];
      if (!value) throw new Error("That credential is not available.");
      await navigator.clipboard.writeText(value);
      setToast({
        type: "success",
        message: `${credentialKey === "username" ? "Username" : "Password"} copied.`,
      });
    } catch (error) {
      setToast({ type: "error", message: error.message || "Unable to copy database credentials." });
    }
  };
  const toggleDatabasePassword = async (database) => {
    if (revealedCredentials[database.id]) {
      setRevealedCredentials((current) => ({ ...current, [database.id]: false }));
      return;
    }
    try {
      await loadDatabaseCredentials(database);
      setRevealedCredentials((current) => ({ ...current, [database.id]: true }));
    } catch (error) {
      setToast({ type: "error", message: error.message || "Unable to load database credentials." });
    }
  };
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
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Databases
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-neutral-500 dark:text-neutral-400">
            Manage database engines, credentials, backups, and application data
            connections from one workspace.
          </p>
        </div>
      </div>
      <section className="order-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isRedis ? (
          <>
            <div className={card}>
              <div className="flex items-center gap-3">
                <Database className="text-red-500" size={20} />
                <span>
                  <small className="block text-xs text-neutral-500 dark:text-neutral-400">Logical databases</small>
                  <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">—</strong>
                </span>
              </div>
            </div>
            <div className={card}>
              <div className="flex items-center gap-3">
                <Database className="text-violet-500" size={20} />
                <span>
                  <small className="block text-xs text-neutral-500 dark:text-neutral-400">Keys</small>
                  <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">—</strong>
                </span>
              </div>
            </div>
            <div className={card}>
              <div className="flex items-center gap-3">
                <HardDrive className="text-amber-500" size={20} />
                <span>
                  <small className="block text-xs text-neutral-500 dark:text-neutral-400">Memory used</small>
                  <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">—</strong>
                </span>
              </div>
            </div>
            <div className={card}>
              <div className="flex items-center gap-3">
                <Archive className="text-emerald-500" size={20} />
                <span>
                  <small className="block text-xs text-neutral-500 dark:text-neutral-400">Managed snapshots</small>
                  <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">0</strong>
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
        <div className={`${card} relative`}>
          <button
            type="button"
            title={`Create ${selectedEngine?.name || "database"}`}
            aria-label={`Create ${selectedEngine?.name || "database"}`}
            onClick={() => setModal(true)}
            disabled={!canCreateDatabase}
            className={`absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full ${canCreateDatabase ? "cursor-pointer text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300" : "cursor-not-allowed text-neutral-300 dark:text-neutral-600"}`}
          >
            <CirclePlus size={18} />
          </button>
          <div className="flex items-center gap-3 pr-8">
            <Database className="text-blue-500" size={20} />
            <span>
              <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                Total databases
              </small>
              <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                {databases.length}
              </strong>
            </span>
          </div>
        </div>
        <div className={card}>
          <div className="flex items-center gap-3">
            <Users className="text-violet-500" size={20} />
            <span>
              <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                Database users
              </small>
              <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                {new Set(databases.map((item) => item.username)).size}
              </strong>
            </span>
          </div>
        </div>
        <div className={card}>
          <div className="flex items-center gap-3">
            <Archive className="text-emerald-500" size={20} />
            <span>
              <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                Scheduled backups
              </small>
              <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                {databases.filter((item) => item.backup !== "manual").length}
              </strong>
            </span>
          </div>
        </div>
        <div className={card}>
          <div className="flex items-center gap-3">
            <HardDrive className="text-amber-500" size={20} />
            <span>
              <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                Storage used
              </small>
              <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                {formatBytes(storage)}
              </strong>
            </span>
          </div>
        </div>
          </>
        )}
      </section>
      <section className="order-1">
        <div className="flex gap-3 overflow-x-auto pb-1">
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
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {isRedis ? "Redis runtime" : "Database inventory"}
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {isRedis && !engineStopped
                ? "Redis uses logical databases and keys rather than SQL databases and users."
                : engineStopped
                ? `${selectedEngine.name} must be running to inspect databases`
                : visible.length === 0
                ? "No database records"
                : `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, visible.length)} of ${visible.length} database records`}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex min-w-64 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-950">
              <Search size={16} />
              <input
                className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={isRedis ? "Search Redis keys (when metrics are connected)" : "Search databases or users"}
              />
            </label>
            {!isRedis && (
              <button
                type="button"
                onClick={() => setModal(true)}
                disabled={!canCreateDatabase}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CirclePlus size={16} />
                Add database
              </button>
            )}
          </div>
        </div>
        <div className="relative mt-5 overflow-visible">
          {selectedEngine && !databaseServiceState.loading && !databaseServiceState.installed ? (
            <ServiceNotInstalledState
              state={databaseServiceState}
              icon={Database}
              eyebrow="Database management"
              title={`${selectedEngine.name} is not installed`}
              description={`Install ${selectedEngine.name} before managing databases with this engine.`}
              installLabel={`Install ${selectedEngine.name}`}
              compact
            />
          ) : engineStopped ? (
            <ServiceStoppedState
              icon={Database}
              eyebrow="Database service stopped"
              title={`${selectedEngine.name} is not running`}
              description={`Start ${selectedEngine.name} before opening its database inventory. No database records are shown while the service is offline.`}
              onConfigure={openServiceConfig}
              configuring={serviceConfigLoading}
              onCheck={load}
            />
          ) : loading ? (
            <div className="border-t border-neutral-200 py-16 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              Loading database inventory…
            </div>
          ) : isRedis ? (
            <div className="flex min-h-64 items-center justify-center border-t border-neutral-200 px-5 py-12 dark:border-neutral-800">
              <div className="max-w-lg text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400">
                  <Database size={23} />
                </div>
                <h4 className="mt-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Redis logical databases</h4>
                <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                  Redis does not create SQL database records or database users. Use the Redis configuration and runtime views to manage logical databases, keys, memory, and persistence.
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th className="px-3 py-3 font-semibold">Database</th>
                  <th className="px-3 py-3 font-semibold">Engine</th>
                  <th className="px-3 py-3 font-semibold">Credentials</th>
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
                    className="border-b border-neutral-100 text-sm dark:border-neutral-800"
                  >
                    <td className="px-3 py-4 font-semibold text-neutral-900 dark:text-neutral-100">
                      {item.name}
                    </td>
                    <td className="px-3 py-4 capitalize text-neutral-600 dark:text-neutral-400">
                      {item.engine}
                    </td>
                    <td className="px-3 py-4 text-neutral-600 dark:text-neutral-400">
                      {item.credentials_saved ? (
                        <div className="min-w-56 space-y-1">
                          <div className="flex items-center gap-1.5 truncate text-xs">
                            <span className="font-medium text-neutral-500 dark:text-neutral-400">User:</span>
                            <span className="truncate">{item.username}</span>
                            <button type="button" title="Copy username" aria-label={`Copy username for ${item.name}`} onClick={() => copyDatabaseCredential(item, "username")} className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200">
                              <Copy size={14} />
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-medium text-neutral-500 dark:text-neutral-400">Pass:</span>
                            <code className="max-w-36 truncate">{revealedCredentials[item.id] ? credentialCache.current[item.id]?.password : "••••••••••••"}</code>
                            <button type="button" title={revealedCredentials[item.id] ? "Hide password" : "Show password"} aria-label={revealedCredentials[item.id] ? `Hide password for ${item.name}` : `Show password for ${item.name}`} onClick={() => toggleDatabasePassword(item)} className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200">
                              {revealedCredentials[item.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            <button type="button" title="Copy password" aria-label={`Copy password for ${item.name}`} onClick={() => copyDatabaseCredential(item, "password")} className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200">
                              <Copy size={14} />
                            </button>
                          </div>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-4">
                      <button
                        type="button"
                        onClick={() => setBackupModal(item)}
                        title={`View backups for ${item.name}`}
                        className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <Archive size={14} />
                        {databaseBackups(item).length}
                      </button>
                    </td>
                    <td className="px-3 py-4">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-right">
                      <div className="relative inline-flex" data-database-actions>
                        {(item.engine === "mysql" || item.engine === "mariadb") && (
                          <button
                            type="button"
                            title="Open in phpMyAdmin"
                            aria-label={`Open ${item.name} in phpMyAdmin`}
                            onClick={() => openPhpMyAdmin(item)}
                            className="mr-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                          >
                            <ExternalLink size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`More actions for ${item.name}`}
                          aria-expanded={actionMenu === item.id}
                          onClick={() => setActionMenu(actionMenu === item.id ? null : item.id)}
                          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                        >
                          <MoreHorizontal size={17} />
                        </button>
                        {actionMenu === item.id && (
                        <div className="absolute bottom-11 right-0 z-50 w-56 rounded-lg border border-neutral-200 bg-white p-1 text-left shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                          {item.credentials_saved && (
                            <button type="button" onClick={() => copyDatabaseCredential(item, "password")} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800">
                              <Copy size={15} /> Copy password
                            </button>
                          )}
                          <button type="button" onClick={() => createBackupJob(item)} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800">
                            <Archive size={15} /> Create daily backup job
                          </button>
                          <button type="button" onClick={() => { setActionMenu(null); setImportModal({ engine: item.engine, targetDatabase: item.name }); }} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800">
                            <Upload size={15} /> Import backup file
                          </button>
                          <button type="button" onClick={() => { setActionMenu(null); setBackupModal(item); }} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800">
                            <HardDrive size={15} /> View backup archives
                          </button>
                        </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {isRedis || (!databaseServiceState.loading && !databaseServiceState.installed || engineStopped) && selectedEngine
            ? null
            : !loading &&
              visible.length === 0 && (
                <div className="grid place-items-center border-t border-neutral-200 py-16 text-center dark:border-neutral-800">
                  <Database size={30} className="text-neutral-400" />
                  <h4 className="mt-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    {query ? "No matching databases" : "No databases yet"}
                  </h4>
                  <p className="mt-2 max-w-md text-sm leading-6 text-neutral-500 dark:text-neutral-400">
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
            <div className="flex flex-col gap-3 border-t border-neutral-200 px-3 py-4 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Page {page} of {pageCount}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-neutral-300 px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
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
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-neutral-300 px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
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
        <p className="order-4 text-sm text-neutral-600 dark:text-neutral-300">
          {notice}
        </p>
      )}
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
      {modal && (
        <CreateDatabase
          engine={engine}
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
              return false;
            }
            const result = await response.json();
            setNotice(result.backup_job
              ? `Database created. ${database.backup === "weekly" ? "Weekly" : "Daily"} backup cron created.`
              : "Database created successfully.");
            setEngine(database.engine);
            await load();
            return true;
          }}
        />
      )}
      {backupModal && (
        <DatabaseBackupsModal
          database={backupModal}
          archives={databaseBackups(backupModal)}
          creating={backupCreating}
          onClose={() => setBackupModal(null)}
          onCreate={() => createDatabaseBackup(backupModal)}
          onDelete={(archive) => setConfirmDialog({
            kind: "confirm",
            tone: "danger",
            title: "Delete backup archive?",
            message: `Delete ${archive.name || "this backup archive"}? This cannot be undone.`,
            submitLabel: "Delete archive",
            onSubmit: () => deleteDatabaseBackup(archive),
          })}
        />
      )}
      {importModal && (
        <DatabaseImportModal
          engine={importModal.engine}
          targetDatabase={importModal.targetDatabase}
          submitting={importSubmitting}
          onClose={() => setImportModal(null)}
          onSubmit={importDatabase}
        />
      )}
      {serviceConfig && (
        <ServiceManagerModal
          service={serviceConfig.service}
          installed={serviceConfig.versions}
          onClose={() => setServiceConfig(null)}
        />
      )}
      {phpMyAdminInstallService && (
        <InstallServiceModal
          service={phpMyAdminInstallService}
          onClose={() => setPhpMyAdminInstallService(null)}
        />
      )}
      <ActionDialog
        dialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onSubmit={() => confirmDialog?.onSubmit?.()}
      />
    </div>
  );
}
