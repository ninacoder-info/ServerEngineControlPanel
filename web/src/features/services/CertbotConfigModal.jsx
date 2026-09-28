import React from "react";
import {
  Activity,
  CheckCircle2,
  FileCog,
  FileKey2,
  FileText,
  History,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";

const tabs = [
  ["certificates", "Certificates", FileKey2],
  ["account", "ACME account", ShieldCheck],
  ["issuance", "Issuance", FileText],
  ["renewal", "Renewal", History],
  ["runtime", "Runtime", Activity],
  ["logs", "Logs", RefreshCw],
  ["configuration", "cli.ini", FileCog],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  email: "",
  staging: false,
  agreeTos: true,
  challenge: "http",
  authenticator: "webroot",
  webroot: "/opt/server-engine/www",
  automaticRenewal: true,
  renewalDays: 30,
  renewalTime: "03:00",
  keepUntilExpiring: true,
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
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <code className="break-all text-xs text-slate-700 dark:text-slate-300 sm:text-right">
        {value}
      </code>
    </div>
  );
}

function readOption(text, key, fallback = "") {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, "mi"));
  return match?.[1]?.trim() || fallback;
}

function parseConfig(text) {
  const challenge = readOption(text, "preferred-challenges", "http");
  return {
    email: readOption(text, "email"),
    staging: readOption(text, "staging", "false") === "true",
    agreeTos: readOption(text, "agree-tos", "true") === "true",
    challenge,
    authenticator: readOption(text, "authenticator", "webroot"),
    webroot: readOption(text, "webroot-path", defaults.webroot),
    automaticRenewal: readOption(text, "renew-by-default", "true") !== "false",
    renewalDays: Number(readOption(text, "renew-within", defaults.renewalDays)) || defaults.renewalDays,
    renewalTime: readOption(text, "renewal-time", defaults.renewalTime),
    keepUntilExpiring: readOption(text, "keep-until-expiring", "true") === "true",
  };
}

function buildConfig(values, root = "/opt/server-engine/services/certbot") {
  return `# Server Engine Certbot defaults
email = ${values.email}
agree-tos = ${values.agreeTos}
non-interactive = true
staging = ${values.staging}
preferred-challenges = ${values.challenge}
authenticator = ${values.authenticator}
webroot-path = ${values.webroot}
renew-by-default = ${values.automaticRenewal}
renew-within = ${values.renewalDays}
renewal-time = ${values.renewalTime}
keep-until-expiring = ${values.keepUntilExpiring}
config-dir = ${root}/config
work-dir = ${root}/work
logs-dir = ${root}/logs
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

export default function CertbotConfigModal({ installed, onClose }) {
  const current = Array.isArray(installed)
    ? installed[0]
    : installed;
  const [tab, setTab] = React.useState("certificates");
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [values, setValues] = React.useState(defaults);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [logs, setLogs] = React.useState(null);

  const loadConfig = React.useCallback(() => {
    apiRequest("/api/v1/services/certbot/configuration")
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
    const load = () =>
      apiRequest("/api/v1/services/certbot/logs?page_size=50")
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
    const response = await apiRequest("/api/v1/services/certbot/configuration", {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    setMessage(
      response.ok
        ? "Certbot settings saved. New certificate and renewal runs will use these defaults."
        : body.message,
    );
    if (response.ok) {
      setText(content);
      setValues((currentValues) => ({ ...currentValues, ...parseConfig(content) }));
    }
    setBusy(false);
  };

  const root = "/opt/server-engine/services/certbot";
  const installedLabel = current?.version ? `v${current.version}` : "installed";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <section
        className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="certbot-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="certbot-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Certbot
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {installedLabel} · on-demand ACME client
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Certbot configuration"
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
          {tab === "certificates" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Certificate management</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Certbot requests and renews certificates for websites configured in Server Engine. Choose the website and certificate action from its SSL settings.
                </p>
              </div>
              <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 text-emerald-600" size={18} />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">ACME client ready</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">HTTP-01 is the safe default for normal websites. DNS-01 is required for wildcard certificates.</p>
                  </div>
                </div>
              </div>
              <div>
                <Row label="Certbot executable" value={`${root}/venv/bin/certbot or ${root}/usr/bin/certbot`} />
                <Row label="Certificate storage" value={`${root}/config/live`} />
                <Row label="Renewal configuration" value={`${root}/config/renewal`} />
              </div>
            </div>
          )}

          {tab === "account" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">ACME account</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Use a monitored address for expiry notices and agree to the certificate authority terms once.</p>
              </div>
              <Field label="Account email" hint="Certbot uses this address for important certificate expiry and account notices.">
                <input className={inputClass} type="email" value={values.email} onChange={(event) => setValue("email", event.target.value)} placeholder="admin@example.com" />
              </Field>
              <Toggle label="Agree to the ACME terms of service" description="Required for non-interactive certificate requests. Review the current provider terms before production use." checked={values.agreeTos} onChange={(value) => setValue("agreeTos", value)} />
              <SaveButton busy={busy} onClick={() => save()}>Save account settings</SaveButton>
            </div>
          )}

          {tab === "issuance" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Certificate issuance</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Set the default ACME challenge for new website certificates.</p>
              </div>
              <Field label="ACME environment" hint="Staging avoids production rate limits while testing DNS and web-server configuration.">
                <select className={inputClass} value={values.staging ? "staging" : "production"} onChange={(event) => setValue("staging", event.target.value === "staging")}>
                  <option value="production">Let’s Encrypt production</option>
                  <option value="staging">Let’s Encrypt staging</option>
                </select>
              </Field>
              <Field label="Challenge method">
                <select className={inputClass} value={values.challenge} onChange={(event) => setValue("challenge", event.target.value)}>
                  <option value="http">HTTP-01</option>
                  <option value="dns">DNS-01</option>
                  <option value="tls-alpn">TLS-ALPN-01</option>
                </select>
              </Field>
              <Field label="Authenticator">
                <select className={inputClass} value={values.authenticator} onChange={(event) => setValue("authenticator", event.target.value)}>
                  <option value="webroot">Webroot</option>
                  <option value="standalone">Standalone listener</option>
                  <option value="dns">DNS provider plugin</option>
                </select>
              </Field>
              <Field label="Webroot path" hint="Used by HTTP-01 when the webroot authenticator is selected.">
                <input className={inputClass} value={values.webroot} onChange={(event) => setValue("webroot", event.target.value)} />
              </Field>
              <SaveButton busy={busy} onClick={() => save()}>Save issuance settings</SaveButton>
            </div>
          )}

          {tab === "renewal" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Renewal policy</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Certbot renewal is safe to run repeatedly; it only renews certificates that are close to expiry.</p>
              </div>
              <Toggle label="Automatic renewal" description="Allow the Server Engine scheduler to run certbot renew for managed certificate lineages." checked={values.automaticRenewal} onChange={(value) => setValue("automaticRenewal", value)} />
              <Field label="Renew when fewer than (days)" hint="The renewal command still respects Certbot’s certificate lineage rules.">
                <input className={inputClass} type="number" min="1" max="90" value={values.renewalDays} onChange={(event) => setValue("renewalDays", Number(event.target.value))} />
              </Field>
              <Field label="Preferred renewal time">
                <input className={inputClass} type="time" value={values.renewalTime} onChange={(event) => setValue("renewalTime", event.target.value)} />
              </Field>
              <Toggle label="Keep certificates until they are due for renewal" description="Avoid unnecessary replacements and reduce ACME requests during routine runs." checked={values.keepUntilExpiring} onChange={(value) => setValue("keepUntilExpiring", value)} />
              <SaveButton busy={busy} onClick={() => save()}>Save renewal policy</SaveButton>
            </div>
          )}

          {tab === "runtime" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Certbot runtime</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Certbot runs only when issuing or renewing a certificate. There is no persistent service to start or stop.</p>
              </div>
              <div>
                <Row label="Status" value={current?.status || "installed"} />
                <Row label="Version" value={current?.version ? `v${current.version}` : "Detected by Server Engine"} />
                <Row label="Configuration" value={config?.config_path || `${root}/conf/cli.ini`} />
                <Row label="Certificate store" value={`${root}/config`} />
                <Row label="Working directory" value={`${root}/work`} />
                <Row label="Logs directory" value={`${root}/logs`} />
              </div>
            </div>
          )}

          {tab === "logs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Certbot activity log</h3>
                  <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{logs?.path || `${root}/logs/letsencrypt.log`}</p>
                </div>
                <button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={() => apiRequest("/api/v1/services/certbot/logs?page_size=50").then((response) => (response.ok ? response.json() : null)).then(setLogs)}>
                  <RefreshCw size={14} />
                  Reload
                </button>
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-300">{logs?.available ? logs.lines.join("\n") || "No Certbot activity recorded." : logs ? "No Certbot log exists yet." : "Loading…"}</pre>
            </div>
          )}

          {tab === "configuration" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">cli.ini</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Advanced Certbot defaults. Website-specific certificate settings remain attached to the website.</p>
                <code className="mt-2 block break-all text-xs text-slate-500 dark:text-slate-400">{config?.config_path || `${root}/conf/cli.ini`}</code>
              </div>
              <ConfigEditor path="cli.ini" value={text} onChange={setText} />
              <div className="flex justify-end gap-3">
                <button type="button" className={`${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300`} onClick={loadConfig}>Reset edits</button>
                <button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy} onClick={() => save(text)}>{busy ? "Saving…" : "Save cli.ini"}</button>
              </div>
            </div>
          )}
        </div>

        {message && <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">{message}</p>}
      </section>
    </div>
  );
}
