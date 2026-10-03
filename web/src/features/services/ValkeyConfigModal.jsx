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
import StartupPolicyToggle from "./StartupPolicyToggle";
import useServiceSocketStatus from "../../hooks/useServiceSocketStatus";

const tabs = [
  ["settings", "Server settings", Database],
  ["memory", "Memory & eviction", Gauge],
  ["persistence", "Persistence", HardDrive],
  ["security", "Security", ShieldCheck],
  ["replication", "Replication", Workflow],
  ["runtime", "Runtime", Activity],
  ["logs", "Logs", RefreshCw],
  ["configuration", "valkey.conf", FileCog],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";
const defaults = {
  bind: "127.0.0.1 ::1",
  port: 6379,
  memory: "256mb",
  policy: "allkeys-lru",
  appendonly: false,
  protectedMode: true,
  primary: "",
  checkInterval: "10s",
};

function Field({ label, children, hint }) {
  return (
    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">
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
        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          {description}
        </span>
      </span>
    </label>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-1 border-b border-neutral-200 py-3 last:border-b-0 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <code className="break-all text-xs text-neutral-700 dark:text-neutral-300 sm:text-right">
        {value}
      </code>
    </div>
  );
}
function SaveButton({ busy, onClick, children }) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
        disabled={busy}
        onClick={onClick}
      >
        {busy ? "Saving…" : children}
      </button>
    </div>
  );
}
function read(text, key, fallback) {
  return (
    text.match(new RegExp(`^${key}\\s+(.+)$`, "mi"))?.[1]?.trim() || fallback
  );
}
function parseConfig(text) {
  return {
    bind: read(text, "bind", defaults.bind),
    port: Number(read(text, "port", defaults.port)),
    memory: read(text, "maxmemory", defaults.memory),
    policy: read(text, "maxmemory-policy", defaults.policy),
    appendonly: read(text, "appendonly", "no") === "yes",
    protectedMode: read(text, "protected-mode", "yes") === "yes",
    primary: read(text, "replicaof", ""),
    checkInterval: read(
      text,
      "repl-ping-replica-period",
      defaults.checkInterval,
    ),
  };
}
function replaceLine(text, key, value) {
  const line = `${key} ${value}`.trimEnd();
  const pattern = new RegExp(`^${key}\\s+.*$`, "mi");
  return pattern.test(text)
    ? text.replace(pattern, line)
    : `${text.trimEnd()}\n${line}\n`;
}
function buildConfig(values, text) {
  let next = text || "# Server Engine Valkey configuration\n";
  [
    ["bind", values.bind],
    ["port", values.port],
    ["protected-mode", values.protectedMode ? "yes" : "no"],
    ["maxmemory", values.memory],
    ["maxmemory-policy", values.policy],
    ["appendonly", values.appendonly ? "yes" : "no"],
    ["repl-ping-replica-period", values.checkInterval],
  ].forEach(([key, value]) => {
    next = replaceLine(next, key, String(value));
  });
  next = values.primary
    ? replaceLine(next, "replicaof", values.primary)
    : next.replace(/^replicaof\s+.*$/gim, "");
  return next;
}

export default function ValkeyConfigModal({ installed, onClose }) {
  const current = Array.isArray(installed)
    ? installed.find((item) => item.status === "running") || installed[0]
    : installed;
  const [tab, setTab] = React.useState("settings");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [values, setValues] = React.useState(defaults);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [logs, setLogs] = React.useState(null);
  const { status: runtimeStatus, action, setAction } = useServiceSocketStatus("valkey", current?.status);
  const loadConfig = React.useCallback(
    () =>
      apiRequest("/api/v1/services/valkey/configuration")
        .then((response) => (response.ok ? response.json() : null))
        .then((value) => {
          if (!value) return;
          setConfig(value);
          setText(value.content || "");
          setValues((currentValues) => ({
            ...currentValues,
            ...parseConfig(value.content || ""),
          }));
        })
        .catch(() => {}),
    [],
  );
  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);
  React.useEffect(() => {
    if (tab !== "logs") return undefined;
    const load = () =>
      apiRequest("/api/v1/services/valkey/logs?page_size=50")
        .then((response) => (response.ok ? response.json() : null))
        .then(setLogs)
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 2500);
    return () => window.clearInterval(timer);
  }, [tab]);
  const setValue = (key, value) =>
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
  const save = async (content = buildConfig(values, text)) => {
    setBusy(true);
    const response = await apiRequest("/api/v1/services/valkey/configuration", {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    setMessage(
      response.ok
        ? "Valkey configuration saved. Restart Valkey to apply runtime changes."
        : body.message,
    );
    if (response.ok) setText(content);
    setBusy(false);
  };
  const serviceAction = async (actionName) => {
    setAction(actionName);
    const response = await apiRequest("/api/v1/services/valkey/action", {
      method: "POST",
      body: JSON.stringify({ action: actionName }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    if (!response.ok || !body.job_id) {
      setMessage(body.message || "Valkey action failed.");
      setAction("");
      return;
    }
  };
  const running = runtimeStatus === "running";
  const saveGuided = () => save();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section
        className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="valkey-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="valkey-title"
              className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Valkey
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <span
                className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {runtimeStatus || "stopped"}
              {current?.version && ` · v${current.version}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Valkey configuration"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 flex gap-5 overflow-x-auto border-b border-neutral-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">
          {tabs.map(([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        <div className="pt-5">
          {tab === "settings" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Valkey server settings
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Configure the Valkey-compatible data store and keep its
                  listener private by default.
                </p>
              </div>
              <Field label="Bind addresses">
                <input
                  className={inputClass}
                  value={values.bind}
                  onChange={(event) => setValue("bind", event.target.value)}
                />
              </Field>
              <Field label="Valkey port">
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  max="65535"
                  value={values.port}
                  onChange={(event) =>
                    setValue("port", Number(event.target.value))
                  }
                />
              </Field>
              <Row
                label="Data directory"
                value="/opt/server-engine/services/valkey/data"
              />
              <SaveButton busy={busy} onClick={saveGuided}>
                Save server settings
              </SaveButton>
            </div>
          )}
          {tab === "memory" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Memory and eviction
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Set a memory ceiling and decide which keys may be evicted when
                  the limit is reached.
                </p>
              </div>
              <Field label="Maximum memory">
                <input
                  className={inputClass}
                  value={values.memory}
                  onChange={(event) => setValue("memory", event.target.value)}
                />
              </Field>
              <Field label="Eviction policy">
                <select
                  className={inputClass}
                  value={values.policy}
                  onChange={(event) => setValue("policy", event.target.value)}
                >
                  <option value="noeviction">No eviction</option>
                  <option value="allkeys-lru">All keys · LRU</option>
                  <option value="allkeys-lfu">All keys · LFU</option>
                  <option value="volatile-lru">Expiring keys · LRU</option>
                  <option value="volatile-ttl">
                    Expiring keys · shortest TTL
                  </option>
                </select>
              </Field>
              <SaveButton busy={busy} onClick={saveGuided}>
                Save memory policy
              </SaveButton>
            </div>
          )}
          {tab === "persistence" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Valkey persistence
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Choose whether this instance is a disposable cache or keeps
                  data across restarts.
                </p>
              </div>
              <Toggle
                label="Append-only file"
                description="Record write commands for stronger restart durability."
                checked={values.appendonly}
                onChange={(value) => setValue("appendonly", value)}
              />
              <div className="rounded-md bg-neutral-50 p-3 text-xs leading-5 text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
                RDB snapshot schedules and AOF fsync details remain available in
                valkey.conf for advanced deployments.
              </div>
              <SaveButton busy={busy} onClick={saveGuided}>
                Save persistence
              </SaveButton>
            </div>
          )}
          {tab === "security" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Valkey security
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Valkey should be private to the application host or protected
                  by a firewall and ACL policy.
                </p>
              </div>
              <Toggle
                label="Protected mode"
                description="Reject unsafe remote access when authentication and safe binding are not configured."
                checked={values.protectedMode}
                onChange={(value) => setValue("protectedMode", value)}
              />
              <div className="rounded-md border border-neutral-200 p-4 text-sm leading-6 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
                Use ACL users in the advanced configuration for
                multi-application access. Do not expose port 6379 directly to
                the public internet.
              </div>
              <SaveButton busy={busy} onClick={saveGuided}>
                Save security
              </SaveButton>
            </div>
          )}
          {tab === "replication" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Replication
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Run this instance as a replica of another Valkey primary when
                  you need a read copy or failover preparation.
                </p>
              </div>
              <Field
                label="Primary server"
                hint="Use host and port, or leave empty for a standalone primary."
              >
                <input
                  className={inputClass}
                  value={values.primary}
                  onChange={(event) => setValue("primary", event.target.value)}
                  placeholder="Leave empty for standalone"
                />
              </Field>
              <Field label="Replica check interval">
                <input
                  className={inputClass}
                  value={values.checkInterval}
                  onChange={(event) =>
                    setValue("checkInterval", event.target.value)
                  }
                />
              </Field>
              <SaveButton busy={busy} onClick={saveGuided}>
                Save replication
              </SaveButton>
            </div>
          )}
          {tab === "runtime" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Valkey runtime
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Control the isolated Valkey process and inspect its managed
                  paths.
                </p>
                <StartupPolicyToggle serviceId="valkey" />
              </div>
              <div>
                <Row label="Status" value={runtimeStatus || "unknown"} />
                <Row
                  label="Version"
                  value={current?.version ? `v${current.version}` : "—"}
                />
                <Row
                  label="Configuration"
                  value={
                    config?.config_path ||
                    "/opt/server-engine/services/valkey/conf/valkey.conf"
                  }
                />
                <Row
                  label="Data directory"
                  value="/opt/server-engine/services/valkey/data"
                />
                <Row label="Port" value={String(values.port)} />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
                  disabled={Boolean(action)}
                  onClick={() => serviceAction(running ? "restart" : "start")}
                >
                  {action
                    ? `${action[0].toUpperCase()}${action.slice(1)}ing…`
                    : running
                      ? "Restart"
                      : "Start"}
                </button>
                {running && (
                  <button
                    type="button"
                    className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
                    disabled={Boolean(action)}
                    onClick={() => serviceAction("stop")}
                  >
                    {action === "stop" ? "Stopping…" : "Stop"}
                  </button>
                )}
              </div>
            </div>
          )}
          {tab === "logs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    Valkey logs
                  </h3>
                  <p className="mt-1 break-all text-xs text-neutral-500 dark:text-neutral-400">
                    {logs?.path || "Loading…"}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
                  onClick={() =>
                    apiRequest("/api/v1/services/valkey/logs?page_size=50")
                      .then((response) =>
                        response.ok ? response.json() : null,
                      )
                      .then(setLogs)
                  }
                >
                  <RefreshCw size={14} />
                  Reload
                </button>
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-950 p-4 text-xs leading-5 text-neutral-300">
                {logs?.available
                  ? logs.lines.join("\n") || "No log lines recorded."
                  : logs
                    ? "No log exists yet."
                    : "Loading…"}
              </pre>
            </div>
          )}
          {tab === "configuration" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  valkey.conf
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Edit advanced Valkey directives directly. Guided controls
                  remain available in the other tabs.
                </p>
                <code className="mt-2 block break-all text-xs text-neutral-500 dark:text-neutral-400">
                  {config?.config_path ||
                    "/opt/server-engine/services/valkey/conf/valkey.conf"}
                </code>
              </div>
              <ConfigEditor
                path="valkey.conf"
                value={text}
                onChange={setText}
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
                  onClick={loadConfig}
                >
                  Reset edits
                </button>
                <button
                  type="button"
                  className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
                  disabled={busy}
                  onClick={() => save(text)}
                >
                  {busy ? "Saving…" : "Save valkey.conf"}
                </button>
              </div>
            </div>
          )}
        </div>
        {message && (
          <p className="mt-5 text-sm text-neutral-600 dark:text-neutral-300">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
