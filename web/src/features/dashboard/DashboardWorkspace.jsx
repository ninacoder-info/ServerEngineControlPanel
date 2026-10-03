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
import { useTranslation } from "../../lib/i18n";

function QuickAction({ icon: Icon, title, description, href, onNavigate }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(href)}
      className="group flex w-full cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-600 group-hover:bg-neutral-200 group-hover:text-neutral-900 dark:bg-neutral-800 dark:text-neutral-300 dark:group-hover:bg-neutral-700 dark:group-hover:text-neutral-100">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </strong>
        <small className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          {description}
        </small>
      </span>
      <ArrowRight
        size={15}
        className="ml-auto mt-1 shrink-0 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700 dark:group-hover:text-neutral-200"
      />
    </button>
  );
}

function Check({ icon: Icon, name, description, status = "Waiting" }) {
  return (
    <div className="flex items-center gap-3 border-b border-neutral-200 py-3 last:border-0 dark:border-neutral-800">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {name}
        </strong>
        <small className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">
          {description}
        </small>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
        {status}
      </span>
    </div>
  );
}

export default function DashboardWorkspace({ onNavigate }) {
  const { t } = useTranslation();
  return (
    <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {t("dashboard.commonTasks")}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {t("dashboard.quickActions")}
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {t("dashboard.quickActionsDescription")}
            </p>
          </div>
          <BriefcaseBusiness size={20} className="text-neutral-400" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <QuickAction
            icon={FilePlus2}
            title={t("dashboard.createWebsite")}
            description={t("dashboard.createWebsiteDescription")}
            href="/websites"
            onNavigate={onNavigate}
          />
          <QuickAction
            icon={PackagePlus}
            title={t("dashboard.installService")}
            description={t("dashboard.installServiceDescription")}
            href="/services"
            onNavigate={onNavigate}
          />
          <QuickAction
            icon={FolderOpen}
            title={t("dashboard.openFileManager")}
            description={t("dashboard.openFileManagerDescription")}
            href="/file-manager"
            onNavigate={onNavigate}
          />
          <QuickAction
            icon={KeyRound}
            title={t("dashboard.reviewSecurity")}
            description={t("dashboard.reviewSecurityDescription")}
            href="/settings"
            onNavigate={onNavigate}
          />
        </div>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {t("dashboard.readiness")}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {t("dashboard.systemChecks")}
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {t("dashboard.systemChecksDescription")}
            </p>
          </div>
          <ShieldCheck size={20} className="text-neutral-400" />
        </div>
        <div className="mt-4">
          <Check
            icon={Server}
            name={t("dashboard.hostAgent")}
            description={t("dashboard.hostAgentDescription")}
            status={t("dashboard.waiting")}
          />
          <Check
            icon={HardDrive}
            name={t("dashboard.storagePolicy")}
            description={t("dashboard.storagePolicyDescription")}
            status={t("dashboard.configured")}
          />
          <Check
            icon={ShieldCheck}
            name={t("dashboard.securityBaseline")}
            description={t("dashboard.securityBaselineDescription")}
            status={t("dashboard.review")}
          />
        </div>
      </div>
    </section>
  );
}
