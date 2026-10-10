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
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import Toast from "../../components/Toast";
import FormField from "../../components/FormField";
import { z } from "zod";

const tabs = [
  ["overview", "Overview"],
  ["schedules", "Schedules"],
  ["archives", "Archives"],
];
const input =
  "mt-2 block min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const panel =
  "rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";

const backupSchema = z.object({
  scope: z.enum(["server", "websites", "panel"]),
  destination: z.literal("local"),
  compression: z.enum(["balanced", "fast", "maximum"]),
});

const backupScheduleSchema = z.object({
  name: z.string().trim().min(1, "Schedule name is required."),
  scope: z.enum(["server", "websites", "database", "panel"]),
  target: z.string().min(1, "Choose a backup target."),
  compression: z.enum(["balanced", "fast", "maximum"]),
  minute: z.string().trim().min(1, "Minute is required."),
  hour: z.string().trim().min(1, "Hour is required."),
  day: z.string().trim().min(1, "Day is required."),
  month: z.string().trim().min(1, "Month is required."),
  weekday: z.string().trim().min(1, "Weekday is required."),
  enabled: z.boolean(),
});

const backupConfigSchema = z.object({
  local_root: z.string(),
  compression: z.enum(["balanced", "fast", "maximum"]),
  retain_local: z.boolean(),
  destinations: z.array(
    z
      .object({
        id: z.string().min(1),
        type: z.enum(["s3", "sftp"]),
        name: z.string().trim().min(1, "Destination name is required."),
        endpoint: z.string().trim().optional(),
        region: z.string().trim().optional(),
        bucket: z.string().trim().optional(),
        prefix: z.string().optional(),
        access_key_id: z.string().trim().optional(),
        secret_access_key: z.string().optional(),
        host: z.string().trim().optional(),
        port: z.string().regex(/^\d+$/, "Port must be a number.").optional(),
        username: z.string().trim().optional(),
        remote_path: z.string().trim().optional(),
        private_key: z.string().optional(),
      })
      .superRefine((destination, context) => {
        const required = (key, message) => {
          if (!destination[key])
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [key],
              message,
            });
        };
        if (destination.type === "s3") {
          required("endpoint", "S3 endpoint is required.");
          if (
            destination.endpoint &&
            !/^https?:\/\//i.test(destination.endpoint)
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["endpoint"],
              message: "Use an HTTP or HTTPS endpoint.",
            });
          }
          required("region", "S3 region is required.");
          required("bucket", "S3 bucket is required.");
          required("access_key_id", "Access key ID is required.");
        } else {
          required("host", "SFTP host is required.");
          required("username", "SFTP username is required.");
          required("remote_path", "Remote folder is required.");
          if (!destination.port) required("port", "SFTP port is required.");
          if (
            destination.port &&
            (Number(destination.port) < 1 || Number(destination.port) > 65535)
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["port"],
              message: "Port must be between 1 and 65535.",
            });
          }
        }
      }),
  ),
});

function BackupModal({ onClose, onCreate, creating, error }) {
  const [form, setForm] = React.useState({
    scope: "websites",
    destination: "local",
    compression: "balanced",
  });
  const [fieldErrors, setFieldErrors] = React.useState({});
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const changeField = (key, value) => {
    change(key, value);
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const submit = (event) => {
    event.preventDefault();
    const result = backupSchema.safeParse(form);
    if (!result.success) {
      setFieldErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      );
      return;
    }
    setFieldErrors({});
    onCreate(result.data);
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/60 p-4"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !creating && onClose()
      }
    >
      <form
        className="w-full max-w-xl rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        noValidate
        onSubmit={submit}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Backup operation
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              Create backup
            </h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Choose what to capture and where the restore point should be
              stored.
            </p>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 space-y-5">
          <FormField label="Backup scope" error={fieldErrors.scope}>
            <select
              className={input}
              value={form.scope}
              onChange={(event) => changeField("scope", event.target.value)}
            >
              <option value="server">Full server state</option>
              <option value="websites">Websites and databases</option>
              <option value="panel">Panel configuration</option>
            </select>
          </FormField>
          <FormField label="Destination" error={fieldErrors.destination}>
            <select
              className={input}
              value={form.destination}
              onChange={(event) =>
                changeField("destination", event.target.value)
              }
            >
              <option value="local">Local backup storage</option>
            </select>
          </FormField>
          <FormField
            label="Compression profile"
            error={fieldErrors.compression}
          >
            <select
              className={input}
              value={form.compression}
              onChange={(event) =>
                changeField("compression", event.target.value)
              }
            >
              <option value="balanced">Balanced</option>
              <option value="fast">Fastest</option>
              <option value="maximum">Smallest archive</option>
            </select>
          </FormField>
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-500" />
          <span>
            The backup will be queued and verified after creation. Existing
            archives will not be overwritten.
          </span>
        </div>
        {error && (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            {creating ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <CirclePlus size={16} />
            )}
            {creating ? "Starting…" : "Start backup"}
          </button>
        </div>
      </form>
    </div>
  );
}

const newDestination = (type = "s3") => ({
  id: crypto.randomUUID(),
  name: type === "s3" ? "S3 archive" : "SFTP archive",
  type,
  endpoint: "https://s3.amazonaws.com",
  region: "us-east-1",
  bucket: "",
  prefix: "server-engine/",
  access_key_id: "",
  secret_access_key: "",
  host: "",
  port: "22",
  username: "",
  remote_path: "/backups",
  private_key: "",
});

function BackupConfigModal({
  onClose,
  initial,
  loading,
  saving,
  testing,
  error,
  onSave,
  onTest,
}) {
  const [form, setForm] = React.useState(
    initial || {
      local_root: "",
      compression: "balanced",
      retain_local: true,
      destinations: [],
    },
  );
  const [tab, setTab] = React.useState("current");
  const [fieldErrors, setFieldErrors] = React.useState({});
  React.useEffect(() => {
    if (initial) {
      setForm(initial);
      setFieldErrors({});
    }
  }, [initial]);
  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const updateDestination = (id, key, value) => {
    setForm((current) => ({
      ...current,
      destinations: current.destinations.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    }));
    setFieldErrors((current) => {
      const field = `${id}.${key}`;
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };
  const removeDestination = (id) =>
    setForm((current) => ({
      ...current,
      destinations: current.destinations.filter((item) => item.id !== id),
    }));
  const submit = (event) => {
    event.preventDefault();
    const result = backupConfigSchema.safeParse({
      ...form,
      local_root: "/server-engine/backups",
    });
    if (!result.success) {
      const errors = Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      );
      setFieldErrors(errors);
      if (Object.keys(errors).some((key) => key.includes(".")))
        setTab("destinations");
      return;
    }
    setFieldErrors({});
    onSave(result.data);
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="w-full max-w-3xl rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Backup storage
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Configure backup destinations
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Choose where verified archives live and test every remote
              destination before using it.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close backup configuration"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="border-b border-neutral-200 px-5 dark:border-neutral-800">
          <div className="flex gap-5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              ["current", HardDrive, "Current storage"],
              ["destinations", Cloud, "Destinations"],
            ].map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"}`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="space-y-4 p-5">
            <div className="h-20 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-36 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
          </div>
        ) : (
          <form
            className="max-h-[72vh] space-y-6 overflow-y-auto p-5"
            noValidate
            onSubmit={submit}
          >
            {error && (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                {error}
              </p>
            )}
            {Object.keys(fieldErrors).length > 0 && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                <p className="font-semibold">
                  Please correct these backup settings.
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {Object.values(fieldErrors).map((message, index) => (
                    <li key={`${message}-${index}`}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            {tab === "destinations" &&
              Object.keys(fieldErrors).some((key) => key.includes(".")) && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                  Remote destination validation details are listed above.
                  Correct them before saving.
                </div>
              )}
            {tab === "current" && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Local storage
                </h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_190px]">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Backup folder
                    <input
                      required
                      readOnly
                      className={`${input} cursor-default bg-neutral-50 dark:bg-neutral-900`}
                      value="/server-engine/backups"
                      aria-describedby="backup-folder-help"
                    />
                  </label>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Compression
                    <select
                      className={input}
                      value={form.compression || "balanced"}
                      onChange={(event) =>
                        set("compression", event.target.value)
                      }
                    >
                      <option value="fast">Fast</option>
                      <option value="balanced">Balanced</option>
                      <option value="maximum">Maximum compression</option>
                    </select>
                  </label>
                </div>
                <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                    checked={form.retain_local !== false}
                    onChange={(event) =>
                      set("retain_local", event.target.checked)
                    }
                  />
                  Keep a local copy after remote upload
                </label>
              </div>
            )}
            {tab === "destinations" && (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      Remote destinations
                    </h3>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Add S3-compatible object storage or an SFTP server for
                      off-site copies.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          destinations: [
                            ...current.destinations,
                            newDestination("s3"),
                          ],
                        }))
                      }
                    >
                      <Cloud size={14} /> Add S3
                    </button>
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          destinations: [
                            ...current.destinations,
                            newDestination("sftp"),
                          ],
                        }))
                      }
                    >
                      <Upload size={14} /> Add SFTP
                    </button>
                  </div>
                </div>
                {form.destinations?.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-neutral-300 px-4 py-7 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                    No remote destinations configured. Local archives will
                    continue to work.
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {form.destinations.map((destination) => (
                      <div
                        key={destination.id}
                        className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                              {destination.type === "s3"
                                ? "S3-compatible storage"
                                : "SFTP server"}
                            </p>
                            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                              Credentials are stored securely and never returned
                              to the browser.
                            </p>
                          </div>
                          <button
                            type="button"
                            className="cursor-pointer text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400"
                            onClick={() => removeDestination(destination.id)}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                            Name
                            <input
                              required
                              className={input}
                              value={destination.name || ""}
                              onChange={(event) =>
                                updateDestination(
                                  destination.id,
                                  "name",
                                  event.target.value,
                                )
                              }
                              placeholder="Nightly S3"
                            />
                          </label>
                          {destination.type === "s3" ? (
                            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                              Endpoint
                              <input
                                required
                                className={input}
                                value={destination.endpoint || ""}
                                onChange={(event) =>
                                  updateDestination(
                                    destination.id,
                                    "endpoint",
                                    event.target.value,
                                  )
                                }
                                placeholder="https://s3.amazonaws.com"
                              />
                            </label>
                          ) : (
                            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                              Host
                              <input
                                required
                                className={input}
                                value={destination.host || ""}
                                onChange={(event) =>
                                  updateDestination(
                                    destination.id,
                                    "host",
                                    event.target.value,
                                  )
                                }
                                placeholder="backup.example.com"
                              />
                            </label>
                          )}
                          {destination.type === "s3" ? (
                            <>
                              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Region
                                <input
                                  required
                                  className={input}
                                  value={destination.region || ""}
                                  onChange={(event) =>
                                    updateDestination(
                                      destination.id,
                                      "region",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="us-east-1"
                                />
                              </label>
                              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Bucket
                                <input
                                  required
                                  className={input}
                                  value={destination.bucket || ""}
                                  onChange={(event) =>
                                    updateDestination(
                                      destination.id,
                                      "bucket",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="server-backups"
                                />
                              </label>
                              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Path prefix
                                <input
                                  className={input}
                                  value={destination.prefix || ""}
                                  onChange={(event) =>
                                    updateDestination(
                                      destination.id,
                                      "prefix",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="server-engine/"
                                />
                              </label>
                              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Access key ID
                                <input
                                  required
                                  className={input}
                                  value={destination.access_key_id || ""}
                                  onChange={(event) =>
                                    updateDestination(
                                      destination.id,
                                      "access_key_id",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 sm:col-span-2">
                                Secret access key
                                <input
                                  type="password"
                                  className={input}
                                  value={destination.secret_access_key || ""}
                                  onChange={(event) =>
                                    updateDestination(
                                      destination.id,
                                      "secret_access_key",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Leave blank to keep the saved key"
                                />
                              </label>
                            </>
                          ) : (
                            <>
                              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Port
                                <input
                                  required
                                  type="number"
                                  min="1"
                                  max="65535"
                                  className={input}
                                  value={destination.port || "22"}
                                  onChange={(event) =>
                                    updateDestination(
                                      destination.id,
                                      "port",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Username
                                <input
                                  required
                                  className={input}
                                  value={destination.username || ""}
                                  onChange={(event) =>
                                    updateDestination(
                                      destination.id,
                                      "username",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Remote folder
                                <input
                                  required
                                  className={input}
                                  value={destination.remote_path || ""}
                                  onChange={(event) =>
                                    updateDestination(
                                      destination.id,
                                      "remote_path",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="/backups"
                                />
                              </label>
                              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 sm:col-span-2">
                                Private key
                                <textarea
                                  className={`${input} min-h-28 font-mono text-xs`}
                                  value={destination.private_key || ""}
                                  onChange={(event) =>
                                    updateDestination(
                                      destination.id,
                                      "private_key",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Paste an OpenSSH private key, or enter a server-side key path. Leave blank to keep the saved key."
                                />
                              </label>
                            </>
                          )}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            Test before saving to verify access.
                          </span>
                          <button
                            type="button"
                            disabled={testing === destination.id}
                            className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60 dark:text-blue-400"
                            onClick={() => onTest(destination)}
                          >
                            {testing === destination.id && (
                              <RefreshCw size={14} className="animate-spin" />
                            )}{" "}
                            {testing === destination.id
                              ? "Testing…"
                              : "Test connection"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                disabled={saving}
                className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
              >
                {saving && <RefreshCw size={15} className="animate-spin" />}
                {saving ? "Saving…" : "Save configuration"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function ScheduleModal({
  onClose,
  onSave,
  websites,
  databases,
  saving,
  error,
}) {
  const [form, setForm] = React.useState({
    name: "",
    scope: "websites",
    target: "all",
    compression: "balanced",
    minute: "0",
    hour: "2",
    day: "*",
    month: "*",
    weekday: "*",
    enabled: true,
  });
  const [fieldErrors, setFieldErrors] = React.useState({});
  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const targets =
    form.scope === "websites"
      ? websites
      : form.scope === "database"
        ? databases
        : [];
  const submit = (event) => {
    event.preventDefault();
    const result = backupScheduleSchema.safeParse(form);
    if (!result.success) {
      setFieldErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      );
      return;
    }
    setFieldErrors({});
    const targetType =
      result.data.target === "all"
        ? "all"
        : result.data.scope === "websites"
          ? "website"
          : "database";
    onSave({
      ...result.data,
      target_type: targetType,
      target_id: result.data.target === "all" ? null : result.data.target,
    });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Backup schedule
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Schedule a backup
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              The panel scheduler runs this backup and records its result.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close backup schedule"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <form className="space-y-5 p-5" noValidate onSubmit={submit}>
          {error && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Schedule name" error={fieldErrors.name}>
              <input
                className={input}
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Daily website backup"
              />
            </FormField>
            <FormField label="Backup scope" error={fieldErrors.scope}>
              <select
                className={input}
                value={form.scope}
                onChange={(event) => {
                  set("scope", event.target.value);
                  set("target", "all");
                }}
              >
                <option value="server">Full server state</option>
                <option value="websites">Websites</option>
                <option value="database">Databases</option>
                <option value="panel">Panel configuration</option>
              </select>
            </FormField>
            {targets.length > 0 && (
              <FormField label="Target" error={fieldErrors.target}>
                <select
                  className={input}
                  value={form.target}
                  onChange={(event) => set("target", event.target.value)}
                >
                  <option value="all">
                    All {form.scope === "websites" ? "websites" : "databases"}
                  </option>
                  {targets.map((target) => {
                    const value =
                      form.scope === "database" ? target.name : target.id;
                    return (
                      <option key={value} value={value}>
                        {target.domain || target.name}
                      </option>
                    );
                  })}
                </select>
              </FormField>
            )}
            <FormField label="Compression" error={fieldErrors.compression}>
              <select
                className={input}
                value={form.compression}
                onChange={(event) => set("compression", event.target.value)}
              >
                <option value="balanced">Balanced</option>
                <option value="fast">Fastest</option>
                <option value="maximum">Smallest archive</option>
              </select>
            </FormField>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Run schedule
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-5">
              {[
                ["minute", "Minute"],
                ["hour", "Hour"],
                ["day", "Day"],
                ["month", "Month"],
                ["weekday", "Weekday"],
              ].map(([key, label]) => (
                <FormField key={key} label={label} error={fieldErrors[key]}>
                  <input
                    className={input}
                    value={form[key]}
                    onChange={(event) => set(key, event.target.value)}
                  />
                </FormField>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              Cron:{" "}
              <code className="rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-800">
                {form.minute} {form.hour} {form.day} {form.month} {form.weekday}
              </code>
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
              checked={form.enabled}
              onChange={(event) => set("enabled", event.target.checked)}
            />
            Enable this schedule
          </label>
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
              disabled={saving}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
            >
              {saving && <RefreshCw size={15} className="animate-spin" />}
              {saving ? "Saving…" : "Save schedule"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SchedulesPanel({
  schedules,
  loading,
  onAdd,
  onRun,
  onToggle,
  onDelete,
  menu,
  onMenu,
}) {
  return (
    <div className="p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Backup schedules
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Run general, website, or database backups automatically.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={onAdd}
        >
          <CirclePlus size={15} /> Add schedule
        </button>
      </div>
      {loading ? (
        <div className="mt-5 space-y-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-14 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800"
            />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="mt-5 rounded-md border border-dashed border-neutral-300 px-4 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No backup schedules yet. Add one to run backups automatically.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <th className="px-3 py-3">Schedule</th>
                <th className="px-3 py-3">Target</th>
                <th className="px-3 py-3">Frequency</th>
                <th className="px-3 py-3">Last run</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {schedules.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-neutral-100 dark:border-neutral-800"
                >
                  <td className="px-3 py-4">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {job.name}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {job.backup?.scope || "Backup"} ·{" "}
                      {job.backup?.compression || "balanced"}
                    </p>
                  </td>
                  <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                    {job.backup?.target_type === "all"
                      ? `All ${job.backup?.scope || "server"}`
                      : job.backup?.target_id}
                  </td>
                  <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                    {job.human}
                  </td>
                  <td className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
                    {job.last}
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${job.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400"}`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${job.enabled ? "bg-emerald-500" : "bg-neutral-400"}`}
                      />
                      {job.enabled ? "Enabled" : "Paused"}
                    </span>
                  </td>
                  <td className="relative px-3 py-4 text-right">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => onMenu(event, job.id)}
                    >
                      <MoreHorizontal size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {menu && (
        <div
          className="fixed z-[70] w-48 rounded-lg border border-neutral-200 bg-white p-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
          style={{ top: menu.top, left: menu.left }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={() => onRun(menu.id)}
          >
            <Play size={14} /> Run backup now
          </button>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={() => onToggle(menu.id)}
          >
            {schedules.find((item) => item.id === menu.id)?.enabled ? (
              <>
                <Pause size={14} /> Pause schedule
              </>
            ) : (
              <>
                <Play size={14} /> Enable schedule
              </>
            )}
          </button>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
            onClick={() => onDelete(menu.id)}
          >
            <Trash2 size={14} /> Delete schedule
          </button>
        </div>
      )}
    </div>
  );
}

function ArchiveLogModal({ archive, onClose }) {
  if (!archive) return null;
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-neutral-950/60 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Archive details
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {archive.name}
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {archive.status} · {archive.scope} · {archive.destination}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-5">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Run log
          </h3>
          {archive.logs?.length ? (
            <div className="mt-3 space-y-2">
              {archive.logs.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className="break-words rounded-md bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-600 dark:bg-neutral-950 dark:text-neutral-400"
                >
                  {line}
                </p>
              ))}
              {archive.error && (
                <p className="break-words rounded-md bg-rose-50 px-3 py-2 font-mono text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                  {archive.error}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              No log entries were recorded.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function ArchivesPanel({
  archives,
  loading,
  query,
  setQuery,
  menu,
  onMenu,
  onDownload,
  onLogs,
  onDelete,
}) {
  const visible = archives.filter((item) =>
    `${item.name} ${item.scope} ${item.destination} ${item.status}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Backup archives
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Verified recovery points and their execution history.
          </p>
        </div>
        <label className="flex min-w-64 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-950">
          <Search size={16} />
          <input
            className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search archives"
          />
        </label>
      </div>
      {loading ? (
        <div className="mt-5 space-y-3">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-14 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-5 rounded-md border border-dashed border-neutral-300 px-4 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No matching backup archives.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <th className="px-3 py-3">Archive</th>
                <th className="px-3 py-3">Scope</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Size</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-neutral-100 dark:border-neutral-800"
                >
                  <td className="px-3 py-4">
                    <p
                      className="max-w-sm truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100"
                      title={item.name}
                    >
                      {item.name}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {item.destination}
                    </p>
                  </td>
                  <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                    {item.scope}
                  </td>
                  <td className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
                    {item.completed || item.created}
                  </td>
                  <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                    {item.size
                      ? `${(item.size / 1024 / 1024).toFixed(1)} MB`
                      : "—"}
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`text-xs font-semibold ${item.status === "Verified" ? "text-emerald-600 dark:text-emerald-400" : item.status === "Failed" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="relative px-3 py-4 text-right">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => onMenu(event, item.id)}
                    >
                      <MoreHorizontal size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {menu && (
        <div
          className="fixed z-[70] w-48 rounded-lg border border-neutral-200 bg-white p-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
          style={{ top: menu.top, left: menu.left }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {menu.status === "Verified" && (
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              onClick={() => onDownload(menu.id)}
            >
              <Download size={15} /> Download archive
            </button>
          )}
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={() => onLogs(menu.id)}
          >
            <Archive size={15} /> View run log
          </button>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
            onClick={() => onDelete(menu.id)}
          >
            <Trash2 size={15} /> Delete archive
          </button>
        </div>
      )}
    </div>
  );
}

export default function BackupsPage() {
  const [tab, setTab] = React.useState("overview");
  const [archives, setArchives] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [notice, setNotice] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [modalError, setModalError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(false);
  const [schedules, setSchedules] = React.useState([]);
  const [scheduleLoading, setScheduleLoading] = React.useState(true);
  const [scheduleModal, setScheduleModal] = React.useState(false);
  const [scheduleSaving, setScheduleSaving] = React.useState(false);
  const [scheduleError, setScheduleError] = React.useState("");
  const [scheduleMenu, setScheduleMenu] = React.useState(null);
  const [websites, setWebsites] = React.useState([]);
  const [databases, setDatabases] = React.useState([]);
  const [archiveMenu, setArchiveMenu] = React.useState(null);
  const [archiveLog, setArchiveLog] = React.useState(null);
  const [configModal, setConfigModal] = React.useState(false);
  const [backupConfig, setBackupConfig] = React.useState(null);
  const [configLoading, setConfigLoading] = React.useState(false);
  const [configSaving, setConfigSaving] = React.useState(false);
  const [configTesting, setConfigTesting] = React.useState("");
  const [configError, setConfigError] = React.useState("");
  const load = React.useCallback(async () => {
    setLoading(true);
    const response = await apiRequest("/api/v1/backups");
    if (response.ok) {
      setArchives(await response.json());
      setNotice("");
    } else {
      setNotice(await readApiError(response, "Unable to load backups."));
    }
    setLoading(false);
  }, []);
  const loadSchedules = React.useCallback(async () => {
    setScheduleLoading(true);
    const [scheduleResponse, websiteResponse, databaseResponse] =
      await Promise.all([
        apiRequest("/api/v1/backups/schedules"),
        apiRequest("/api/v1/websites"),
        apiRequest("/api/v1/databases?engine=mysql"),
      ]);
    if (scheduleResponse.ok) setSchedules(await scheduleResponse.json());
    if (websiteResponse.ok) setWebsites(await websiteResponse.json());
    if (databaseResponse.ok) {
      const body = await databaseResponse.json();
      setDatabases(body.databases || []);
    }
    setScheduleLoading(false);
  }, []);
  React.useEffect(() => {
    load();
    loadSchedules();
    const refresh = () => load();
    window.addEventListener("serverengine:jobs-updated", refresh);
    return () =>
      window.removeEventListener("serverengine:jobs-updated", refresh);
  }, [load, loadSchedules]);
  React.useEffect(() => {
    const closeMenu = () => {
      setScheduleMenu(null);
      setArchiveMenu(null);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);
  const createBackup = async (values) => {
    setCreating(true);
    setModalError("");
    const response = await apiRequest("/api/v1/backups", {
      method: "POST",
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setModalError(
        await readApiError(response, "Unable to start the backup."),
      );
      setCreating(false);
      return;
    }
    setModal(false);
    setCreating(false);
    setNotice(
      "Backup queued. Progress and verification logs are available in Operations.",
    );
    await load();
  };
  const saveSchedule = async (values) => {
    setScheduleSaving(true);
    setScheduleError("");
    const response = await apiRequest("/api/v1/backups/schedules", {
      method: "POST",
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setScheduleError(
        await readApiError(response, "Unable to save the backup schedule."),
      );
      setScheduleSaving(false);
      return;
    }
    setScheduleModal(false);
    setScheduleSaving(false);
    setNotice("Backup schedule saved.");
    await loadSchedules();
  };
  const toggleSchedule = async (id) => {
    const current = schedules.find((item) => item.id === id);
    setScheduleMenu(null);
    const response = await apiRequest(
      `/api/v1/backups/schedules/${id}/toggle`,
      {
        method: "POST",
        body: JSON.stringify({ enabled: !current?.enabled }),
      },
    );
    if (!response.ok)
      setNotice(await readApiError(response, "Unable to update the schedule."));
    await loadSchedules();
  };
  const runSchedule = async (id) => {
    const schedule = schedules.find((item) => item.id === id);
    const previousRun = schedule?.last_run_at || "";
    setScheduleMenu(null);
    const response = await apiRequest(`/api/v1/cron/jobs/${id}/run`, {
      method: "POST",
    });
    if (!response.ok) {
      setToast({
        type: "error",
        message: await readApiError(response, "Unable to start the backup."),
      });
      return;
    }
    setToast({
      type: "info",
      message: `${schedule?.name || "Backup"} is running…`,
    });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const statusResponse = await apiRequest(`/api/v1/cron/jobs/${id}`);
      if (!statusResponse.ok) break;
      const current = await statusResponse.json();
      if (current.last_run_at && current.last_run_at !== previousRun) {
        await Promise.all([loadSchedules(), load()]);
        setToast({
          type: current.result === "success" ? "success" : "error",
          message:
            current.result === "success"
              ? `${schedule?.name || "Backup"} completed successfully.`
              : `${schedule?.name || "Backup"} failed. Open its logs for details.`,
        });
        return;
      }
    }
    setToast({
      type: "error",
      message: `${schedule?.name || "Backup"} is still running. Check the job logs shortly.`,
    });
    await Promise.all([loadSchedules(), load()]);
  };
  const deleteSchedule = async (id) => {
    setScheduleMenu(null);
    const response = await apiRequest(`/api/v1/backups/schedules/${id}`, {
      method: "DELETE",
    });
    if (!response.ok)
      setNotice(await readApiError(response, "Unable to delete the schedule."));
    else setNotice("Backup schedule deleted.");
    await loadSchedules();
  };
  const deleteArchive = async (id) => {
    setArchiveMenu(null);
    const archive = archives.find((item) => item.id === id);
    if (
      !archive ||
      !window.confirm(`Delete ${archive.name}? This cannot be undone.`)
    )
      return;
    const response = await apiRequest(`/api/v1/backups/${id}`, {
      method: "DELETE",
    });
    setNotice(
      response.ok
        ? "Backup archive deleted."
        : await readApiError(response, "Unable to delete the archive."),
    );
    await load();
  };
  const openConfig = async () => {
    setConfigModal(true);
    setConfigLoading(true);
    setConfigError("");
    const response = await apiRequest("/api/v1/backups/config");
    if (response.ok) setBackupConfig(await response.json());
    else
      setConfigError(
        await readApiError(response, "Unable to load backup configuration."),
      );
    setConfigLoading(false);
  };
  const saveConfig = async (values) => {
    setConfigSaving(true);
    setConfigError("");
    const response = await apiRequest("/api/v1/backups/config", {
      method: "PUT",
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setConfigError(
        await readApiError(response, "Unable to save backup configuration."),
      );
      setConfigSaving(false);
      return;
    }
    const result = await response.json();
    setBackupConfig(result.config);
    setConfigSaving(false);
    setConfigModal(false);
    setNotice("Backup configuration saved.");
  };
  const testDestination = async (destination) => {
    setConfigTesting(destination.id);
    setConfigError("");
    const hasCredentials =
      destination.secret_access_key || destination.private_key;
    const response = await apiRequest("/api/v1/backups/config/test", {
      method: "POST",
      body: JSON.stringify(
        hasCredentials ? destination : { id: destination.id },
      ),
    });
    if (response.ok)
      setNotice(
        (await response.json()).message || "Destination connection verified.",
      );
    else
      setConfigError(
        await readApiError(response, "Unable to test the backup destination."),
      );
    setConfigTesting("");
  };
  const visible = archives.filter((item) =>
    `${item.name} ${item.scope} ${item.destination}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const verified = archives.filter((item) => item.status === "Verified");
  const storage = archives.reduce(
    (total, item) => total + (Number(item.size) || 0),
    0,
  );
  const formatSize = (bytes) => {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024)
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };
  const previewLog = (value) => {
    const text = value || "Waiting for job output…";
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  };
  const statusClass = (status) =>
    status === "Verified"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "Failed"
        ? "text-rose-600 dark:text-rose-400"
        : "text-amber-600 dark:text-amber-400";
  return (
    <div className="space-y-7">
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Data protection
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Backups
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-neutral-500 dark:text-neutral-400">
            Create verified restore points for websites, databases, panel
            settings, and certificates.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={openConfig}
          >
            <HardDrive size={16} />
            Configure
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
      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300">
          {notice}
        </div>
      )}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={panel}>
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-emerald-500" size={20} />
            <span>
              <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                Protection status
              </small>
              <strong
                className={`mt-1 block text-xl ${verified.length ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-900 dark:text-neutral-100"}`}
              >
                {loading
                  ? "—"
                  : verified.length
                    ? "Healthy"
                    : "No verified backup"}
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            {verified.length
              ? "Latest archive passed verification"
              : "Create a backup to protect this server"}
          </p>
        </div>
        <div className={panel}>
          <div className="flex items-center gap-3">
            <Archive className="text-blue-500" size={20} />
            <span>
              <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                Available archives
              </small>
              <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                {archives.length}
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            Ready for restore
          </p>
        </div>
        <div className={panel}>
          <div className="flex items-center gap-3">
            <CalendarClock className="text-violet-500" size={20} />
            <span>
              <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                Next scheduled run
              </small>
              <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                —
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            Configure a schedule in the Schedules tab
          </p>
        </div>
        <div className={panel}>
          <div className="flex items-center gap-3">
            <HardDrive className="text-amber-500" size={20} />
            <span>
              <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                Storage used
              </small>
              <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                {loading ? "—" : formatSize(storage)}
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            Local backup storage
          </p>
        </div>
      </section>
      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 px-5 pt-5 dark:border-neutral-800">
          <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`whitespace-nowrap border-b-2 px-4 pb-3 text-sm font-semibold ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {
          tab === "overview" ? (
            <div className="space-y-5 p-5">
              <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
                <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
                  <div className="flex items-center gap-3">
                    <HardDrive size={19} className="text-blue-500" />
                    <div>
                      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                        Backup destinations
                      </h3>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        Keep more than one recovery path available.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-4">
                    <div className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-800">
                      <span className="flex items-center gap-3">
                        <HardDrive size={17} className="text-neutral-400" />
                        <span>
                          <strong className="block text-sm text-neutral-800 dark:text-neutral-200">
                            Local storage
                          </strong>
                          <small className="text-xs text-neutral-500 dark:text-neutral-400">
                            {backupConfig?.local_root ||
                              "/server-engine/backups"}
                          </small>
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        Available
                      </span>
                    </div>
                    {(backupConfig?.destinations || []).length ? (
                      backupConfig.destinations.map((destination) => (
                        <div
                          key={destination.id}
                          className="flex items-center justify-between gap-4"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            {destination.type === "s3" ? (
                              <Cloud
                                size={17}
                                className="shrink-0 text-neutral-400"
                              />
                            ) : (
                              <Upload
                                size={17}
                                className="shrink-0 text-neutral-400"
                              />
                            )}
                            <span className="min-w-0">
                              <strong className="block truncate text-sm text-neutral-800 dark:text-neutral-200">
                                {destination.name}
                              </strong>
                              <small className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                                {destination.type === "s3"
                                  ? `${destination.bucket} · ${destination.region}`
                                  : `${destination.username}@${destination.host}`}
                              </small>
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400">
                            Configured
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-3">
                          <Cloud size={17} className="text-neutral-400" />
                          <span>
                            <strong className="block text-sm text-neutral-800 dark:text-neutral-200">
                              Remote storage
                            </strong>
                            <small className="text-xs text-neutral-500 dark:text-neutral-400">
                              Add S3 or SFTP in Configure
                            </small>
                          </span>
                        </span>
                        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                          Not configured
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
                  <div className="flex items-center gap-3">
                    <CalendarClock size={19} className="text-violet-500" />
                    <div>
                      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                        Schedule policy
                      </h3>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        Automated recovery coverage.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
                    <div className="flex justify-between border-b border-neutral-200 pb-3 dark:border-neutral-800">
                      <span>Website backups</span>
                      <strong className="text-neutral-900 dark:text-neutral-100">
                        Not configured
                      </strong>
                    </div>
                    <div className="flex justify-between border-b border-neutral-200 pb-3 dark:border-neutral-800">
                      <span>Database backups</span>
                      <strong className="text-neutral-900 dark:text-neutral-100">
                        Not configured
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Retention</span>
                      <strong className="text-neutral-900 dark:text-neutral-100">
                        30 days
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800 xl:col-span-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                        Recent backup runs
                      </h3>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        Every run records its progress, result, and verification
                        message.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      onClick={load}
                    >
                      <RefreshCw size={15} /> Refresh
                    </button>
                  </div>
                  {loading ? (
                    <div className="mt-5 space-y-3">
                      {[1, 2, 3].map((item) => (
                        <div
                          key={item}
                          className="h-12 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800"
                        />
                      ))}
                    </div>
                  ) : archives.length === 0 ? (
                    <div className="mt-5 rounded-md border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                      No backup runs yet. Create a local backup to see its live
                      job log here.
                    </div>
                  ) : (
                    <div className="mt-5 divide-y divide-neutral-200 dark:divide-neutral-800">
                      {archives.slice(0, 5).map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                              {item.name}
                            </p>
                            <p
                              className="max-w-full truncate text-xs text-neutral-500 dark:text-neutral-400"
                              title={
                                item.logs?.at(-1) ||
                                item.error ||
                                "Waiting for job output…"
                              }
                            >
                              {previewLog(item.logs?.at(-1) || item.error)}
                            </p>
                          </div>
                          <span className="flex shrink-0 items-center gap-3">
                            <span
                              className={`text-xs font-semibold ${statusClass(item.status)}`}
                            >
                              {item.status} · {formatSize(item.size)}
                            </span>
                            {item.status === "Verified" && (
                              <a
                                href={`/api/v1/backups/${item.id}/download`}
                                download
                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                              >
                                <Download size={14} /> Download
                              </a>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : tab === "schedules" ? (
            <SchedulesPanel
              schedules={schedules}
              loading={scheduleLoading}
              onAdd={() => {
                setScheduleError("");
                setScheduleModal(true);
              }}
              onRun={runSchedule}
              onToggle={toggleSchedule}
              onDelete={deleteSchedule}
              menu={scheduleMenu}
              onMenu={(event, id) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setScheduleMenu({
                  id,
                  top: rect.bottom + 5,
                  left: Math.max(8, rect.right - 176),
                });
              }}
            />
          ) : (
            <ArchivesPanel
              archives={archives}
              loading={loading}
              query={query}
              setQuery={setQuery}
              menu={archiveMenu}
              onMenu={(event, id) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const archive = archives.find((item) => item.id === id);
                setArchiveMenu({
                  id,
                  status: archive?.status,
                  top: rect.bottom + 5,
                  left: Math.max(8, rect.right - 192),
                });
              }}
              onDownload={(id) => {
                setArchiveMenu(null);
                window.location.href = `/api/v1/backups/${id}/download`;
              }}
              onLogs={(id) => {
                setArchiveMenu(null);
                setArchiveLog(archives.find((item) => item.id === id));
              }}
              onDelete={deleteArchive}
            />
          ) /* Archives is handled above; keep restore as a dedicated future workflow. */
        }
        {false && (
          <div className="p-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  {tab === "archives" ? "Backup archives" : "Scheduled backups"}
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  {tab === "archives"
                    ? "Verified recovery points available on this server."
                    : "Automated jobs and their retention policy."}
                </p>
              </div>
              <label className="flex min-w-64 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-950">
                <Search size={16} />
                <input
                  className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search archives"
                />
              </label>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
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
                      className="border-b border-neutral-100 dark:border-neutral-800"
                    >
                      <td className="px-3 py-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {item.name}
                      </td>
                      <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                        {item.scope}
                      </td>
                      <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                        {item.destination}
                      </td>
                      <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                        {formatSize(item.size)}
                      </td>
                      <td className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
                        {item.created}
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex items-center gap-2 text-xs font-semibold ${statusClass(item.status)}`}
                        >
                          {item.status === "Verified" ? (
                            <CheckCircle2 size={14} />
                          ) : (
                            <RefreshCw
                              size={14}
                              className={
                                item.status === "Running" ? "animate-spin" : ""
                              }
                            />
                          )}
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-right">
                        {item.status === "Verified" ? (
                          <a
                            href={`/api/v1/backups/${item.id}/download`}
                            download
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          >
                            <Download size={15} /> Download
                          </a>
                        ) : (
                          <MoreHorizontal
                            size={17}
                            className="ml-auto text-neutral-400"
                          />
                        )}
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
          onClose={() => {
            setModal(false);
            setModalError("");
          }}
          onCreate={createBackup}
          creating={creating}
          error={modalError}
        />
      )}
      {configModal && (
        <BackupConfigModal
          initial={backupConfig}
          loading={configLoading}
          saving={configSaving}
          testing={configTesting}
          error={configError}
          onClose={() => {
            if (!configSaving) {
              setConfigModal(false);
              setConfigError("");
            }
          }}
          onSave={saveConfig}
          onTest={testDestination}
        />
      )}
      {scheduleModal && (
        <ScheduleModal
          onClose={() => {
            setScheduleModal(false);
            setScheduleError("");
          }}
          onSave={saveSchedule}
          websites={websites}
          databases={databases}
          saving={scheduleSaving}
          error={scheduleError}
        />
      )}
      <ArchiveLogModal
        archive={archiveLog}
        onClose={() => setArchiveLog(null)}
      />
    </div>
  );
}
