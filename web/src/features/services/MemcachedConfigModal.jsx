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
import StartupPolicyToggle from "./StartupPolicyToggle";
import useServiceSocketStatus from "../../hooks/useServiceSocketStatus";

const tabs = [
  ["settings", "Server settings", Database],
  ["memory", "Memory & threads", Gauge],
  ["security", "Security", ShieldCheck],
  ["network", "Network", Network],
  ["runtime", "Runtime", Activity],
  ["logs", "Log", RefreshCw],
  ["configuration", "memcached.conf", FileCog],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  bind: "127.0.0.1",
  port: 11211,
  memory: 256,
  connections: 1024,
  threads: 4,
  udp: false,
  sasl: false,
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

function read(text, flag, fallback) {
  const match = text.match(new RegExp(`^${flag}\\s+(.+)$`, "mi"));
  return match?.[1]?.trim() || fallback;
}

function parseConfig(text) {
  return {
    memory: Number(read(text, "-m", defaults.memory)),
    port: Number(read(text, "-p", defaults.port)),
    bind: read(text, "-l", defaults.bind),
    connections: Number(read(text, "-c", defaults.connections)),
    threads: Number(read(text, "-t", defaults.threads)),
    udp: Number(read(text, "-U", "0")) > 0,
    sasl: text.split(/\s+/).includes("-S"),
  };
}

function buildConfig(values) {
  return `# Server Engine Memcached command-line configuration\n-m ${values.memory}\n-p ${values.port}\n-l ${values.bind}\n-c ${values.connections}\n-t ${values.threads}\n-U ${values.udp ? values.port : 0}\n${values.sasl ? "-S\n" : ""}-o modern\n`;
}

function Settings({ values, setValue, save, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Memcached server settings
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Configure the cache listener. Memcached stores volatile application
          data and does not persist it as a database.
        </p>
      </div>
      <div className="space-y-4">
        <Field
          label="Listen address"
          hint="Keep this on loopback unless trusted application servers need access."
        >
          <input
            className={inputClass}
            value={values.bind}
            onChange={(event) => setValue("bind", event.target.value)}
          />
        </Field>
        <Field label="Memcached port">
          <input
            className={inputClass}
            type="number"
            min="1"
            max="65535"
            value={values.port}
            onChange={(event) => setValue("port", Number(event.target.value))}
          />
        </Field>
      </div>
      <SaveButton busy={busy} onClick={save}>
        Save server settings
      </SaveButton>
    </div>
  );
}

function Memory({ values, setValue, save, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Memory and threads
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Set the item-storage memory pool and worker capacity for web traffic.
        </p>
      </div>
      <div className="space-y-4">
        <Field
          label="Item memory (MB)"
          hint="Memcached may use additional memory for connections, metadata, and allocator overhead."
        >
          <input
            className={inputClass}
            type="number"
            min="1"
            value={values.memory}
            onChange={(event) => setValue("memory", Number(event.target.value))}
          />
        </Field>
        <Field label="Worker threads">
          <input
            className={inputClass}
            type="number"
            min="1"
            max="128"
            value={values.threads}
            onChange={(event) =>
              setValue("threads", Number(event.target.value))
            }
          />
        </Field>
        <Field label="Maximum connections">
          <input
            className={inputClass}
            type="number"
            min="16"
            value={values.connections}
            onChange={(event) =>
              setValue("connections", Number(event.target.value))
            }
          />
        </Field>
      </div>
      <SaveButton busy={busy} onClick={save}>
        Save memory settings
      </SaveButton>
    </div>
  );
}

function Security({ values, setValue, save, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Memcached security
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Memcached has a small security model. Keep it private with firewall
          rules and a loopback bind by default.
        </p>
      </div>
      <div className="space-y-4">
        <Toggle
          label="SASL authentication"
          description="Enable the binary protocol and require client authentication. The server must have SASL support and credentials configured separately."
          checked={values.sasl}
          onChange={(value) => setValue("sasl", value)}
        />
        <div className="rounded-md bg-neutral-50 p-3 text-xs leading-5 text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
          SASL authenticates clients but does not encrypt traffic. Do not expose
          Memcached directly to the public internet.
        </div>
      </div>
      <SaveButton busy={busy} onClick={save}>
        Save security
      </SaveButton>
    </div>
  );
}

function NetworkSettings({ values, setValue, save, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Network protocol
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          UDP is disabled by default to reduce reflection and amplification
          exposure.
        </p>
      </div>
      <Toggle
        label="Enable UDP listener"
        description="Only enable this for clients that explicitly require the UDP protocol."
        checked={values.udp}
        onChange={(value) => setValue("udp", value)}
      />
      <Field label="TCP listen port">
        <input
          className={inputClass}
          type="number"
          min="1"
          max="65535"
          value={values.port}
          onChange={(event) => setValue("port", Number(event.target.value))}
        />
      </Field>
      <SaveButton busy={busy} onClick={save}>
        Save network settings
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
          Memcached runtime
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Control the isolated cache process and inspect its managed paths.
        </p>
        <StartupPolicyToggle serviceId="memcached" />
      </div>
      <div>
        <Row label="Status" value={runtimeStatus || current?.status || "unknown"} />
        <Row
          label="Version"
          value={current?.version ? `v${current.version}` : "—"}
        />
        <Row label="Configuration" value={configPath} />
        <Row label="Port" value="11211" />
        <Row label="Persistence" value="Not available by design" />
        <Row label="Replication" value="Client-managed" />
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

export default function MemcachedConfigModal({ installed, onClose }) {
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
  const { status: runtimeStatus, action, setAction } = useServiceSocketStatus("memcached", current?.status);
  const loadConfig = React.useCallback(
    () =>
      apiRequest("/api/v1/services/memcached/configuration")
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
      apiRequest("/api/v1/services/memcached/logs?page_size=50")
        .then((response) => (response.ok ? response.json() : null))
        .then(setLogs)
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 2000);
    return () => window.clearInterval(timer);
  }, [tab]);
  const setValue = (key, value) =>
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
  const save = async (content = buildConfig(values)) => {
    setBusy(true);
    const response = await apiRequest(
      "/api/v1/services/memcached/configuration",
      { method: "PUT", body: JSON.stringify({ content }) },
    );
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    setMessage(
      response.ok
        ? "Memcached configuration saved. Restart the service to apply runtime changes."
        : body.message,
    );
    if (response.ok) setText(content);
    setBusy(false);
  };
  const serviceAction = async (actionName) => {
    setAction(actionName);
    setMessage("");
    const response = await apiRequest("/api/v1/services/memcached/action", {
      method: "POST",
      body: JSON.stringify({ action: actionName }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    if (!response.ok || !body.job_id) {
      setMessage(body.message || "Memcached action failed.");
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
        aria-labelledby="memcached-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="memcached-title"
              className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Memcached
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
            aria-label="Close Memcached configuration"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
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
          {tab === "memory" && (
            <Memory
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
          {tab === "network" && (
            <NetworkSettings
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
                "/opt/server-engine/services/memcached/conf/memcached.conf"
              }
            />
          )}
          {tab === "logs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    Memcached log
                  </h3>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {logs?.path || "Loading…"}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
                  onClick={() =>
                    apiRequest("/api/v1/services/memcached/logs?page_size=50")
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
                  Memcached configuration
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Edit the command-line style configuration directly. Guided
                  controls remain available in the other tabs.
                </p>
                <code className="mt-2 block break-all text-xs text-neutral-500 dark:text-neutral-400">
                  {config?.config_path ||
                    "/opt/server-engine/services/memcached/conf/memcached.conf"}
                </code>
              </div>
              <ConfigEditor
                path="memcached.conf"
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
                  {busy ? "Saving…" : "Save memcached.conf"}
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
