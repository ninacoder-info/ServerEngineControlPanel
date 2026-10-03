import React from "react";
import { CheckCircle2, ChevronRight, Database, FolderKanban, Globe2, HardDrive, Mail, Package, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { apiRequest } from "../../lib/api";

const sources = {
  websites: "/api/v1/websites",
  services: "/api/v1/services/installed",
  databases: "/api/v1/databases/engines",
  firewall: "/api/v1/firewall",
  malware: "/api/v1/malware/status",
  shield: "/api/v1/application-shield/overview",
  backups: "/api/v1/backups",
  email: "/api/v1/email/summary",
};

const initialState = Object.fromEntries(Object.keys(sources).map((key) => [key, null]));

function SummaryCard({ icon: Icon, label, value, detail, tone = "neutral" }) {
  const tones = {
    neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
    good: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
  };
  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3"><span className={`grid h-9 w-9 place-items-center rounded-lg ${tones[tone] || tones.neutral}`}><Icon size={17} /></span><span className="text-right text-xs text-neutral-500 dark:text-neutral-400">{detail}</span></div>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">{value}</p>
    </article>
  );
}

function FeatureRow({ icon: Icon, name, detail, status, tone = "neutral", onClick }) {
  const statusClass = { good: "text-emerald-600 dark:text-emerald-400", warning: "text-amber-600 dark:text-amber-400", neutral: "text-neutral-500 dark:text-neutral-400" }[tone] || "text-neutral-500 dark:text-neutral-400";
  return (
    <button type="button" onClick={onClick} className={`group flex w-full items-center gap-3 border-b border-neutral-200 py-3 text-left last:border-0 dark:border-neutral-800 ${onClick ? "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50" : "cursor-default"}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"><Icon size={16} /></span>
      <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">{name}</strong><small className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">{detail}</small></span>
      <span className={`shrink-0 text-xs font-medium ${statusClass}`}>{status}</span>{onClick && <ChevronRight size={15} className="shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5 dark:text-neutral-500" />}
    </button>
  );
}

function OverviewSkeleton() {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading overview summary">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900" />)}</div>;
}

export default function OverviewSummary({ onNavigate }) {
  const [data, setData] = React.useState(initialState);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const requestId = React.useRef(0);
  const load = React.useCallback(async () => {
    const id = ++requestId.current;
    setRefreshing(true);
    const entries = await Promise.all(Object.entries(sources).map(async ([key, path]) => {
      try { const response = await apiRequest(path); if (!response.ok) return [key, { unavailable: true }]; return [key, await response.json()]; } catch { return [key, { unavailable: true }]; }
    }));
    if (id !== requestId.current) return;
    setData(Object.fromEntries(entries)); setLoading(false); setRefreshing(false);
  }, []);

  React.useEffect(() => {
    load();
    const events = ["serverengine:jobs-updated", "serverengine:service-status", "serverengine:activity", "serverengine:websites-updated", "serverengine:shield-updated", "serverengine:malware-schedule"];
    events.forEach((event) => window.addEventListener(event, load));
    return () => events.forEach((event) => window.removeEventListener(event, load));
  }, [load]);

  const websites = Array.isArray(data.websites) ? data.websites : [];
  const services = Array.isArray(data.services) ? data.services : [];
  const engines = Array.isArray(data.databases) ? data.databases : [];
  const databases = engines.filter((engine) => engine.running).length;
  const firewall = data.firewall; const malware = data.malware; const shield = data.shield;
  const backups = Array.isArray(data.backups) ? data.backups : []; const email = data.email;
  const firewallReady = firewall && !firewall.unavailable && firewall.enabled;
  const malwareReady = malware && !malware.unavailable && malware.ready && malware.signatures;
  const shieldReady = shield && !shield.unavailable && shield.engine?.installed;
  const backupFailures = backups.filter((backup) => String(backup.status).toLowerCase() === "failed").length;
  const go = (path) => onNavigate?.(path);
  if (loading) return <OverviewSkeleton />;

  return (
    <section className="space-y-5" aria-label="Server overview summary">
      <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Server overview</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Live status across the features connected to Server Engine.</p></div><button type="button" onClick={load} disabled={refreshing} title="Refresh overview" aria-label="Refresh overview" className="inline-flex cursor-pointer items-center justify-center rounded-md border border-neutral-300 p-2 text-neutral-600 hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /></button></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard icon={Globe2} label="Websites" value={websites.length} detail={`${websites.filter((site) => site.enabled !== false).length} active`} tone={websites.length ? "good" : "neutral"} /><SummaryCard icon={Package} label="Installed services" value={services.length} detail={`${services.filter((service) => service.status === "running").length} running`} tone={services.length ? "good" : "neutral"} /><SummaryCard icon={Database} label="Database engines" value={databases} detail={`${engines.filter((engine) => engine.installed).length} installed`} tone={databases ? "good" : "neutral"} /><SummaryCard icon={HardDrive} label="Backup archives" value={backups.length} detail={backupFailures ? `${backupFailures} need attention` : "Verified and managed here"} tone={backupFailures ? "warning" : backups.length ? "good" : "neutral"} /></div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"><div className="flex items-center gap-3"><FolderKanban size={18} className="text-neutral-500 dark:text-neutral-400" /><div><h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Operations</h3><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Important control-plane resources.</p></div></div><div className="mt-5"><FeatureRow icon={ShieldCheck} name="Firewall" detail={firewall?.unavailable ? "Unable to read firewall state" : firewallReady ? `${firewall.rules?.filter((rule) => rule.enabled).length || 0} active rules · ${firewall.blocked_states || 0} blocked states` : "nftables is not ready"} status={firewallReady ? "Protected" : "Needs setup"} tone={firewallReady ? "good" : "warning"} onClick={() => go("/firewall")} /><FeatureRow icon={ShieldAlert} name="Application Shield" detail={shield?.unavailable ? "Unable to read protection state" : shieldReady ? `${shield.connectors?.filter((connector) => connector.attached).length || 0} connectors attached` : "Install the engine and attach a web connector"} status={shieldReady ? "Available" : "Not ready"} tone={shieldReady ? "good" : "neutral"} onClick={() => go("/application-shield")} /><FeatureRow icon={ShieldCheck} name="Malware scanner" detail={malware?.unavailable ? "Unable to read scanner state" : malwareReady ? `${malware.latest?.files_scanned || 0} files in the latest scan` : "ClamAV signatures are not ready"} status={malwareReady ? "Ready" : "Not ready"} tone={malwareReady ? "good" : "warning"} onClick={() => go("/malware-scanner")} /><FeatureRow icon={HardDrive} name="Backups" detail={backups.length ? `${backups.length} recorded archives${backupFailures ? ` · ${backupFailures} failed` : ""}` : "No backup archives yet"} status={backupFailures ? "Review" : backups.length ? "Available" : "Not configured"} tone={backupFailures ? "warning" : backups.length ? "good" : "neutral"} onClick={() => go("/backups")} /></div></div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"><div className="flex items-center gap-3"><CheckCircle2 size={18} className="text-neutral-500 dark:text-neutral-400" /><div><h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Service coverage</h3><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">What is currently available to manage.</p></div></div><div className="mt-5"><FeatureRow icon={HardDrive} name="Host connection" detail="Local Server is the active control plane" status="Local" tone="good" onClick={() => go("/health")} /><FeatureRow icon={Mail} name="Email" detail={email?.unavailable ? "Mail summary unavailable" : `${email?.mailboxes || 0} mailboxes · ${email?.forwarders || 0} forwarders`} status={email?.unavailable ? "Unavailable" : "Available"} tone={email?.unavailable ? "warning" : "good"} onClick={() => go("/email")} /><FeatureRow icon={Database} name="Database inventory" detail={engines.length ? engines.map((engine) => `${engine.name}: ${engine.status}`).join(" · ") : "Database engine status unavailable"} status={engines.length ? "Connected" : "Unavailable"} tone={engines.length ? "good" : "warning"} onClick={() => go("/databases")} /><FeatureRow icon={CheckCircle2} name="Host resources" detail="Live CPU, memory, disk, and network metrics are shown above" status="Live" tone="good" onClick={() => go("/health")} /></div></div>
      </div>
    </section>
  );
}
