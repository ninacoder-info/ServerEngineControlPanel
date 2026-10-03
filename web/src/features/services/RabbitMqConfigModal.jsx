import React from "react";
import {
  Activity,
  FileText,
  Gauge,
  KeyRound,
  Mail,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";

const STORAGE_KEY = "serverengine:rabbitmq";
const tabs = [
  ["configuration", "Configuration", Settings2],
  ["access", "Access", KeyRound],
  ["security", "Security", ShieldCheck],
  ["limits", "Limits", Gauge],
  ["runtime", "Runtime", Activity],
  ["logs", "Error log", FileText],
];
const inputClass =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";
const defaults = {
  bindAddress: "127.0.0.1",
  amqpPort: "5672",
  tlsPort: "5671",
  managementPort: "15672",
  nodeName: "rabbit@localhost",
  defaultVhost: "/",
  serviceUser: "serverengine",
  vhosts: "/",
  users: "serverengine",
  permissions: "configure: .*\nwrite: .*\nread: .*",
  tls: false,
  certificate: "/opt/server-engine/services/rabbitmq/certs/server.pem",
  privateKey: "/opt/server-engine/services/rabbitmq/certs/server-key.pem",
  caFile: "/opt/server-engine/services/rabbitmq/certs/ca.pem",
  management: true,
  memoryWatermark: "60%",
  diskFreeLimit: "2 GB",
  maxChannels: "2048",
  maxConnections: "1000",
  heartbeat: "60s",
  queueType: "Quorum where selected",
  startWithPanel: false,
};

function readSettings() {
  try {
    return { ...defaults, ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function Field({ label, hint, children }) {
  return <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}{children}{hint && <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">{hint}</span>}</label>;
}
function Toggle({ label, description, checked, onChange }) {
  return <label className="flex cursor-pointer items-start gap-3 py-1"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 cursor-pointer accent-blue-600" /><span><span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</span>{description && <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">{description}</span>}</span></label>;
}
function Section({ title, description, children }) {
  return <section className="space-y-4"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>{description && <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">{description}</p>}</div>{children}</section>;
}
function Row({ label, value }) {
  return <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3 text-sm last:border-0 dark:border-neutral-800"><span className="text-neutral-500 dark:text-neutral-400">{label}</span><span className="max-w-[72%] break-all text-right font-medium text-neutral-900 dark:text-neutral-100">{value || "—"}</span></div>;
}
function SaveFooter({ onSave, saving }) {
  return <div className="flex justify-end border-t border-neutral-200 pt-4 dark:border-neutral-800"><SaveButton onClick={onSave} saving={saving}>Save changes</SaveButton></div>;
}

export default function RabbitMqConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed) ? installed[0] : installed;
  const [tab, setTab] = React.useState("configuration");
  const [settings, setSettings] = React.useState(readSettings);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const version = current?.version || service?.version || "—";
  const root = current?.root || current?.path || "/opt/server-engine/services/rabbitmq";
  const running = current?.status === "running";
  const set = (key, value) => setSettings((valueState) => ({ ...valueState, [key]: value }));
  const save = async () => {
    setSaving(true);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    setSaving(false);
    setToast({ type: "success", message: "RabbitMQ settings saved." });
    return true;
  };

  const renderTab = () => {
    if (tab === "configuration") return <div className="space-y-6"><Section title="Broker identity" description="Set the node identity and local listener used by applications and workers."><div className="grid gap-4 sm:grid-cols-2"><Field label="Node name" hint="Keep this stable; changing it affects the broker data directory."><input className={inputClass} value={settings.nodeName} onChange={(event) => set("nodeName", event.target.value)} /></Field><Field label="Bind address"><input className={inputClass} value={settings.bindAddress} onChange={(event) => set("bindAddress", event.target.value)} /></Field><Field label="Default virtual host" hint="Virtual hosts are separate namespaces for queues, exchanges, and permissions."><input className={inputClass} value={settings.defaultVhost} onChange={(event) => set("defaultVhost", event.target.value)} /></Field><Field label="Service account"><input className={inputClass} value={settings.serviceUser} onChange={(event) => set("serviceUser", event.target.value)} /></Field></div></Section><Section title="Managed files" description="RabbitMQ configuration and data remain inside the Server Engine service area."><div className="border-y border-neutral-200 dark:border-neutral-800"><Row label="Configuration" value={`${root}/conf/rabbitmq.conf`} /><Row label="Environment" value={`${root}/conf/rabbitmq-env.conf`} /><Row label="Data directory" value={`${root}/data`} /><Row label="Log directory" value={`${root}/logs`} /></div></Section><SaveFooter onSave={save} saving={saving} /></div>;

    if (tab === "access") return <div className="space-y-6"><Section title="Virtual hosts" description="Each virtual host is a separate namespace. A user must have permissions on a vhost before clients can connect to it."><Field label="Managed virtual hosts" hint="One virtual host per line."><textarea className={`${inputClass} min-h-24 font-mono text-xs`} value={settings.vhosts} onChange={(event) => set("vhosts", event.target.value)} /></Field></Section><Section title="Users and permissions" description="Use a dedicated application user instead of the default guest account for production applications."><div className="grid gap-4 sm:grid-cols-2"><Field label="Managed users" hint="Passwords are handled separately and are not stored in this form."><textarea className={`${inputClass} min-h-24 font-mono text-xs`} value={settings.users} onChange={(event) => set("users", event.target.value)} /></Field><Field label="Permission patterns" hint="Configure, write, and read patterns for the selected virtual host."><textarea className={`${inputClass} min-h-24 font-mono text-xs`} value={settings.permissions} onChange={(event) => set("permissions", event.target.value)} /></Field></div></Section><Section title="Management plugin"><Toggle label="Enable management interface" description="Expose the RabbitMQ management API and dashboard on the configured management port." checked={settings.management} onChange={(value) => set("management", value)} /></Section><SaveFooter onSave={save} saving={saving} /></div>;

    if (tab === "security") return <div className="space-y-6"><Section title="TLS listeners" description="Enable TLS for client connections only after certificates are present and readable by the broker account."><div className="grid gap-4 sm:grid-cols-2"><Field label="TLS port"><input className={inputClass} type="number" value={settings.tlsPort} onChange={(event) => set("tlsPort", event.target.value)} /></Field><Field label="TLS listener"><select className={inputClass} value={settings.tls ? "enabled" : "disabled"} onChange={(event) => set("tls", event.target.value === "enabled")}><option value="disabled">Disabled</option><option value="enabled">Enabled</option></select></Field><Field label="Certificate path"><input className={`${inputClass} font-mono text-xs`} value={settings.certificate} onChange={(event) => set("certificate", event.target.value)} /></Field><Field label="Private key path"><input className={`${inputClass} font-mono text-xs`} value={settings.privateKey} onChange={(event) => set("privateKey", event.target.value)} /></Field><Field label="CA certificate path"><input className={`${inputClass} font-mono text-xs`} value={settings.caFile} onChange={(event) => set("caFile", event.target.value)} /></Field></div></Section><Section title="Access safety"><div className="space-y-3"><Toggle label="Disable remote guest access" description="RabbitMQ's default guest user is intended for local connections only; use a generated application user for remote clients." checked={true} onChange={() => {}} /><Toggle label="Require TLS for remote clients" description="Apply encrypted connections to clients outside the local service network." checked={settings.tls} onChange={(value) => set("tls", value)} /></div></Section><SaveFooter onSave={save} saving={saving} /></div>;

    if (tab === "limits") return <div className="space-y-6"><Section title="Resource alarms" description="RabbitMQ raises alarms when memory or disk thresholds are reached and publishers may be blocked to protect the node."><div className="grid gap-4 sm:grid-cols-2"><Field label="Memory watermark"><select className={inputClass} value={settings.memoryWatermark} onChange={(event) => set("memoryWatermark", event.target.value)}><option>40%</option><option>60%</option><option>70%</option><option>80%</option></select></Field><Field label="Disk free limit"><select className={inputClass} value={settings.diskFreeLimit} onChange={(event) => set("diskFreeLimit", event.target.value)}><option>1 GB</option><option>2 GB</option><option>5 GB</option><option>10 GB</option></select></Field><Field label="Maximum connections"><input className={inputClass} type="number" value={settings.maxConnections} onChange={(event) => set("maxConnections", event.target.value)} /></Field><Field label="Maximum channels"><input className={inputClass} type="number" value={settings.maxChannels} onChange={(event) => set("maxChannels", event.target.value)} /></Field></div></Section><Section title="Queue defaults"><div className="grid gap-4 sm:grid-cols-2"><Field label="Default queue type" hint="Quorum queues provide replicated safety; classic queues can be appropriate for simpler workloads."><select className={inputClass} value={settings.queueType} onChange={(event) => set("queueType", event.target.value)}><option>Quorum where selected</option><option>Classic</option><option>Quorum</option></select></Field><Field label="Heartbeat"><select className={inputClass} value={settings.heartbeat} onChange={(event) => set("heartbeat", event.target.value)}><option>30 seconds</option><option>60 seconds</option><option>120 seconds</option></select></Field></div></Section><SaveFooter onSave={save} saving={saving} /></div>;

    if (tab === "runtime") return <div className="space-y-6"><Section title="Runtime status" description="RabbitMQ is a broker service. Queue and consumer metrics become available when the management API or host agent is connected."><div className="border-y border-neutral-200 dark:border-neutral-800"><Row label="Status" value={running ? "Running" : "Installed · stopped"} /><Row label="Version" value={version} /><Row label="AMQP listener" value={`${settings.bindAddress}:${settings.amqpPort}`} /><Row label="Management API" value={`${settings.bindAddress}:${settings.managementPort}`} /><Row label="CLI" value={`${root}/sbin/rabbitmqctl`} /></div></Section><Section title="Validation commands" description="Use these checks before reloading the broker configuration."><div className="space-y-2 rounded-md bg-neutral-950 p-4 font-mono text-xs leading-6 text-neutral-200"><p>{root}/sbin/rabbitmq-diagnostics status</p><p>{root}/sbin/rabbitmq-diagnostics listeners</p><p>{root}/sbin/rabbitmqctl list_vhosts</p><p>{root}/sbin/rabbitmqctl list_permissions -p {settings.defaultVhost}</p></div></Section></div>;

    return <div className="space-y-6"><Section title="RabbitMQ error log" description="Connection failures, authentication errors, alarms, queue problems, and TLS failures appear here."><div className="border-y border-neutral-200 dark:border-neutral-800"><Row label="Log file" value={`${root}/logs/rabbitmq.log`} /><Row label="Tail" value="50 lines" /><Row label="Live streaming" value="Available when the host agent is connected" /></div><div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">No RabbitMQ errors have been reported yet.</div></Section></div>;
  };

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"><section className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-neutral-900" role="dialog" aria-modal="true" aria-labelledby="rabbitmq-title"><div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800"><div><div className="flex items-center gap-2"><Mail size={19} className="text-blue-600 dark:text-blue-400" /><h2 id="rabbitmq-title" className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">RabbitMQ</h2></div><p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400"><span className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`} />{running ? "Running" : "Stopped"} · v{version}</p></div><button type="button" aria-label="Close RabbitMQ configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200" onClick={onClose}><X size={18} /></button></div><div className="flex gap-5 overflow-x-auto border-b border-neutral-200 px-6 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">{tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`${buttonClass} rounded-none border-b-2 px-1 pb-3 pt-0 ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}><Icon size={15} />{label}</button>)}</div><div className="px-6 py-5">{renderTab()}</div></section><Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} /></div>;
}
