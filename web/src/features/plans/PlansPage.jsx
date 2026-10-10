import React from "react";
import {
  Check,
  CirclePlus,
  MoreHorizontal,
  Package,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import Toast from "../../components/Toast";
import { z } from "zod";

const features = [
  ["ssl", "SSL certificates"],
  ["dns", "DNS management"],
  ["mail", "Email services"],
  ["backups", "Backups"],
  ["git", "Git deployments"],
  ["shell", "SSH access"],
];
const input =
  "mt-2 block min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const panel =
  "rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900";
const emptyForm = {
  id: "",
  name: "",
  description: "",
  disk_quota_mb: 10240,
  bandwidth_quota_mb: 102400,
  websites_quota: 1,
  databases_quota: 2,
  mailboxes_quota: 5,
  ftp_quota: 2,
  cron_quota: 5,
  php_version: "latest",
  webserver: "nginx",
  database_engine: "mysql",
  features: ["ssl", "dns", "backups", "git"],
  status: "active",
};
const planSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(
      /^[a-z][a-z0-9_-]{2,63}$/,
      "Use 3–64 lowercase letters, numbers, hyphens, or underscores.",
    ),
  name: z
    .string()
    .trim()
    .min(1, "Plan name is required.")
    .max(120, "Plan name is too long."),
  description: z
    .string()
    .trim()
    .min(1, "Description is required.")
    .max(500, "Description is too long."),
  disk_quota_mb: z.number().int().min(0, "Disk quota cannot be negative."),
  bandwidth_quota_mb: z
    .number()
    .int()
    .min(0, "Bandwidth quota cannot be negative."),
  websites_quota: z.number().int().min(0, "Website quota cannot be negative."),
  databases_quota: z
    .number()
    .int()
    .min(0, "Database quota cannot be negative."),
  mailboxes_quota: z.number().int().min(0, "Mailbox quota cannot be negative."),
  ftp_quota: z.number().int().min(0, "FTP quota cannot be negative."),
  cron_quota: z.number().int().min(0, "Cron quota cannot be negative."),
  php_version: z.string().min(1),
  webserver: z.enum(["nginx", "apache", "openlitespeed", "caddy"]),
  database_engine: z.enum(["mysql", "mariadb", "postgresql", "none"]),
  features: z.array(z.string()),
  status: z.enum(["active", "suspended"]),
});

function size(value) {
  const mb = Number(value || 0);
  if (mb >= 1024 * 1024)
    return `${(mb / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} TB`;
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`;
  return `${mb} MB`;
}

function PlanModal({ plan, saving, onClose, onSave }) {
  const editing = Boolean(plan);
  const [form, setForm] = React.useState(plan || emptyForm);
  const [error, setError] = React.useState("");
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const toggle = (feature) =>
    set(
      "features",
      form.features.includes(feature)
        ? form.features.filter((item) => item !== feature)
        : [...form.features, feature],
    );
  async function submit(event) {
    event.preventDefault();
    setError("");
    const validation = planSchema.safeParse(form);
    if (!validation.success) {
      setError(validation.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    try {
      await onSave(validation.data, editing);
    } catch (requestError) {
      setError(requestError.message || "Could not save plan.");
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !saving && onClose()
      }
    >
      <form
        onSubmit={submit}
        className="my-4 w-full max-w-4xl rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Hosting plans
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {editing ? "Edit hosting plan" : "Create hosting plan"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Set the limits and features available to hosting accounts.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(100vh-12rem)] space-y-7 overflow-y-auto p-6">
          <section>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Plan details
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Plan name
                <input
                  required
                  className={input}
                  value={form.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    set("name", name);
                    if (!editing && !form.id)
                      set(
                        "id",
                        name
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, ""),
                      );
                  }}
                  placeholder="Professional"
                />
              </label>
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Plan ID
                <input
                  required
                  readOnly={editing}
                  pattern="[a-z][a-z0-9_-]{2,63}"
                  className={`${input} ${editing ? "opacity-60" : ""}`}
                  value={form.id}
                  onChange={(event) =>
                    set("id", event.target.value.toLowerCase())
                  }
                  placeholder="professional"
                />
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Description
              <textarea
                required
                className={`${input} min-h-20`}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="For production websites and stores."
              />
            </label>
          </section>
          <section>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Resource limits
            </h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["disk_quota_mb", "Disk quota (MB)", "51200"],
                ["bandwidth_quota_mb", "Monthly bandwidth (MB)", "512000"],
                ["websites_quota", "Websites", "10"],
                ["databases_quota", "Databases", "10"],
                ["mailboxes_quota", "Mailboxes", "25"],
                ["ftp_quota", "FTP accounts", "10"],
                ["cron_quota", "Cron jobs", "20"],
              ].map(([key, label, placeholder]) => (
                <label
                  key={key}
                  className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  {label}
                  <input
                    required
                    min="0"
                    type="number"
                    className={input}
                    value={form[key]}
                    onChange={(event) => set(key, Number(event.target.value))}
                    placeholder={placeholder}
                  />
                </label>
              ))}
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Feature access
                </h3>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Available capabilities for accounts using this plan.
                </p>
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {form.features.length} selected
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(([id, label]) => (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-blue-600"
                    checked={form.features.includes(id)}
                    onChange={() => toggle(id)}
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </section>
          <label className="flex cursor-pointer items-center justify-between gap-3 border-y border-neutral-200 py-4 dark:border-neutral-800">
            <span>
              <strong className="block text-sm text-neutral-900 dark:text-neutral-100">
                Plan status
              </strong>
              <small className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                Suspended plans cannot be assigned to new hosting accounts.
              </small>
            </span>
            <select
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              value={form.status}
              onChange={(event) => set("status", event.target.value)}
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4 dark:border-neutral-800">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="cursor-pointer px-3 py-2 text-sm font-semibold text-neutral-600 dark:text-neutral-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
          >
            <Check size={16} />
            {saving ? "Saving…" : editing ? "Save changes" : "Create plan"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteModal({ plan, plans, saving, onClose, onDelete }) {
  const [replacement, setReplacement] = React.useState(
    plans.find((item) => item.id !== plan.id)?.id || "",
  );
  const assigned = Number(plan.assigned_count || 0);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-neutral-950/60 p-4">
      <section className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
            <Trash2 size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Delete {plan.name}?
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
              {assigned
                ? `${assigned} account${assigned === 1 ? " is" : "s are"} assigned to this plan. Choose where they should move before deletion.`
                : "No hosting accounts use this plan. It can be removed immediately."}
            </p>
          </div>
        </div>
        {assigned > 0 && (
          <label className="mt-5 block text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Replacement plan
            <select
              required
              className={input}
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
            >
              <option value="">Select a plan</option>
              {plans
                .filter(
                  (item) => item.id !== plan.id && item.status === "active",
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || (assigned > 0 && !replacement)}
            onClick={() => onDelete(plan.id, replacement || null)}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Trash2 size={15} />
            {saving
              ? "Deleting…"
              : assigned
                ? "Move accounts and delete"
                : "Delete plan"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = React.useState([]);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const [editor, setEditor] = React.useState(undefined);
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [openMenu, setOpenMenu] = React.useState(null);
  const loadPlans = React.useCallback(async () => {
    const response = await apiRequest("/api/v1/plans");
    if (!response.ok)
      throw new Error(
        await readApiError(response, "Could not load hosting plans."),
      );
    const payload = await response.json();
    setPlans(Array.isArray(payload.plans) ? payload.plans : []);
    setError("");
  }, []);
  React.useEffect(() => {
    let active = true;
    loadPlans()
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadPlans]);
  React.useEffect(() => {
    const refresh = () =>
      loadPlans().catch((requestError) => setError(requestError.message));
    window.addEventListener("serverengine:plans", refresh);
    return () => window.removeEventListener("serverengine:plans", refresh);
  }, [loadPlans]);
  async function savePlan(form, editing) {
    setSaving(true);
    try {
      const response = await apiRequest(
        editing
          ? `/api/v1/plans/${encodeURIComponent(form.id)}`
          : "/api/v1/plans",
        { method: editing ? "PUT" : "POST", body: JSON.stringify(form) },
      );
      if (!response.ok)
        throw new Error(
          await readApiError(
            response,
            editing ? "Could not update plan." : "Could not create plan.",
          ),
        );
      const saved = await response.json();
      setPlans((current) =>
        editing
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved].sort(
              (a, b) =>
                Number(b.system_plan) - Number(a.system_plan) ||
                a.name.localeCompare(b.name),
            ),
      );
      setEditor(undefined);
      setToast({
        type: "success",
        message: editing ? "Hosting plan updated." : "Hosting plan created.",
      });
    } finally {
      setSaving(false);
    }
  }
  async function deletePlan(planId, replacementPlan) {
    setSaving(true);
    try {
      const response = await apiRequest(
        `/api/v1/plans/${encodeURIComponent(planId)}`,
        {
          method: "DELETE",
          body: JSON.stringify({ replacement_plan: replacementPlan }),
        },
      );
      if (!response.ok)
        throw new Error(await readApiError(response, "Could not delete plan."));
      setPlans((current) => current.filter((item) => item.id !== planId));
      setDeleteTarget(null);
      setToast({ type: "success", message: "Hosting plan deleted." });
    } catch (requestError) {
      setToast({ type: "error", message: requestError.message });
    } finally {
      setSaving(false);
    }
  }
  const visible = plans.filter((plan) =>
    `${plan.name} ${plan.id} ${plan.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const active = plans.filter((plan) => plan.status === "active").length;
  const assigned = plans.reduce(
    (sum, plan) => sum + Number(plan.assigned_count || 0),
    0,
  );
  return (
    <div className="space-y-7">
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
      <header className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Accounts & plans
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Hosting plans
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Define reusable resource limits and feature access for hosting
            accounts. Changes apply to future assignments.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() =>
              loadPlans().catch((requestError) =>
                setError(requestError.message),
              )
            }
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setEditor({})}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <CirclePlus size={16} />
            Create plan
          </button>
        </div>
      </header>
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          [Package, "Plans", plans.length],
          [ShieldCheck, "Active plans", active],
          [Users, "Assigned accounts", assigned],
        ].map(([Icon, label, value]) => (
          <div className={`${panel} p-5`} key={label}>
            <div className="flex items-center gap-3">
              <Icon size={19} className="text-blue-500" />
              <span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  {label}
                </span>
                <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                  {value}
                </strong>
              </span>
            </div>
          </div>
        ))}
      </section>
      <section className={`${panel} overflow-hidden`}>
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 p-5 lg:flex-row lg:items-center dark:border-neutral-800">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Plan catalog
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Built-in plans can be edited but cannot be deleted while they are
              part of the catalog.
            </p>
          </div>
          <label className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-950">
            <Search size={16} />
            <input
              className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100"
              placeholder="Search plans"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        {error && (
          <div className="m-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="space-y-3 p-5">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-24 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800"
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              {visible.map((plan) => (
                <article
                  key={plan.id}
                  className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                          {plan.name}
                        </h3>
                        <span
                          className={`text-xs font-semibold ${plan.status === "active" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                        >
                          {plan.status === "active" ? "Active" : "Suspended"}
                        </span>
                      </div>
                      <code className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                        {plan.id}
                      </code>
                      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                        {plan.description}
                      </p>
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        aria-label={`More actions for ${plan.name}`}
                        onClick={() =>
                          setOpenMenu(openMenu === plan.id ? null : plan.id)
                        }
                        className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {openMenu === plan.id && (
                        <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
                          <button
                            type="button"
                            onClick={() => {
                              setEditor(plan);
                              setOpenMenu(null);
                            }}
                            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                          >
                            <Pencil size={14} />
                            Edit plan
                          </button>
                          {!plan.system_plan && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteTarget(plan);
                                setOpenMenu(null);
                              }}
                              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                            >
                              <Trash2 size={14} />
                              Delete plan
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-x-6 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                    <div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Disk
                      </p>
                      <strong className="mt-1 block text-sm text-neutral-900 dark:text-neutral-100">
                        {size(plan.disk_quota_mb)}
                      </strong>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Bandwidth
                      </p>
                      <strong className="mt-1 block text-sm text-neutral-900 dark:text-neutral-100">
                        {size(plan.bandwidth_quota_mb)}
                      </strong>
                    </div>
                    <div className="mt-4">
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Websites
                      </p>
                      <strong className="mt-1 block text-sm text-neutral-900 dark:text-neutral-100">
                        {plan.websites_quota}
                      </strong>
                    </div>
                    <div className="mt-4">
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Databases · Mailboxes
                      </p>
                      <strong className="mt-1 block text-sm text-neutral-900 dark:text-neutral-100">
                        {plan.databases_quota} · {plan.mailboxes_quota}
                      </strong>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                    {plan.features?.map((feature) => (
                      <span
                        key={feature}
                        className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {feature}
                      </span>
                    ))}
                    <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
                      {plan.assigned_count || 0} account
                      {plan.assigned_count === 1 ? "" : "s"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!loading && !visible.length && (
            <div className="px-5 py-16 text-center">
              <Package
                className="mx-auto text-neutral-300 dark:text-neutral-700"
                size={32}
              />
              <p className="mt-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                No hosting plans found
              </p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Create a plan or change your search.
              </p>
            </div>
          )}
        </div>
      </section>
      {editor !== undefined && (
        <PlanModal
          plan={editor?.id ? editor : null}
          saving={saving}
          onClose={() => setEditor(undefined)}
          onSave={savePlan}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          plan={deleteTarget}
          plans={plans}
          saving={saving}
          onClose={() => setDeleteTarget(null)}
          onDelete={deletePlan}
        />
      )}
    </div>
  );
}
