import React from "react";
import { z } from "zod";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Edit3,
  History,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
  RotateCw,
  Square,
  FileText,
} from "lucide-react";
import Toast from "../../components/Toast";
import { apiRequest, readApiError } from "../../lib/api";
import FormField from "../../components/FormField";

const groups = ["Panel tasks", "Website", "Backup", "System", "Security"];
const input =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const emptyForm = {
  name: "",
  group: "Website",
  owner: "serverengine",
  minute: "0",
  hour: "2",
  day: "*",
  month: "*",
  weekday: "*",
  command: "",
  email: "",
  enabled: true,
};
const cronSchema = z.object({
  name: z.string().trim().min(1, "Task name is required.").max(120, "Task name is too long."),
  group: z.enum(["Website", "Backup", "System", "Security"]),
  owner: z.enum(["serverengine", "www-data", "root"]),
  minute: z.string().trim().min(1, "Minute is required.").regex(/^[0-9*/?,\-]+$/, "Use a valid cron value."),
  hour: z.string().trim().min(1, "Hour is required.").regex(/^[0-9*/?,\-]+$/, "Use a valid cron value."),
  day: z.string().trim().min(1, "Day is required.").regex(/^[0-9*/?,\-]+$/, "Use a valid cron value."),
  month: z.string().trim().min(1, "Month is required.").regex(/^[0-9*/?,\-]+$/, "Use a valid cron value."),
  weekday: z.string().trim().min(1, "Weekday is required.").regex(/^[0-9*/?,\-]+$/, "Use a valid cron value."),
  command: z.string().trim().min(1, "Command is required.").max(4096, "Command is too long."),
  email: z.string().trim().email("Enter a valid notification email.").or(z.literal("")),
  enabled: z.boolean(),
});

function Result({ value }) {
  const success = value === "success";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${success ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
    >
      {success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {success ? "Completed" : "Needs attention"}
    </span>
  );
}

function JobModal({ job, onClose, onSave }) {
  const editing = Boolean(job);
  const [form, setForm] = React.useState(() => job || emptyForm);
  const [error, setError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState({});
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const schedule = `${form.minute} ${form.hour} ${form.day} ${form.month} ${form.weekday}`;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Scheduled tasks
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {editing ? "Edit cron job" : "Add cron job"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Run a command automatically on this server.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close cron job form"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <form
          className="space-y-5 p-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const validation = cronSchema.safeParse(form);
            if (!validation.success) {
              setFieldErrors(Object.fromEntries(validation.error.issues.map((issue) => [issue.path[0], issue.message])));
              setError("");
              return;
            }
            setFieldErrors({});
            onSave({ ...form, schedule });
          }}
        >
          {error && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Task name" error={fieldErrors.name}>
              <input
                className={input}
                value={form.name}
                onChange={(event) => { set("name", event.target.value); setFieldErrors((current) => ({ ...current, name: undefined })); }}
                placeholder="Laravel scheduler"
              />
            </FormField>
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Category
              <select
                className={input}
                value={form.group}
                onChange={(event) => set("group", event.target.value)}
              >
                <option>Website</option>
                <option>Backup</option>
                <option>System</option>
                <option>Security</option>
              </select>
            </label>
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Run as
              <select
                className={input}
                value={form.owner}
                onChange={(event) => set("owner", event.target.value)}
              >
                <option>serverengine</option>
                <option>www-data</option>
                <option>root</option>
              </select>
            </label>
            <FormField label="Notification email" error={fieldErrors.email}>
              <input
                type="email"
                className={input}
                value={form.email || ""}
                onChange={(event) => { set("email", event.target.value); setFieldErrors((current) => ({ ...current, email: undefined })); }}
                placeholder="Optional"
              />
            </FormField>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Schedule
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-5">
              {[
                ["minute", "Minute"],
                ["hour", "Hour"],
                ["day", "Day"],
                ["month", "Month"],
                ["weekday", "Weekday"],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="text-xs text-neutral-500 dark:text-neutral-400"
                >
                  {label}
                  <input
                    className={input}
                    value={form[key]}
                    onChange={(event) => { set(key, event.target.value); setFieldErrors((current) => ({ ...current, [key]: undefined })); }}
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <CalendarClock size={14} /> Cron expression:
              <code className="rounded bg-neutral-100 px-2 py-1 font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {schedule}
              </code>
            </div>
          </div>
          <FormField label="Command" error={fieldErrors.command}>
            <textarea
              rows={3}
              className={`${input} font-mono`}
              value={form.command}
              onChange={(event) => { set("command", event.target.value); setFieldErrors((current) => ({ ...current, command: undefined })); }}
              placeholder="cd /server-engine/www/example.com && php artisan schedule:run"
            />
          </FormField>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
              checked={form.enabled !== false}
              onChange={(event) => set("enabled", event.target.checked)}
            />
            Enable this schedule
          </label>
          <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            Commands run with the selected account. Use an absolute path or
            change into the project directory first.
          </p>
          <div className="flex justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <button
              type="button"
              className="cursor-pointer rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <CheckCircle2 size={16} />
              {editing ? "Save cron job" : "Add cron job"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CronJobsSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading cron jobs">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="space-y-3">
          <div className="h-4 w-28 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-9 w-36 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-96 max-w-full rounded bg-neutral-100 dark:bg-neutral-800/70" />
        </div>
        <div className="h-10 w-32 rounded-md bg-neutral-200 dark:bg-neutral-800" />
      </header>
      <section className="flex flex-col justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3"><div className="h-3 w-3 rounded-full bg-neutral-200 dark:bg-neutral-800" /><div className="space-y-2"><div className="h-4 w-40 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-3 w-56 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div></div>
        <div className="flex gap-2"><div className="h-8 w-20 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="h-8 w-20 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="h-8 w-20 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"><div className="h-5 w-5 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="mt-3 h-7 w-16 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="mt-2 h-3 w-24 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div>)}
      </section>
      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex gap-6 border-b border-neutral-200 px-4 pt-4 dark:border-neutral-800">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="mb-3 h-4 w-20 rounded bg-neutral-200 dark:bg-neutral-800" />)}</div>
        <div className="p-4"><div className="flex justify-between gap-4"><div className="space-y-2"><div className="h-5 w-40 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-3 w-64 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div><div className="h-9 w-72 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div>
          <div className="mt-5 overflow-hidden"><div className="grid grid-cols-7 gap-4 border-b border-neutral-200 px-3 py-3 dark:border-neutral-800">{Array.from({ length: 7 }).map((_, index) => <div key={index} className="h-3 rounded bg-neutral-100 dark:bg-neutral-800/70" />)}</div><div className="divide-y divide-neutral-100 dark:divide-neutral-800">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="grid grid-cols-7 items-center gap-4 px-3 py-5"><div className="h-4 w-28 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-4 w-20 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="h-3 w-32 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="h-3 w-24 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="h-3 w-24 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="h-4 w-16 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="ml-auto h-8 w-8 rounded-full bg-neutral-100 dark:bg-neutral-800/70" /></div>)}</div></div>
        </div>
      </section>
    </div>
  );
}

export default function CronJobsPage() {
  const [jobs, setJobs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [scheduler, setScheduler] = React.useState(null);
  const [logJob, setLogJob] = React.useState(null);
  const [jobLogs, setJobLogs] = React.useState([]);
  const [group, setGroup] = React.useState("Panel tasks");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [menu, setMenu] = React.useState(null);
  const [modal, setModal] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const loadJobs = React.useCallback(async () => {
    setLoading(true);
    try {
      const [jobsResponse, schedulerResponse] = await Promise.all([
        apiRequest("/api/v1/cron/jobs"),
        apiRequest("/api/v1/cron/scheduler"),
      ]);
      if (!jobsResponse.ok)
        throw new Error(
          await readApiError(jobsResponse, "Could not load cron jobs"),
        );
      if (schedulerResponse.ok) setScheduler(await schedulerResponse.json());
      setJobs(await jobsResponse.json());
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    loadJobs();
  }, [loadJobs]);
  React.useEffect(() => {
    if (!menu) return undefined;
    const close = (event) => {
      if (!event.target.closest("[data-cron-menu]")) setMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  const request = async (url, options, message) => {
    try {
      const response = await apiRequest(url, options);
      if (!response.ok) throw new Error(await readApiError(response));
      await loadJobs();
      setToast({ type: "success", message });
      return true;
    } catch (error) {
      setToast({ type: "error", message: error.message });
      return false;
    }
  };
  const save = async (value) => {
    const editing = Boolean(modal?.id);
    const ok = await request(
      `/api/v1/cron/jobs${editing ? `/${modal.id}` : ""}`,
      { method: editing ? "PUT" : "POST", body: JSON.stringify(value) },
      editing ? "Cron job updated." : "Cron job created.",
    );
    if (ok) setModal(null);
  };
  const action = async (job, type) => {
    setMenu(null);
    if (type === "delete" && !window.confirm(`Delete “${job.name}”?`)) return;
    if (type === "toggle")
      await request(
        `/api/v1/cron/jobs/${job.id}/toggle`,
        { method: "POST", body: JSON.stringify({ enabled: !job.enabled }) },
        job.enabled ? "Cron job disabled." : "Cron job enabled.",
      );
    if (type === "run")
      await request(
        `/api/v1/cron/jobs/${job.id}/run`,
        { method: "POST" },
        "Cron job started.",
      );
    if (type === "delete")
      await request(
        `/api/v1/cron/jobs/${job.id}`,
        { method: "DELETE" },
        "Cron job deleted.",
      );
  };
  const schedulerAction = async (action, payload = {}) => {
    try {
      const response = await apiRequest("/api/v1/cron/scheduler", {
        method: "POST",
        body: JSON.stringify({ action, ...payload }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setScheduler(await response.json());
      setToast({
        type: "success",
        message:
          action === "enable_at_boot"
            ? "Boot setting updated."
            : `Scheduler ${action}ed.`,
      });
    } catch (error) {
      setToast({ type: "error", message: error.message });
    }
  };
  const openLogs = async (job) => {
    setMenu(null);
    setLogJob(job);
    try {
      const response = await apiRequest(
        `/api/v1/cron/jobs/${job.id}/logs?limit=50`,
      );
      if (!response.ok) throw new Error(await readApiError(response));
      setJobLogs(await response.json());
    } catch (error) {
      setJobLogs([]);
      setToast({ type: "error", message: error.message });
    }
  };
  const panelJobs = jobs.filter((job) => job.group !== "Backup");
  const visible = jobs.filter(
    (job) =>
      (group === "Panel tasks" ? job.group !== "Backup" : job.group === group) &&
      (status === "all" ||
        (status === "enabled" ? job.enabled : !job.enabled)) &&
      `${job.name} ${job.command} ${job.owner} ${job.group}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (loading && !jobs.length && !scheduler) return <CronJobsSkeleton />;
  return (
    <div className="space-y-6">
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Automation
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Cron jobs
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            Manage certificate renewal, website tasks, maintenance, and server
            commands. Database backups live in Backup → Schedules.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={() => setModal({})}
        >
          <Plus size={16} />
          Add cron job
        </button>
      </div>
      {scheduler && (
        <section className="flex flex-col justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 rounded-full ${scheduler.running ? "bg-emerald-500" : "bg-neutral-400"}`}
            />
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Cron scheduler{" "}
                <span className="font-normal text-neutral-500">
                  · {scheduler.running ? "Running" : "Stopped"}
                </span>
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Checks enabled schedules every {scheduler.interval_seconds}{" "}
                seconds.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="mr-2 inline-flex cursor-pointer items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                checked={scheduler.enabled_at_boot}
                onChange={(event) =>
                  schedulerAction("enable_at_boot", {
                    enabled: event.target.checked,
                  })
                }
              />
              Enable at boot
            </label>
            <button
              type="button"
              title={scheduler.running ? "Stop scheduler" : "Start scheduler"}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              onClick={() => schedulerAction(scheduler.running ? "stop" : "start")}
            >
              {scheduler.running ? <Square size={13} /> : <Play size={13} />}
              {scheduler.running ? "Stop" : "Start"}
            </button>
            <button
              type="button"
              title="Restart scheduler"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              onClick={() => schedulerAction("restart")}
            >
              <RotateCw size={13} />
              Restart
            </button>
            <button
              type="button"
              title="View scheduler logs"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              onClick={() =>
                setToast({
                  type: "info",
                  message:
                    "Scheduler output is recorded on each cron job row after it runs.",
                })
              }
            >
              <FileText size={13} />
              View logs
            </button>
          </div>
        </section>
      )}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            CalendarClock,
            panelJobs.length,
            "Panel tasks",
            "text-blue-600 dark:text-blue-400",
          ],
          [
            CheckCircle2,
            panelJobs.filter((job) => job.enabled).length,
            "Enabled",
            "text-emerald-600 dark:text-emerald-400",
          ],
          [
            Clock3,
            panelJobs.filter((job) => job.enabled).length,
            "Scheduled to run",
            "text-neutral-500",
          ],
          [
            History,
            panelJobs.filter((job) => job.result === "warning").length,
            "Needs attention",
            "text-amber-600 dark:text-amber-400",
          ],
        ].map(([Icon, value, label, color]) => (
          <div
            key={label}
            className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center gap-3">
              <Icon className={color} size={19} />
              <div>
                <strong className="block text-2xl text-neutral-900 dark:text-neutral-100">
                  {value}
                </strong>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {label}
                </span>
              </div>
            </div>
          </div>
        ))}
      </section>
      <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 px-4 pt-4 dark:border-neutral-800">
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
        <div className="p-4">
          <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Scheduled tasks
              </h3>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Review timing, command ownership, last result, and next run.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex min-w-64 items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-neutral-400 dark:border-neutral-700">
                <Search size={15} />
                <input
                  className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search cron jobs"
                />
              </label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
              >
                <option value="all">All statuses</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
              <button
                type="button"
                title="Refresh jobs"
                aria-label="Refresh jobs"
                onClick={loadJobs}
                className="inline-flex cursor-pointer items-center justify-center rounded-md border border-neutral-300 px-3 py-2 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <RefreshCw
                  className={loading ? "animate-spin" : ""}
                  size={16}
                />
              </button>
            </div>
          </div>
          <div className="mt-4 overflow-visible">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th className="px-3 py-3 font-semibold">Job</th>
                  <th className="px-3 py-3 font-semibold">Schedule</th>
                  <th className="px-3 py-3 font-semibold">Command</th>
                  <th className="px-3 py-3 font-semibold">Last run</th>
                  <th className="px-3 py-3 font-semibold">Next run</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
                  >
                    <td className="px-3 py-4">
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${job.enabled ? "bg-emerald-500" : "bg-neutral-400"}`}
                        />
                        <div>
                          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {job.name}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                            {job.group} · {job.owner}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <code className="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        {job.schedule}
                      </code>
                      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                        {job.human}
                      </p>
                    </td>
                    <td className="max-w-xs px-3 py-4">
                      <code
                        className="block truncate text-xs text-neutral-600 dark:text-neutral-400"
                        title={job.command}
                      >
                        {job.command}
                      </code>
                    </td>
                    <td className="px-3 py-4">
                      <div className="text-xs text-neutral-600 dark:text-neutral-400">
                        {job.last}
                      </div>
                      <div className="mt-1">
                        <Result value={job.result} />
                      </div>
                    </td>
                    <td className="px-3 py-4 text-xs text-neutral-600 dark:text-neutral-400">
                      {job.enabled ? job.next : "Paused"}
                    </td>
                    <td className="px-3 py-4">
                      {job.enabled ? (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          Enabled
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-neutral-500">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td
                      data-cron-menu
                      className="relative px-3 py-4 text-right"
                    >
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        aria-label={`Actions for ${job.name}`}
                        onClick={() => setMenu(menu === job.id ? null : job.id)}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {menu === job.id && (
                        <div className="absolute right-3 top-12 z-10 w-44 rounded-md border border-neutral-200 bg-white py-1 text-left shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            onClick={() => {
                              setModal(job);
                              setMenu(null);
                            }}
                          >
                            <Edit3 size={15} />
                            Edit job
                          </button>
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            onClick={() => action(job, "toggle")}
                          >
                            <Play size={15} />
                            {job.enabled ? "Disable job" : "Enable job"}
                          </button>
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            onClick={() => openLogs(job)}
                          >
                            <FileText size={15} />
                            View logs
                          </button>
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            onClick={() => action(job, "run")}
                          >
                            <Play size={15} />
                            Run now
                          </button>
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                            onClick={() => action(job, "delete")}
                          >
                            <Trash2 size={15} />
                            Delete job
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading ? (
              <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                Loading scheduled tasks…
              </div>
            ) : !visible.length ? (
              <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No scheduled tasks match these filters.
              </div>
            ) : null}
          </div>
        </div>
      </section>
      {modal && (
        <JobModal
          job={modal.id ? modal : null}
          onClose={() => setModal(null)}
          onSave={save}
        />
      )}
      {logJob && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
          <section className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-neutral-900">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Job logs</p>
                <h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{logJob.name}</h2>
              </div>
              <button type="button" aria-label="Close job logs" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200" onClick={() => setLogJob(null)}><X size={17} /></button>
            </div>
            <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
              {jobLogs.length ? jobLogs.map((entry) => <article key={entry.id} className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400"><span>{entry.started_at} · exit {entry.exit_code ?? "—"}</span><Result value={entry.status} /></div><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-950 p-3 text-xs leading-5 text-neutral-200">{entry.output || "No output recorded."}</pre></article>) : <p className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">This job has not run yet.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
