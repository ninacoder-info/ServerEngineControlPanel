import React from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import {
  CheckCircle2,
  CirclePlus,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import Toast from "../../components/Toast";
import SecurePasswordInput from "../../components/SecurePasswordInput";
import FormField from "../../components/FormField";

const builtInRoles = [
  ["administrator", "Administrator"],
  ["operator", "Operator"],
  ["website_manager", "Website manager"],
  ["database_manager", "Database manager"],
  ["mail_manager", "Mail manager"],
  ["security_auditor", "Security auditor"],
  ["viewer", "Viewer"],
];
let roleOptionsForLabels = builtInRoles.map(([id, name]) => ({ id, name }));

const inputClass =
  "mt-2 block min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const panelClass =
  "rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900";

const userSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(120, "Display name is too long."),
  username: z
    .string()
    .trim()
    .regex(
      /^[a-z][a-z0-9._-]{2,63}$/,
      "Use 3–64 lowercase letters, numbers, dots, underscores, or hyphens.",
    ),
  email: z.union([
    z.literal(""),
    z.string().trim().email("Enter a valid email address."),
  ]),
  role: z.string().min(1, "Select an access role."),
  password: z.string().min(12, "Use a password with at least 12 characters."),
});

function validationErrors(result) {
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [issue.path[0], issue.message]),
      );
}

function roleLabel(role, options = roleOptionsForLabels) {
  return (
    options.find(
      (item) => (Array.isArray(item) ? item[0] : item.id) === role,
    )?.[1] ||
    options.find((item) => item.id === role)?.name ||
    role
  );
}

function UserFormModal({ onClose, onCreate, saving, roles }) {
  const [form, setForm] = React.useState({
    display_name: "",
    username: "",
    email: "",
    role: "administrator",
    password: "",
  });
  const [error, setError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState({});

  const setValue = (name, value) =>
    setForm((current) => ({ ...current, [name]: value }));

  async function submit(event) {
    event.preventDefault();
    setError("");
    const validation = userSchema.safeParse(form);
    const nextErrors = validationErrors(validation);
    if (!validation.success) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    try {
      await onCreate(validation.data);
    } catch (requestError) {
      setError(requestError.message || "Could not create panel user.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/60 p-4"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !saving && onClose()
      }
    >
      <form
        onSubmit={submit}
        className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400">
              <ShieldCheck size={16} />
              Panel access
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Create panel user
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
              Add an administrator or staff member. This does not create a
              hosting account.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-7 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Display name" error={fieldErrors.display_name}>
              <input
                className={inputClass}
                value={form.display_name}
                onChange={(event) => {
                  setValue("display_name", event.target.value);
                  setFieldErrors((current) => ({
                    ...current,
                    display_name: "",
                  }));
                }}
                placeholder="Jane Smith"
              />
            </FormField>
            <FormField
              label="Username"
              error={fieldErrors.username}
              hint="Lowercase letters, numbers, dots, underscores, or hyphens."
            >
              <input
                className={inputClass}
                value={form.username}
                onChange={(event) => {
                  setValue("username", event.target.value.toLowerCase());
                  setFieldErrors((current) => ({ ...current, username: "" }));
                }}
                placeholder="jane.smith"
              />
            </FormField>
          </div>
          <FormField label="Email address" error={fieldErrors.email}>
            <input
              className={inputClass}
              value={form.email}
              onChange={(event) => {
                setValue("email", event.target.value);
                setFieldErrors((current) => ({ ...current, email: "" }));
              }}
              placeholder="jane@example.com"
            />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Access role" error={fieldErrors.role}>
              <select
                className={inputClass}
                value={form.role}
                onChange={(event) => {
                  setValue("role", event.target.value);
                  setFieldErrors((current) => ({ ...current, role: "" }));
                }}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Initial password"
              error={fieldErrors.password}
              hint="Use at least 12 characters."
            >
              <SecurePasswordInput
                className={inputClass}
                value={form.password}
                onChange={(event) => {
                  setValue("password", event.target.value);
                  setFieldErrors((current) => ({ ...current, password: "" }));
                }}
                placeholder="At least 12 characters"
              />
            </FormField>
          </div>
        </div>
        {error && (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </p>
        )}
        <div className="mt-7 flex justify-end gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
          >
            <CirclePlus size={16} />
            {saving ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </div>
  );
}

const permissionAreas = [
  ["websites", "Websites"],
  ["domains", "Domains"],
  ["files", "Files"],
  ["databases", "Databases"],
  ["backups", "Backups"],
  ["mail", "Mail"],
  ["services", "Services"],
  ["logs", "Logs"],
  ["firewall", "Firewall"],
  ["malware", "Malware scanner"],
  ["docker", "Docker"],
  ["jobs", "Jobs"],
];

function RoleManagerModal({ roles, onClose, onCreate, onDelete, saving }) {
  const [form, setForm] = React.useState({
    id: "",
    name: "",
    description: "",
    permissions: [],
  });
  const [error, setError] = React.useState("");
  const setValue = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const togglePermission = (permission) =>
    setValue(
      "permissions",
      form.permissions.includes(permission)
        ? form.permissions.filter((item) => item !== permission)
        : [...form.permissions, permission],
    );
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await onCreate(form);
      setForm({ id: "", name: "", description: "", permissions: [] });
    } catch (requestError) {
      setError(requestError.message || "Could not create role.");
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/60 p-4"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !saving && onClose()
      }
    >
      <section className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Access control
            </div>
            <h2 className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Manage roles
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
              Create reusable permission profiles for panel users. Built-in
              roles are protected.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 grid gap-3">
          {roles.map((role) => (
            <div
              key={role.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm text-neutral-900 dark:text-neutral-100">
                    {role.name}
                  </strong>
                  {role.system_role && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      Built-in
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {role.description || "Custom permission profile"}
                </p>
              </div>
              {!role.system_role && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onDelete(role.id)}
                  className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
        <form
          onSubmit={submit}
          className="mt-6 border-t border-neutral-200 pt-6 dark:border-neutral-800"
        >
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Create custom role
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              Role name
              <input
                required
                className={inputClass}
                value={form.name}
                onChange={(event) => {
                  setValue("name", event.target.value);
                  if (!form.id)
                    setValue(
                      "id",
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "_")
                        .replace(/^_|_$/g, ""),
                    );
                }}
                placeholder="Content manager"
              />
            </label>
            <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              Role ID
              <input
                required
                pattern="[a-z][a-z0-9_-]*"
                className={inputClass}
                value={form.id}
                onChange={(event) =>
                  setValue("id", event.target.value.toLowerCase())
                }
                placeholder="content_manager"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Description
            <textarea
              className={`${inputClass} min-h-20`}
              value={form.description}
              onChange={(event) => setValue("description", event.target.value)}
              placeholder="Manage website content without server controls."
            />
          </label>
          <div className="mt-4">
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              Permission areas
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {permissionAreas.map(([id, label]) => (
                <label
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
                >
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(id)}
                    onChange={() => togglePermission(id)}
                    className="h-4 w-4 rounded accent-blue-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          {error && (
            <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end">
            <button
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <CirclePlus size={16} />
              {saving ? "Saving…" : "Create role"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RoleManagerTabs({ roles, onClose, onSave, onDelete, saving }) {
  const [tab, setTab] = React.useState("roles");
  const [form, setForm] = React.useState({
    id: "",
    name: "",
    description: "",
    permissions: [],
    editing: false,
  });
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [replacement, setReplacement] = React.useState("administrator");
  const setValue = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const editRole = (role) => {
    setForm({
      id: role.id,
      name: role.name,
      description: role.description || "",
      permissions: role.permissions || [],
      editing: true,
    });
    setTab("editor");
  };
  const createRole = () => {
    setForm({
      id: "",
      name: "",
      description: "",
      permissions: [],
      editing: false,
    });
    setTab("editor");
  };
  const toggle = (id) =>
    setValue(
      "permissions",
      form.permissions.includes(id)
        ? form.permissions.filter((item) => item !== id)
        : [...form.permissions, id],
    );
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/60 p-4"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !saving && onClose()
      }
    >
      <section className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Access control
            </p>
            <h2 className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Manage roles
            </h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Build reusable permission profiles for panel users.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex gap-1 border-y border-neutral-200 px-6 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setTab("roles")}
            className={`border-b-2 px-3 py-3 text-sm font-semibold ${tab === "roles" ? "border-blue-600 text-blue-600" : "border-transparent text-neutral-500"}`}
          >
            Roles ({roles.length})
          </button>
          <button
            type="button"
            onClick={createRole}
            className={`border-b-2 px-3 py-3 text-sm font-semibold ${tab === "editor" ? "border-blue-600 text-blue-600" : "border-transparent text-neutral-500"}`}
          >
            {form.editing ? "Edit role" : "Create role"}
          </button>
        </div>
        <div className="p-6">
          {tab === "roles" ? (
            <div className="space-y-3">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm text-neutral-900 dark:text-neutral-100">
                        {role.name}
                      </strong>
                      {role.system_role && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                          Protected
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {role.description || "Custom permission profile"} ·{" "}
                      {role.assigned_count || 0} user
                      {role.assigned_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {role.system_role ? (
                      <span className="text-xs text-neutral-400">
                        Administrator only
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => editRole(role)}
                          className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget(role);
                            setReplacement(
                              roles.find((item) => item.id !== role.id)?.id ||
                                "administrator",
                            );
                          }}
                          className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSave(form);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Role name
                  <input
                    required
                    className={inputClass}
                    value={form.name}
                    onChange={(event) => {
                      setValue("name", event.target.value);
                      if (!form.editing && !form.id)
                        setValue(
                          "id",
                          event.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "_")
                            .replace(/^_|_$/g, ""),
                        );
                    }}
                    placeholder="Content manager"
                  />
                </label>
                <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Role ID
                  <input
                    required
                    readOnly={form.editing}
                    pattern="[a-z][a-z0-9_-]*"
                    className={`${inputClass} ${form.editing ? "opacity-60" : ""}`}
                    value={form.id}
                    onChange={(event) =>
                      setValue("id", event.target.value.toLowerCase())
                    }
                    placeholder="content_manager"
                  />
                </label>
              </div>
              <label className="mt-4 block text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Description
                <textarea
                  className={`${inputClass} min-h-20`}
                  value={form.description}
                  onChange={(event) =>
                    setValue("description", event.target.value)
                  }
                  placeholder="Manage website content without server controls."
                />
              </label>
              <div className="mt-5">
                <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Permission areas
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {permissionAreas.map(([id, label]) => (
                    <label
                      key={id}
                      className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
                    >
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(id)}
                        onChange={() => toggle(id)}
                        className="h-4 w-4 rounded accent-blue-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving
                    ? "Saving…"
                    : form.editing
                      ? "Save changes"
                      : "Create role"}
                </button>
              </div>
            </form>
          )}
        </div>
        {deleteTarget && (
          <div className="fixed inset-0 z-[60] grid place-items-center bg-neutral-950/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Move users before deleting
              </h3>
              <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                {deleteTarget.assigned_count || 0} user
                {deleteTarget.assigned_count === 1 ? " is" : "s are"} assigned
                to {deleteTarget.name}. Choose the role that should receive
                them.
              </p>
              <select
                className={inputClass}
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
              >
                {roles
                  .filter((role) => role.id !== deleteTarget.id)
                  .map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
              </select>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onDelete(deleteTarget.id, replacement);
                    setDeleteTarget(null);
                  }}
                  className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Move users and delete
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function PanelUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = React.useState([]);
  const [roles, setRoles] = React.useState(() =>
    builtInRoles.map(([id, name, description, permissions]) => ({
      id,
      name,
      description,
      permissions,
      system_role: true,
    })),
  );
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [modal, setModal] = React.useState(false);
  const [roleModal, setRoleModal] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [toast, setToast] = React.useState(null);
  roleOptionsForLabels = roles;

  const loadUsers = React.useCallback(async () => {
    const response = await apiRequest("/api/v1/users");
    if (!response.ok)
      throw new Error(
        await readApiError(response, "Could not load panel users."),
      );
    const payload = await response.json();
    setUsers(Array.isArray(payload.users) ? payload.users : []);
    setError("");
  }, []);

  const loadRoles = React.useCallback(async () => {
    const response = await apiRequest("/api/v1/users/roles");
    if (!response.ok)
      throw new Error(await readApiError(response, "Could not load roles."));
    const payload = await response.json();
    setRoles(Array.isArray(payload.roles) ? payload.roles : []);
  }, []);

  React.useEffect(() => {
    let active = true;
    Promise.all([loadUsers(), loadRoles()])
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadUsers]);

  React.useEffect(() => {
    const refresh = () =>
      loadUsers().catch((requestError) => setError(requestError.message));
    window.addEventListener("serverengine:users", refresh);
    const refreshRoles = () =>
      loadRoles().catch((requestError) => setError(requestError.message));
    window.addEventListener("serverengine:roles", refreshRoles);
    return () => {
      window.removeEventListener("serverengine:users", refresh);
      window.removeEventListener("serverengine:roles", refreshRoles);
    };
  }, [loadUsers, loadRoles]);

  async function createUser(form) {
    setSaving(true);
    try {
      const response = await apiRequest("/api/v1/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, "Could not create panel user."),
        );
      setModal(false);
      setToast({ type: "success", message: "Panel user created." });
      await loadUsers();
    } finally {
      setSaving(false);
    }
  }

  async function saveRole(form) {
    setSaving(true);
    try {
      const { editing, ...payload } = form;
      const response = await apiRequest(
        editing
          ? `/api/v1/users/roles/${encodeURIComponent(form.id)}`
          : "/api/v1/users/roles",
        { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) },
      );
      if (!response.ok)
        throw new Error(
          await readApiError(
            response,
            editing ? "Could not update role." : "Could not create role.",
          ),
        );
      await loadRoles();
      setToast({
        type: "success",
        message: editing ? "Role updated." : "Role created.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(roleId, replacementRole) {
    const response = await apiRequest(
      `/api/v1/users/roles/${encodeURIComponent(roleId)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ replacement_role: replacementRole }),
      },
    );
    if (!response.ok) {
      setToast({
        type: "error",
        message: await readApiError(response, "Could not delete role."),
      });
      return;
    }
    await loadRoles();
    setToast({ type: "success", message: "Role deleted." });
  }

  const visible = users.filter((user) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "active"
        ? user.status === "active"
        : filter === "suspended"
          ? user.status !== "active"
          : user.role === filter);
    const haystack =
      `${user.display_name} ${user.username} ${user.email} ${user.role}`.toLowerCase();
    return matchesFilter && haystack.includes(query.toLowerCase());
  });
  const activeCount = users.filter((user) => user.status === "active").length;
  const adminCount = users.filter(
    (user) => user.role === "administrator",
  ).length;

  return (
    <div className="space-y-7">
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
      <header className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <Users size={23} />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Server administration
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Panel users
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
              Manage the people who can sign in to Server Engine. Hosting
              accounts for websites are managed separately.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/roles")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Manage roles
          </button>
          <button
            onClick={() => setModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <CirclePlus size={17} /> Create user
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          [Users, "Total users", users.length, "All panel identities"],
          [ShieldCheck, "Administrators", adminCount, "Full panel access"],
          [CheckCircle2, "Active", activeCount, "Currently allowed to sign in"],
        ].map(([Icon, label, value, detail]) => (
          <div key={label} className={`${panelClass} p-5`}>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                <Icon size={18} />
              </span>
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {label}
                </p>
                <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                  {value}
                </strong>
              </div>
            </div>
            <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
              {detail}
            </p>
          </div>
        ))}
      </section>

      <section className={`${panelClass} overflow-hidden`}>
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 p-5 dark:border-neutral-800 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              User directory
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Create another administrator here without creating a hosting
              account.
            </p>
          </div>
          <label className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-950">
            <Search size={16} />
            <input
              className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100"
              placeholder="Search users"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          {[
            ["all", "All users"],
            ["active", "Active"],
            ["administrator", "Administrators"],
            ["operator", "Operators"],
            ["suspended", "Suspended"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${filter === id ? "bg-blue-600 text-white" : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"}`}
            >
              {label}
            </button>
          ))}
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
                  className="h-16 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800"
                />
              ))}
            </div>
          ) : (
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Last sign-in</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-neutral-100 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-950"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          <UserRound size={16} />
                        </span>
                        <span>
                          <strong className="block text-sm text-neutral-900 dark:text-neutral-100">
                            {user.display_name || user.username}
                          </strong>
                          <small className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                            {user.username}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-neutral-700 dark:text-neutral-300">
                      {roleLabel(user.role)}
                    </td>
                    <td className="px-4 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                      {user.email || "—"}
                    </td>
                    <td className="px-4 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleString()
                        : "Never"}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-2 text-xs font-semibold ${user.status === "active" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {user.status === "active" ? "Active" : "Suspended"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        title="More user actions"
                        className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        <MoreHorizontal size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !error && visible.length === 0 && (
            <div className="px-5 py-16 text-center">
              <Users
                className="mx-auto text-neutral-300 dark:text-neutral-700"
                size={32}
              />
              <p className="mt-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                No users found
              </p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Create a panel user or change the current filter.
              </p>
            </div>
          )}
        </div>
      </section>

      {modal && (
        <UserFormModal
          roles={roles}
          onClose={() => setModal(false)}
          onCreate={createUser}
          saving={saving}
        />
      )}
      {roleModal && (
        <RoleManagerTabs
          roles={roles}
          onClose={() => setRoleModal(false)}
          onSave={saveRole}
          onDelete={deleteRole}
          saving={saving}
        />
      )}
    </div>
  );
}
