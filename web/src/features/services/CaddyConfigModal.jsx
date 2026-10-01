import React from "react";
import {
  Activity,
  FileCog,
  Gauge,
  Globe2,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";
import StartupPolicyToggle from "./StartupPolicyToggle";
import InstallServiceModal from "./InstallServiceModal";

const tabs = [
  ["sites", "Sites", Globe2],
  ["versions", "Versions", PackageOpen],
  ["https", "Automatic HTTPS", ShieldCheck],
  ["proxy", "Reverse proxy", Activity],
  ["performance", "Performance", Gauge],
  ["runtime", "Runtime", TerminalSquare],
  ["logs", "Logs", RefreshCw],
  ["configuration", "Caddyfile", FileCog],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  email: "admin@example.com",
  autoHttps: true,
  httpPort: 80,
  httpsPort: 443,
  compression: "zstd gzip",
  cache: false,
  healthUri: "/health",
  healthInterval: "30s",
};

function Field({ label, children, hint }) {
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
        <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </span>
      </span>
    </label>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-200 py-3 last:border-b-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <code className="break-all text-xs text-slate-700 dark:text-slate-300 sm:text-right">
        {value}
      </code>
    </div>
  );
}

function read(text, key, fallback) {
  const match = text.match(new RegExp(`^\\s*${key}\\s+(.+)$`, "mi"));
  return match?.[1]?.trim() || fallback;
}

function parseConfig(text) {
  const global = text.match(/email\s+([^\n]+)/i)?.[1]?.trim();
  const ports = [...text.matchAll(/:\s*(\d+)\s*\{/g)].map((match) =>
    Number(match[1]),
  );
  return {
    email: global || defaults.email,
    autoHttps: !text.includes("auto_https off"),
    httpPort: ports.includes(80) ? 80 : ports[0] || defaults.httpPort,
    httpsPort: ports.includes(443) ? 443 : defaults.httpsPort,
    compression: read(text, "encode", defaults.compression),
    cache: text.includes("cache"),
    healthUri:
      text.match(/health_uri\s+([^\n]+)/i)?.[1]?.trim() || defaults.healthUri,
    healthInterval:
      text.match(/health_interval\s+([^\n]+)/i)?.[1]?.trim() ||
      defaults.healthInterval,
  };
}

function buildConfig(values, root = "/opt/server-engine/services/caddy") {
  return `# Server Engine Caddy baseline
{
    email ${values.email}
    ${values.autoHttps ? "" : "auto_https off"}
    admin 127.0.0.1:2019
    storage file-system ${root}/data
}

:${values.httpPort} {
    root * ${root}/www
    encode ${values.compression}
    file_server
    log {
        output file ${root}/logs/access.log
        format json
    }
}
`;
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

export default function CaddyConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed)
    ? installed.find((item) => item.status === "running") || installed[0]
    : installed;
  const [tab, setTab] = React.useState("sites");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [values, setValues] = React.useState(defaults);
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [logs, setLogs] = React.useState(null);
  const [caddyVersions, setCaddyVersions] = React.useState([]);
  const [activeCaddyVersion, setActiveCaddyVersion] = React.useState("");
  const [showInstaller, setShowInstaller] = React.useState(false);
  const loadCaddyVersions = React.useCallback(() => {
    apiRequest("/api/v1/services/caddy/versions")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        setCaddyVersions(value?.versions || []);
        setActiveCaddyVersion(value?.active_version || "");
      })
      .catch(() => {});
  }, []);
  const loadConfig = React.useCallback(
    () =>
      apiRequest("/api/v1/services/caddy/configuration")
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
    if (tab === "versions") loadCaddyVersions();
  }, [tab, loadCaddyVersions]);
  async function makeDefault(version) {
    const response = await apiRequest("/api/v1/services/caddy/default", {
      method: "PUT",
      body: JSON.stringify({ version }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    setMessage(body.message || "Unable to change the Caddy default version.");
    if (response.ok) loadCaddyVersions();
  }
  React.useEffect(() => {
    if (tab !== "logs") return undefined;
    const load = () =>
      apiRequest("/api/v1/services/caddy/logs?page_size=50")
        .then((response) => (response.ok ? response.json() : null))
        .then(setLogs)
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [tab]);
  const setValue = (key, value) =>
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
  const save = async (content = buildConfig(values)) => {
    setBusy(true);
    const response = await apiRequest("/api/v1/services/caddy/configuration", {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    setMessage(
      response.ok
        ? "Caddy configuration saved. Restart Caddy to apply it."
        : body.message,
    );
    if (response.ok) setText(content);
    setBusy(false);
  };
  const serviceAction = async (actionName) => {
    setAction(actionName);
    const response = await apiRequest("/api/v1/services/caddy/action", {
      method: "POST",
      body: JSON.stringify({ action: actionName }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    if (!response.ok || !body.job_id) {
      setMessage(body.message || "Caddy action failed.");
      setAction("");
      return;
    }
    let finalJob;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
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
    setMessage(finalJob?.message || `Caddy ${actionName} request finished.`);
    setAction("");
  };
  const running = current?.status === "running";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <section
        className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="caddy-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="caddy-title"
              className="text-xl font-semibold text-slate-900 dark:text-slate-100"
            >
              Caddy
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span
                className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {current?.status || "stopped"}
              {current?.version && ` · v${current.version}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Caddy configuration"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 flex gap-5 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800">
          {tabs.map(([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        <div className="pt-5">
          {tab === "versions" && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Caddy versions
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Install a prebuilt Caddy binary or build one with the Application Shield adapter. Only the selected default runs.
                  </p>
                </div>
                <button
                  type="button"
                  className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
                  onClick={() => setShowInstaller(true)}
                >
                  <PackageOpen size={15} />
                  Install version
                </button>
              </div>
              <div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {caddyVersions.length ? caddyVersions.map((item) => (
                  <div key={`${item.version}-${item.path}`} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900 dark:text-slate-100">Caddy {item.version}</p>
                        {item.active && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Default</span>}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.install_method === "source" ? "Build from source" : "Prebuilt package"}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{item.path}</p>
                    </div>
                    {!item.active && (
                      <button type="button" className="shrink-0 cursor-pointer text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={() => makeDefault(item.version)}>
                        Make default
                      </button>
                    )}
                  </div>
                )) : (
                  <p className="py-6 text-sm text-slate-500 dark:text-slate-400">No managed Caddy versions are available yet.</p>
                )}
              </div>
            </div>
          )}
          {tab === "sites" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Caddy sites
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Caddy serves static sites and reverse proxies from site
                  blocks. Website-specific domains and upstreams are managed
                  from the website configuration.
                </p>
              </div>
              <Row label="Default site" value={`:${values.httpPort}`} />
              <Row
                label="Document root"
                value="/opt/server-engine/services/caddy/www"
              />
              <Row
                label="Site configuration"
                value={
                  config?.config_path ||
                  "/opt/server-engine/services/caddy/conf/Caddyfile"
                }
              />
              <SaveButton busy={busy} onClick={() => save()}>
                Save site defaults
              </SaveButton>
            </div>
          )}
          {tab === "https" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Automatic HTTPS
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Caddy can obtain and renew certificates automatically when a
                  real domain points to the server and ports 80/443 are
                  reachable.
                </p>
              </div>
              <Toggle
                label="Enable automatic HTTPS"
                description="Manage certificates and HTTP-to-HTTPS redirects for domain site addresses."
                checked={values.autoHttps}
                onChange={(value) => setValue("autoHttps", value)}
              />
              <Field
                label="ACME account email"
                hint="Used for certificate authority notices."
              >
                <input
                  className={inputClass}
                  type="email"
                  value={values.email}
                  onChange={(event) => setValue("email", event.target.value)}
                />
              </Field>
              <div className="rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                Use the Certbot service instead when a website requires DNS-01
                plugins or provider-specific certificate workflows.
              </div>
              <SaveButton busy={busy} onClick={() => save()}>
                Save HTTPS settings
              </SaveButton>
            </div>
          )}
          {tab === "proxy" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Reverse proxy defaults
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Caddy reverse proxy supports load balancing, retries, active
                  health checks, and upstream transport settings.
                </p>
              </div>
              <Field label="Health check path">
                <input
                  className={inputClass}
                  value={values.healthUri}
                  onChange={(event) =>
                    setValue("healthUri", event.target.value)
                  }
                />
              </Field>
              <Field label="Health check interval">
                <input
                  className={inputClass}
                  value={values.healthInterval}
                  onChange={(event) =>
                    setValue("healthInterval", event.target.value)
                  }
                />
              </Field>
              <div className="rounded-md border border-slate-200 p-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:text-slate-300">
                Add upstream addresses and load-balancing policy from the
                website’s reverse-proxy settings. These defaults do not send
                traffic anywhere by themselves.
              </div>
              <SaveButton busy={busy} onClick={() => save()}>
                Save proxy defaults
              </SaveButton>
            </div>
          )}
          {tab === "performance" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Performance
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Use Caddy’s native response encoding and keep site handlers
                  simple for reliable deployments.
                </p>
              </div>
              <Field label="Response encodings">
                <select
                  className={inputClass}
                  value={values.compression}
                  onChange={(event) =>
                    setValue("compression", event.target.value)
                  }
                >
                  <option value="zstd gzip">Zstandard and Gzip</option>
                  <option value="gzip">Gzip</option>
                  <option value="">Disabled</option>
                </select>
              </Field>
              <Toggle
                label="Enable response compression"
                description="Compress supported text responses according to the client’s Accept-Encoding header."
                checked={Boolean(values.compression)}
                onChange={(value) =>
                  setValue("compression", value ? "zstd gzip" : "")
                }
              />
              <Toggle
                label="Application cache placeholder"
                description="Caddy does not cache application responses by default; configure caching at the website or application layer."
                checked={values.cache}
                onChange={(value) => setValue("cache", value)}
              />
              <SaveButton busy={busy} onClick={() => save()}>
                Save performance
              </SaveButton>
            </div>
          )}
          {tab === "runtime" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Caddy runtime
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Control Caddy’s isolated process and inspect its managed data
                  and certificate storage.
                </p>
                <StartupPolicyToggle serviceId="caddy" />
              </div>
              <div>
                <Row label="Status" value={current?.status || "unknown"} />
                <Row
                  label="Version"
                  value={current?.version ? `v${current.version}` : "—"}
                />
                <Row
                  label="Configuration"
                  value={
                    config?.config_path ||
                    "/opt/server-engine/services/caddy/conf/Caddyfile"
                  }
                />
                <Row
                  label="Data and certificates"
                  value="/opt/server-engine/services/caddy/data"
                />
                <Row
                  label="Access log"
                  value="/opt/server-engine/services/caddy/logs/access.log"
                />
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
                    className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`}
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
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Caddy logs
                  </h3>
                  <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
                    {logs?.path || "Loading…"}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`}
                  onClick={() =>
                    apiRequest("/api/v1/services/caddy/logs?page_size=50")
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
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-300">
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
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Caddyfile
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Edit Caddy’s native configuration directly. Website-specific
                  site blocks can be managed separately later.
                </p>
                <code className="mt-2 block break-all text-xs text-slate-500 dark:text-slate-400">
                  {config?.config_path ||
                    "/opt/server-engine/services/caddy/conf/Caddyfile"}
                </code>
              </div>
              <ConfigEditor path="Caddyfile" value={text} onChange={setText} />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`}
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
                  {busy ? "Saving…" : "Save Caddyfile"}
                </button>
              </div>
            </div>
          )}
        </div>
        {message && (
          <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">
            {message}
          </p>
        )}
      </section>
      {showInstaller && (
        <InstallServiceModal
          service={service || { id: "caddy", name: "Caddy", install_methods: ["prebuilt", "source"] }}
          onClose={() => {
            setShowInstaller(false);
            loadCaddyVersions();
          }}
        />
      )}
    </div>
  );
}
