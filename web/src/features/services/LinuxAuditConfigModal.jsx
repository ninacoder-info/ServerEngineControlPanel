import React from "react";
import {
  Activity,
  Check,
  FileCode2,
  FileText,
  Gauge,
  ListChecks,
  RefreshCw,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";

const STORAGE_KEY = "serverengine:linux-audit-config";
const inputClass =
  "mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const tabs = [
  ["overview", "Overview", ShieldCheck],
  ["rules", "Rules", ListChecks],
  ["runtime", "Runtime", Activity],
  ["logs", "Audit log", FileText],
];

const defaults = {
  auditLog: "/var/log/audit/audit.log",
  rulesFile: "/etc/audit/rules.d/server-engine.rules",
  backlog: "8192",
  rateLimit: "0",
  failureMode: "1",
  immutable: false,
  loginEvents: true,
  identityChanges: true,
  privilegeUse: true,
  serviceFiles: true,
  websiteFiles: false,
  watchPaths: "/opt/server-engine/services\n/server-engine/www",
  customRules: "",
  retention: "14 days",
};

function readSettings() {
  try {
    return { ...defaults, ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" className="mt-1 h-4 w-4 cursor-pointer accent-blue-600" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{label}</span>{description && <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>}</span>
    </label>
  );
}

function Section({ title, description, children }) {
  return <section className="space-y-4"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>{description && <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}</div>{children}</section>;
}

function Row({ label, value }) {
  return <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 text-sm last:border-0 dark:border-slate-800"><span className="text-slate-500 dark:text-slate-400">{label}</span><span className="max-w-[72%] break-all text-right font-medium text-slate-900 dark:text-slate-100">{value || "—"}</span></div>;
}

function SaveFooter({ onSave, saving }) {
  return <div className="flex justify-end pt-2"><SaveButton onClick={onSave} saving={saving}>Save changes</SaveButton></div>;
}

export default function LinuxAuditConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed) ? installed[0] : installed;
  const [tab, setTab] = React.useState("overview");
  const [settings, setSettings] = React.useState(readSettings);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const version = current?.version || service?.version || "—";
  const set = (key, value) => setSettings((currentSettings) => ({ ...currentSettings, [key]: value }));
  const save = async () => {
    setSaving(true);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    setSaving(false);
    setToast({ type: "success", message: "Linux Audit policy saved." });
  };
  const reset = () => {
    setSettings(defaults);
    setToast({ type: "success", message: "Linux Audit defaults restored." });
  };

  const renderTab = () => {
    if (tab === "overview") return (
      <div className="space-y-6">
        <Section title="Audit coverage" description="Capture security-relevant activity without turning every system call into an unreadable event stream.">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Toggle label="Authentication events" description="Login, logout, failed authentication, and identity changes." checked={settings.loginEvents} onChange={(value) => set("loginEvents", value)} />
            <Toggle label="Identity and privilege changes" description="User, group, sudo, and privilege-related changes." checked={settings.identityChanges} onChange={(value) => set("identityChanges", value)} />
            <Toggle label="Privileged commands" description="Track selected privileged execution instead of every process." checked={settings.privilegeUse} onChange={(value) => set("privilegeUse", value)} />
            <Toggle label="Server Engine paths" description="Watch service configuration, runtime, and managed data paths." checked={settings.serviceFiles} onChange={(value) => set("serviceFiles", value)} />
            <Toggle label="Website files" description="Watch website roots for writes and permission changes." checked={settings.websiteFiles} onChange={(value) => set("websiteFiles", value)} />
          </div>
        </Section>
        <Section title="Audit state" description="Linux Audit writes kernel events through auditd. The panel reads the system audit stream; it does not replace the kernel audit subsystem.">
          <div className="border-y border-slate-200 dark:border-slate-800"><Row label="Status" value="Installed · check runtime state" /><Row label="Audit version" value={version} /><Row label="Audit log" value={settings.auditLog} /><Row label="Rules directory" value="/etc/audit/rules.d" /></div>
        </Section>
        <Section title="Policy safety" description="Locking rules with immutable mode is intentionally not enabled by default because changes require a reboot or kernel policy reset."><Toggle label="Lock policy after load" description="Equivalent to the audit -e 2 setting. Enable only after validating every rule." checked={settings.immutable} onChange={(value) => set("immutable", value)} /></Section>
        <SaveFooter onSave={save} saving={saving} />
      </div>
    );

    if (tab === "rules") return (
      <div className="space-y-6">
        <Section title="Kernel event limits" description="These values control how the kernel handles audit event pressure before auditd writes records to disk.">
          <div className="grid gap-4 sm:grid-cols-3"><Field label="Backlog limit" hint="Maximum queued audit records."><input className={inputClass} type="number" value={settings.backlog} onChange={(event) => set("backlog", event.target.value)} /></Field><Field label="Rate limit" hint="Events per second; 0 means unlimited."><input className={inputClass} type="number" value={settings.rateLimit} onChange={(event) => set("rateLimit", event.target.value)} /></Field><Field label="Failure mode"><select className={inputClass} value={settings.failureMode} onChange={(event) => set("failureMode", event.target.value)}><option value="0">Silent</option><option value="1">Print warning</option><option value="2">Panic</option></select></Field></div>
        </Section>
        <Section title="Watched directories" description="Each path becomes a file-system watch. Use narrow paths because recursive watches can generate significant volume.">
          <Field label="Paths to watch" hint="One directory or file per line."><textarea className={`${inputClass} min-h-28 font-mono text-xs`} value={settings.watchPaths} onChange={(event) => set("watchPaths", event.target.value)} /></Field>
          <Field label="Custom audit rules" hint="One audit.rules entry per line. The panel validates the format before applying it."><textarea className={`${inputClass} min-h-36 font-mono text-xs`} value={settings.customRules} placeholder="-w /etc/ssh/sshd_config -p wa -k ssh-config" onChange={(event) => set("customRules", event.target.value)} /></Field>
        </Section>
        <Section title="Generated rule file"><div className="border-y border-slate-200 dark:border-slate-800"><Row label="Managed file" value={settings.rulesFile} /><Row label="Compiler" value="augenrules" /><Row label="Loaded by" value="auditctl" /></div></Section>
        <SaveFooter onSave={save} saving={saving} />
      </div>
    );

    if (tab === "runtime") return (
      <div className="space-y-6">
        <Section title="Runtime status" description="auditd is a host audit daemon and is controlled by the operating system. These commands are provided for verification and policy reloads.">
          <div className="border-y border-slate-200 dark:border-slate-800"><Row label="Daemon" value="auditd" /><Row label="Rules compiler" value="/sbin/augenrules" /><Row label="Rule loader" value="/sbin/auditctl" /><Row label="State file" value="/var/run/auditd.state" /><Row label="Service account" value="root" /></div>
        </Section>
        <Section title="Verification commands"><div className="space-y-2 rounded-md bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-200"><p>auditctl -s</p><p>auditctl -l</p><p>augenrules --check</p><p>systemctl status auditd</p></div></Section>
        <Section title="Policy reload"><div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">Reloading rules can change what the host records immediately. Immutable mode prevents normal reloads, so validate the policy before locking it.</div></Section>
      </div>
    );

    return (
      <div className="space-y-6">
        <Section title="Audit records" description="Search and report tools read the audit stream; use the Logs page for the full paginated event view.">
          <div className="border-y border-slate-200 dark:border-slate-800"><Row label="Audit log" value={settings.auditLog} /><Row label="Search tool" value="ausearch" /><Row label="Report tool" value="aureport" /><Row label="Retention" value={settings.retention} /></div>
        </Section>
        <Section title="Common reports"><div className="space-y-2 rounded-md bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-200"><p>ausearch -ts today</p><p>ausearch -m USER_LOGIN --interpret</p><p>aureport --auth --summary</p><p>aureport --failed --summary</p></div></Section>
        <Section title="Log retention"><Field label="Retention policy"><select className={inputClass} value={settings.retention} onChange={(event) => set("retention", event.target.value)}><option>7 days</option><option>14 days</option><option>30 days</option><option>90 days</option></select></Field></Section>
        <SaveFooter onSave={save} saving={saving} />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <section className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="audit-title">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800"><div><div className="flex items-center gap-2"><ShieldCheck size={19} className="text-blue-600 dark:text-blue-400" /><h2 id="audit-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Linux Audit</h2><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Check size={13} />Installed</span></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kernel audit rules, privileged activity, authentication events, and audit records.</p></div><button type="button" aria-label="Close Linux Audit configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={onClose}><X size={18} /></button></div>
        <div className="flex gap-5 overflow-x-auto border-b border-slate-200 px-6 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800">{tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`${buttonClass} rounded-none border-b-2 px-1 pb-3 pt-0 ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}><Icon size={15} />{label}</button>)}</div>
        <div className="px-6 py-5">{renderTab()}</div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800"><button type="button" className={`${buttonClass} text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800`} onClick={reset}><Save size={15} />Restore defaults</button><span className="text-xs text-slate-500 dark:text-slate-400">Each tab has its own save action.</span></div>
      </section>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
