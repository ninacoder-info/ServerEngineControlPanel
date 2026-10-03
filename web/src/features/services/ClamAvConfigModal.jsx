import React from "react";
import {
  Activity,
  Check,
  Database,
  FileText,
  FolderSearch,
  Gauge,
  RefreshCw,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";

const STORAGE_KEY = "serverengine:clamav-config";
const LOG_ROOT = "/server-engine/logs/clamav";
const inputClass =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";
const tabs = [
  ["overview", "Overview", ShieldCheck],
  ["scanner", "Scanner", FolderSearch],
  ["definitions", "Definitions", Database],
  ["runtime", "Runtime", Activity],
  ["logs", "Error log", FileText],
];

const defaults = {
  databaseDirectory: "/opt/server-engine/services/clamav/data/database",
  scanSocket: "/opt/server-engine/services/clamav/run/clamd.sock",
  scanRoots: "/server-engine/www\n/opt/server-engine/services",
  quarantineDirectory: "/opt/server-engine/services/clamav/data/quarantine",
  exclusions: "/opt/server-engine/services/clamav/data\n/proc\n/sys\n/dev",
  maxFileSize: "100 MB",
  maxScanSize: "1 GB",
  maxRecursion: "16",
  logClean: false,
  scanArchives: true,
  scanMail: true,
  quarantineThreats: true,
  freshclamChecks: "12",
  bytecode: true,
  heuristicAlerts: true,
  logFile: `${LOG_ROOT}/clamd.log`,
  retention: "14 days",
};

function readSettings() {
  try {
    const settings = { ...defaults, ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") };
    if (settings.logFile?.startsWith("/opt/server-engine/services/clamav/logs/")) {
      settings.logFile = `${LOG_ROOT}/${settings.logFile.split("/").pop()}`;
    }
    return settings;
  } catch {
    return defaults;
  }
}

function Field({ label, hint, children }) {
  return <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}{children}{hint && <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">{hint}</span>}</label>;
}

function Toggle({ label, description, checked, onChange }) {
  return <label className="flex cursor-pointer items-start gap-3 py-1"><input type="checkbox" className="mt-1 h-4 w-4 cursor-pointer accent-blue-600" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span><span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</span>{description && <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">{description}</span>}</span></label>;
}

function Section({ title, description, children }) {
  return <section className="space-y-4"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>{description && <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">{description}</p>}</div>{children}</section>;
}

function Row({ label, value }) {
  return <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3 text-sm last:border-0 dark:border-neutral-800"><span className="text-neutral-500 dark:text-neutral-400">{label}</span><span className="max-w-[72%] break-all text-right font-medium text-neutral-900 dark:text-neutral-100">{value || "—"}</span></div>;
}

function SaveFooter({ onSave, saving }) {
  return <div className="flex justify-end pt-2"><SaveButton onClick={onSave} saving={saving}>Save changes</SaveButton></div>;
}

export default function ClamAvConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed) ? installed[0] : installed;
  const [tab, setTab] = React.useState("overview");
  const [settings, setSettings] = React.useState(readSettings);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const version = current?.version || service?.version || "—";
  const root = "/opt/server-engine/services/clamav";
  const set = (key, value) => setSettings((currentSettings) => ({ ...currentSettings, [key]: value }));
  const save = async () => {
    setSaving(true);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    setSaving(false);
    setToast({ type: "success", message: "ClamAV settings saved." });
  };
  const reset = () => {
    setSettings(defaults);
    setToast({ type: "success", message: "ClamAV defaults restored." });
  };

  const renderTab = () => {
    if (tab === "overview") return <div className="space-y-6"><Section title="Scanner profile" description="ClamAV combines clamd for repeated scans, freshclam for signature updates, and clamscan/clamdscan for one-off checks."><div className="grid gap-x-6 gap-y-3 sm:grid-cols-2"><Toggle label="Scan uploaded files" description="Use the daemon scanner for website and upload workflows." checked={true} onChange={() => {}} /><Toggle label="Scan mail content" description="Enable mail scanning when a mail transport is connected." checked={settings.scanMail} onChange={(value) => set("scanMail", value)} /><Toggle label="Scan archives" description="Inspect supported compressed and archive formats." checked={settings.scanArchives} onChange={(value) => set("scanArchives", value)} /><Toggle label="Quarantine detections" description="Move detected files to quarantine instead of deleting them." checked={settings.quarantineThreats} onChange={(value) => set("quarantineThreats", value)} /></div></Section><Section title="Service paths" description="Keep signatures, sockets, logs, and quarantine data in the managed ClamAV service directory."><div className="border-y border-neutral-200 dark:border-neutral-800"><Row label="Version" value={version} /><Row label="Database" value={settings.databaseDirectory} /><Row label="Daemon socket" value={settings.scanSocket} /><Row label="Quarantine" value={settings.quarantineDirectory} /><Row label="Log file" value={settings.logFile} /></div></Section><SaveFooter onSave={save} saving={saving} /></div>;

    if (tab === "scanner") return <div className="space-y-6"><Section title="Scan scope" description="Set the paths used by scheduled website and service scans. Keep exclusions narrow so important files are not skipped accidentally."><Field label="Scan roots" hint="One directory or file per line."><textarea className={`${inputClass} min-h-28 font-mono text-xs`} value={settings.scanRoots} onChange={(event) => set("scanRoots", event.target.value)} /></Field><Field label="Excluded paths" hint="One directory or file per line."><textarea className={`${inputClass} min-h-24 font-mono text-xs`} value={settings.exclusions} onChange={(event) => set("exclusions", event.target.value)} /></Field></Section><Section title="Resource limits" description="Limits prevent a large archive or deeply nested directory from consuming the whole server during a scan."><div className="grid gap-4 sm:grid-cols-3"><Field label="Maximum file size"><select className={inputClass} value={settings.maxFileSize} onChange={(event) => set("maxFileSize", event.target.value)}><option>25 MB</option><option>100 MB</option><option>250 MB</option><option>1 GB</option></select></Field><Field label="Maximum scan size"><select className={inputClass} value={settings.maxScanSize} onChange={(event) => set("maxScanSize", event.target.value)}><option>512 MB</option><option>1 GB</option><option>5 GB</option><option>Unlimited</option></select></Field><Field label="Maximum recursion"><select className={inputClass} value={settings.maxRecursion} onChange={(event) => set("maxRecursion", event.target.value)}><option>8</option><option>16</option><option>32</option><option>64</option></select></Field></div></Section><Section title="Detection output"><Toggle label="Log clean files" description="Disabled by default to keep audit and scanner logs useful." checked={settings.logClean} onChange={(value) => set("logClean", value)} /></Section><SaveFooter onSave={save} saving={saving} /></div>;

    if (tab === "definitions") return <div className="space-y-6"><Section title="Signature updates" description="freshclam downloads and validates current ClamAV databases, then notifies clamd to reload them."><div className="grid gap-4 sm:grid-cols-2"><Field label="Checks per day"><select className={inputClass} value={settings.freshclamChecks} onChange={(event) => set("freshclamChecks", event.target.value)}><option>4</option><option>12</option><option>24</option><option>48</option></select></Field><Field label="Database directory"><input className={`${inputClass} font-mono text-xs`} value={settings.databaseDirectory} onChange={(event) => set("databaseDirectory", event.target.value)} /></Field></div></Section><Section title="Detection engine"><div className="grid gap-x-6 gap-y-3 sm:grid-cols-2"><Toggle label="Bytecode signatures" description="Keep enabled for current detection coverage." checked={settings.bytecode} onChange={(value) => set("bytecode", value)} /><Toggle label="Heuristic alerts" description="Detect suspicious behavior beyond exact signatures." checked={settings.heuristicAlerts} onChange={(value) => set("heuristicAlerts", value)} /></div></Section><Section title="Update commands"><div className="space-y-2 rounded-md bg-neutral-950 p-4 font-mono text-xs leading-6 text-neutral-200"><p>freshclam --config-file={root}/conf/freshclam.conf</p><p>{root}/bin/clamdscan --fdpass &lt;path&gt;</p><p>{root}/bin/sigtool --info {settings.databaseDirectory}/main.cvd</p></div></Section><SaveFooter onSave={save} saving={saving} /></div>;

    if (tab === "runtime") return <div className="space-y-6"><Section title="Runtime components" description="The daemon handles repeated scans, while freshclam maintains the signature database. A command-line scan can run without a daemon."><div className="border-y border-neutral-200 dark:border-neutral-800"><Row label="Status" value="Installed · runtime check available" /><Row label="Daemon" value={`${root}/bin/clamd`} /><Row label="Daemon client" value={`${root}/bin/clamdscan`} /><Row label="One-off scanner" value={`${root}/bin/clamscan`} /><Row label="Updater" value={`${root}/bin/freshclam`} /><Row label="Run as" value="serverengine" /></div></Section><Section title="Verification commands"><div className="space-y-2 rounded-md bg-neutral-950 p-4 font-mono text-xs leading-6 text-neutral-200"><p>{root}/bin/clamd --version</p><p>{root}/bin/clamscan --version</p><p>{root}/bin/freshclam --version</p><p>{root}/bin/clamdscan --ping</p></div></Section><Section title="Socket"><Field label="Daemon socket" hint="The panel and website scanner use this socket for repeated scans."><input className={`${inputClass} font-mono text-xs`} value={settings.scanSocket} onChange={(event) => set("scanSocket", event.target.value)} /></Field></Section></div>;

    return <div className="space-y-6"><Section title="ClamAV logs" description="Review signature update failures, daemon startup issues, scan errors, and detected threats separately from website request logs."><div className="border-y border-neutral-200 dark:border-neutral-800"><Row label="Daemon log" value={settings.logFile} /><Row label="Updater log" value={`${LOG_ROOT}/freshclam.log`} /><Row label="Scan activity" value={`${LOG_ROOT}/scanner.log`} /><Row label="Retention" value={settings.retention} /></div></Section><Section title="Log retention"><Field label="Retention policy"><select className={inputClass} value={settings.retention} onChange={(event) => set("retention", event.target.value)}><option>7 days</option><option>14 days</option><option>30 days</option><option>90 days</option></select></Field></Section><SaveFooter onSave={save} saving={saving} /></div>;
  };

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"><section className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-neutral-900" role="dialog" aria-modal="true" aria-labelledby="clamav-title"><div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800"><div><div className="flex items-center gap-2"><ShieldCheck size={19} className="text-blue-600 dark:text-blue-400" /><h2 id="clamav-title" className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">ClamAV</h2><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Check size={13} />Installed</span></div><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Malware scanning, signature updates, quarantine, and file inspection.</p></div><button type="button" aria-label="Close ClamAV configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200" onClick={onClose}><X size={18} /></button></div><div className="flex gap-5 overflow-x-auto border-b border-neutral-200 px-6 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">{tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`${buttonClass} rounded-none border-b-2 px-1 pb-3 pt-0 ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}><Icon size={15} />{label}</button>)}</div><div className="px-6 py-5">{renderTab()}</div><div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-6 py-4 dark:border-neutral-800"><button type="button" className={`${buttonClass} text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800`} onClick={reset}><Save size={15} />Restore defaults</button><span className="text-xs text-neutral-500 dark:text-neutral-400">Each tab has its own save action.</span></div></section><Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} /></div>;
}
