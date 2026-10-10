import React from "react";
import {
  Activity,
  FileCog,
  Gauge,
  KeyRound,
  RefreshCw,
  Server,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";
import StartupPolicyToggle from "./StartupPolicyToggle";
import useServiceSocketStatus from "../../hooks/useServiceSocketStatus";

const tabs = [
  ["runtime", "Runtime", Activity],
  ["settings", "Server settings", Server],
  ["performance", "Performance", Gauge],
  ["security", "Security", ShieldCheck],
  ["replication", "Replication", Workflow],
  ["logs", "Error log", RefreshCw],
  ["configuration", "my.cnf", FileCog],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  bindAddress: "127.0.0.1",
  port: 3306,
  dataDirectory: "/opt/server-engine/services/mariadb/data",
  maxConnections: 151,
  bufferPool: "256M",
  tableOpenCache: 2000,
  threadCache: 16,
  tmpTableSize: "64M",
  localInfile: false,
  skipNameResolve: true,
  requireSecureTransport: false,
  slowQueryLog: true,
  longQueryTime: 2,
  binaryLog: false,
  binlogFormat: "ROW",
  serverId: 1,
  gtidStrict: false,
  readOnly: false,
  relayRecovery: true,
  expireLogs: 7,
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
        {description && (
          <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function Save({ busy, children, onClick }) {
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

function read(text, key, fallback) {
  return (
    text.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "mi"))?.[1]?.trim() ||
    fallback
  );
}

function parseConfig(text) {
  return {
    bindAddress: read(text, "bind-address", defaults.bindAddress),
    port: Number(read(text, "port", defaults.port)),
    dataDirectory: read(text, "datadir", defaults.dataDirectory),
    maxConnections: Number(
      read(text, "max_connections", defaults.maxConnections),
    ),
    bufferPool: read(text, "innodb_buffer_pool_size", defaults.bufferPool),
    tableOpenCache: Number(
      read(text, "table_open_cache", defaults.tableOpenCache),
    ),
    threadCache: Number(read(text, "thread_cache_size", defaults.threadCache)),
    tmpTableSize: read(text, "tmp_table_size", defaults.tmpTableSize),
    localInfile: read(text, "local_infile", "0") === "1",
    skipNameResolve: read(text, "skip_name_resolve", "1") === "1",
    requireSecureTransport:
      read(text, "require_secure_transport", "OFF").toUpperCase() === "ON",
    slowQueryLog: read(text, "slow_query_log", "ON").toUpperCase() === "ON",
    longQueryTime: Number(
      read(text, "long_query_time", defaults.longQueryTime),
    ),
    binaryLog: !["", "0", "off", "false"].includes(
      read(text, "log_bin", "").toLowerCase(),
    ),
    binlogFormat: read(
      text,
      "binlog_format",
      defaults.binlogFormat,
    ).toUpperCase(),
    serverId: Number(read(text, "server_id", defaults.serverId)),
    gtidStrict: read(text, "gtid_strict_mode", "0") === "1",
    readOnly: read(text, "read_only", "0") === "1",
    relayRecovery: read(text, "relay_log_recovery", "1") === "1",
    expireLogs: Number(read(text, "expire_logs_days", defaults.expireLogs)),
  };
}

function buildConfig(values, text) {
  const entries = {
    "bind-address": values.bindAddress,
    port: values.port,
    datadir: values.dataDirectory,
    max_connections: values.maxConnections,
    innodb_buffer_pool_size: values.bufferPool,
    table_open_cache: values.tableOpenCache,
    thread_cache_size: values.threadCache,
    tmp_table_size: values.tmpTableSize,
    max_heap_table_size: values.tmpTableSize,
    local_infile: values.localInfile ? 1 : 0,
    skip_name_resolve: values.skipNameResolve ? 1 : 0,
    require_secure_transport: values.requireSecureTransport ? "ON" : "OFF",
    slow_query_log: values.slowQueryLog ? "ON" : "OFF",
    long_query_time: values.longQueryTime,
    log_bin: values.binaryLog ? "mariadb-bin" : "OFF",
    binlog_format: values.binlogFormat,
    server_id: values.serverId,
    gtid_strict_mode: values.gtidStrict ? 1 : 0,
    read_only: values.readOnly ? 1 : 0,
    relay_log_recovery: values.relayRecovery ? 1 : 0,
    expire_logs_days: values.expireLogs,
  };
  let next = text || "[mariadb]\n";
  Object.entries(entries).forEach(([key, value]) => {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}\\s*=.*$`, "mi");
    next = pattern.test(next)
      ? next.replace(pattern, line)
      : `${next.trimEnd()}\n${line}\n`;
  });
  return next;
}

function Settings({ values, setValue, save, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          MariaDB server settings
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Configure the listener, data directory, and connection ceiling for
          this MariaDB instance.
        </p>
      </div>
      <div className="space-y-4">
        <Field
          label="Bind address"
          hint="Keep this at 127.0.0.1 unless a website or remote client must connect over the network."
        >
          <input
            className={inputClass}
            value={values.bindAddress}
            onChange={(event) => setValue("bindAddress", event.target.value)}
          />
        </Field>
        <Field label="MariaDB port">
          <input
            className={inputClass}
            type="number"
            min="1"
            max="65535"
            value={values.port}
            onChange={(event) => setValue("port", Number(event.target.value))}
          />
        </Field>
        <Field label="Data directory">
          <input
            className={inputClass}
            value={values.dataDirectory}
            onChange={(event) => setValue("dataDirectory", event.target.value)}
          />
        </Field>
        <Field
          label="Maximum connections"
          hint="Each connection consumes memory and file descriptors."
        >
          <input
            className={inputClass}
            type="number"
            min="10"
            value={values.maxConnections}
            onChange={(event) =>
              setValue("maxConnections", Number(event.target.value))
            }
          />
        </Field>
      </div>
      <Save busy={busy} onClick={save}>
        Save server settings
      </Save>
    </div>
  );
}

function Performance({ values, setValue, save, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          MariaDB performance
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Tune memory and connection reuse for live Laravel, WordPress, and
          general web workloads.
        </p>
      </div>
      <div className="space-y-4">
        <Field
          label="InnoDB buffer pool"
          hint="Main cache for InnoDB data and indexes. A common starting point is 50–70% of available memory on a dedicated database server."
        >
          <input
            className={inputClass}
            value={values.bufferPool}
            onChange={(event) => setValue("bufferPool", event.target.value)}
          />
        </Field>
        <Field label="Table open cache">
          <input
            className={inputClass}
            type="number"
            min="64"
            value={values.tableOpenCache}
            onChange={(event) =>
              setValue("tableOpenCache", Number(event.target.value))
            }
          />
        </Field>
        <Field label="Thread cache size">
          <input
            className={inputClass}
            type="number"
            min="0"
            value={values.threadCache}
            onChange={(event) =>
              setValue("threadCache", Number(event.target.value))
            }
          />
        </Field>
        <Field label="Temporary table memory">
          <input
            className={inputClass}
            value={values.tmpTableSize}
            onChange={(event) => setValue("tmpTableSize", event.target.value)}
          />
        </Field>
      </div>
      <Save busy={busy} onClick={save}>
        Save performance
      </Save>
    </div>
  );
}

function Security({ values, setValue, save, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          MariaDB security
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Reduce exposure and make connection behavior safer for production
          websites.
        </p>
      </div>
      <div className="space-y-4">
        <Toggle
          label="Skip hostname lookups"
          description="Avoid reverse-DNS delays and require host access rules to use IP addresses."
          checked={values.skipNameResolve}
          onChange={(value) => setValue("skipNameResolve", value)}
        />
        <Toggle
          label="Require secure transport"
          description="Require TLS for client connections when MariaDB TLS certificates are configured."
          checked={values.requireSecureTransport}
          onChange={(value) => setValue("requireSecureTransport", value)}
        />
        <Toggle
          label="Allow local infile"
          description="Keep disabled unless an application explicitly needs LOAD DATA LOCAL INFILE."
          checked={values.localInfile}
          onChange={(value) => setValue("localInfile", value)}
        />
      </div>
      <Save busy={busy} onClick={save}>
        Save security
      </Save>
    </div>
  );
}

function Replication({ values, setValue, save, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Replication and recovery
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Prepare a primary or replica without hiding the settings that affect
          binlogs and failover.
        </p>
      </div>
      <div className="space-y-4">
        <Toggle
          label="Enable binary logging"
          description="Required for standard replication, point-in-time recovery, and binlog-based tooling."
          checked={values.binaryLog}
          onChange={(value) => setValue("binaryLog", value)}
        />
        <Field
          label="Server ID"
          hint="Every primary and replica in a topology must have a unique numeric ID."
        >
          <input
            className={inputClass}
            type="number"
            min="1"
            value={values.serverId}
            onChange={(event) =>
              setValue("serverId", Number(event.target.value))
            }
          />
        </Field>
        <Field label="Binary log format">
          <select
            className={inputClass}
            value={values.binlogFormat}
            onChange={(event) => setValue("binlogFormat", event.target.value)}
          >
            <option>ROW</option>
            <option>MIXED</option>
            <option>STATEMENT</option>
          </select>
        </Field>
        <Toggle
          label="Strict GTID mode"
          description="Use MariaDB GTID rules for controlled replication topologies."
          checked={values.gtidStrict}
          onChange={(value) => setValue("gtidStrict", value)}
        />
        <Toggle
          label="Read-only replica"
          description="Prevent normal application writes while allowing replication updates."
          checked={values.readOnly}
          onChange={(value) => setValue("readOnly", value)}
        />
        <Toggle
          label="Relay log recovery"
          description="Recover relay logs automatically after an unclean replica shutdown."
          checked={values.relayRecovery}
          onChange={(value) => setValue("relayRecovery", value)}
        />
        <Field label="Binary log retention (days)">
          <input
            className={inputClass}
            type="number"
            min="0"
            value={values.expireLogs}
            onChange={(event) =>
              setValue("expireLogs", Number(event.target.value))
            }
          />
        </Field>
      </div>
      <Save busy={busy} onClick={save}>
        Save replication
      </Save>
    </div>
  );
}

function Runtime({ current, runtimeStatus, action, onAction, configPath }) {
  const running = runtimeStatus === "running";
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          MariaDB runtime
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Control the managed server process and inspect its runtime paths.
        </p>
        <StartupPolicyToggle serviceId="mariadb" />
      </div>
      <div>
        <Row
          label="Status"
          value={runtimeStatus || current?.status || "unknown"}
        />
        <Row
          label="Version"
          value={current?.version ? `v${current.version}` : "—"}
        />
        <Row label="Configuration" value={configPath} />
        <Row
          label="Data directory"
          value="/opt/server-engine/services/mariadb/data"
        />
        <Row label="Socket" value="run/mysql.sock" />
        <Row label="Port" value="3306" />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
          disabled={Boolean(action)}
          onClick={() => onAction(running ? "restart" : "start")}
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
            onClick={() => onAction("stop")}
          >
            {action === "stop" ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function MariaDbConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed)
    ? installed.find((item) => item.status === "running") || installed[0]
    : installed;
  const [tab, setTab] = React.useState("runtime");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [values, setValues] = React.useState(defaults);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [logs, setLogs] = React.useState(null);
  const {
    status: runtimeStatus,
    action,
    setAction,
  } = useServiceSocketStatus("mariadb", current?.status);
  const loadConfig = React.useCallback(
    () =>
      apiRequest("/api/v1/services/mariadb/configuration")
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
      apiRequest("/api/v1/services/mariadb/logs?page_size=50")
        .then((response) => (response.ok ? response.json() : null))
        .then(setLogs)
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 2000);
    return () => window.clearInterval(timer);
  }, [tab]);
  const setValue = (key, value) =>
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
  const save = async (content = buildConfig(values, text)) => {
    setBusy(true);
    const response = await apiRequest(
      "/api/v1/services/mariadb/configuration",
      { method: "PUT", body: JSON.stringify({ content }) },
    );
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    setMessage(
      response.ok
        ? "MariaDB configuration saved. Restart the service to apply runtime changes."
        : body.message,
    );
    if (response.ok) setText(content);
    setBusy(false);
  };
  const serviceAction = async (actionName) => {
    setAction(actionName);
    setMessage("");
    const response = await apiRequest("/api/v1/services/mariadb/action", {
      method: "POST",
      body: JSON.stringify({ action: actionName }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    if (!response.ok || !body.job_id) {
      setMessage(body.message || "MariaDB action failed.");
      setAction("");
      return;
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section
        className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mariadb-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="mariadb-title"
              className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
            >
              MariaDB
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <span
                className={`h-2 w-2 rounded-full ${current?.status === "running" ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {current?.status || "stopped"}
              {current?.version && ` · v${current.version}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close MariaDB configuration"
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
            <Settings
              values={values}
              setValue={setValue}
              save={save}
              busy={busy}
            />
          )}
          {tab === "performance" && (
            <Performance
              values={values}
              setValue={setValue}
              save={save}
              busy={busy}
            />
          )}
          {tab === "security" && (
            <Security
              values={values}
              setValue={setValue}
              save={save}
              busy={busy}
            />
          )}
          {tab === "replication" && (
            <Replication
              values={values}
              setValue={setValue}
              save={save}
              busy={busy}
            />
          )}
          {tab === "runtime" && (
            <Runtime
              current={current}
              runtimeStatus={runtimeStatus}
              action={action}
              onAction={serviceAction}
              configPath={
                config?.config_path ||
                "/opt/server-engine/services/mariadb/conf/my.cnf"
              }
            />
          )}
          {tab === "logs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    MariaDB error log
                  </h3>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {logs?.path || "Loading…"}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
                  onClick={() =>
                    apiRequest("/api/v1/services/mariadb/logs?page_size=50")
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
                  MariaDB my.cnf
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Edit advanced MariaDB options directly. Guided settings remain
                  available in the other tabs.
                </p>
                <code className="mt-2 block break-all text-xs text-neutral-500 dark:text-neutral-400">
                  {config?.config_path ||
                    "/opt/server-engine/services/mariadb/conf/my.cnf"}
                </code>
              </div>
              <ConfigEditor path="my.cnf" value={text} onChange={setText} />
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
                  onClick={() => save()}
                >
                  {busy ? "Saving…" : "Save my.cnf"}
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
