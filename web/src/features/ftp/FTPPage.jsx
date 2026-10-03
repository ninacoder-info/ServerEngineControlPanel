import React from "react";
import { z } from "zod";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileCog,
  FolderOpen,
  History,
  Info,
  KeyRound,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCw,
  Server,
  Play,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
  UserRound,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ServiceNotInstalledState from "../../components/ServiceNotInstalledState";
import { useServiceInstallationState } from "../../hooks/useServiceInstallationState";
import SecurePasswordInput from "../../components/SecurePasswordInput";
import FormField from "../../components/FormField";

const field =
  "mt-2 block min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const card =
  "rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900";

const ftpAccountSchema = (editing) => z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters.").max(32, "Username cannot exceed 32 characters.").regex(/^[a-z][a-z0-9_-]*$/, "Username format is invalid."),
  password: editing ? z.string().max(256, "Password is too long.") : z.string().min(8, "Password is too short.").max(256, "Password is too long."),
  root: z.string().trim().min(1, "Choose an account root folder."),
  access: z.enum(["read-write", "read-only"]),
  quota_mb: z.union([z.literal(""), z.coerce.number().int().positive("Quota must be greater than zero.")]),
  enabled: z.boolean(),
});

export function VsftpdConfigModal({
  service,
  settings,
  onClose,
  onSaved,
  onServiceAction,
}) {
  const installed = service.status !== "not-installed";
  const statusLabel = installed
    ? (service.status === "running" ? "running" : "stopped")
    : "not installed";
  const statusClass = service.status === "running"
    ? "text-emerald-600 dark:text-emerald-400"
    : service.status === "not-installed"
      ? "text-neutral-500 dark:text-neutral-400"
      : "text-amber-600 dark:text-amber-400";
  const [form, setForm] = React.useState({
    control_port: settings.control_port || 21,
    passive_min: settings.passive_min || 40000,
    passive_max: settings.passive_max || 40100,
    tls_required: settings.tls_required ?? true,
    anonymous_enabled: settings.anonymous_enabled ?? false,
    max_clients: settings.max_clients || 50,
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [tab, setTab] = React.useState("configuration");
  const [actionBusy, setActionBusy] = React.useState(false);
  const [version, setVersion] = React.useState(service.version || "3.0.5");
  const [confirmed, setConfirmed] = React.useState(false);
  const [versionBusy, setVersionBusy] = React.useState(false);
  const [versionMessage, setVersionMessage] = React.useState("");
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await apiRequest("/api/v1/ftp/settings", {
      method: "PUT",
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      setError(await readApiError(response, "Unable to save vsftpd settings."));
      setBusy(false);
      return;
    }
    onSaved(await response.json());
  };
  const update = (key, value) => setForm({ ...form, [key]: value });
  const runAction = async (action) => {
    setActionBusy(true);
    setError("");
    try {
      await onServiceAction(action);
    } catch (actionError) {
      setError(actionError.message || "Unable to control vsftpd.");
    } finally {
      setActionBusy(false);
    }
  };
  const tabs = [
    ["configuration", "Configuration", FileCog],
    ["versions", "Versions", History],
    ["runtime", "Runtime", Activity],
    ["error-log", "Error log", AlertTriangle],
  ];
  const versions = service.versions || [
    { version: "3.0.5", channel: "stable" },
    { version: "3.0.3", channel: "security" },
    { version: "3.0.2", channel: "legacy" },
  ];
  const switchVersion = async () => {
    setVersionBusy(true);
    setVersionMessage("");
    const response = await apiRequest(
      "/api/v1/services/vsftpd/switch-version",
      {
        method: "POST",
        body: JSON.stringify({ version, confirmed }),
      },
    );
    const body = response.ok ? await response.json() : null;
    setVersionMessage(
      body?.message ||
        (await readApiError(response, "Unable to switch vsftpd version.")),
    );
    setVersionBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/50 p-4">
      <form
        onSubmit={save}
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              vsftpd configuration
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              <span
                className={statusClass}
              >
                {statusLabel}
              </span>
              {" · "}v{service.version || "3.0.5"}
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Configure transfer ports, access policy, and connection limits.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close vsftpd configuration"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            ×
          </button>
        </div>
        <div className="mt-6 flex gap-5 overflow-x-auto border-b border-neutral-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">
          {tabs.map(([value, label, Icon]) => (
            <button
              type="button"
              key={value}
              onClick={() => setTab(value)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === value ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon size={14} />
                {label}
              </span>
            </button>
          ))}
        </div>
        {tab === "configuration" && (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              FTP control port
              <input
                className={field}
                type="number"
                min="1"
                max="65535"
                value={form.control_port}
                onChange={(event) =>
                  update("control_port", Number(event.target.value))
                }
              />
              <span className="mt-1 block text-xs font-normal text-neutral-500">
                Used by FTP and FTPS. SFTP uses SSH and is managed separately.
              </span>
            </label>
            <label className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              Passive port start
              <input
                className={field}
                type="number"
                min="1024"
                max="65535"
                value={form.passive_min}
                onChange={(event) =>
                  update("passive_min", Number(event.target.value))
                }
              />
              <span className="mt-1 block text-xs font-normal text-neutral-500">
                First port used for file transfers and directory listings.
              </span>
            </label>
            <label className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              Passive port end
              <input
                className={field}
                type="number"
                min="1024"
                max="65535"
                value={form.passive_max}
                onChange={(event) =>
                  update("passive_max", Number(event.target.value))
                }
              />
              <span className="mt-1 block text-xs font-normal text-neutral-500">
                Last port in the passive transfer range.
              </span>
            </label>
            <label className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              Maximum connections
              <input
                className={field}
                type="number"
                min="1"
                max="10000"
                value={form.max_clients}
                onChange={(event) =>
                  update("max_clients", Number(event.target.value))
                }
              />
            </label>
            <div className="space-y-4 pt-3">
              <label className="flex items-center gap-3 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300 text-blue-600"
                  checked={form.tls_required}
                  onChange={(event) =>
                    update("tls_required", event.target.checked)
                  }
                />
                Require FTPS
              </label>
              <label className="flex items-center gap-3 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300 text-blue-600"
                  checked={form.anonymous_enabled}
                  onChange={(event) =>
                    update("anonymous_enabled", event.target.checked)
                  }
                />
                Allow anonymous FTP
              </label>
            </div>
          </div>
        )}
        {tab === "versions" && (
          <div className="mt-6 space-y-4">
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                Available vsftpd versions
              </h3>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Manage the FTP server version provided by Server Engine.
              </p>
            </div>
            <label className="block text-sm font-medium text-neutral-800 dark:text-neutral-200">
              vsftpd version
              <select
                className={`${field} bg-white dark:bg-neutral-950`}
                value={version}
                onChange={(event) => setVersion(event.target.value)}
              >
                {versions.map((item) => (
                  <option key={item.version} value={item.version}>
                    {item.version} · {item.channel}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300 text-blue-600"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Queue this version installation or switch.
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={switchVersion}
                disabled={!confirmed || versionBusy}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Settings2 size={14} />{" "}
                {versionBusy ? "Queueing…" : "Install / switch version"}
              </button>
            </div>
            {versionMessage && (
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {versionMessage}
              </p>
            )}
          </div>
        )}
        {tab === "runtime" && (
          <div className="mt-6 space-y-4">
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                Runtime status
              </h3>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Check the current FTP service process and runtime paths.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                <p className="text-xs text-neutral-500">Service state</p>
                <p className={`mt-1 font-semibold ${statusClass}`}>
                  {statusLabel}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                <p className="text-xs text-neutral-500">Control port</p>
                <p className="mt-1 font-semibold text-neutral-900 dark:text-neutral-100">
                  21
                </p>
              </div>
            </div>
            {!installed ? (
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
                Install vsftpd from the Services page before starting it or managing its runtime.
              </div>
            ) : <div className="flex flex-wrap gap-3">
              {service.status === "running" ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => runAction("stop")}
                  className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <Square size={14} /> Stop
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => runAction("start")}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Play size={14} /> Start
                </button>
              )}
              {service.status === "running" && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => runAction("restart")}
                  className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <RotateCw size={14} /> Restart
                </button>
              )}
            </div>}
          </div>
        )}
        {tab === "error-log" && (
          <div className="mt-6">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
              vsftpd error log
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Service errors will appear here after vsftpd starts.
            </p>
            <pre className="mt-4 min-h-32 overflow-auto rounded-lg bg-neutral-950 p-4 text-xs text-neutral-300">
              No log entries available.
            </pre>
          </div>
        )}
        {error && (
          <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        {tab === "configuration" && (
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-neutral-600 dark:text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !installed}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save configuration"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function FolderPicker({ browser, busy, browse, onSelect, onClose }) {
  const current = browser.path || "/server-engine/www";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="w-full max-w-xl rounded-xl bg-white shadow-xl dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Choose account root folder
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              The FTP account can access this folder and its subfolders only.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close folder browser"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
            <FolderOpen size={16} className="text-blue-600" />
            <span className="min-w-0 flex-1 truncate">{current}</span>
            {browser.path && (
              <button
                type="button"
                className="cursor-pointer text-blue-600 hover:text-blue-700 dark:text-blue-400"
                onClick={() => onSelect(browser.path)}
              >
                Select
              </button>
            )}
          </div>
          {browser.parent && (
            <button
              type="button"
              className="cursor-pointer text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              onClick={() => browse(browser.parent)}
            >
              ← Parent folder
            </button>
          )}
          {busy ? (
            <p className="py-5 text-sm text-neutral-500 dark:text-neutral-400">
              Loading folders…
            </p>
          ) : !browser.path ? (
            <div className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {browser.roots.map((root) => (
                <button
                  type="button"
                  key={root.path}
                  className="flex w-full cursor-pointer items-center gap-3 py-3 text-left text-sm text-neutral-700 hover:text-blue-600 dark:text-neutral-300 dark:hover:text-blue-400"
                  onClick={() => browse(root.path)}
                >
                  <FolderOpen size={16} />
                  {root.path}
                </button>
              ))}
              {!browser.roots.length && (
                <p className="py-5 text-sm text-neutral-500 dark:text-neutral-400">
                  No allowed website roots are available yet.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {browser.directories.map((directory) => (
                <button
                  type="button"
                  key={directory.path}
                  className="flex w-full cursor-pointer items-center gap-3 py-3 text-left text-sm text-neutral-700 hover:text-blue-600 dark:text-neutral-300 dark:hover:text-blue-400"
                  onClick={() => browse(directory.path)}
                >
                  <FolderOpen size={16} />
                  {directory.name}
                </button>
              ))}
              {!browser.directories.length && (
                <p className="py-5 text-sm text-neutral-500 dark:text-neutral-400">
                  No subfolders in this directory.
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AccountModal({ account, onClose, onSaved }) {
  const editing = Boolean(account);
  const [form, setForm] = React.useState({
    username: account?.username || "",
    password: "",
    root: account?.root || "/server-engine/www",
    access: account?.access || "read-write",
    quota_mb: account?.quota_mb || "",
    enabled: account?.enabled ?? true,
  });
  const [error, setError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [browser, setBrowser] = React.useState({
    path: null,
    parent: null,
    roots: [],
    directories: [],
  });
  const [browserBusy, setBrowserBusy] = React.useState(false);
  const [browserOpen, setBrowserOpen] = React.useState(false);
  const browse = React.useCallback(async (path = null) => {
    setBrowserBusy(true);
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    const response = await apiRequest(`/api/v1/ftp/directories${query}`);
    if (response.ok) setBrowser(await response.json());
    else
      setError(
        await readApiError(response, "Unable to browse allowed folders."),
      );
    setBrowserBusy(false);
  }, []);
  React.useEffect(() => {
    browse(account?.root || null);
  }, [account, browse]);
  const save = async (event) => {
    event.preventDefault();
    const validation = ftpAccountSchema(editing).safeParse(form);
    if (!validation.success) {
      const nextErrors = Object.fromEntries(validation.error.issues.map((issue) => [issue.path[0], issue.message]));
      setFieldErrors(nextErrors);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    setFieldErrors({});
    const response = await apiRequest(
      editing
        ? `/api/v1/ftp/accounts/${account.username}`
        : "/api/v1/ftp/accounts",
      {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          quota_mb: form.quota_mb ? Number(form.quota_mb) : null,
        }),
      },
    );
    if (!response.ok) {
      setError(await readApiError(response, "Unable to save FTP account."));
      setBusy(false);
      return;
    }
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/50 p-4">
      <form
        onSubmit={save}
        noValidate
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {editing ? "Edit FTP account" : "Create FTP account"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Restrict this account to one website or deployment directory.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400">
            ×
          </button>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <FormField label="Username" tooltip="Use lowercase letters, numbers, underscores, or hyphens only." error={fieldErrors.username} showError={false}>
            <input
              className={field}
              value={form.username}
              disabled={editing}
              onChange={(event) => {
                setForm({ ...form, username: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") });
                setFieldErrors((current) => ({ ...current, username: undefined }));
              }}
              placeholder="website_deploy"
            />
          </FormField>
          <FormField label={editing ? "New password (optional)" : "Password"} tooltip="Use at least 8 characters." error={fieldErrors.password} showError={false}>
            <SecurePasswordInput
              className={field}
              value={form.password}
              onChange={(event) => {
                setForm({ ...form, password: event.target.value });
                setFieldErrors((current) => ({ ...current, password: undefined }));
              }}
              placeholder="At least 8 characters"
            />
          </FormField>
          <label className={`text-sm font-medium md:col-span-2 ${fieldErrors.root ? "text-rose-600 dark:text-rose-400" : "text-neutral-800 dark:text-neutral-200"}`}>
            Account root folder
            <div className="mt-2 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <FolderOpen
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                />
                <input
                  className={`${field} mt-0 pl-9 ${fieldErrors.root ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500" : ""}`}
                  value={form.root}
                  readOnly
                  placeholder="Choose a folder"
                />
              </div>
              <button
                type="button"
                className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                onClick={() => setBrowserOpen(true)}
              >
                <FolderOpen size={15} />
                Browse
              </button>
            </div>
            <span className="group/root relative mt-1 inline-flex cursor-help items-center text-neutral-400 dark:text-neutral-500">
              <Info size={14} aria-label="FTP account root folder information" />
              <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-64 rounded-md bg-neutral-900 px-2.5 py-2 text-xs font-normal leading-5 text-white opacity-0 shadow-lg transition-opacity group-hover/root:opacity-100 dark:bg-white dark:text-neutral-900">
                The FTP account cannot browse above this directory.
              </span>
            </span>
            {fieldErrors.root && <span className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">{fieldErrors.root}</span>}
          </label>
          <label className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Access
            <select
              className={field}
              value={form.access}
              onChange={(event) =>
                setForm({ ...form, access: event.target.value })
              }
            >
              <option value="read-write">Read and write</option>
              <option value="read-only">Read only</option>
            </select>
          </label>
          <label className={`text-sm font-medium ${fieldErrors.quota_mb ? "text-rose-600 dark:text-rose-400" : "text-neutral-800 dark:text-neutral-200"}`}>
            Storage quota (MB)
            <input
              className={fieldErrors.quota_mb ? `${field} border-rose-500 focus:border-rose-500 focus:ring-rose-500` : field}
              type="number"
              min="1"
              value={form.quota_mb}
              onChange={(event) => {
                setForm({ ...form, quota_mb: event.target.value });
                setFieldErrors((current) => ({ ...current, quota_mb: undefined }));
              }}
              placeholder="Unlimited"
            />
            {fieldErrors.quota_mb && <span className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">{fieldErrors.quota_mb}</span>}
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-neutral-800 dark:text-neutral-200 md:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300 text-blue-600"
              checked={form.enabled}
              onChange={(event) =>
                setForm({ ...form, enabled: event.target.checked })
              }
            />
            Allow this account to sign in
          </label>
        </div>
        {error && (
          <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-neutral-600 dark:text-neutral-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Create account"}
          </button>
        </div>
      </form>
      {browserOpen && (
        <FolderPicker
          browser={browser}
          busy={browserBusy}
          browse={browse}
          onSelect={(path) => {
            setForm((current) => ({ ...current, root: path }));
            setFieldErrors((current) => ({ ...current, root: undefined }));
            setBrowserOpen(false);
          }}
          onClose={() => setBrowserOpen(false)}
        />
      )}
    </div>
  );
}

function FTPPageSkeleton() {
  return (
    <div className="animate-pulse space-y-7" aria-label="Loading FTP accounts">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="space-y-3">
          <div className="h-4 w-36 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-9 w-44 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-[30rem] max-w-full rounded bg-neutral-100 dark:bg-neutral-800/70" />
        </div>
        <div className="h-10 w-40 rounded-md bg-neutral-200 dark:bg-neutral-800" />
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={`${card} space-y-4`}>
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="space-y-2">
                <div className="h-3 w-20 rounded bg-neutral-100 dark:bg-neutral-800/70" />
                <div className="h-6 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className={card}>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-5 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-3 w-64 rounded bg-neutral-100 dark:bg-neutral-800/70" />
          </div>
          <div className="h-5 w-20 rounded bg-neutral-100 dark:bg-neutral-800/70" />
        </div>
        <div className="mt-5 overflow-hidden">
          <div className="grid grid-cols-6 gap-4 border-b border-neutral-200 px-3 py-3 dark:border-neutral-800">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-3 rounded bg-neutral-100 dark:bg-neutral-800/70" />)}
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="grid grid-cols-6 items-center gap-4 px-3 py-5">
                <div className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-3 w-40 rounded bg-neutral-100 dark:bg-neutral-800/70" />
                <div className="h-3 w-16 rounded bg-neutral-100 dark:bg-neutral-800/70" />
                <div className="h-3 w-20 rounded bg-neutral-100 dark:bg-neutral-800/70" />
                <div className="h-5 w-20 rounded-full bg-neutral-100 dark:bg-neutral-800/70" />
                <div className="ml-auto h-7 w-16 rounded bg-neutral-100 dark:bg-neutral-800/70" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function FTPPage() {
  const vsftpdState = useServiceInstallationState("vsftpd");
  const [data, setData] = React.useState({
    service: {},
    settings: {},
    accounts: [],
  });
  const [modal, setModal] = React.useState(null);
  const [configOpen, setConfigOpen] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(() => {
    setLoading(true);
    return apiRequest("/api/v1/ftp")
        .then((response) => {
          if (!response.ok) throw new Error("Unable to load FTP configuration.");
          return response.json();
        })
        .then(setData)
        .catch(() => setNotice("Unable to load FTP configuration."))
        .finally(() => setLoading(false));
  }, []);
  React.useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener("serverengine:jobs-updated", refresh);
    return () => window.removeEventListener("serverengine:jobs-updated", refresh);
  }, [load]);

  const updateSettings = async (key, value) => {
    const next = { ...data.settings, [key]: value };
    setData({ ...data, settings: next });
    if (
      key === "passive_max" ||
      key === "passive_min" ||
      key === "tls_required" ||
      key === "anonymous_enabled" ||
      key === "max_clients"
    ) {
      const response = await apiRequest("/api/v1/ftp/settings", {
        method: "PUT",
        body: JSON.stringify(next),
      });
      if (!response.ok)
        setNotice(await readApiError(response, "Unable to save FTP settings."));
    }
  };
  const saveServiceSettings = (settings) => {
    setData((current) => ({ ...current, settings }));
    setConfigOpen(false);
  };
  const serviceAction = async (action) => {
    const response = await apiRequest("/api/v1/services/vsftpd/action", {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      throw new Error(
        await readApiError(response, `Unable to ${action} vsftpd.`),
      );
    }
    const body = await response.json();
    let finalJob;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      const jobs = await apiRequest("/api/v1/jobs").then((result) =>
        result.ok ? result.json() : [],
      );
      finalJob = jobs.find((job) => job.id === body.job_id);
      if (
        finalJob &&
        ["succeeded", "failed", "cancelled"].includes(finalJob.status)
      )
        break;
    }
    if (!finalJob || finalJob.status !== "succeeded") {
      throw new Error(finalJob?.message || `Unable to ${action} vsftpd.`);
    }
    await load();
  };
  const remove = async (username) => {
    if (!window.confirm(`Delete FTP account ${username}?`)) return;
    const response = await apiRequest(`/api/v1/ftp/accounts/${username}`, {
      method: "DELETE",
    });
    if (response.ok) load();
    else
      setNotice(await readApiError(response, "Unable to delete FTP account."));
  };
  const installed = vsftpdState.installed && data.service.installed;
  if (loading || vsftpdState.loading) {
    return <FTPPageSkeleton />;
  }
  if (!installed) {
    return <ServiceNotInstalledState state={vsftpdState} icon={Server} eyebrow="FTP Accounts" title="vsftpd is not installed" description="Install vsftpd to create restricted FTP accounts, configure FTPS, and manage passive transfer ports." installLabel="Install vsftpd" />;
  }
  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Hosting / File transfer
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-neutral-900 dark:text-neutral-100">
            FTP Accounts
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Manage restricted FTP and FTPS users, website roots, access
            permissions, quotas, and passive transfer settings.
          </p>
        </div>
        <button
          type="button"
          disabled={!installed}
          onClick={() => setModal({})}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={16} /> Add FTP account
        </button>
      </header>
      {!installed && (
        <section className={card}>
          <div className="flex items-start gap-3">
            <Server className="mt-0.5 text-amber-500" size={20} />
            <div>
              <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
                vsftpd is not installed
              </h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Install vsftpd from Services before creating FTP accounts.
              </p>
              <a
                href="/services"
                className="mt-3 inline-flex text-sm font-semibold text-blue-600 dark:text-blue-400"
              >
                Open Services
              </a>
            </div>
          </div>
        </section>
      )}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [UserRound, "FTP accounts", data.accounts.length],
          [
            ShieldCheck,
            "TLS policy",
            data.settings.tls_required ? "Required" : "Optional",
          ],
          [
            FolderOpen,
            "Restricted roots",
            data.accounts.filter((account) => account.root).length,
          ],
          [LockKeyhole, "Service status", data.service.status || "Unknown"],
        ].map(([Icon, label, value]) => (
          <div className={card} key={label}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Icon size={20} className="text-blue-500" />
                <span>
                  <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                    {label}
                  </small>
                  <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                    {value}
                  </strong>
                </span>
              </div>
              {label === "Service status" && installed && (
                <button
                  type="button"
                  title="Configure vsftpd"
                  aria-label="Configure vsftpd"
                  onClick={() => setConfigOpen(true)}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                >
                  <Settings2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
      <section className={card}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              FTP accounts
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Every account is jailed to its configured root folder.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400"
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                <th className="px-3 py-3">Account</th>
                <th className="px-3 py-3">Root folder</th>
                <th className="px-3 py-3">Access</th>
                <th className="px-3 py-3">Quota</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((account) => (
                <tr
                  key={account.username}
                  className="border-b border-neutral-100 dark:border-neutral-800"
                >
                  <td className="px-3 py-4 font-semibold text-neutral-900 dark:text-neutral-100">
                    {account.username}
                  </td>
                  <td className="px-3 py-4 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                    {account.root}
                  </td>
                  <td className="px-3 py-4 capitalize text-neutral-600 dark:text-neutral-400">
                    {account.access}
                  </td>
                  <td className="px-3 py-4 text-neutral-600 dark:text-neutral-400">
                    {account.quota_mb ? `${account.quota_mb} MB` : "Unlimited"}
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${account.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400"}`}
                    >
                      <CheckCircle2 size={14} />
                      {account.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setModal(account)}
                      className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <MoreHorizontal size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(account.username)}
                      className="rounded-md p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.accounts.length && (
            <div className="py-14 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No FTP accounts yet.
            </div>
          )}
        </div>
      </section>
      {notice && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{notice}</p>
      )}
      {modal !== null && (
        <AccountModal
          account={modal.username ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {configOpen && (
        <VsftpdConfigModal
          service={data.service}
          settings={data.settings}
          onClose={() => setConfigOpen(false)}
          onSaved={saveServiceSettings}
          onServiceAction={serviceAction}
        />
      )}
    </div>
  );
}
