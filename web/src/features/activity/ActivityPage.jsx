import React from "react";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
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
import { apiRequest } from "../../lib/api";
import { formatPanelDate } from "../../lib/panelPreferences";

const filters = [
  ["all", "All activity", ActivityIcon],
  ["websites", "Websites", Globe2],
  ["services", "Services", Package],
  ["security", "Security", ShieldCheck],
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
    metadata: { Destination: "/var/lib/server-engine/backups", Usage: "82%", Schedule: "Daily at 02:00" },
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
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-md ${tones[tone]}`}><Icon size={18} /></span>
        <span className="text-right"><strong className="block text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</strong><span className="text-xs text-slate-500 dark:text-slate-400">{label}</span></span>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

function ActivityRow({ event, expanded, onExpand }) {
  const state = statusStyles[event.status] || statusStyles.info;
  const StateIcon = state.icon;
  const EventIcon = event.icon;
  return (
    <div className="border-b border-slate-200 last:border-b-0 dark:border-slate-800">
      <button type="button" className="flex w-full cursor-pointer items-start gap-3 px-1 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={onExpand}>
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><EventIcon size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="text-sm font-semibold text-slate-900 dark:text-slate-100">{event.type}</strong>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${state.text}`}><StateIcon size={13} />{state.label}</span>
          </span>
          <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">{event.detail}</span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-500"><span className="inline-flex items-center gap-1"><UserRound size={12} />{event.actor}</span><span>·</span><span>{event.target}</span></span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><span className="hidden sm:inline">{formatTime(event.time)}</span><ChevronDown size={15} className={`transition-transform ${expanded ? "rotate-180" : ""}`} /></span>
      </button>
      {expanded && <div className="ml-12 mb-4 grid gap-3 rounded-md bg-slate-50 px-4 py-3 sm:grid-cols-3 dark:bg-slate-950/60">{Object.entries(event.metadata).map(([key, value]) => <div key={key}><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">{key}</p><p className="mt-1 break-words text-xs text-slate-700 dark:text-slate-300">{value}</p></div>)}</div>}
    </div>
  );
}

export default function ActivityPage() {
  const [activeFilter, setActiveFilter] = React.useState("all");
  const [range, setRange] = React.useState("24h");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [expanded, setExpanded] = React.useState(null);
  const [jobs, setJobs] = React.useState([]);
  React.useEffect(() => {
    apiRequest("/api/v1/jobs").then((response) => response.ok ? response.json() : []).then(setJobs).catch(() => {});
  }, []);
  const jobEvents = jobs.map((job) => ({ id: `job-${job.id}`, category: "services", type: job.type, actor: "server-engine", target: job.service || "Managed service", detail: job.message || "A managed operation was recorded.", time: job.updated_at || job.created_at, status: job.status === "failed" ? "error" : job.status === "succeeded" ? "success" : "info", icon: FileCog, metadata: { Status: job.status, Job: job.id, Details: job.message || "No additional details" } }));
  const events = [...jobEvents, ...seedEvents];
  const visible = events.filter((event) => (activeFilter === "all" || event.category === activeFilter) && (status === "all" || event.status === status) && `${event.type} ${event.actor} ${event.target} ${event.detail}`.toLowerCase().includes(query.toLowerCase()));
  const attention = events.filter((event) => event.status === "warning" || event.status === "error").length;
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-sm font-medium text-blue-600 dark:text-blue-400">Operations center</p><h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Activity</h2><p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">A clear record of changes, service operations, security events, and account activity across this server.</p></div>
        <div className="flex items-center gap-2"><label className="sr-only" htmlFor="activity-range">Activity range</label><select id="activity-range" value={range} onChange={(event) => setRange(event.target.value)} className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All activity</option></select><button type="button" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => window.location.reload()}><RefreshCw size={15} />Refresh</button></div>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Summary icon={ActivityIcon} label="Events in range" value={visible.length} detail="Recorded control-plane activity" tone="blue" /><Summary icon={CheckCircle2} label="Completed" value={events.filter((event) => event.status === "success").length} detail="Successful operations and changes" tone="emerald" /><Summary icon={AlertTriangle} label="Needs attention" value={attention} detail="Warnings and failed operations" tone="amber" /><Summary icon={Clock3} label="Latest event" value="Just now" detail="Activity feed is ready for live events" /></section>
      <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 pt-4 dark:border-slate-800"><div className="flex gap-5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{filters.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setActiveFilter(id)} className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${activeFilter === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}><Icon size={15} />{label}</button>)}</div></div>
        <div className="p-4"><div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Recent activity</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Select an event to inspect the recorded context.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="flex min-w-64 items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-slate-400 dark:border-slate-700"><Search size={15} /><input className="w-full bg-transparent text-sm text-slate-900 outline-none dark:text-slate-100" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><option value="all">All statuses</option><option value="success">Completed</option><option value="info">Information</option><option value="warning">Needs attention</option><option value="error">Failed</option></select><button type="button" title="Export activity" aria-label="Export activity" className="inline-flex cursor-pointer items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><ArrowDownToLine size={16} /></button></div></div><div className="mt-4">{visible.length ? visible.map((event) => <ActivityRow key={event.id} event={event} expanded={expanded === event.id} onExpand={() => setExpanded(expanded === event.id ? null : event.id)} />) : <div className="py-14 text-center"><ActivityIcon className="mx-auto text-slate-300 dark:text-slate-700" size={28} /><p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">No activity matches these filters</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Try another category, status, or search term.</p></div>}</div></div>
      </section>
    </div>
  );
}
