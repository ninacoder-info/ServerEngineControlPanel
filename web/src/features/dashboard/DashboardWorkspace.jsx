import {
  ArrowRight,
  BriefcaseBusiness,
  FilePlus2,
  FolderOpen,
  HardDrive,
  KeyRound,
  PackagePlus,
  Server,
  ShieldCheck,
} from "lucide-react";

function QuickAction({ icon: Icon, title, description, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/20"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-blue-950 dark:group-hover:text-blue-300">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </strong>
        <small className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </small>
      </span>
      <ArrowRight
        size={15}
        className="ml-auto mt-1 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-500"
      />
    </button>
  );
}

function Check({ icon: Icon, name, description, status = "Waiting" }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 py-3 last:border-0 dark:border-slate-800">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-medium text-slate-800 dark:text-slate-200">
          {name}
        </strong>
        <small className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
          {description}
        </small>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        {status}
      </span>
    </div>
  );
}

export default function DashboardWorkspace({ onNavigate }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Common tasks
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Quick actions
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Start the next hosting operation from one place.
            </p>
          </div>
          <BriefcaseBusiness size={20} className="text-slate-400" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <QuickAction
            icon={FilePlus2}
            title="Create website"
            description="Add a domain and document root."
            onClick={() => onNavigate("/websites")}
          />
          <QuickAction
            icon={PackagePlus}
            title="Install service"
            description="Add PHP, a database, or a cache."
            onClick={() => onNavigate("/services")}
          />
          <QuickAction
            icon={FolderOpen}
            title="Open file manager"
            description="Browse and manage server files."
            onClick={() => onNavigate("/file-manager")}
          />
          <QuickAction
            icon={KeyRound}
            title="Review security"
            description="Check access and session policy."
            onClick={() => onNavigate("/settings")}
          />
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Readiness
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              System checks
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Core areas monitored by the control plane.
            </p>
          </div>
          <ShieldCheck size={20} className="text-slate-400" />
        </div>
        <div className="mt-4">
          <Check
            icon={Server}
            name="Host agent"
            description="Connect a managed server to enable operations."
          />
          <Check
            icon={HardDrive}
            name="Storage policy"
            description="Disk and backup thresholds are ready."
            status="Configured"
          />
          <Check
            icon={ShieldCheck}
            name="Security baseline"
            description="Review authentication and network controls."
            status="Review"
          />
        </div>
      </div>
    </section>
  );
}
