import React from "react";
import {
  Activity,
  Code2,
  Gauge,
  Globe2,
  Layers3,
  PackageOpen,
  RefreshCw,
  ScrollText,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import Toast from "../../components/Toast";
import ConfigEditor from "./ConfigEditor";
import StartupPolicyToggle from "./StartupPolicyToggle";
import InstallServiceModal from "./InstallServiceModal";

const tabs = [
  ["settings", "Settings", Globe2],
  ["versions", "Versions", PackageOpen],
  ["performance", "Performance", Gauge],
  ["security", "Security", ShieldCheck],
  ["sites", "Sites", Layers3],
  ["configuration", "nginx.conf", Code2],
  ["runtime", "Runtime", Activity],
  ["error-log", "Error log", RefreshCw],
  ["response-log", "Response log", ScrollText],
];
const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold";

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
      {label}
      {children}
    </label>
  );
}
function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-neutral-200 py-3 last:border-b-0 dark:border-neutral-800">
      <span>
        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
      />
    </label>
  );
}
function Row({ label, value, hint }) {
  return (
    <div className="flex w-full items-start justify-between gap-4 border-b border-neutral-200 py-3 last:border-b-0 dark:border-neutral-800">
      <div>
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </p>
        {hint && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {hint}
          </p>
        )}
      </div>
      <strong className="text-right text-sm text-neutral-700 dark:text-neutral-300">
        {value}
      </strong>
    </div>
  );
}

function nginxDirective(content, directive, fallback) {
  const match = String(content || "").match(new RegExp(`^\\s*${directive}\\s+([^;#\\r\\n]+)`, "mi"));
  return match ? match[1].trim() : fallback;
}

function Settings({ config, busy, message, httpPort, onSave }) {
  const [values, setValues] = React.useState({
    listen: "80",
    root: "/server-engine/www",
    index: "index.php index.html index.htm",
    php: "Enabled",
    proxy: "Enabled",
  });
  const set = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }));
  React.useEffect(() => {
    setValues((current) => ({
      ...current,
      listen: String(config?.http_port || httpPort || current.listen),
      root: config?.web_root || current.root,
    }));
  }, [config?.http_port, config?.web_root, httpPort]);
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Nginx web server settings
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Configure the default web root, request routing, PHP-FPM handling, and
          static file behavior.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="HTTP port">
          <input
            className={inputClass}
            type="number"
            value={values.listen}
            onChange={(event) => set("listen", event.target.value)}
          />
        </Field>
        <Field label="Default website root">
          <p className="mt-1.5 rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">{values.root}</p>
        </Field>
        <Field label="Index files">
          <p className="mt-1.5 rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">Managed per website</p>
        </Field>
        <Field label="PHP-FPM routing">
          <p className="mt-1.5 rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">Managed per website</p>
        </Field>
        <Field label="Reverse proxy support">
          <p className="mt-1.5 rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">Managed per project</p>
        </Field>
      </div>
      <div className="border-t border-neutral-200 pt-2 dark:border-neutral-800">
        <Row
          label="Configuration file"
          value={
            config?.config_path ||
            "/opt/server-engine/services/nginx/conf/nginx.conf"
          }
        />
        <Row
          label="Virtual hosts"
          value="Managed per website"
          hint="Website configurations are kept under conf/sites/*.conf."
        />
        <Row label="Validation" value="Checked before save" />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
          disabled={busy}
          onClick={() => onSave(values)}
        >
          {busy ? "Saving…" : "Save Nginx settings"}
        </button>
      </div>
    </div>
  );
}

function Performance({ config, busy, message, onSave }) {
  const [values, setValues] = React.useState({
    workers: "auto",
    connections: "4096",
    keepalive: "65",
    upload: "64m",
    proxy: "60",
    gzip: true,
    sendfile: true,
    http2: true,
  });
  const set = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }));
  React.useEffect(() => {
    const content = config?.content || "";
    setValues((current) => ({
      ...current,
      workers: nginxDirective(content, "worker_processes", current.workers),
      connections: nginxDirective(content, "worker_connections", current.connections),
      keepalive: nginxDirective(content, "keepalive_timeout", current.keepalive),
      upload: nginxDirective(content, "client_max_body_size", current.upload),
      proxy: nginxDirective(content, "proxy_read_timeout", `${current.proxy}s`).replace(/s$/, ""),
      gzip: nginxDirective(content, "gzip", current.gzip ? "on" : "off") === "on",
      sendfile: nginxDirective(content, "sendfile", current.sendfile ? "on" : "off") === "on",
    }));
  }, [config?.content]);
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Nginx performance
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Tune worker capacity, connection reuse, uploads, proxy timeouts, and
          response delivery for live websites.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Worker processes">
          <select
            className={`${inputClass} bg-white dark:bg-neutral-900`}
            value={values.workers}
            onChange={(event) => set("workers", event.target.value)}
          >
            <option value="auto">auto</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="4">4</option>
          </select>
        </Field>
        <Field label="Worker connections">
          <input
            className={inputClass}
            type="number"
            value={values.connections}
            onChange={(event) => set("connections", event.target.value)}
          />
        </Field>
        <Field label="Keep-alive timeout (seconds)">
          <input
            className={inputClass}
            type="number"
            value={values.keepalive}
            onChange={(event) => set("keepalive", event.target.value)}
          />
        </Field>
        <Field label="Maximum upload">
          <input
            className={inputClass}
            value={values.upload}
            onChange={(event) => set("upload", event.target.value)}
          />
        </Field>
        <Field label="Proxy read timeout (seconds)">
          <input
            className={inputClass}
            type="number"
            value={values.proxy}
            onChange={(event) => set("proxy", event.target.value)}
          />
        </Field>
      </div>
      <div className="border-t border-neutral-200 dark:border-neutral-800">
        <Toggle
          label="Gzip compression"
          description="Compress text responses and preserve the correct cache variation."
          checked={values.gzip}
          onChange={(value) => set("gzip", value)}
        />
        <Toggle
          label="Sendfile"
          description="Use the kernel fast path for static file delivery."
          checked={values.sendfile}
          onChange={(value) => set("sendfile", value)}
        />
        <Toggle
          label="HTTP/2"
          description="Enable multiplexed TLS connections for supported sites."
          checked={values.http2}
          onChange={(value) => set("http2", value)}
        />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
          disabled={busy}
          onClick={() => onSave(values)}
        >
          {busy ? "Saving…" : "Save performance profile"}
        </button>
      </div>
    </div>
  );
}

function Security({ config }) {
  const content = config?.content || "";
  const serverTokens = nginxDirective(content, "server_tokens", "not configured");
  const bodyLimit = nginxDirective(content, "client_max_body_size", "not configured");
  const sendfile = nginxDirective(content, "sendfile", "not configured");
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Nginx security profile
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Safe defaults for TLS, headers, request limits, and information
          disclosure.
        </p>
      </div>
      <div className="border-y border-neutral-200 dark:border-neutral-800">
        <Row label="Server version header" value={serverTokens} />
        <Row label="Maximum request body" value={bodyLimit} />
        <Row label="Sendfile" value={sendfile} />
        <Row label="Response security headers" value="Managed per website or Application Shield" />
        <Row label="TLS policy" value="Managed per TLS-enabled website" />
        <Row label="Directory listing" value="Managed per website" />
      </div>
    </div>
  );
}

function Sites({ setMessage }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Nginx virtual hosts
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Each website receives its own server block, document root, access log,
          error log, and optional TLS certificate.
        </p>
      </div>
      <div className="flex items-start gap-3 border-y border-neutral-200 py-5 dark:border-neutral-800">
        <Globe2 size={20} className="mt-0.5 text-blue-600" />
        <div>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Website configurations are managed from Websites
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Create a website to generate a validated Nginx server block.
          </p>
          <button
            type="button"
            className="mt-3 cursor-pointer text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
            onClick={() =>
              setMessage(
                "Create a website from Websites to generate its Nginx server block.",
              )
            }
          >
            Open Websites
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NginxConfigModal({ service, installed, onClose }) {
  const current = (Array.isArray(installed) ? installed : [installed]).filter(
    Boolean,
  )[0];
  const [runtimeStatus, setRuntimeStatus] = React.useState(
    current?.status || "not installed",
  );
  const [runtimeVersion, setRuntimeVersion] = React.useState(
    current?.version || "",
  );
  React.useEffect(() => {
    setRuntimeStatus(current?.status || "not installed");
    setRuntimeVersion(current?.version || "");
  }, [current?.status, current?.version]);
  const running = runtimeStatus === "running";
  const [tab, setTab] = React.useState("settings");
  const [config, setConfig] = React.useState(null);
  const [httpPort, setHttpPort] = React.useState("80");
  const [text, setText] = React.useState("");
  const [logs, setLogs] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState("");
  const [nginxVersions, setNginxVersions] = React.useState([]);
  const [activeNginxVersion, setActiveNginxVersion] = React.useState("");
  const [showInstaller, setShowInstaller] = React.useState(false);
  React.useEffect(() => {
    const update = (event) => {
      const detail = event.detail || {};
      if (detail.serviceId !== "nginx") return;
      if (["queued", "running"].includes(detail.status)) {
        setAction(detail.action || "");
        return;
      }
      if (!["succeeded", "failed", "cancelled"].includes(detail.status)) return;
      if (detail.status === "succeeded") {
        setRuntimeStatus(["start", "restart"].includes(detail.action) ? "running" : "stopped");
      } else if (detail.job?.message) {
        setToast({ type: "error", message: detail.job.message });
      }
      setAction("");
    };
    window.addEventListener("serverengine:service-status", update);
    return () => window.removeEventListener("serverengine:service-status", update);
  }, []);
  const loadNginxVersions = React.useCallback(() => {
    apiRequest("/api/v1/services/nginx/versions")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        setNginxVersions(value?.versions || []);
        setActiveNginxVersion(value?.active_version || "");
      })
      .catch(() => {});
  }, []);
  React.useEffect(() => {
    if (tab === "versions") loadNginxVersions();
  }, [tab, loadNginxVersions]);
  async function makeDefault(version) {
    const response = await apiRequest("/api/v1/services/nginx/default", {
      method: "PUT",
      body: JSON.stringify({ version }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    setToast({
      type: response.ok ? "success" : "error",
      message: response.ok
        ? `Nginx ${version} is now the default version.`
        : body.message || "Unable to change the Nginx default version.",
    });
    if (response.ok) loadNginxVersions();
  }
  React.useEffect(() => {
    apiRequest("/api/v1/services/nginx/configuration")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        setConfig(value);
        setText(value?.content || "");
      })
      .catch(() => {});
    apiRequest("/api/v1/services/nginx/settings")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (value?.http_port) setHttpPort(String(value.http_port));
      })
      .catch(() => {});
  }, []);
  const loadLogs = React.useCallback(
    () =>
      apiRequest(
        `/api/v1/services/nginx/logs?lines=150&kind=${tab === "response-log" ? "response" : "error"}`,
      )
        .then((response) => (response.ok ? response.json() : null))
        .then(setLogs)
        .catch(() => {}),
    [tab],
  );
  React.useEffect(() => {
    if (!["error-log", "response-log"].includes(tab)) return undefined;
    loadLogs();
    const timer = window.setInterval(loadLogs, 2500);
    return () => window.clearInterval(timer);
  }, [tab, loadLogs]);
  async function save(content = text) {
    setBusy(true);
    const response = await apiRequest("/api/v1/services/nginx/configuration", {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    if (response.ok) setText(content);
    setMessage("");
    setToast({
      type: body.saved ? "success" : "error",
      message: body.saved
        ? `Nginx configuration saved. Backup created at ${body.backup || "the Nginx backup directory"}.`
        : body.message || "Unable to save Nginx configuration.",
    });
    setBusy(false);
  }
  async function saveSettings(values) {
    setBusy(true);
    const response = await apiRequest("/api/v1/services/nginx/settings", {
      method: "PUT",
      body: JSON.stringify({ http_port: Number(values.listen) }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    setToast({
      type: response.ok ? "success" : "error",
      message: response.ok
        ? `Nginx HTTP port set to ${body.http_port}.`
        : body.message || "Unable to save Nginx settings.",
    });
    if (response.ok && body.http_port) setHttpPort(String(body.http_port));
    setBusy(false);
  }
  function replaceDirective(content, directive, value) {
    const pattern = new RegExp(`^${directive}\\s+.*$`, "mi");
    return pattern.test(content)
      ? content.replace(pattern, `${directive} ${value};`)
      : `${content.trimEnd()}\n${directive} ${value};\n`;
  }
  function savePerformance(values) {
    let next = text;
    const directives = {
      worker_processes: values.workers,
      worker_connections: values.connections,
      keepalive_timeout: values.keepalive,
      client_max_body_size: values.upload,
      proxy_read_timeout: `${values.proxy}s`,
      sendfile: values.sendfile ? "on" : "off",
      gzip: values.gzip ? "on" : "off",
    };
    Object.entries(directives).forEach(([key, value]) => {
      next = replaceDirective(next, key, value);
    });
    save(next);
  }
  async function serviceAction(actionName) {
    setAction(actionName);
    const response = await apiRequest("/api/v1/services/nginx/action", {
      method: "POST",
      body: JSON.stringify({ action: actionName }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    if (!response.ok || !body.job_id) {
      setToast({ type: "error", message: body.message || "Nginx action failed." });
      setAction("");
      return;
    }
  }
  const primary = running ? "stop" : "start";
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Nginx
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <span
                className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {runtimeStatus}
              {runtimeVersion && ` · v${runtimeVersion}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Nginx configuration"
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
              config={config}
              busy={busy}
              message={message}
              httpPort={httpPort}
              onSave={saveSettings}
            />
          )}
          {tab === "versions" && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    Nginx versions
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    Each release has its own configuration, modules, logs, and runtime directory. Only the selected default runs.
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
              <div className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {nginxVersions.length ? nginxVersions.map((item) => (
                  <div key={`${item.version}-${item.path}`} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">Nginx {item.version}</p>
                        {item.active && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Default</span>}
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{item.install_method === "source" ? "Build from source" : "Prebuilt package"}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">{item.path}</p>
                    </div>
                    {!item.active && (
                      <button type="button" className="shrink-0 cursor-pointer text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={() => makeDefault(item.version)}>
                        Make default
                      </button>
                    )}
                  </div>
                )) : (
                  <p className="py-6 text-sm text-neutral-500 dark:text-neutral-400">No managed Nginx versions are available yet.</p>
                )}
              </div>
            </div>
          )}
          {tab === "performance" && (
            <Performance
              config={config}
              busy={busy}
              message={message}
              onSave={savePerformance}
            />
          )}
          {tab === "security" && <Security config={config} />}
          {tab === "sites" && <Sites setMessage={setMessage} />}
          {tab === "configuration" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Nginx configuration
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Edit the main file here. Website server blocks remain managed
                  per website.
                </p>
                <code className="mt-2 block text-xs text-neutral-500 dark:text-neutral-400">
                  {config?.config_path ||
                    "/opt/server-engine/services/nginx/conf/nginx.conf"}
                </code>
              </div>
              <ConfigEditor path="nginx.conf" value={text} onChange={setText} />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
                  onClick={() => setText(config?.content || "")}
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
          {tab === "runtime" && (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <Server size={19} className="mt-0.5 text-blue-600" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    Nginx runtime
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    Control the Nginx master process and inspect its isolated
                    runtime paths.
                  </p>
                  <StartupPolicyToggle serviceId="nginx" />
                  <div className="mt-4 w-full">
                    <Row
                      label="Worker model"
                      value="Configured in Performance"
                    />
                    <Row label="PID file" value="logs/nginx.pid" />
                    <Row label="Error log" value="logs/error.log" />
                    <Row label="Response log" value="logs/access.log" />
                  </div>
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      className={`${buttonClass} ${primary === "stop" ? "border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                      disabled={Boolean(action)}
                      onClick={() => serviceAction(primary)}
                    >
                      {action === primary
                        ? `${primary === "start" ? "Starting" : "Stopping"}…`
                        : primary === "start"
                          ? "Start"
                          : "Stop"}
                    </button>
                    {running && (
                      <button
                        type="button"
                        className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
                        disabled={Boolean(action)}
                        onClick={() => serviceAction("restart")}
                      >
                        {action === "restart" ? "Restarting…" : "Restart"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {message && (
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  {message}
                </p>
              )}
            </div>
          )}
          {["error-log", "response-log"].includes(tab) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-400">
                    Nginx{" "}
                    {tab === "response-log" ? "response log" : "error log"}
                  </h3>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {logs?.path || "Loading…"}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
                  onClick={loadLogs}
                >
                  <RefreshCw size={14} />
                  Reload
                </button>
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-950 p-4 text-xs leading-5 text-neutral-300">
                {logs?.available
                  ? logs.lines.join("\n") || "No log lines recorded."
                  : "No log exists yet."}
              </pre>
            </div>
          )}
        </div>
      </section>
      {showInstaller && (
        <InstallServiceModal
          service={service}
          onClose={() => {
            setShowInstaller(false);
            loadNginxVersions();
          }}
        />
      )}
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
