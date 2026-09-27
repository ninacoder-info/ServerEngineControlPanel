import React from "react";
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CirclePlus,
  Cloud,
  Database,
  Download,
  HardDrive,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

const tabs = [
  ["overview", "Overview"],
  ["schedules", "Schedules"],
  ["archives", "Archives"],
  ["restore", "Restore"],
];
const initialArchives = [
  {
    id: 1,
    name: "server-engine-full-2026-09-26",
    scope: "Panel + websites",
    destination: "Local storage",
    size: "2.4 GB",
    created: "Today, 02:00",
    status: "Verified",
  },
  {
    id: 2,
    name: "websites-daily-2026-09-25",
    scope: "Websites + databases",
    destination: "Local storage",
    size: "1.8 GB",
    created: "Yesterday, 02:00",
    status: "Verified",
  },
  {
    id: 3,
    name: "panel-config-2026-09-24",
    scope: "Settings + certificates",
    destination: "S3 archive",
    size: "84 MB",
    created: "2 days ago",
    status: "Verified",
  },
];
const input =
  "mt-2 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const panel =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";

function BackupModal({ onClose, onCreate }) {
  const [form, setForm] = React.useState({
    scope: "websites",
    destination: "local",
    compression: "balanced",
  });
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate({
            id: crypto.randomUUID(),
            name: `manual-${new Date().toISOString().slice(0, 10)}`,
            scope: form.scope,
            destination:
              form.destination === "local" ? "Local storage" : "S3 archive",
            size: "Queued",
            created: "Just now",
            status: "Queued",
          });
          onClose();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Backup operation
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Create backup
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Choose what to capture and where the restore point should be
              stored.
            </p>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 space-y-5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Backup scope
            <select
              className={input}
              value={form.scope}
              onChange={(event) => change("scope", event.target.value)}
            >
              <option value="server">Full server state</option>
              <option value="websites">Websites and databases</option>
              <option value="panel">Panel configuration</option>
              <option value="database">Selected databases</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Destination
            <select
              className={input}
              value={form.destination}
              onChange={(event) => change("destination", event.target.value)}
            >
              <option value="local">Local backup storage</option>
              <option value="s3">S3-compatible archive</option>
              <option value="sftp">SFTP destination</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Compression profile
            <select
              className={input}
              value={form.compression}
              onChange={(event) => change("compression", event.target.value)}
            >
              <option value="balanced">Balanced</option>
              <option value="fast">Fastest</option>
              <option value="maximum">Smallest archive</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-500" />
          <span>
            The backup will be queued and verified after creation. Existing
            archives will not be overwritten.
          </span>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <CirclePlus size={16} />
            Start backup
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BackupsPage() {
  const [tab, setTab] = React.useState("overview");
  const [archives, setArchives] = React.useState(initialArchives);
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(false);
  const visible = archives.filter((item) =>
    `${item.name} ${item.scope} ${item.destination}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-7">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Data protection
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Backups
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500 dark:text-slate-400">
            Create verified restore points for websites, databases, panel
            settings, and certificates.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
            <RefreshCw size={16} />
            Run verification
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            onClick={() => setModal(true)}
          >
            <CirclePlus size={16} />
            Create backup
          </button>
        </div>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={panel}>
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-emerald-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Protection status
              </small>
              <strong className="mt-1 block text-xl text-emerald-600 dark:text-emerald-400">
                Healthy
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Last archive verified today
          </p>
        </div>
        <div className={panel}>
          <div className="flex items-center gap-3">
            <Archive className="text-blue-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Available archives
              </small>
              <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">
                {archives.length}
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Ready for restore
          </p>
        </div>
        <div className={panel}>
          <div className="flex items-center gap-3">
            <CalendarClock className="text-violet-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Next scheduled run
              </small>
              <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">
                02:00
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Daily · local server time
          </p>
        </div>
        <div className={panel}>
          <div className="flex items-center gap-3">
            <HardDrive className="text-amber-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Storage used
              </small>
              <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">
                4.3 GB
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Local and remote destinations
          </p>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 pt-5 dark:border-slate-800">
          <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`whitespace-nowrap border-b-2 px-4 pb-3 text-sm font-semibold ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tab === "overview" ? (
          <div className="grid gap-5 p-5 xl:grid-cols-[1.15fr_.85fr]">
            <div className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <HardDrive size={19} className="text-blue-500" />
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Backup destinations
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Keep more than one recovery path available.
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                  <span className="flex items-center gap-3">
                    <HardDrive size={17} className="text-slate-400" />
                    <span>
                      <strong className="block text-sm text-slate-800 dark:text-slate-200">
                        Local storage
                      </strong>
                      <small className="text-xs text-slate-500 dark:text-slate-400">
                        /var/lib/server-engine/backups
                      </small>
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Available
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-3">
                    <Cloud size={17} className="text-slate-400" />
                    <span>
                      <strong className="block text-sm text-slate-800 dark:text-slate-200">
                        S3 archive
                      </strong>
                      <small className="text-xs text-slate-500 dark:text-slate-400">
                        Remote destination not configured
                      </small>
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Not configured
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <CalendarClock size={19} className="text-violet-500" />
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Schedule policy
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Automated recovery coverage.
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                  <span>Website backups</span>
                  <strong className="text-slate-900 dark:text-slate-100">
                    Daily
                  </strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                  <span>Database backups</span>
                  <strong className="text-slate-900 dark:text-slate-100">
                    Daily
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Retention</span>
                  <strong className="text-slate-900 dark:text-slate-100">
                    30 days
                  </strong>
                </div>
              </div>
            </div>
          </div>
        ) : tab === "restore" ? (
          <div className="grid min-h-64 place-items-center p-8 text-center">
            <RotateCcw size={30} className="text-slate-400" />
            <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
              Choose an archive to restore
            </h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
              Restore workflows will let you preview files, select a scope, and
              confirm the destination before changing live data.
            </p>
          </div>
        ) : (
          <div className="p-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {tab === "archives" ? "Backup archives" : "Scheduled backups"}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {tab === "archives"
                    ? "Verified recovery points available on this server."
                    : "Automated jobs and their retention policy."}
                </p>
              </div>
              <label className="flex min-w-64 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-400 dark:border-slate-700 dark:bg-slate-950">
                <Search size={16} />
                <input
                  className="w-full bg-transparent text-sm text-slate-900 outline-none dark:text-slate-100"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search archives"
                />
              </label>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-3 py-3 font-semibold">Archive</th>
                    <th className="px-3 py-3 font-semibold">Scope</th>
                    <th className="px-3 py-3 font-semibold">Destination</th>
                    <th className="px-3 py-3 font-semibold">Size</th>
                    <th className="px-3 py-3 font-semibold">Created</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-3 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {item.name}
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {item.scope}
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {item.destination}
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {item.size}
                      </td>
                      <td className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400">
                        {item.created}
                      </td>
                      <td className="px-3 py-4">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={14} />
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-right">
                        <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                          <MoreHorizontal size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      {modal && (
        <BackupModal
          onClose={() => setModal(false)}
          onCreate={(archive) =>
            setArchives((current) => [archive, ...current])
          }
        />
      )}
    </div>
  );
}
