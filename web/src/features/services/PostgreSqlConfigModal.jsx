import React from "react";
import {
  Activity,
  Database,
  FileCog,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import Toast from "../../components/Toast";
import ConfigEditor from "./ConfigEditor";
import StartupPolicyToggle from "./StartupPolicyToggle";

const tabs = [
  ["runtime", "Runtime", Activity],
  ["settings", "Server settings", Database],
  ["performance", "Performance", Gauge],
  ["security", "Security", ShieldCheck],
  ["replication", "WAL & replication", Workflow],
  ["logs", "Error log", RefreshCw],
  ["configuration", "postgresql.conf", FileCog],
  ["hba", "pg_hba.conf", ShieldCheck],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  listen: "127.0.0.1",
  port: 5432,
  dataDirectory: "/opt/server-engine/services/postgresql/data",
  maxConnections: 100,
  sharedBuffers: "256MB",
  workMem: "8MB",
  maintenanceWorkMem: "64MB",
  effectiveCacheSize: "768MB",
  passwordEncryption: "scram-sha-256",
  ssl: false,
  loggingCollector: true,
  walLevel: "replica",
  maxWalSenders: 10,
  maxReplicationSlots: 4,
  archiveMode: false,
  logMinDuration: -1,
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

function SaveButton({ busy, children, onClick }) {
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
    listen: read(text, "listen_addresses", defaults.listen).replaceAll("'", ""),
    port: Number(read(text, "port", defaults.port)),
    dataDirectory: read(
      text,
      "data_directory",
      defaults.dataDirectory,
    ).replaceAll("'", ""),
    maxConnections: Number(
      read(text, "max_connections", defaults.maxConnections),
    ),
    sharedBuffers: read(text, "shared_buffers", defaults.sharedBuffers),
    workMem: read(text, "work_mem", defaults.workMem),
    maintenanceWorkMem: read(
      text,
      "maintenance_work_mem",
      defaults.maintenanceWorkMem,
    ),
    effectiveCacheSize: read(
      text,
      "effective_cache_size",
      defaults.effectiveCacheSize,
    ),
    passwordEncryption: read(
      text,
      "password_encryption",
      defaults.passwordEncryption,
    ).replaceAll("'", ""),
    ssl: read(text, "ssl", "off").replaceAll("'", "") === "on",
    loggingCollector: read(text, "logging_collector", "on") === "on",
    walLevel: read(text, "wal_level", defaults.walLevel),
    maxWalSenders: Number(
      read(text, "max_wal_senders", defaults.maxWalSenders),
    ),
    maxReplicationSlots: Number(
      read(text, "max_replication_slots", defaults.maxReplicationSlots),
    ),
    archiveMode: read(text, "archive_mode", "off") === "on",
    logMinDuration: Number(
      read(text, "log_min_duration_statement", defaults.logMinDuration),
    ),
  };
}

function buildConfig(values, text) {
  const entries = {
    listen_addresses: `'${values.listen}'`,
    port: values.port,
    data_directory: `'${values.dataDirectory}'`,
    max_connections: values.maxConnections,
    shared_buffers: values.sharedBuffers,
    work_mem: values.workMem,
    maintenance_work_mem: values.maintenanceWorkMem,
    effective_cache_size: values.effectiveCacheSize,
    password_encryption: `'${values.passwordEncryption}'`,
    ssl: values.ssl ? "on" : "off",
    logging_collector: values.loggingCollector ? "on" : "off",
    wal_level: values.walLevel,
    max_wal_senders: values.maxWalSenders,
    max_replication_slots: values.maxReplicationSlots,
    archive_mode: values.archiveMode ? "on" : "off",
    log_min_duration_statement: values.logMinDuration,
  };
  let next = text || "# Server Engine PostgreSQL configuration\n";
  Object.entries(entries).forEach(([key, value]) => {
    const line = `${key} = ${value}`;
    const pattern = new RegExp(`^\\s*#?\\s*${key}\\s*=.*$`, "mi");
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
          PostgreSQL server settings
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Configure the listener, cluster directory, and connection ceiling for
          this PostgreSQL instance.
        </p>
      </div>
      <div className="space-y-4">
        <Field
          label="Listen addresses"
          hint="Keep this at 127.0.0.1 unless remote clients need access."
        >
          <input
            className={inputClass}
            value={values.listen}
            onChange={(event) => setValue("listen", event.target.value)}
          />
        </Field>
        <Field label="PostgreSQL port">
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
          hint="Higher values increase shared memory and process resource requirements."
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
      <SaveButton busy={busy} onClick={save}>
        Save server settings
      </SaveButton>
    </div>
  );
}

function Performance({ values, setValue, save, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          PostgreSQL performance
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Tune memory for web traffic, migrations, indexes, and maintenance
          jobs.
        </p>
      </div>
      <div className="space-y-4">
        <Field
          label="Shared buffers"
          hint="A common starting point is about 25% of RAM on a dedicated PostgreSQL server."
        >
          <input
            className={inputClass}
            value={values.sharedBuffers}
            onChange={(event) => setValue("sharedBuffers", event.target.value)}
          />
        </Field>
        <Field
          label="Work memory"
          hint="Applied per sort/hash operation, so total usage can exceed this value under concurrency."
        >
          <input
            className={inputClass}
            value={values.workMem}
            onChange={(event) => setValue("workMem", event.target.value)}
          />
        </Field>
        <Field label="Maintenance work memory">
          <input
            className={inputClass}
            value={values.maintenanceWorkMem}
            onChange={(event) =>
              setValue("maintenanceWorkMem", event.target.value)
            }
          />
        </Field>
        <Field
          label="Effective cache size"
          hint="Planner estimate of memory available to PostgreSQL and the operating system cache."
        >
          <input
            className={inputClass}
            value={values.effectiveCacheSize}
            onChange={(event) =>
              setValue("effectiveCacheSize", event.target.value)
            }
          />
        </Field>
      </div>
      <SaveButton busy={busy} onClick={save}>
        Save performance
      </SaveButton>
    </div>
  );
}

function Security({ values, setValue, save, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          PostgreSQL security
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Set secure password storage and transport defaults. Detailed client
          rules live in `pg_hba.conf`.
        </p>
      </div>
      <div className="space-y-4">
        <Field label="Password encryption">
          <select
            className={inputClass}
            value={values.passwordEncryption}
            onChange={(event) =>
              setValue("passwordEncryption", event.target.value)
            }
          >
            <option value="scram-sha-256">SCRAM-SHA-256</option>
            <option value="md5">MD5 compatibility</option>
          </select>
        </Field>
        <Toggle
          label="Enable SSL"
          description="Enable encrypted TCP connections after certificates are configured in the service directory."
          checked={values.ssl}
          onChange={(value) => setValue("ssl", value)}
        />
      </div>
      <SaveButton busy={busy} onClick={save}>
        Save security
      </SaveButton>
    </div>
  );
}

function Replication({ values, setValue, save, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          WAL and replication
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Prepare this instance for point-in-time recovery, streaming replicas,
          or logical replication.
        </p>
      </div>
      <div className="space-y-4">
        <Field label="WAL level">
          <select
            className={inputClass}
            value={values.walLevel}
            onChange={(event) => setValue("walLevel", event.target.value)}
          >
            <option value="replica">Replica</option>
            <option value="logical">Logical</option>
            <option value="minimal">Minimal</option>
          </select>
        </Field>
        <Field label="Maximum WAL senders">
          <input
            className={inputClass}
            type="number"
            min="0"
            value={values.maxWalSenders}
            onChange={(event) =>
              setValue("maxWalSenders", Number(event.target.value))
            }
          />
        </Field>
        <Field label="Maximum replication slots">
          <input
            className={inputClass}
            type="number"
            min="0"
            value={values.maxReplicationSlots}
            onChange={(event) =>
              setValue("maxReplicationSlots", Number(event.target.value))
            }
          />
        </Field>
        <Toggle
          label="Enable WAL archiving"
          description="Enables archive mode; configure archive_command in postgresql.conf before relying on backups."
          checked={values.archiveMode}
          onChange={(value) => setValue("archiveMode", value)}
        />
      </div>
      <SaveButton busy={busy} onClick={save}>
        Save WAL settings
      </SaveButton>
    </div>
  );
}

function Runtime({ current, runtimeStatus, action, onAction, configPath }) {
  const running = runtimeStatus === "running";
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          PostgreSQL runtime
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Control the isolated PostgreSQL cluster and inspect its runtime paths.
        </p>
        <StartupPolicyToggle serviceId="postgresql" />
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
          value="/opt/server-engine/services/postgresql/data"
        />
        <Row
          label="Socket directory"
          value="/opt/server-engine/services/postgresql/run"
        />
        <Row label="Port" value="5432" />
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

export default function PostgreSqlConfigModal({ installed, onClose }) {
  const current = Array.isArray(installed)
    ? installed.find((item) => item.status === "running") || installed[0]
    : installed;
  const [runtimeStatus, setRuntimeStatus] = React.useState(
    current?.status || "stopped",
  );
  const [tab, setTab] = React.useState("runtime");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [hbaText, setHbaText] = React.useState("");
  const [values, setValues] = React.useState(defaults);
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [logs, setLogs] = React.useState(null);

  React.useEffect(() => {
    setRuntimeStatus(current?.status || "stopped");
  }, [current?.status]);

  React.useEffect(() => {
    const updateFromSocket = (event) => {
      const detail = event.detail || {};
      if (detail.serviceId !== "postgresql") return;

      if (detail.status === "running") {
        setAction(detail.action || "start");
        return;
      }
      if (!["succeeded", "failed", "cancelled"].includes(detail.status)) return;

      if (["failed", "cancelled"].includes(detail.status)) {
        setMessage(
          detail.job?.message ||
            `PostgreSQL ${detail.action || "service"} failed.`,
        );
        setAction("");
        return;
      }

      if (["start", "restart"].includes(detail.action)) {
        setRuntimeStatus("running");
      } else if (detail.action === "stop") {
        setRuntimeStatus("stopped");
      }
      setAction("");
    };

    window.addEventListener("serverengine:service-status", updateFromSocket);
    return () =>
      window.removeEventListener(
        "serverengine:service-status",
        updateFromSocket,
      );
  }, []);

  const loadConfig = React.useCallback(() => {
    Promise.all([
      apiRequest("/api/v1/services/postgresql/configuration"),
      apiRequest("/api/v1/services/postgresql/configuration?file=hba"),
    ])
      .then(async ([mainResponse, hbaResponse]) => {
        const main = mainResponse.ok ? await mainResponse.json() : null;
        const hba = hbaResponse.ok ? await hbaResponse.json() : null;
        if (main) {
          setConfig(main);
          setText(main.content || "");
          setValues((currentValues) => ({
            ...currentValues,
            ...parseConfig(main.content || ""),
          }));
        }
        if (hba) setHbaText(hba.content || "");
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);
  React.useEffect(() => {
    if (tab !== "logs") return undefined;
    const load = () =>
      apiRequest("/api/v1/services/postgresql/logs?page_size=50")
        .then((response) => (response.ok ? response.json() : null))
        .then(setLogs)
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 2000);
    return () => window.clearInterval(timer);
  }, [tab]);

  const setValue = (key, value) =>
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
  const save = async (
    content = buildConfig(values, text),
    file = undefined,
  ) => {
    setBusy(true);
    const query = file ? `?file=${file}` : "";
    const response = await apiRequest(
      `/api/v1/services/postgresql/configuration${query}`,
      { method: "PUT", body: JSON.stringify({ content }) },
    );
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    setMessage(
      response.ok
        ? "PostgreSQL configuration saved. Restart the service to apply runtime changes."
        : body.message,
    );
    if (response.ok && file === "hba") setHbaText(content);
    else if (response.ok) setText(content);
    setBusy(false);
  };
  const serviceAction = async (actionName) => {
    setAction(actionName);
    setMessage("");
    const response = await apiRequest("/api/v1/services/postgresql/action", {
      method: "POST",
      body: JSON.stringify({ action: actionName }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    if (!response.ok || !body.job_id) {
      setMessage(body.message || "PostgreSQL action failed.");
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
        aria-labelledby="postgresql-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="postgresql-title"
              className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
            >
              PostgreSQL
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <span
                className={`h-2 w-2 rounded-full ${runtimeStatus === "running" ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {runtimeStatus}
              {current?.version && ` · v${current.version}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close PostgreSQL configuration"
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
              save={() => save()}
              busy={busy}
            />
          )}
          {tab === "performance" && (
            <Performance
              values={values}
              setValue={setValue}
              save={() => save()}
              busy={busy}
            />
          )}
          {tab === "security" && (
            <Security
              values={values}
              setValue={setValue}
              save={() => save()}
              busy={busy}
            />
          )}
          {tab === "replication" && (
            <Replication
              values={values}
              setValue={setValue}
              save={() => save()}
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
                "/opt/server-engine/services/postgresql/conf/postgresql.conf"
              }
            />
          )}
          {tab === "logs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    PostgreSQL error log
                  </h3>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {logs?.path || "Loading…"}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
                  onClick={() =>
                    apiRequest("/api/v1/services/postgresql/logs?page_size=50")
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
                  PostgreSQL configuration
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Edit advanced PostgreSQL settings directly. Guided controls
                  remain available in the other tabs.
                </p>
                <code className="mt-2 block break-all text-xs text-neutral-500 dark:text-neutral-400">
                  {config?.config_path ||
                    "/opt/server-engine/services/postgresql/conf/postgresql.conf"}
                </code>
              </div>
              <ConfigEditor
                path="postgresql.conf"
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
                  onClick={() => save()}
                >
                  {busy ? "Saving…" : "Save postgresql.conf"}
                </button>
              </div>
            </div>
          )}
          {tab === "hba" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Client authentication
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Control which users can connect, from where, and with which
                  authentication method.
                </p>
                <code className="mt-2 block break-all text-xs text-neutral-500 dark:text-neutral-400">
                  /opt/server-engine/services/postgresql/conf/pg_hba.conf
                </code>
              </div>
              <ConfigEditor
                path="pg_hba.conf"
                value={hbaText}
                onChange={setHbaText}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
                  disabled={busy}
                  onClick={() => save(hbaText, "hba")}
                >
                  {busy ? "Saving…" : "Save pg_hba.conf"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      <Toast
        message={message}
        type={
          /failed|error|unable|exited|not become ready/i.test(message)
            ? "error"
            : "success"
        }
        onClose={() => setMessage("")}
      />
    </div>
  );
}
