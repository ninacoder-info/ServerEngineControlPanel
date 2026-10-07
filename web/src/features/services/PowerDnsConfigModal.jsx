import React from "react";
import {
  Activity,
  FileCog,
  Globe2,
  KeyRound,
  ListRestart,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";
import StartupPolicyToggle from "./StartupPolicyToggle";
import useServiceSocketStatus from "../../hooks/useServiceSocketStatus";
import { showToast } from "../../components/Toast";

const tabs = [
  ["runtime", "Runtime", Activity],
  ["settings", "DNS settings", Globe2],
  ["api", "API access", KeyRound],
  ["dnssec", "DNSSEC", ShieldCheck],
  ["logs", "Logs", RefreshCw],
  ["configuration", "Configuration", FileCog],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

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

const defaults = {
  address: "0.0.0.0",
  port: 53,
  defaultTtl: 3600,
  primary: "ns1.example.com.",
  hostmaster: "hostmaster.example.com.",
  apiEnabled: true,
  apiAddress: "127.0.0.1",
  apiPort: 8081,
  apiAllowFrom: "127.0.0.1,::1",
  apiKey: "",
  dnssec: true,
  algorithm: "ed25519",
  queryLogging: false,
  logLevel: "4",
};

function readDirective(text, key, fallback) {
  return (
    text.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "mi"))?.[1]?.trim() ||
    fallback
  );
}

function buildConfig(values, text) {
  const entries = {
    "local-address": values.address,
    "local-port": values.port,
    "default-ttl": values.defaultTtl,
    api: values.apiEnabled ? "yes" : "no",
    webserver: values.apiEnabled ? "yes" : "no",
    "webserver-address": values.apiAddress,
    "webserver-port": values.apiPort,
    "webserver-allow-from": values.apiAllowFrom,
    "api-key": values.apiKey,
    "log-dns-queries": values.queryLogging ? "yes" : "no",
    loglevel: values.logLevel,
  };
  let next = (text || "# Server Engine PowerDNS configuration\n").replace(
    /^\s*(?:default-soa-(?:name|mail)|default-(?:zsk|ksk)-algorithm)\s*=.*(?:\n|$)/gim,
    "",
  );
  Object.entries(entries).forEach(([key, value]) => {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}\\s*=.*$`, "mi");
    next = pattern.test(next)
      ? next.replace(pattern, line)
      : `${next.trimEnd()}\n${line}\n`;
  });
  return next;
}

function parseConfig(text) {
  return {
    address: readDirective(text, "local-address", defaults.address),
    port: Number(readDirective(text, "local-port", defaults.port)),
    defaultTtl: Number(readDirective(text, "default-ttl", defaults.defaultTtl)),
    primary: readDirective(text, "default-soa-name", defaults.primary),
    hostmaster: readDirective(text, "default-soa-mail", defaults.hostmaster),
    apiEnabled: readDirective(text, "api", "yes") === "yes",
    apiAddress: readDirective(text, "webserver-address", defaults.apiAddress),
    apiPort: Number(readDirective(text, "webserver-port", defaults.apiPort)),
    apiAllowFrom: readDirective(
      text,
      "webserver-allow-from",
      defaults.apiAllowFrom,
    ),
    apiKey: readDirective(text, "api-key", defaults.apiKey),
    dnssec: Boolean(readDirective(text, "default-zsk-algorithm", "")),
    algorithm: readDirective(text, "default-zsk-algorithm", defaults.algorithm),
    queryLogging: readDirective(text, "log-dns-queries", "no") === "yes",
    logLevel: readDirective(text, "loglevel", defaults.logLevel),
  };
}

function Settings({ values, setValue, onSave, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Authoritative DNS settings
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Choose where PowerDNS listens and the defaults used when new zones are
          created.
        </p>
      </div>
      <div className="space-y-4">
        <Field
          label="DNS listen address"
          hint="Use 0.0.0.0 to answer on all server interfaces."
        >
          <input
            className={inputClass}
            value={values.address}
            onChange={(event) => setValue("address", event.target.value)}
          />
        </Field>
        <Field
          label="DNS port"
          hint="UDP and TCP use the same authoritative DNS port."
        >
          <input
            className={inputClass}
            type="number"
            min="1"
            max="65535"
            value={values.port}
            onChange={(event) => setValue("port", Number(event.target.value))}
          />
        </Field>
        <Field label="Default record TTL">
          <input
            className={inputClass}
            type="number"
            min="30"
            value={values.defaultTtl}
            onChange={(event) =>
              setValue("defaultTtl", Number(event.target.value))
            }
          />
        </Field>
        <Field
          label="Primary nameserver for new zones"
          hint="Enter a fully qualified name ending with a dot."
        >
          <input
            className={inputClass}
            value={values.primary}
            onChange={(event) => setValue("primary", event.target.value)}
          />
        </Field>
        <Field
          label="SOA contact for new zones"
          hint="Use DNS format, for example hostmaster.example.com. for hostmaster@example.com."
        >
          <input
            className={inputClass}
            value={values.hostmaster}
            onChange={(event) => setValue("hostmaster", event.target.value)}
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
          disabled={busy}
          onClick={onSave}
        >
          {busy ? "Saving…" : "Save DNS settings"}
        </button>
      </div>
    </div>
  );
}

function Api({ values, setValue, onSave, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          PowerDNS HTTP API
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          The API is used by Server Engine to manage zones, records, and DNSSEC.
          Keep it private unless a trusted integration needs access.
        </p>
      </div>
      <Toggle
        label="Enable the HTTP API"
        description="Required for panel-managed DNS zones and records."
        checked={values.apiEnabled}
        onChange={(value) => setValue("apiEnabled", value)}
      />
      <div className="space-y-4">
        <Field label="API listen address">
          <input
            className={inputClass}
            value={values.apiAddress}
            onChange={(event) => setValue("apiAddress", event.target.value)}
          />
        </Field>
        <Field label="API port">
          <input
            className={inputClass}
            type="number"
            min="1"
            max="65535"
            value={values.apiPort}
            onChange={(event) =>
              setValue("apiPort", Number(event.target.value))
            }
          />
        </Field>
        <Field
          label="Allowed API networks"
          hint="Comma-separated IP addresses or CIDR ranges."
        >
          <input
            className={inputClass}
            value={values.apiAllowFrom}
            onChange={(event) => setValue("apiAllowFrom", event.target.value)}
          />
        </Field>
        <Field
          label="API key"
          hint="Leave unchanged to keep the existing key. The value is stored in the service configuration."
        >
          <input
            className={inputClass}
            type="password"
            value={values.apiKey}
            onChange={(event) => setValue("apiKey", event.target.value)}
            placeholder="Enter a new API key"
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
          disabled={busy}
          onClick={onSave}
        >
          {busy ? "Saving…" : "Save API access"}
        </button>
      </div>
    </div>
  );
}

function Dnssec({ values, setValue, onSave, busy }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          DNSSEC defaults
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Set the signing defaults for zones that enable DNSSEC. Existing zones
          keep their own key metadata.
        </p>
      </div>
      <Toggle
        label="Enable DNSSEC defaults"
        description="Use the selected algorithm when Server Engine secures a new zone."
        checked={values.dnssec}
        onChange={(value) => setValue("dnssec", value)}
      />
      <Field label="Zone signing algorithm">
        <select
          className={inputClass}
          value={values.algorithm}
          onChange={(event) => setValue("algorithm", event.target.value)}
        >
          <option value="ed25519">Ed25519</option>
          <option value="ecdsa256">ECDSA P-256</option>
          <option value="ecdsa384">ECDSA P-384</option>
          <option value="rsasha256">RSA SHA-256</option>
          <option value="rsasha512">RSA SHA-512</option>
        </select>
      </Field>
      <div className="rounded-md bg-neutral-50 p-3 text-xs leading-5 text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
        PowerDNS supports multiple DNSSEC algorithms depending on how the server
        was built. The panel will validate availability before signing a zone.
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
          disabled={busy}
          onClick={onSave}
        >
          {busy ? "Saving…" : "Save DNSSEC defaults"}
        </button>
      </div>
    </div>
  );
}

function Runtime({ current, runtimeStatus, action, onAction, configPath }) {
  const running = runtimeStatus === "running";
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          PowerDNS runtime
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Control the authoritative server process and review the managed paths.
        </p>
        <StartupPolicyToggle serviceId="powerdns" />
      </div>
      <div className="space-y-0">
        <Row label="Status" value={runtimeStatus || current?.status || "unknown"} />
        <Row
          label="Version"
          value={current?.version ? `v${current.version}` : "—"}
        />
        <Row label="Configuration" value={configPath} />
        <Row label="DNS service" value="UDP/TCP 53" />
        <Row label="API service" value="TCP 8081" />
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

export default function PowerDnsConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed) ? installed[0] : installed;
  const [tab, setTab] = React.useState("runtime");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [values, setValues] = React.useState(defaults);
  const [busy, setBusy] = React.useState(false);
  const [logs, setLogs] = React.useState(null);
  const { status: runtimeStatus, action, setAction } = useServiceSocketStatus("powerdns", current?.status);

  const loadConfig = React.useCallback(() => {
    apiRequest("/api/v1/services/powerdns/configuration")
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
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);
  React.useEffect(() => {
    if (tab !== "logs") return undefined;
    apiRequest("/api/v1/services/powerdns/logs?page_size=50")
      .then((response) => (response.ok ? response.json() : null))
      .then(setLogs)
      .catch(() => {});
    return undefined;
  }, [tab]);

  const setValue = (key, value) =>
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
  const save = async (content = buildConfig(values, text)) => {
    setBusy(true);
    const response = await apiRequest(
      "/api/v1/services/powerdns/configuration",
      { method: "PUT", body: JSON.stringify({ content }) },
    );
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    showToast(
      response.ok
        ? "PowerDNS configuration saved. Restart the service to apply runtime changes."
        : body.message,
      response.ok ? "success" : "error",
    );
    if (response.ok) {
      setText(content);
      setConfig((currentConfig) => ({ ...currentConfig, ...body }));
    }
    setBusy(false);
  };
  const saveValues = () => save(buildConfig(values, text));
  const serviceAction = async (actionName) => {
    setAction(actionName);
    const response = await apiRequest("/api/v1/services/powerdns/action", {
      method: "POST",
      body: JSON.stringify({ action: actionName }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    if (!response.ok || !body.job_id) {
      showToast(body.message || "PowerDNS action failed.", "error");
      setAction("");
      return;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="powerdns-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="powerdns-title"
              className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
            >
              PowerDNS Authoritative
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <span
                className={`h-2 w-2 rounded-full ${runtimeStatus === "running" ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {runtimeStatus || current?.status || "stopped"}
              {current?.version && ` · v${current.version}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close PowerDNS configuration"
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
              onSave={saveValues}
              busy={busy}
            />
          )}
          {tab === "api" && (
            <Api
              values={values}
              setValue={setValue}
              onSave={saveValues}
              busy={busy}
            />
          )}
          {tab === "dnssec" && (
            <Dnssec
              values={values}
              setValue={setValue}
              onSave={saveValues}
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
                "/opt/server-engine/services/powerdns/conf/service.conf"
              }
            />
          )}
          {tab === "logs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    PowerDNS logs
                  </h3>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {logs?.path || "Loading…"}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
                  onClick={() => {
                    setLogs(null);
                    apiRequest("/api/v1/services/powerdns/logs?page_size=50")
                      .then((response) =>
                        response.ok ? response.json() : null,
                      )
                      .then(setLogs);
                  }}
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
                  PowerDNS configuration
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Edit advanced directives when the guided settings do not cover
                  your deployment.
                </p>
                <code className="mt-2 block break-all text-xs text-neutral-500 dark:text-neutral-400">
                  {config?.config_path ||
                    "/opt/server-engine/services/powerdns/conf/service.conf"}
                </code>
              </div>
              <ConfigEditor path="pdns.conf" value={text} onChange={setText} />
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
                  {busy ? "Saving…" : "Save configuration"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
