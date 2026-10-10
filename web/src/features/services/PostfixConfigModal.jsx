import React from "react";
import {
  Activity,
  FileText,
  Gauge,
  Globe2,
  Mail,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";

const STORAGE_KEY = "serverengine:postfix-modal";
const tabs = [
  ["runtime", "Runtime", Activity],
  ["configuration", "Configuration", SlidersHorizontal],
  ["listeners", "Listeners", Network],
  ["security", "Security", ShieldCheck],
  ["delivery", "Delivery", Globe2],
  ["queue", "Queue", Gauge],
  ["logs", "Error log", FileText],
];
const inputClass =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  hostname: "mail.example.com",
  primaryDomain: "example.com",
  interfaces: "all",
  ipv6: false,
  smtpPort: "25",
  submissionPort: "587",
  smtpsPort: "465",
  submission: true,
  smtps: false,
  tls: "may",
  tlsAuthOnly: true,
  certificate: "/opt/server-engine/services/postfix/certs/fullchain.pem",
  privateKey: "/opt/server-engine/services/postfix/certs/privkey.pem",
  sasl: true,
  relayhost: "",
  trustedNetworks: "127.0.0.0/8, [::1]/128",
  rejectUnauth: true,
  recipientRestrictions: "reject_unknown_recipient_domain",
  maxQueueLifetime: "5 days",
  bounceQueueLifetime: "1 day",
  destinationConcurrency: "20",
  rateDelay: "0",
  messageSize: "50 MB",
};

function readSettings() {
  try {
    return {
      ...defaults,
      ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"),
    };
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
    <div className="flex justify-end border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <SaveButton onClick={onSave} saving={saving}>
        Save changes
      </SaveButton>
    </div>
  );
}

export default function PostfixConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed) ? installed[0] : installed;
  const [tab, setTab] = React.useState("runtime");
  const [settings, setSettings] = React.useState(readSettings);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const version = current?.version || service?.version || "—";
  const root =
    current?.root || current?.path || "/opt/server-engine/services/postfix";
  const running = current?.status === "running";
  const set = (key, value) =>
    setSettings((valueState) => ({ ...valueState, [key]: value }));
  const save = async () => {
    setSaving(true);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    setSaving(false);
    setToast({ type: "success", message: "Postfix settings saved." });
    return true;
  };

  const renderTab = () => {
    if (tab === "configuration")
      return (
        <div className="space-y-6">
          <Section
            title="Mail identity"
            description="Set the identity Postfix presents when delivering and receiving mail."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Mail hostname"
                hint="Use a fully qualified hostname with a matching DNS record."
              >
                <input
                  className={inputClass}
                  value={settings.hostname}
                  onChange={(event) => set("hostname", event.target.value)}
                />
              </Field>
              <Field label="Primary mail domain">
                <input
                  className={inputClass}
                  value={settings.primaryDomain}
                  onChange={(event) => set("primaryDomain", event.target.value)}
                />
              </Field>
              <Field label="Listen interfaces">
                <select
                  className={inputClass}
                  value={settings.interfaces}
                  onChange={(event) => set("interfaces", event.target.value)}
                >
                  <option value="all">All available interfaces</option>
                  <option value="loopback">Localhost only</option>
                  <option value="private">Private interfaces only</option>
                </select>
              </Field>
              <Field label="IPv6 listener">
                <select
                  className={inputClass}
                  value={settings.ipv6 ? "enabled" : "disabled"}
                  onChange={(event) =>
                    set("ipv6", event.target.value === "enabled")
                  }
                >
                  <option value="disabled">Disabled</option>
                  <option value="enabled">Enabled</option>
                </select>
              </Field>
            </div>
          </Section>
          <Section
            title="Managed files"
            description="These files stay inside the Server Engine service area; the host Postfix configuration is not changed."
          >
            <div className="border-y border-neutral-200 dark:border-neutral-800">
              <Row label="Main configuration" value={`${root}/conf/main.cf`} />
              <Row
                label="Service configuration"
                value={`${root}/conf/master.cf`}
              />
              <Row label="Queue directory" value={`${root}/queue`} />
              <Row label="Mail log" value={`${root}/logs/postfix.log`} />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );

    if (tab === "listeners")
      return (
        <div className="space-y-6">
          <Section
            title="SMTP listeners"
            description="Port 25 is for server-to-server delivery. Submission ports are for authenticated mail clients."
          >
            <div className="grid gap-4 sm:grid-cols-3">
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
              <Field label="SMTPS port">
                <input
                  className={inputClass}
                  type="number"
                  value={settings.smtpsPort}
                  onChange={(event) => set("smtpsPort", event.target.value)}
                />
              </Field>
            </div>
            <div className="space-y-3">
              <Toggle
                label="Enable authenticated submission"
                description="Expose the submission service for mail clients after authentication and TLS."
                checked={settings.submission}
                onChange={(value) => set("submission", value)}
              />
              <Toggle
                label="Enable implicit TLS (SMTPS)"
                description="Offer direct TLS on port 465 when your clients require it."
                checked={settings.smtps}
                onChange={(value) => set("smtps", value)}
              />
            </div>
          </Section>
          <Section title="Listener behavior">
            <Field
              label="Maximum message size"
              hint="Reject messages above this size before they enter the queue."
            >
              <select
                className={inputClass}
                value={settings.messageSize}
                onChange={(event) => set("messageSize", event.target.value)}
              >
                <option>10 MB</option>
                <option>25 MB</option>
                <option>50 MB</option>
                <option>100 MB</option>
              </select>
            </Field>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );

    if (tab === "security")
      return (
        <div className="space-y-6">
          <Section
            title="TLS and authentication"
            description="Authenticated relay should be available only to trusted clients, preferably after encryption."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SMTP TLS policy">
                <select
                  className={inputClass}
                  value={settings.tls}
                  onChange={(event) => set("tls", event.target.value)}
                >
                  <option value="may">Opportunistic TLS</option>
                  <option value="encrypt">Require TLS</option>
                  <option value="none">Disabled</option>
                </select>
              </Field>
              <Field label="SASL authentication">
                <select
                  className={inputClass}
                  value={settings.sasl ? "enabled" : "disabled"}
                  onChange={(event) =>
                    set("sasl", event.target.value === "enabled")
                  }
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Field>
              <Field label="Certificate path">
                <input
                  className={`${inputClass} font-mono text-xs`}
                  value={settings.certificate}
                  onChange={(event) => set("certificate", event.target.value)}
                />
              </Field>
              <Field label="Private key path">
                <input
                  className={`${inputClass} font-mono text-xs`}
                  value={settings.privateKey}
                  onChange={(event) => set("privateKey", event.target.value)}
                />
              </Field>
            </div>
            <div className="space-y-3">
              <Toggle
                label="Require TLS before authentication"
                description="Do not offer plaintext authentication mechanisms before the connection is encrypted."
                checked={settings.tlsAuthOnly}
                onChange={(value) => set("tlsAuthOnly", value)}
              />
              <Toggle
                label="Reject unauthenticated relay destinations"
                description="Prevent this server from becoming an open relay."
                checked={settings.rejectUnauth}
                onChange={(value) => set("rejectUnauth", value)}
              />
            </div>
          </Section>
          <Section
            title="Trusted networks"
            description="Only add private networks that you control. Authenticated clients are handled separately."
          >
            <Field
              label="Trusted network ranges"
              hint="Comma-separated CIDR ranges."
            >
              <textarea
                className={`${inputClass} min-h-24 font-mono text-xs`}
                value={settings.trustedNetworks}
                onChange={(event) => set("trustedNetworks", event.target.value)}
              />
            </Field>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );

    if (tab === "delivery")
      return (
        <div className="space-y-6">
          <Section
            title="Outbound delivery"
            description="Choose direct delivery or route outgoing mail through a trusted upstream relay."
          >
            <Field
              label="Relay host"
              hint="Leave empty for direct DNS-based delivery. Include a port when required, for example [smtp.example.net]:587."
            >
              <input
                className={inputClass}
                value={settings.relayhost}
                onChange={(event) => set("relayhost", event.target.value)}
                placeholder="Leave empty for direct delivery"
              />
            </Field>
            <Field
              label="Recipient restrictions"
              hint="Reject invalid or unauthorized destinations before accepting a message."
            >
              <textarea
                className={`${inputClass} min-h-24 font-mono text-xs`}
                value={settings.recipientRestrictions}
                onChange={(event) =>
                  set("recipientRestrictions", event.target.value)
                }
              />
            </Field>
          </Section>
          <Section title="Delivery safety">
            <div className="space-y-3">
              <Toggle
                label="Reject unknown recipient domains"
                description="Do not accept mail for destinations this server cannot resolve or deliver to."
                checked={settings.rejectUnauth}
                onChange={(value) => set("rejectUnauth", value)}
              />
              <Toggle
                label="Require authenticated relay for remote mail"
                description="Allow remote relay only for trusted networks or authenticated submission clients."
                checked={settings.sasl}
                onChange={(value) => set("sasl", value)}
              />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );

    if (tab === "queue")
      return (
        <div className="space-y-6">
          <Section
            title="Queue retention"
            description="Control how long undelivered mail remains queued before Postfix returns it to the sender."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Maximum queue lifetime">
                <select
                  className={inputClass}
                  value={settings.maxQueueLifetime}
                  onChange={(event) =>
                    set("maxQueueLifetime", event.target.value)
                  }
                >
                  <option>1 day</option>
                  <option>3 days</option>
                  <option>5 days</option>
                  <option>7 days</option>
                </select>
              </Field>
              <Field label="Bounce lifetime">
                <select
                  className={inputClass}
                  value={settings.bounceQueueLifetime}
                  onChange={(event) =>
                    set("bounceQueueLifetime", event.target.value)
                  }
                >
                  <option>12 hours</option>
                  <option>1 day</option>
                  <option>2 days</option>
                </select>
              </Field>
              <Field label="Destination concurrency">
                <select
                  className={inputClass}
                  value={settings.destinationConcurrency}
                  onChange={(event) =>
                    set("destinationConcurrency", event.target.value)
                  }
                >
                  <option>5</option>
                  <option>10</option>
                  <option>20</option>
                  <option>50</option>
                </select>
              </Field>
              <Field label="Delivery rate delay">
                <select
                  className={inputClass}
                  value={settings.rateDelay}
                  onChange={(event) => set("rateDelay", event.target.value)}
                >
                  <option value="0">No delay</option>
                  <option value="1s">1 second</option>
                  <option value="5s">5 seconds</option>
                  <option value="10s">10 seconds</option>
                </select>
              </Field>
            </div>
          </Section>
          <Section title="Operational tools">
            <div className="border-y border-neutral-200 dark:border-neutral-800">
              <Row label="Queue inspection" value="postqueue -p" />
              <Row label="Queue re-try" value="postqueue -f" />
              <Row label="Queue deletion" value="postsuper -d queue-id" />
            </div>
            <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              Queue actions will be connected to the host agent. Destructive
              deletion will require confirmation.
            </p>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );

    if (tab === "runtime")
      return (
        <div className="space-y-6">
          <Section
            title="Runtime status"
            description="Postfix is a mail transport service. Mailboxes and IMAP access belong to Dovecot or the selected mail platform."
          >
            <div className="border-y border-neutral-200 dark:border-neutral-800">
              <Row
                label="Status"
                value={running ? "Running" : "Installed · stopped"}
              />
              <Row label="Version" value={version} />
              <Row label="Postfix binary" value={`${root}/sbin/postfix`} />
              <Row label="Main configuration" value={`${root}/conf/main.cf`} />
              <Row
                label="Service configuration"
                value={`${root}/conf/master.cf`}
              />
            </div>
          </Section>
          <Section
            title="Validation commands"
            description="These checks should run before the service is reloaded."
          >
            <div className="space-y-2 rounded-md bg-neutral-950 p-4 font-mono text-xs leading-6 text-neutral-200">
              <p>{root}/sbin/postfix check</p>
              <p>{root}/sbin/postconf -n</p>
              <p>{root}/sbin/postqueue -p</p>
            </div>
          </Section>
        </div>
      );

    return (
      <div className="space-y-6">
        <Section
          title="Postfix error log"
          description="TLS failures, relay rejections, queue errors, delivery responses, and policy violations appear here."
        >
          <div className="border-y border-neutral-200 dark:border-neutral-800">
            <Row label="Log file" value={`${root}/logs/postfix.log`} />
            <Row label="Tail" value="50 lines" />
            <Row
              label="Live streaming"
              value="Available when the host agent is connected"
            />
          </div>
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
            No Postfix errors have been reported yet.
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
        aria-labelledby="postfix-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <Mail size={19} className="text-blue-600 dark:text-blue-400" />
              <h2
                id="postfix-title"
                className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
              >
                Postfix
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
            aria-label="Close Postfix configuration"
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
      </section>
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
