import React from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Activity,
  Folder,
  History,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from "lucide-react";
import Toast from "../../components/Toast";
import ActionDialog from "../../components/ActionDialog";
import FormField, { formControlClass } from "../../components/FormField";
import { apiRequest } from "../../lib/api";
import ServiceNotInstalledState from "../../components/ServiceNotInstalledState";
import ServiceStoppedState from "../../components/ServiceStoppedState";
import { useServiceInstallationState } from "../../hooks/useServiceInstallationState";
import { FolderPicker } from "../websites/WebsiteFormModal";
import SupervisorConfigModal from "./SupervisorConfigModal";

function FolderPickerPortal(props) {
  return createPortal(<FolderPicker {...props} />, document.body);
}

function ProgramModalPortal({ editing, onClose, onSave }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex min-h-screen items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="my-0 w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl dark:bg-neutral-900 sm:my-2">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Process management
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {editing.id ? "Edit program" : "Add program"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Configure the command, working directory, process count, and
              restart policy.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close program form"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto p-5">
          <ProgramForm
            program={editing.id ? editing : null}
            onSave={onSave}
            onCancel={onClose}
          />
        </div>
      </section>
    </div>,
    document.body,
  );
}

function SupervisorSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading Supervisor">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="space-y-3">
          <div className="h-4 w-28 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-9 w-36 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-96 max-w-full rounded bg-neutral-100 dark:bg-neutral-800/70" />
        </div>
        <div className="h-10 w-32 rounded-md bg-neutral-200 dark:bg-neutral-800" />
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="h-5 w-5 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="mt-3 h-7 w-16 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="mt-2 h-3 w-24 rounded bg-neutral-100 dark:bg-neutral-800/70" />
          </div>
        ))}
      </section>
      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex gap-6 border-b border-neutral-200 pb-3 dark:border-neutral-800">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-800"
            />
          ))}
        </div>
        <div className="mt-6 flex justify-between gap-4">
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-3 w-72 rounded bg-neutral-100 dark:bg-neutral-800/70" />
          </div>
          <div className="h-9 w-72 rounded bg-neutral-100 dark:bg-neutral-800/70" />
        </div>
        <div className="mt-5 overflow-hidden">
          <div className="grid grid-cols-5 gap-4 border-b border-neutral-200 px-3 py-3 dark:border-neutral-800">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-3 rounded bg-neutral-100 dark:bg-neutral-800/70"
              />
            ))}
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="grid grid-cols-5 items-center gap-4 px-3 py-5"
              >
                <div className="h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-3 w-40 rounded bg-neutral-100 dark:bg-neutral-800/70" />
                <div className="h-3 w-12 rounded bg-neutral-100 dark:bg-neutral-800/70" />
                <div className="h-4 w-16 rounded bg-neutral-100 dark:bg-neutral-800/70" />
                <div className="ml-auto h-8 w-24 rounded bg-neutral-100 dark:bg-neutral-800/70" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";
const programSchema = z
  .object({
    id: z.string(),
    name: z.string().trim().min(1, "Enter a program name."),
    group: z.string().min(1),
    manager: z.enum(["supervisor", "pm2"]),
    phpVersion: z.string(),
    nodeVersion: z.string(),
    pm2Version: z.string(),
    command: z.string().trim().min(1, "Enter a start command."),
    directory: z.string().trim().min(1, "Choose a working directory."),
    user: z.string().min(1),
    processes: z.coerce
      .number()
      .int("Use a whole number of processes.")
      .min(1, "Use at least one process.")
      .max(64, "Use no more than 64 processes."),
    autostart: z.boolean(),
    autorestart: z.boolean(),
    status: z.string(),
  })
  .superRefine((value, context) => {
    if (value.manager === "supervisor" && !value.phpVersion)
      context.addIssue({
        code: "custom",
        path: ["phpVersion"],
        message: "Install a PHP runtime before selecting it.",
      });
    if (value.manager === "pm2" && !value.nodeVersion)
      context.addIssue({
        code: "custom",
        path: ["nodeVersion"],
        message: "Install a Node.js runtime before selecting it.",
      });
    if (value.manager === "pm2" && !value.pm2Version)
      context.addIssue({
        code: "custom",
        path: ["pm2Version"],
        message: "Install PM2 before selecting it.",
      });
  });

function ProgramForm({ program, onSave, onCancel }) {
  const initialValues = {
    id: `program-${Date.now()}`,
    name: "",
    group: "Website",
    manager: "supervisor",
    phpVersion: "",
    nodeVersion: "",
    pm2Version: "",
    command: "",
    directory: "/server-engine/www",
    user: "serverengine",
    processes: 1,
    autostart: true,
    autorestart: true,
    status: "stopped",
    ...program,
  };
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(programSchema),
    defaultValues: initialValues,
  });
  const form = watch();
  const set = (key, value) =>
    setValue(key, value, { shouldDirty: true, shouldValidate: true });
  const commandHint =
    form.manager === "pm2"
      ? "Enter the Node.js start command managed by PM2, for example node /server-engine/www/example.com/queue-worker.js."
      : "Enter the full command that should stay running, for example php artisan queue:work or python worker.py.";
  const commandPlaceholder =
    form.manager === "pm2"
      ? "node /server-engine/www/example.com/queue-worker.js"
      : "php artisan queue:work";
  const [runtimes, setRuntimes] = React.useState([]);
  const [phpVersions, setPhpVersions] = React.useState([]);
  const [pm2Versions, setPm2Versions] = React.useState([]);
  const [folderOpen, setFolderOpen] = React.useState(false);

  React.useEffect(() => {
    apiRequest("/api/v1/services/installed")
      .then(async (installedResponse) => {
        const installed = installedResponse.ok
          ? await installedResponse.json()
          : [];
        const sortVersions = (items) =>
          [...items].sort((a, b) =>
            String(b.version).localeCompare(String(a.version), undefined, {
              numeric: true,
            }),
          );
        const php = sortVersions(
          installed.filter(
            (item) => item.id === "php" || item.id.startsWith("php@"),
          ),
        );
        const node = sortVersions(
          installed.filter(
            (item) => item.id === "nodejs" || item.id.startsWith("nodejs@"),
          ),
        );
        setPhpVersions(php);
        setRuntimes(node);
        if (!form.phpVersion && php[0]?.version)
          setValue("phpVersion", php[0].version);
        if (!form.nodeVersion && node[0]?.version)
          setValue("nodeVersion", node[0].version);
        const pm2 = installed.find((item) => item.id === "pm2");
        setPm2Versions(pm2 ? [pm2] : []);
        if (pm2 && !form.pm2Version) setValue("pm2Version", pm2.version || "");
      })
      .catch(() => {});
  }, []);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (event.target !== event.currentTarget) return;
        handleSubmit(onSave)(event);
      }}
    >
      <div className="grid items-start gap-4 sm:grid-cols-3">
        <FormField label="Program name" error={errors.name?.message}>
          <input
            className={inputClass}
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="Laravel worker"
          />
        </FormField>
        <FormField label="Category">
          <select
            className={inputClass}
            value={form.group}
            onChange={(event) => set("group", event.target.value)}
          >
            <option>Website</option>
            <option>Queue workers</option>
            <option>System</option>
            <option>Custom</option>
          </select>
        </FormField>
        <FormField label="Process manager">
          <select
            className={inputClass}
            value={form.manager}
            onChange={(event) => set("manager", event.target.value)}
          >
            <option value="supervisor">Supervisor</option>
            <option value="pm2">PM2 · Node.js</option>
          </select>
        </FormField>
      </div>
      <FormField label="Working directory" error={errors.directory?.message}>
        <div className="mt-1.5 flex items-stretch gap-2">
          <input
            readOnly
            className={formControlClass(
              `${inputClass.replace("mt-1.5 ", "")} h-10 min-h-0 min-w-0 w-auto flex-1`,
              errors.directory,
            )}
            value={form.directory}
          />
          <button
            type="button"
            className={`${buttonClass} h-10 shrink-0 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
            onClick={() => setFolderOpen(true)}
          >
            <Folder size={15} />
            Browse
          </button>
        </div>
      </FormField>
      <div
        className={
          form.manager === "supervisor"
            ? "grid gap-4 sm:grid-cols-[2fr_1fr]"
            : ""
        }
      >
        <FormField
          label="Start command"
          hint={commandHint}
          error={errors.command?.message}
        >
          <input
            className={`${inputClass} font-mono`}
            value={form.command}
            onChange={(event) => set("command", event.target.value)}
            placeholder={commandPlaceholder}
          />
        </FormField>
        {form.manager === "supervisor" && (
          <FormField label="PHP version" error={errors.phpVersion?.message}>
            <select
              className={inputClass}
              value={form.phpVersion}
              onChange={(event) => set("phpVersion", event.target.value)}
            >
              {!phpVersions.length && (
                <option value="">No installed PHP versions</option>
              )}
              {phpVersions.map((runtime) => (
                <option key={runtime.id} value={runtime.version}>
                  PHP {runtime.version}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </div>
      {form.manager === "pm2" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Node.js version"
            error={errors.nodeVersion?.message}
          >
            <select
              className={inputClass}
              value={form.nodeVersion}
              onChange={(event) => set("nodeVersion", event.target.value)}
            >
              {!runtimes.length && (
                <option value="">No installed Node.js versions</option>
              )}
              {runtimes.map((runtime) => (
                <option key={runtime.id} value={runtime.version}>
                  Node.js {runtime.version}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="PM2 version" error={errors.pm2Version?.message}>
            <select
              className={inputClass}
              value={form.pm2Version}
              onChange={(event) => set("pm2Version", event.target.value)}
            >
              {!pm2Versions.length && (
                <option value="">No installed PM2 version</option>
              )}
              {pm2Versions.map((runtime) => (
                <option
                  key={runtime.id || runtime.version}
                  value={runtime.version}
                >
                  {runtime.version}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Run as user">
          <select
            className={inputClass}
            value={form.user}
            onChange={(event) => set("user", event.target.value)}
          >
            <option value="serverengine">serverengine</option>
            <option value="www-data">www-data</option>
            <option value="root">root</option>
          </select>
        </FormField>
        <FormField label="Process count" error={errors.processes?.message}>
          <input
            className={inputClass}
            type="number"
            min="1"
            max="64"
            value={form.processes}
            onChange={(event) => set("processes", Number(event.target.value))}
          />
        </FormField>
      </div>
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-blue-600"
            checked={form.autostart}
            onChange={(event) => set("autostart", event.target.checked)}
          />
          Start automatically with Server Engine
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-blue-600"
            checked={form.autorestart}
            onChange={(event) => set("autorestart", event.target.checked)}
          />
          Restart after unexpected exit
        </label>
      </div>
      {folderOpen && (
        <FolderPickerPortal
          value={form.directory}
          defaultRoot="/server-engine/www"
          onSelect={(path) => {
            set("directory", path);
            setFolderOpen(false);
          }}
          onClose={() => setFolderOpen(false)}
        />
      )}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          className={`${buttonClass} border border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300`}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
        >
          Save program
        </button>
      </div>
    </form>
  );
}

export default function SupervisorWorkspace() {
  const supervisorState = useServiceInstallationState("supervisor");
  const [programs, setPrograms] = React.useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("serverengine:supervisor-programs") || "[]",
      );
      return Array.isArray(saved)
        ? saved.filter(
            (item) =>
              !["laravel-worker", "laravel-scheduler"].includes(item.id),
          )
        : [];
    } catch {
      return [];
    }
  });
  const [editing, setEditing] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const [group, setGroup] = React.useState("All programs");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [confirmDialog, setConfirmDialog] = React.useState(null);
  const [configOpen, setConfigOpen] = React.useState(false);

  const savePrograms = (next) => {
    setPrograms(next);
    localStorage.setItem(
      "serverengine:supervisor-programs",
      JSON.stringify(next),
    );
  };
  React.useEffect(() => {
    localStorage.setItem(
      "serverengine:supervisor-programs",
      JSON.stringify(programs),
    );
  }, [programs]);
  const saveProgram = (program) => {
    savePrograms(
      programs.some((item) => item.id === program.id)
        ? programs.map((item) => (item.id === program.id ? program : item))
        : [...programs, program],
    );
    setEditing(null);
    setMessage(`${program.name} saved.`);
  };
  const toggle = (program) => {
    const status = program.status === "running" ? "stopped" : "running";
    savePrograms(
      programs.map((item) =>
        item.id === program.id ? { ...item, status } : item,
      ),
    );
    setMessage(
      `${program.name} ${status === "running" ? "started" : "stopped"}.`,
    );
  };
  const groups = [
    "All programs",
    "Website",
    "Queue workers",
    "System",
    "Custom",
  ];
  const visiblePrograms = programs.filter(
    (program) =>
      (group === "All programs" || program.group === group) &&
      (status === "all" ||
        (status === "running"
          ? program.status === "running"
          : program.status !== "running")) &&
      `${program.name} ${program.command} ${program.user} ${program.group}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  if (supervisorState.loading || !supervisorState.installed) {
    if (supervisorState.loading) return <SupervisorSkeleton />;
    return (
      <ServiceNotInstalledState
        state={supervisorState}
        icon={Server}
        eyebrow="Process management"
        title="Supervisor is not installed"
        description="Install Supervisor to keep queue workers, schedulers, and long-running application processes alive with restart policies and logs."
        installLabel="Install Supervisor"
      />
    );
  }

  if (!supervisorState.running) {
    return (
      <>
        <ServiceStoppedState
          icon={Server}
          eyebrow="Process manager stopped"
          title="Supervisor is not running"
          description="Start Supervisor before managing queue workers, schedulers, and long-running application processes."
          configureLabel="Configure"
          onConfigure={() => setConfigOpen(true)}
          onCheck={supervisorState.loadStatus}
        />
        {configOpen && (
          <SupervisorConfigModal
            service={{ id: "supervisor", name: "Supervisor" }}
            installed={[{ status: "stopped" }]}
            onClose={() => setConfigOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Automation
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Supervisor
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            Keep queue workers, schedulers, and long-running application
            processes alive with restart policies and logs.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={() => setEditing({})}
        >
          <Plus size={16} />
          Add program
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <Activity className="text-blue-600 dark:text-blue-400" size={19} />
            <div>
              <strong className="block text-2xl text-neutral-900 dark:text-neutral-100">
                {programs.length}
              </strong>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Programs
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <Play
              className="text-emerald-600 dark:text-emerald-400"
              size={19}
            />
            <div>
              <strong className="block text-2xl text-neutral-900 dark:text-neutral-100">
                {programs.filter((item) => item.status === "running").length}
              </strong>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Running
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <RefreshCw className="text-neutral-500" size={19} />
            <div>
              <strong className="block text-2xl text-neutral-900 dark:text-neutral-100">
                {programs.filter((item) => item.autorestart).length}
              </strong>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Auto-restart
              </span>
            </div>
          </div>
        </div>
      </div>
      <section className="space-y-6 rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex gap-5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {groups.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setGroup(item)}
                className={`inline-flex cursor-pointer items-center whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${group === item ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Managed programs
            </h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Run queue workers, schedulers, and long-running application
              processes.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex min-w-64 items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-neutral-400 dark:border-neutral-700">
              <Search size={15} />
              <input
                className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search programs"
              />
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            >
              <option value="all">All statuses</option>
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
            </select>
            <button
              type="button"
              title="Refresh programs"
              aria-label="Refresh programs"
              className="inline-flex cursor-pointer items-center justify-center rounded-md border border-neutral-300 px-3 py-2 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
              <tr>
                <th className="px-3 py-3">Program</th>
                <th className="px-3 py-3">Command</th>
                <th className="px-3 py-3">Processes</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {visiblePrograms.map((program) => (
                <tr
                  key={program.id}
                  className="border-b border-neutral-100 dark:border-neutral-800"
                >
                  <td className="px-3 py-4">
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${program.status === "running" ? "bg-emerald-500" : "bg-neutral-400"}`}
                      />
                      <div>
                        <strong className="block text-neutral-900 dark:text-neutral-100">
                          {program.name}
                        </strong>
                        <small className="text-neutral-500">
                          {program.group} · {program.user} · {program.directory}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-xs px-3 py-4">
                    <code
                      className="block truncate text-xs text-neutral-600 dark:text-neutral-400"
                      title={program.command}
                    >
                      {program.command}
                    </code>
                  </td>
                  <td className="px-3 py-4 text-neutral-600 dark:text-neutral-400">
                    {program.processes}
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`text-xs font-medium ${program.status === "running" ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-500"}`}
                    >
                      {program.status === "running" ? "Running" : "Stopped"}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        title={
                          program.status === "running"
                            ? "Stop program"
                            : "Run program"
                        }
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        onClick={() => toggle(program)}
                      >
                        {program.status === "running" ? (
                          <Square size={15} />
                        ) : (
                          <Play size={15} />
                        )}
                      </button>
                      <button
                        type="button"
                        title="Edit program"
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        onClick={() => setEditing(program)}
                      >
                        <Settings2 size={15} />
                      </button>
                      <button
                        type="button"
                        title="Remove program"
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        onClick={() =>
                          setConfirmDialog({
                            kind: "confirm",
                            title: "Remove program?",
                            message: `This will remove ${program.name} from Supervisor management.`,
                            submitLabel: "Remove program",
                            tone: "danger",
                            onSubmit: () => {
                              savePrograms(
                                programs.filter(
                                  (item) => item.id !== program.id,
                                ),
                              );
                              setConfirmDialog(null);
                              setMessage(`${program.name} removed.`);
                            },
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visiblePrograms.length && (
                <tr>
                  <td
                    colSpan="5"
                    className="px-3 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400"
                  >
                    No programs match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Toast
          message={message}
          type="success"
          onClose={() => setMessage("")}
        />
        <ActionDialog
          dialog={confirmDialog}
          onClose={() => setConfirmDialog(null)}
          onSubmit={() => confirmDialog?.onSubmit?.()}
        />
        {editing && (
          <ProgramModalPortal
            editing={editing}
            onClose={() => setEditing(null)}
            onSave={saveProgram}
          />
        )}
        <div className="flex flex-wrap gap-5 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
          <span className="inline-flex items-center gap-2 text-neutral-500">
            <RefreshCw size={15} />
            Runtime reload ready
          </span>
          <span className="inline-flex items-center gap-2 text-neutral-500">
            <History size={15} />
            Logs per program
          </span>
          <span className="inline-flex items-center gap-2 text-neutral-500">
            <ShieldCheck size={15} />
            Runs with explicit user
          </span>
        </div>
      </section>
    </div>
  );
}
