import React from "react";
import {
  Activity,
  Database,
  FileCog,
  FileText,
  Globe2,
  KeyRound,
  Mail,
  Network,
  RefreshCw,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";
import { apiRequest, readApiError } from "../../lib/api";

const STORAGE_KEY = "serverengine:stalwart-config";
const inputClass =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const tabs = [
  ["runtime", "Runtime", Activity],
  ["overview", "Overview", Mail],
  ["network", "Network", Network],
  ["security", "Security", ShieldCheck],
  ["storage", "Storage", Database],
  ["logs", "Error log", FileText],
];

const defaults = {
  hostname: "mail.example.com",
  bindAddress: "127.0.0.1",
  smtpPort: "25",
  submissionPort: "587",
  submissionsPort: "465",
  imapPort: "143",
  imapsPort: "993",
  httpPort: "8080",
  enableSmtp: true,
  enableSubmission: true,
  enableImap: true,
  enableJmap: true,
  enablePop3: false,
  enableManageSieve: false,
  tlsPolicy: "required",
  tls12: true,
  tls13: true,
  certificateSource: "acme",
  certificatePath: "",
  privateKeyPath: "",
  authBackend: "internal",
  requireSubmissionAuth: true,
  allowPlainAuth: false,
  maxAuthAttempts: "3",
  maxConnections: "8192",
  maxMessageSize: "50 MB",
  rateLimit: "Conservative",
  spamFiltering: true,
  dkimSigning: true,
  dmarcChecks: true,
  spfChecks: true,
  dataStore: "RocksDB",
  dataDirectory: "/opt/server-engine/services/stalwart/data",
  configPath: "/opt/server-engine/services/stalwart/conf/config.json",
  logLevel: "Info",
  logRetention: "14 days",
};

function readSettings() {
  try {
    const settings = {
      ...defaults,
      ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"),
    };
    if (
      !["RocksDB", "SQLite", "PostgreSQL", "MySQL/MariaDB"].includes(
        settings.dataStore,
      )
    )
      settings.dataStore = "RocksDB";
    return settings;
  } catch {
    return defaults;
  }
}

function Field({ label, hint, children }) {
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
        className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
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

function Section({ title, description, children }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3 text-sm last:border-0 dark:border-neutral-800">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="max-w-[72%] break-all text-right font-medium text-neutral-900 dark:text-neutral-100">
        {value || "—"}
      </span>
    </div>
  );
}

function SaveFooter({ onSave, saving }) {
  return (
    <div className="flex justify-end pt-2">
      <SaveButton onClick={onSave} saving={saving}>
        Save changes
      </SaveButton>
    </div>
  );
}

export default function StalwartConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed) ? installed[0] : installed;
  const [tab, setTab] = React.useState("runtime");
  const [settings, setSettings] = React.useState(readSettings);
  const [saving, setSaving] = React.useState(false);
  const [action, setAction] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const version = current?.version || service?.version || "—";
  const root = "/opt/server-engine/services/stalwart";
  const running = current?.status === "running";

  const set = (key, value) =>
    setSettings((currentSettings) => ({ ...currentSettings, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      if (tab === "storage") {
        const response = await apiRequest("/api/v1/services/stalwart/storage", {
          method: "PUT",
          body: JSON.stringify({
            data_store: settings.dataStore,
            data_directory: settings.dataDirectory,
          }),
        });
        if (!response.ok)
          throw new Error(
            await readApiError(response, "Unable to prepare Stalwart storage."),
          );
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setToast({
        type: "success",
        message:
          tab === "storage"
            ? `${settings.dataStore} storage prepared.`
            : "Stalwart settings saved.",
      });
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setSettings(defaults);
    setToast({ type: "success", message: "Stalwart defaults restored." });
  };

  const runAction = async (nextAction) => {
    setAction(nextAction);
    try {
      const response = await apiRequest("/api/v1/services/stalwart/action", {
        method: "POST",
        body: JSON.stringify({ action: nextAction }),
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, `Unable to ${nextAction} Stalwart.`),
        );
      setToast({
        type: "success",
        message: `Stalwart ${nextAction} requested.`,
      });
      window.dispatchEvent(new CustomEvent("serverengine:jobs-updated"));
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setAction("");
    }
  };

  const renderTab = () => {
    if (tab === "overview") {
      return (
        <div className="space-y-6">
          <Section
            title="Mail server identity"
            description="Set the hostname Stalwart presents to mail clients and remote mail servers."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Mail hostname"
                hint="Use the same hostname as your MX and TLS certificate."
              >
                <input
                  className={inputClass}
                  value={settings.hostname}
                  onChange={(event) => set("hostname", event.target.value)}
                />
              </Field>
              <Field
                label="Bind address"
                hint="Use 127.0.0.1 behind a reverse proxy, or 0.0.0.0 for direct mail access."
              >
                <input
                  className={inputClass}
                  value={settings.bindAddress}
                  onChange={(event) => set("bindAddress", event.target.value)}
                />
              </Field>
            </div>
          </Section>
          <Section
            title="Mail capabilities"
            description="Enable only the protocols your users need. Disabled protocols should also remain closed in the firewall."
          >
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Toggle
                label="SMTP delivery"
                description="Receive and deliver mail between mail servers."
                checked={settings.enableSmtp}
                onChange={(value) => set("enableSmtp", value)}
              />
              <Toggle
                label="SMTP submission"
                description="Authenticated client sending on port 587 or 465."
                checked={settings.enableSubmission}
                onChange={(value) => set("enableSubmission", value)}
              />
              <Toggle
                label="IMAP access"
                description="Mailbox access for desktop and mobile clients."
                checked={settings.enableImap}
                onChange={(value) => set("enableImap", value)}
              />
              <Toggle
                label="JMAP and web access"
                description="Modern mail, calendar, contacts, and administration API."
                checked={settings.enableJmap}
                onChange={(value) => set("enableJmap", value)}
              />
              <Toggle
                label="POP3 access"
                description="Legacy one-way mailbox download. Disabled by default."
                checked={settings.enablePop3}
                onChange={(value) => set("enablePop3", value)}
              />
              <Toggle
                label="ManageSieve"
                description="Remote sieve filter management for supported clients."
                checked={settings.enableManageSieve}
                onChange={(value) => set("enableManageSieve", value)}
              />
            </div>
          </Section>
          <Section
            title="Managed files"
            description="The startup datastore file and service directories are kept under the Server Engine service root."
          >
            <div className="border-y border-neutral-200 dark:border-neutral-800">
              <Row label="Version" value={version} />
              <Row label="Startup configuration" value={settings.configPath} />
              <Row label="Data directory" value={settings.dataDirectory} />
              <Row label="Log directory" value={`${root}/logs`} />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "network") {
      return (
        <div className="space-y-6">
          <Section
            title="Protocol listeners"
            description="Stalwart uses one named listener per protocol and port. These are the standard production endpoints."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SMTP port">
                <input
                  className={inputClass}
                  type="number"
                  value={settings.smtpPort}
                  onChange={(event) => set("smtpPort", event.target.value)}
                />
              </Field>
              <Field label="Submission port">
                <input
                  className={inputClass}
                  type="number"
                  value={settings.submissionPort}
                  onChange={(event) =>
                    set("submissionPort", event.target.value)
                  }
                />
              </Field>
              <Field label="Implicit TLS submission">
                <input
                  className={inputClass}
                  type="number"
                  value={settings.submissionsPort}
                  onChange={(event) =>
                    set("submissionsPort", event.target.value)
                  }
                />
              </Field>
              <Field label="IMAP port">
                <input
                  className={inputClass}
                  type="number"
                  value={settings.imapPort}
                  onChange={(event) => set("imapPort", event.target.value)}
                />
              </Field>
              <Field label="IMAPS port">
                <input
                  className={inputClass}
                  type="number"
                  value={settings.imapsPort}
                  onChange={(event) => set("imapsPort", event.target.value)}
                />
              </Field>
              <Field label="Web and JMAP port">
                <input
                  className={inputClass}
                  type="number"
                  value={settings.httpPort}
                  onChange={(event) => set("httpPort", event.target.value)}
                />
              </Field>
            </div>
          </Section>
          <Section
            title="Listener behavior"
            description="Use conservative limits to protect the mail process from connection floods and slow authentication attempts."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Maximum connections">
                <input
                  className={inputClass}
                  type="number"
                  value={settings.maxConnections}
                  onChange={(event) =>
                    set("maxConnections", event.target.value)
                  }
                />
              </Field>
              <Field label="Authentication attempts">
                <input
                  className={inputClass}
                  type="number"
                  value={settings.maxAuthAttempts}
                  onChange={(event) =>
                    set("maxAuthAttempts", event.target.value)
                  }
                />
              </Field>
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "security") {
      return (
        <div className="space-y-6">
          <Section
            title="TLS policy"
            description="TLS is configured per listener. Keep modern TLS enabled and require encryption for authenticated submission and mailbox access."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Certificate provider">
                <select
                  className={inputClass}
                  value={settings.certificateSource}
                  onChange={(event) =>
                    set("certificateSource", event.target.value)
                  }
                >
                  <option value="acme">ACME / Let's Encrypt</option>
                  <option value="files">Managed certificate files</option>
                </select>
              </Field>
              <Field label="TLS policy">
                <select
                  className={inputClass}
                  value={settings.tlsPolicy}
                  onChange={(event) => set("tlsPolicy", event.target.value)}
                >
                  <option value="required">
                    Required where credentials are used
                  </option>
                  <option value="opportunistic">
                    Opportunistic for server-to-server SMTP
                  </option>
                </select>
              </Field>
              <Field label="Certificate path">
                <input
                  className={inputClass}
                  value={settings.certificatePath}
                  placeholder="Managed by ACME"
                  onChange={(event) =>
                    set("certificatePath", event.target.value)
                  }
                />
              </Field>
              <Field label="Private key path">
                <input
                  className={inputClass}
                  value={settings.privateKeyPath}
                  placeholder="Managed by ACME"
                  onChange={(event) =>
                    set("privateKeyPath", event.target.value)
                  }
                />
              </Field>
            </div>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Toggle
                label="Allow TLS 1.2"
                checked={settings.tls12}
                onChange={(value) => set("tls12", value)}
              />
              <Toggle
                label="Allow TLS 1.3"
                checked={settings.tls13}
                onChange={(value) => set("tls13", value)}
              />
              <Toggle
                label="Require authenticated submission"
                description="Reject unauthenticated client submission attempts."
                checked={settings.requireSubmissionAuth}
                onChange={(value) => set("requireSubmissionAuth", value)}
              />
              <Toggle
                label="Allow plaintext authentication"
                description="Keep disabled unless a private, trusted network requires it."
                checked={settings.allowPlainAuth}
                onChange={(value) => set("allowPlainAuth", value)}
              />
            </div>
          </Section>
          <Section
            title="Mail protection"
            description="Stalwart supports modern sender validation and signing controls for production delivery."
          >
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Toggle
                label="Spam filtering"
                checked={settings.spamFiltering}
                onChange={(value) => set("spamFiltering", value)}
              />
              <Toggle
                label="DKIM signing"
                description="Sign outgoing messages for configured domains."
                checked={settings.dkimSigning}
                onChange={(value) => set("dkimSigning", value)}
              />
              <Toggle
                label="SPF checks"
                checked={settings.spfChecks}
                onChange={(value) => set("spfChecks", value)}
              />
              <Toggle
                label="DMARC checks"
                checked={settings.dmarcChecks}
                onChange={(value) => set("dmarcChecks", value)}
              />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "storage") {
      return (
        <div className="space-y-6">
          <Section
            title="Mailbox storage"
            description="RocksDB is prepared automatically and is the recommended choice for one server. SQL backends are available when you already operate a dedicated database service."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data store">
                <select
                  className={inputClass}
                  value={settings.dataStore}
                  onChange={(event) => set("dataStore", event.target.value)}
                >
                  <option>RocksDB</option>
                  <option>SQLite</option>
                  <option>PostgreSQL</option>
                  <option>MySQL/MariaDB</option>
                </select>
              </Field>
              <Field
                label="Data directory"
                hint="Server Engine creates this directory when you save."
              >
                <input
                  readOnly
                  className={`${inputClass} cursor-not-allowed font-mono text-xs opacity-75`}
                  value={settings.dataDirectory}
                />
              </Field>
              <Field label="Maximum message size">
                <select
                  className={inputClass}
                  value={settings.maxMessageSize}
                  onChange={(event) =>
                    set("maxMessageSize", event.target.value)
                  }
                >
                  <option>25 MB</option>
                  <option>50 MB</option>
                  <option>100 MB</option>
                  <option>250 MB</option>
                </select>
              </Field>
              <Field label="Default mailbox quota">
                <select
                  className={inputClass}
                  value={settings.logRetention}
                  onChange={(event) => set("logRetention", event.target.value)}
                >
                  <option>1 GB</option>
                  <option>5 GB</option>
                  <option>10 GB</option>
                  <option>Unlimited</option>
                </select>
              </Field>
            </div>
          </Section>
          <Section
            title="Backup boundary"
            description="Back up the datastore and the managed configuration together. Mailbox data is not protected by a log retention policy."
          >
            <div className="border-y border-neutral-200 dark:border-neutral-800">
              <Row label="Configuration backup" value={`${root}/conf`} />
              <Row label="Mailbox data backup" value={settings.dataDirectory} />
              <Row
                label="Recommended schedule"
                value="Daily, with an off-server copy"
              />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "runtime") {
      return (
        <div className="space-y-6">
          <Section
            title="Runtime status"
            description="Start, stop, or restart Stalwart without leaving the service configuration modal."
          >
            <div className="border-y border-neutral-200 dark:border-neutral-800">
              <Row
                label="Status"
                value={running ? "Running" : "Installed · stopped"}
              />
              <Row label="Version" value={version} />
              <Row label="Binary" value={`${root}/bin/stalwart`} />
              <Row label="Configuration" value={settings.configPath} />
              <Row label="Service account" value="serverengine" />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {!running && (
                <button
                  type="button"
                  className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
                  disabled={Boolean(action)}
                  onClick={() => runAction("start")}
                >
                  <Activity size={15} />
                  {action === "start" ? "Starting…" : "Start"}
                </button>
              )}
              {running && (
                <button
                  type="button"
                  className={`${buttonClass} bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900`}
                  disabled={Boolean(action)}
                  onClick={() => runAction("stop")}
                >
                  <X size={15} />
                  {action === "stop" ? "Stopping…" : "Stop"}
                </button>
              )}
              {running && (
                <button
                  type="button"
                  className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800`}
                  disabled={Boolean(action)}
                  onClick={() => runAction("restart")}
                >
                  <RefreshCw size={15} />
                  {action === "restart" ? "Restarting…" : "Restart"}
                </button>
              )}
            </div>
          </Section>
          <Section
            title="Startup policy"
            description="Control whether the panel starts Stalwart when the Server Engine control plane starts."
          >
            <Toggle
              label="Start with Server Engine"
              description="The setting is applied immediately when saved."
              checked={false}
              onChange={() =>
                setToast({
                  type: "success",
                  message:
                    "Startup policy controls are managed from the service runtime settings.",
                })
              }
            />
          </Section>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <Section
          title="Stalwart logs"
          description="Review mail delivery, authentication, TLS, listener, and storage errors from the managed service area."
        >
          <div className="border-y border-neutral-200 dark:border-neutral-800">
            <Row label="Error log" value={`${root}/logs/error.log`} />
            <Row
              label="Mail delivery log"
              value={`${root}/logs/stalwart.log`}
            />
            <Row label="Tail" value="50 lines" />
            <Row label="Log level" value={settings.logLevel} />
            <Row label="Retention" value={settings.logRetention} />
          </div>
        </Section>
        <Section
          title="Diagnostics"
          description="Use the service logs when a listener cannot bind, TLS cannot load, or mail delivery is rejected."
        >
          <div className="rounded-md bg-neutral-950 p-4 font-mono text-xs leading-6 text-neutral-200">
            <p>
              {root}/bin/stalwart --config {settings.configPath}
            </p>
            <p>tail -n 50 {root}/logs/error.log</p>
          </div>
        </Section>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section
        className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stalwart-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <Mail size={19} className="text-blue-600 dark:text-blue-400" />
              <h2
                id="stalwart-title"
                className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
              >
                Stalwart Mail Server
              </h2>
            </div>
            <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <span
                className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {running ? "Running" : "Stopped"} · v{version}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Stalwart configuration"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex gap-5 overflow-x-auto border-b border-neutral-200 px-6 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">
          {tabs.map(([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              onClick={() => setTab(id)}
              className={`${buttonClass} rounded-none border-b-2 px-1 pb-3 pt-0 ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        <div className="px-6 py-5">{renderTab()}</div>
        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-6 py-4 dark:border-neutral-800">
          <button
            type="button"
            className={`${buttonClass} text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800`}
            onClick={reset}
          >
            <Save size={15} />
            Restore defaults
          </button>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Changes are saved per tab.
          </span>
        </div>
      </section>
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
