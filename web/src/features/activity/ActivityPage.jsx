import React from "react";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  FileCog,
  Globe2,
  Info,
  KeyRound,
  Package,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  TerminalSquare,
  UserRound,
  XCircle,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import { formatPanelDate } from "../../lib/panelPreferences";

const filters = [
  ["all", "All activity", ActivityIcon],
  ["websites", "Websites", Globe2],
  ["services", "Services", Package],
  ["security", "Security", ShieldCheck],
  ["access", "Access", UserRound],
  ["hosting", "Hosting", Globe2],
  ["system", "System", Server],
];

const seedEvents = [
  {
    id: "website-created",
    category: "websites",
    type: "Website created",
    actor: "admin",
    target: "checkout.example.com",
    detail: "Created a new website with Nginx and PHP 8.3.",
    time: "2026-09-27T09:32:00",
    status: "success",
    icon: Globe2,
    metadata: { "Project folder": "/server-engine/www/checkout", "Web server": "Nginx", Runtime: "PHP 8.3" },
  },
  {
    id: "php-started",
    category: "services",
    type: "Service started",
    actor: "server-engine",
    target: "PHP-FPM 8.3",
    detail: "Runtime started successfully and is ready for website requests.",
    time: "2026-09-27T09:18:00",
    status: "success",
    icon: Package,
    metadata: { Socket: "/opt/server-engine/services/php/versions/8.3/run/php-fpm.sock", Version: "8.3.33" },
  },
  {
    id: "ssh-login",
    category: "security",
    type: "SSH session opened",
    actor: "ubuntu",
    target: "Stugo Server",
    detail: "A remote terminal session was opened from 104.28.254.73.",
    time: "2026-09-27T09:04:00",
    status: "info",
    icon: TerminalSquare,
    metadata: { Address: "51.161.115.162", Method: "Password authentication", Session: "Live" },
  },
  {
    id: "backup-warning",
    category: "system",
    type: "Backup attention required",
    actor: "backup worker",
    target: "Daily website backup",
    detail: "The backup destination is nearing its configured storage limit.",
    time: "2026-09-27T08:40:00",
    status: "warning",
    icon: AlertTriangle,
    metadata: { Destination: "/server-engine/backups", Usage: "82%", Schedule: "Daily at 02:00" },
  },
  {
    id: "firewall-reloaded",
    category: "security",
    type: "Firewall policy reloaded",
    actor: "admin",
    target: "Firewall rules",
    detail: "The active policy was reloaded after a rule change.",
    time: "2026-09-27T08:12:00",
    status: "success",
    icon: ShieldCheck,
    metadata: { Rules: "4 enabled", Management: "Restricted", Result: "Applied" },
  },
  {
    id: "mysql-failed",
    category: "services",
    type: "Service start failed",
    actor: "server-engine",
    target: "MySQL 8.4",
    detail: "The service did not start. Review the service error log for details.",
    time: "2026-09-27T07:55:00",
    status: "error",
    icon: Database,
    metadata: { Service: "mysql", Port: "3307", Log: "/opt/server-engine/services/mysql/logs/error.log" },
  },
];

const statusStyles = {
  success: { label: "Completed", text: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  info: { label: "Information", text: "text-blue-600 dark:text-blue-400", icon: Info },
  warning: { label: "Needs attention", text: "text-amber-600 dark:text-amber-400", icon: AlertTriangle },
  error: { label: "Failed", text: "text-rose-600 dark:text-rose-400", icon: XCircle },
};

function formatTime(value) {
  return formatPanelDate(value);
}

function Summary({ icon: Icon, label, value, detail, tone = "slate" }) {
  const tones = {
    slate: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
  };
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-md ${tones[tone]}`}><Icon size={18} /></span>
        <span className="text-right"><strong className="block text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</strong><span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span></span>
      </div>
      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">{detail}</p>
    </div>
  );
}

function ActivityRow({ event, expanded, onExpand }) {
  const state = statusStyles[event.status] || statusStyles.info;
  const StateIcon = state.icon;
  const EventIcon = event.icon;
  return (
    <div className="border-b border-neutral-200 last:border-b-0 dark:border-neutral-800">
      <button type="button" className="flex w-full cursor-pointer items-start gap-3 px-1 py-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/40" onClick={onExpand}>
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"><EventIcon size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{event.type}</strong>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${state.text}`}><StateIcon size={13} />{state.label}</span>
          </span>
          <span className="mt-1 block text-sm text-neutral-600 dark:text-neutral-400">{event.detail}</span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-500"><span className="inline-flex items-center gap-1"><UserRound size={12} />{event.actor}</span><span>·</span><span>{event.target}</span></span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400"><span className="hidden sm:inline">{formatTime(event.time)}</span><ChevronDown size={15} className={`transition-transform ${expanded ? "rotate-180" : ""}`} /></span>
      </button>
      {expanded && <div className="ml-12 mb-4 grid gap-3 rounded-md bg-neutral-50 px-4 py-3 sm:grid-cols-3 dark:bg-neutral-950/60">{Object.entries(event.metadata).map(([key, value]) => <div key={key}><p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-500">{key}</p><p className="mt-1 break-words text-xs text-neutral-700 dark:text-neutral-300">{value}</p></div>)}</div>}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading activity logs">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="space-y-3"><div className="h-4 w-36 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-9 w-32 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-4 w-96 max-w-full rounded bg-neutral-100 dark:bg-neutral-800/70" /></div>
        <div className="flex gap-2"><div className="h-9 w-28 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="h-9 w-24 rounded bg-neutral-200 dark:bg-neutral-800" /></div>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"><div className="flex justify-between"><div className="h-9 w-9 rounded-md bg-neutral-100 dark:bg-neutral-800/70" /><div className="h-7 w-12 rounded bg-neutral-200 dark:bg-neutral-800" /></div><div className="mt-3 h-3 w-24 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="mt-2 h-3 w-36 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div>)}</section>
      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"><div className="flex gap-6 border-b border-neutral-200 px-4 pt-4 dark:border-neutral-800">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="mb-3 h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />)}</div><div className="p-4"><div className="flex justify-between gap-4"><div className="space-y-2"><div className="h-5 w-36 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-3 w-64 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div><div className="h-9 w-80 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div><div className="mt-5 divide-y divide-neutral-100 dark:divide-neutral-800">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="flex items-start gap-3 py-5"><div className="h-9 w-9 shrink-0 rounded-md bg-neutral-100 dark:bg-neutral-800/70" /><div className="flex-1 space-y-2"><div className="h-4 w-56 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-3 w-full max-w-xl rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="h-3 w-40 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div><div className="h-3 w-24 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div>)}</div></div></section>
    </div>
  );
}

export default function ActivityPage() {
  const [activeFilter, setActiveFilter] = React.useState("all");
  const [range, setRange] = React.useState("24h");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState(null);
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const icons = { websites: Globe2, services: Package, security: ShieldCheck, access: UserRound, hosting: Globe2, system: Server };
  const loadActivity = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest(`/api/v1/activity?range=${range}`);
      if (!response.ok) throw new Error(await readApiError(response, "Could not load activity"));
      const data = await response.json();
      setEvents(data.map((event) => ({ ...event, icon: icons[event.category] || FileCog })));
    } catch (error) {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [range]);
  React.useEffect(() => { loadActivity(); }, [loadActivity]);
  React.useEffect(() => {
    const onActivity = (event) => {
      const next = event.detail;
      if (!next) return;
      setEvents((current) => [{ ...next, icon: icons[next.category] || FileCog }, ...current.filter((item) => item.id !== next.id)].slice(0, 1000));
    };
    const onJobs = () => loadActivity();
    window.addEventListener("serverengine:activity", onActivity);
    window.addEventListener("serverengine:jobs-updated", onJobs);
    return () => { window.removeEventListener("serverengine:activity", onActivity); window.removeEventListener("serverengine:jobs-updated", onJobs); };
  }, [loadActivity]);
  const visible = events.filter((event) => (activeFilter === "all" || event.category === activeFilter) && (status === "all" || event.status === status) && `${event.type} ${event.actor} ${event.target} ${event.detail}`.toLowerCase().includes(query.toLowerCase()));
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageEvents = visible.slice((page - 1) * pageSize, page * pageSize);
  React.useEffect(() => { setPage(1); setExpanded(null); }, [activeFilter, range, query, status]);
  React.useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  const attention = events.filter((event) => event.status === "warning" || event.status === "error").length;
  if (loading && !events.length) return <ActivitySkeleton />;
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-sm font-medium text-blue-600 dark:text-blue-400">Operations center</p><h2 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Activity</h2><p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">A clear record of changes, service operations, security events, and account activity across this server.</p></div>
        <div className="flex items-center gap-2"><label className="sr-only" htmlFor="activity-range">Activity range</label><select id="activity-range" value={range} onChange={(event) => setRange(event.target.value)} className="cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All activity</option></select><button type="button" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800" onClick={loadActivity}><RefreshCw className={loading ? "animate-spin" : ""} size={15} />Refresh</button></div>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Summary icon={ActivityIcon} label="Events in range" value={visible.length} detail="Recorded control-plane activity" tone="blue" /><Summary icon={CheckCircle2} label="Completed" value={events.filter((event) => event.status === "success").length} detail="Successful operations and changes" tone="emerald" /><Summary icon={AlertTriangle} label="Needs attention" value={attention} detail="Warnings and failed operations" tone="amber" /><Summary icon={Clock3} label="Latest event" value="Just now" detail="Activity feed is ready for live events" /></section>
      <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 px-4 pt-4 dark:border-neutral-800"><div className="flex gap-5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{filters.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setActiveFilter(id)} className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${activeFilter === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"}`}><Icon size={15} />{label}</button>)}</div></div>
        <div className="p-4"><div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Recent activity</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Select an event to inspect the recorded context.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="flex min-w-64 items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-neutral-400 dark:border-neutral-700"><Search size={15} /><input className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"><option value="all">All statuses</option><option value="success">Completed</option><option value="info">Information</option><option value="warning">Needs attention</option><option value="error">Failed</option></select><button type="button" title="Export activity" aria-label="Export activity" className="inline-flex cursor-pointer items-center justify-center rounded-md border border-neutral-300 px-3 py-2 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800" onClick={() => { const rows = visible.map((event) => [event.time, event.status, event.type, event.actor, event.target, event.detail]); const csv = [["Time", "Status", "Type", "Actor", "Target", "Details"], ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = "server-engine-activity.csv"; link.click(); URL.revokeObjectURL(url); }}><ArrowDownToLine size={16} /></button></div></div><div className="mt-4">{loading ? <div className="py-14 text-center text-sm text-neutral-500 dark:text-neutral-400">Loading activity…</div> : pageEvents.length ? pageEvents.map((event) => <ActivityRow key={event.id} event={event} expanded={expanded === event.id} onExpand={() => setExpanded(expanded === event.id ? null : event.id)} />) : <div className="py-14 text-center"><ActivityIcon className="mx-auto text-neutral-300 dark:text-neutral-700" size={28} /><p className="mt-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">No activity matches these filters</p><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Try another category, status, or search term.</p></div>}</div>{visible.length > 0 && <div className="mt-4 flex items-center justify-between border-t border-neutral-200 pt-3 dark:border-neutral-800"><span className="text-xs text-neutral-500 dark:text-neutral-400">Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, visible.length)} of {visible.length}</span><div className="flex items-center gap-1"><button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"><ChevronLeft size={16} /></button><span className="min-w-16 text-center text-xs font-medium text-neutral-600 dark:text-neutral-300">Page {page} of {pageCount}</span><button type="button" aria-label="Next page" disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"><ChevronRight size={16} /></button></div></div>}</div>
      </section>
    </div>
  );
}
