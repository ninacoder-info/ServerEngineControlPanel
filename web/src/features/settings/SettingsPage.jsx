import React from "react";
import QRCode from "qrcode";
import { z } from "zod";
import {
  Bell,
  Cloud,
  Code2,
  Database,
  FileText,
  FolderCog,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Palette,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import ActionDialog from "../../components/ActionDialog";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";
import { formControlClass } from "../../components/ui/form";
import { apiRequest, readApiError } from "../../lib/api";
import { applyPanelPreferences } from "../../lib/panelPreferences";
import languageOptions from "../../data/languages.json";
import timezoneOptions from "../../data/timezones.json";

const groups = [
  [
    "panel",
    "Panel",
    SlidersHorizontal,
    "Identity, language, and regional behavior.",
  ],
  [
    "storage",
    "Web & storage",
    FolderCog,
    "Website roots, uploads, and backup policy.",
  ],
  [
    "security",
    "Security & access",
    LockKeyhole,
    "Authentication, network, and browser security.",
  ],
  ["api", "API", Code2, "External app access, tokens, and request policy."],
  [
    "notifications",
    "Notifications",
    Bell,
    "Operational alerts and delivery preferences.",
  ],
  [
    "certificates",
    "Certificates",
    ShieldCheck,
    "Certbot state and renewal policy.",
  ],
  [
    "maintenance",
    "Maintenance",
    Database,
    "Retention policies for jobs and logs.",
  ],
];
let notificationValues = {};
let certificateValues = {};
let maintenanceValues = {};
const fields = {
  notifications: [["__notifications__", "", "", "custom"]],
  certificates: [["__certificates__", "", "", "custom"]],
  maintenance: [["__maintenance__", "", "", "custom"]],
};
const input =
  "mt-2 block min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
const card = "w-full";
const row =
  "grid gap-5 py-5 md:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)] md:items-center";
const panelValues = (values) => ({
  panel_name: values.panel_name || "",
  language: values.language || "en",
  timezone: values.timezone || "UTC",
  panel_theme: values.panel_theme || "system",
  panel_density: values.panel_density || "comfortable",
  panel_accent: values.panel_accent || "blue",
  panel_landing: values.panel_landing || "overview",
  panel_date_format: values.panel_date_format || "local",
  panel_show_hints: values.panel_show_hints !== false,
  session_timeout_minutes: values.session_timeout_minutes ?? 120,
  api_enabled: values.api_enabled !== false,
  api_bind_host: values.api_bind_host || "127.0.0.1",
});
const panelSchema = z.object({
  panel_name: z.string().trim().min(1, "Panel name is required."),
  language: z.string().min(1, "Choose a panel language."),
  timezone: z.string().min(1, "Choose a timezone."),
  panel_theme: z.enum(["system", "dark", "light"]),
  panel_density: z.enum(["comfortable", "compact"]),
  panel_accent: z.string().min(1, "Choose an accent color."),
  panel_landing: z.enum(["overview", "websites", "services"]),
  panel_date_format: z.enum(["local", "iso", "relative"]),
  session_timeout_minutes: z.coerce.number().int().min(1, "Session timeout must be at least 1 minute."),
});
const storageSchema = z.object({
  default_site_root: z.string().trim().min(1, "Website root is required."),
  default_backup_root: z.string().trim().min(1, "Backup root is required."),
  storage_upload_limit_mb: z.coerce.number().int().min(1, "Upload limit must be at least 1 MB."),
  storage_required_free_mb: z.coerce.number().int().min(0, "Required free space cannot be negative."),
});
const securitySchema = z.object({
  session_timeout_minutes: z.coerce.number().int().min(1, "Session timeout must be at least 1 minute."),
  security_panel_port: z.coerce.number().int().min(1, "Port must be between 1 and 65535.").max(65535, "Port must be between 1 and 65535."),
  security_max_failed_attempts: z.coerce.number().int().min(1, "Attempts must be at least 1."),
  security_lockout_minutes: z.coerce.number().int().min(1, "Lockout must be at least 1 minute."),
});
const apiSchema = z.object({
  api_rate_limit: z.coerce.number().int().min(1, "Rate limit must be at least 1."),
  api_burst: z.coerce.number().int().min(1, "Burst must be at least 1."),
  api_max_page_size: z.coerce.number().int().min(1, "Page size must be at least 1."),
  api_token_expiry_days: z.coerce.number().int().min(1, "Token expiry must be at least 1 day."),
});
const notificationSchema = z.object({
  notification_email: z.string().email("Enter a valid notification email.").or(z.literal("")),
  notification_history_days: z.coerce.number().int().min(1, "History must be at least 1 day."),
});
const certificateSchema = z.object({
  certbot_account_email: z.string().email("Enter a valid ACME account email.").or(z.literal("")),
  certbot_renew_window_days: z.coerce.number().int().min(1, "Renewal window must be at least 1 day."),
  certbot_expiry_notify_days: z.coerce.number().int().min(1, "Expiry notice must be at least 1 day."),
  certbot_config_dir: z.string().trim().min(1, "Certificate directory is required."),
});
const maintenanceSchema = z.object({
  job_retention_days: z.coerce.number().int().min(1, "Job retention must be at least 1 day."),
  log_retention_days: z.coerce.number().int().min(1, "Log retention must be at least 1 day."),
  maintenance_stale_job_hours: z.coerce.number().int().min(1, "Stale job threshold must be at least 1 hour."),
  log_rotation_max_size_mb: z.coerce.number().int().min(1, "Maximum log size must be at least 1 MB."),
  log_rotation_retention_count: z.coerce.number().int().min(1, "Retention count must be at least 1."),
});
const validationErrors = (schema, values) => {
  const result = schema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
};
const apiSettingsValues = (values) => ({
  api_enabled: values.api_enabled !== false,
  api_bind_host: values.api_bind_host || "127.0.0.1",
  api_auth_mode: values.api_auth_mode || "tokens",
  api_version: values.api_version || "v1",
  api_require_https: values.api_require_https !== false,
  api_allowed_origins: values.api_allowed_origins || "",
  api_rate_limit: values.api_rate_limit ?? 120,
  api_burst: values.api_burst ?? 30,
  api_max_page_size: values.api_max_page_size ?? 100,
  api_webhooks_enabled: values.api_webhooks_enabled !== false,
  api_webhook_signing: values.api_webhook_signing !== false,
  api_audit_enabled: values.api_audit_enabled !== false,
  api_webhook_url: values.api_webhook_url || "",
  api_token_expiry_days: values.api_token_expiry_days ?? 90,
  api_token_allowed_ips: values.api_token_allowed_ips || "",
});
const storageValues = (values) => ({
  default_site_root: values.default_site_root || "/server-engine/www",
  default_backup_root: "/server-engine/backups",
  storage_file_manager_start: values.storage_file_manager_start || "web-root",
  storage_show_hidden_files: values.storage_show_hidden_files !== false,
  storage_verify_encoding: values.storage_verify_encoding !== false,
  storage_index_files: Array.isArray(values.storage_index_files)
    ? values.storage_index_files
    : ["index.php", "index.html"],
  storage_upload_limit_mb: values.storage_upload_limit_mb ?? 2048,
  storage_required_free_mb: values.storage_required_free_mb ?? 512,
  storage_backup_enabled: values.storage_backup_enabled !== false,
  storage_backup_type: values.storage_backup_type || "compressed",
  storage_backup_schedule: values.storage_backup_schedule || "daily",
  storage_backup_retain_local: values.storage_backup_retain_local !== false,
  storage_backup_destination: values.storage_backup_destination || "none",
  storage_backup_compression: values.storage_backup_compression || "balanced",
  storage_backup_exclusions: Array.isArray(values.storage_backup_exclusions)
    ? values.storage_backup_exclusions
    : [".git", "node_modules", "cache"],
});
const securityValues = (values) => ({
  session_timeout_minutes: values.session_timeout_minutes ?? 120,
  security_require_mfa: values.security_require_mfa === true,
  security_strong_passwords: values.security_strong_passwords !== false,
  security_panel_domain: values.security_panel_domain || "",
  security_panel_port: values.security_panel_port ?? 8888,
  security_authorized_ips: Array.isArray(values.security_authorized_ips)
    ? values.security_authorized_ips
    : [],
  security_entry_path: values.security_entry_path || "",
  security_proxy_mode: values.security_proxy_mode || "direct",
  security_require_https: values.security_require_https === true,
  security_hsts: values.security_hsts !== false,
  security_secure_cookies: values.security_secure_cookies !== false,
  security_csrf_checks: values.security_csrf_checks !== false,
  security_brute_force: values.security_brute_force !== false,
  security_max_failed_attempts: values.security_max_failed_attempts ?? 5,
  security_lockout_minutes: values.security_lockout_minutes ?? 15,
  security_audit_events: values.security_audit_events !== false,
  security_auth_alerts: values.security_auth_alerts !== false,
});
const notificationSettingsValues = (values) => ({
  notifications_enabled: values.notifications_enabled !== false,
  notification_email: values.notification_email || "",
  notification_email_channel: values.notification_email_channel !== false,
  notification_slack_channel: values.notification_slack_channel === true,
  notification_webhook_channel: values.notification_webhook_channel === true,
  notification_digest: values.notification_digest || "immediate",
  notification_quiet_hours: values.notification_quiet_hours === true,
  notification_quiet_date: values.notification_quiet_date || "",
  notification_quiet_start: values.notification_quiet_start || "22:00",
  notification_quiet_end: values.notification_quiet_end || "07:00",
  notification_failed_jobs: values.notification_failed_jobs !== false,
  notification_security_events: values.notification_security_events !== false,
  notification_certificate_expiry: values.notification_certificate_expiry !== false,
  notification_resource_thresholds: values.notification_resource_thresholds !== false,
  notification_service_health: values.notification_service_health !== false,
  notification_backup_events: values.notification_backup_events !== false,
  notification_history_days: values.notification_history_days ?? 30,
  telemetry_enabled: values.telemetry_enabled === true,
});
const certificateSettingsValues = (values) => ({
  certbot_provider: values.certbot_provider || "letsencrypt",
  certbot_account_email: values.certbot_account_email || "",
  certbot_staging: values.certbot_staging === true,
  certbot_challenge: values.certbot_challenge || "http-01",
  certbot_require_https: values.certbot_require_https !== false,
  certbot_keep_previous: values.certbot_keep_previous !== false,
  certbot_auto_renew: values.certbot_auto_renew !== false,
  certbot_renew_window_days: values.certbot_renew_window_days ?? 30,
  certbot_renewal_time: values.certbot_renewal_time || "03:00",
  certbot_expiry_notify_days: values.certbot_expiry_notify_days ?? 14,
  certbot_config_dir: values.certbot_config_dir || "/var/lib/server-engine/letsencrypt",
});
const maintenanceSettingsValues = (values) => ({
  job_retention_days: values.job_retention_days ?? 30,
  log_retention_days: values.log_retention_days ?? 30,
  maintenance_window: values.maintenance_window || "02:00-04:00",
  maintenance_auto_cleanup: values.maintenance_auto_cleanup !== false,
  maintenance_notify_before: values.maintenance_notify_before !== false,
  maintenance_show_reboot: values.maintenance_show_reboot !== false,
  maintenance_update_policy: values.maintenance_update_policy || "security",
  maintenance_health_checks: values.maintenance_health_checks !== false,
  maintenance_verify_backups: values.maintenance_verify_backups !== false,
  maintenance_notify_failed_jobs: values.maintenance_notify_failed_jobs !== false,
  maintenance_stale_job_hours: values.maintenance_stale_job_hours ?? 24,
  log_rotation_enabled: values.log_rotation_enabled !== false,
  log_rotation_max_size_mb: values.log_rotation_max_size_mb ?? 50,
  log_rotation_schedule: values.log_rotation_schedule || "daily",
  log_rotation_compression: values.log_rotation_compression || "gzip",
  log_rotation_retention_count: values.log_rotation_retention_count ?? 14,
  log_rotation_service_policies: values.log_rotation_service_policies || {},
});
const appearanceAccentColors = [
  { name: "Blue", value: "blue", color: "#007bff", className: "bg-[#007bff]" },
  { name: "Purple", value: "purple", color: "#894291", className: "bg-[#894291]" },
  { name: "Pink", value: "pink", color: "#e45c9c", className: "bg-[#e45c9c]" },
  { name: "Red", value: "red", color: "#ce4745", className: "bg-[#ce4745]" },
  { name: "Orange", value: "orange", color: "#e8883b", className: "bg-[#e8883b]" },
  { name: "Yellow", value: "yellow", color: "#f7c84e", className: "bg-[#f7c84e]" },
  { name: "Green", value: "green", color: "#78b856", className: "bg-[#78b856]" },
  { name: "Graphite", value: "graphite", color: "#989898", className: "bg-[#989898]" },
];
function Section({ icon: Icon, title, description, badge, children }) {
  return (
    <>
      <section className={card}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              <Icon size={17} />
            </span>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {title}
              </h3>
              <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                {description}
              </p>
            </div>
          </div>
          {badge && (
            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
              {badge}
            </span>
          )}
        </div>
        {children}
      </section>
      <hr className="my-6 border-0 border-t border-neutral-200 dark:border-neutral-800" />
    </>
  );
}
function Control({ label, description, children, full = false, error }) {
  const control = React.isValidElement(children) && children.type !== React.Fragment
    ? React.cloneElement(children, { className: formControlClass(children.props.className || "", Boolean(error)), "aria-invalid": error ? "true" : undefined })
    : children;
  return (
    <label className={`${row}${full ? " md:grid-cols-1" : ""}`}>
      <span>
        <strong className={`text-sm font-semibold ${error ? "text-rose-600 dark:text-rose-400" : "text-neutral-900 dark:text-neutral-100"}`}>
          {label}
        </strong>
        <small className="mt-1 block text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          {description}
        </small>
      </span>
      <span>{control}{error && <small className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">{error}</small>}</span>
    </label>
  );
}
function Toggle({ label, description, checked, onChange }) {
  return (
    <label className={row}>
      <span>
        <strong className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {label}
        </strong>
        <small className="mt-1 block text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          {description}
        </small>
      </span>
      <span className="flex justify-start md:justify-end">
        <input
          className="h-4 w-4 rounded border-neutral-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-800 dark:focus:ring-offset-neutral-900"
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </span>
    </label>
  );
}
function SelectControl({
  label,
  description,
  value,
  onChange,
  children,
  full,
}) {
  return (
    <Control label={label} description={description} full={full}>
      <select
        className={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </Control>
  );
}
function FieldSet({ label, description, children, error }) {
  const control = React.isValidElement(children)
    ? React.cloneElement(children, { className: formControlClass(children.props.className || "", Boolean(error)), "aria-invalid": error ? "true" : undefined })
    : children;
  return (
    <label className="block">
      <span className={`text-sm font-semibold ${error ? "text-rose-600 dark:text-rose-400" : "text-neutral-900 dark:text-neutral-100"}`}>
        {label}
      </span>
      <small className="mt-1 block text-sm leading-6 text-neutral-500 dark:text-neutral-400">
        {description}
      </small>
      {control}
      {error && <small className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">{error}</small>}
    </label>
  );
}
function TagInput({ value, onChange, placeholder }) {
  const [draft, setDraft] = React.useState("");
  const add = (raw) => {
    const next = raw.trim();
    if (!next || value.includes(next)) return;
    onChange([...value, next]);
    setDraft("");
  };
  const remove = (tag) => onChange(value.filter((item) => item !== tag));
  return (
    <div className="mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-md border border-neutral-300 bg-white px-2.5 py-2 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          {tag}
          <button
            type="button"
            className="cursor-pointer text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-100"
            aria-label={`Remove ${tag}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => remove(tag)}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="min-w-32 flex-1 bg-transparent py-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
        value={draft}
        placeholder={value.length ? "Add another" : placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add(draft);
          }
          if (event.key === "Backspace" && !draft && value.length) {
            remove(value[value.length - 1]);
          }
        }}
      />
    </div>
  );
}
function Notice({ children, amber = false }) {
  return (
    <div
      className={`mt-5 flex items-start gap-2 rounded-md border p-4 text-sm leading-6 ${amber ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200" : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"}`}
    >
      {children}
    </div>
  );
}
function SettingsActions({ onSave, onReset, saving, dirty, message }) {
  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{message}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onReset} disabled={saving} className="inline-flex cursor-pointer items-center justify-center rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-800">Restore defaults</button>
        <SaveButton
          onClick={onSave}
          saving={saving}
          disabled={!dirty}
          className="bg-[var(--panel-accent)] text-white hover:opacity-90"
        >
          Save API settings
        </SaveButton>
      </div>
    </div>
  );
}
function PanelTab({ values, onChange, onSave, onReset, saving, dirty, message, errors = {} }) {
  const o = {
    theme: values.panel_theme || "system",
    density: values.panel_density || "comfortable",
    accent: values.panel_accent || "blue",
    landing: values.panel_landing || "overview",
    date: values.panel_date_format || "local",
    hints: values.panel_show_hints !== false,
  };
  const set = (key, value) => onChange(key, value);
  const timezones = timezoneOptions.some((option) => option.value === values.timezone)
    ? timezoneOptions
    : [
        ...timezoneOptions,
        { value: values.timezone || "UTC", label: values.timezone || "UTC" },
      ];
  return (
    <div className="space-y-6">
      <Section
        icon={SlidersHorizontal}
        title="Panel identity"
        description="Set the name and language used across the control plane."
        badge="Core"
      >
        <Control
          label="Panel name"
          description="The name administrators see across the console."
          error={errors.panel_name}
        >
          <input
            className={input}
            value={values.panel_name || ""}
            onChange={(e) => onChange("panel_name", e.target.value)}
            placeholder="Server Engine"
          />
        </Control>
        <Control
          label="Panel language"
          description="Default locale for this installation."
          error={errors.language}
        >
          <select
            className={input}
            value={values.language || "en"}
            onChange={(e) => onChange("language", e.target.value)}
          >
            {languageOptions.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </Control>
      </Section>
      <Section
        icon={Palette}
        title="Appearance"
        description="Choose a comfortable default for this device."
      >
        <SelectControl
          label="Color theme"
          description="Default appearance for new sessions."
          value={o.theme}
          onChange={(v) => set("panel_theme", v)}
        >
          <option value="system">Use system preference</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </SelectControl>
        <SelectControl
          label="Interface density"
          description="Spacing in tables, cards, and forms."
          value={o.density}
          onChange={(v) => set("panel_density", v)}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </SelectControl>
        <Control label="Accent color" description="Interface accent color.">
          <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="Accent color">
            {appearanceAccentColors.map((accent) => {
              const selected = o.accent === accent.value;
              return (
                <button
                  key={accent.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={accent.name}
                  title={accent.name}
                  className={`relative inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-neutral-300 shadow-sm ring-offset-2 transition focus:outline-none focus:ring-2 focus:ring-[var(--panel-accent)] dark:border-neutral-600 dark:ring-offset-neutral-900 ${accent.className} ${selected ? "ring-2 ring-[var(--panel-accent)]" : "hover:border-neutral-500"}`}
                  onClick={() => set("panel_accent", accent.value)}
                >
                  {selected && <span className="h-1.5 w-1.5 rounded-full bg-white shadow-sm" />}
                </button>
              );
            })}
          </div>
        </Control>
      </Section>
      <Section
        icon={Globe2}
        title="Regional format"
        description="Keep timestamps consistent across jobs, logs, and certificates."
      >
        <Control
          label="Timezone"
          description="Used for timestamps shown by the control panel."
          error={errors.timezone}
        >
          <select
            className={input}
            value={values.timezone || ""}
            onChange={(e) => onChange("timezone", e.target.value)}
          >
            {timezones.map((timezone) => (
              <option key={timezone.value} value={timezone.value}>
                {timezone.label}
              </option>
            ))}
          </select>
        </Control>
        <SelectControl
          label="Date and time format"
          description="How dates appear in the console."
          value={o.date}
          onChange={(v) => set("panel_date_format", v)}
        >
          <option value="local">Regional default</option>
          <option value="iso">ISO 8601</option>
          <option value="relative">Relative time</option>
        </SelectControl>
      </Section>
      <Section
        icon={LayoutDashboard}
        title="Workspace behavior"
        description="Choose what administrators see first."
      >
        <SelectControl
          label="Default landing page"
          description="Open this view after signing in."
          value={o.landing}
          onChange={(v) => set("panel_landing", v)}
        >
          <option value="overview">Overview</option>
          <option value="websites">Websites</option>
          <option value="services">Services</option>
        </SelectControl>
        <Toggle
          label="Show contextual hints"
          description="Display explanations beside advanced controls."
          checked={o.hints}
          onChange={(v) => set("panel_show_hints", v)}
        />
      </Section>
      <Section
        icon={ShieldCheck}
        title="Access & session policy"
        description="Keep the control plane reachable only where intended."
        badge="Security"
      >
        <Control
          label="Session timeout"
          description="How long an authenticated session remains valid."
          error={errors.session_timeout_minutes}
        >
          <input
            className={input}
            type="number"
            min="1"
            value={values.session_timeout_minutes ?? ""}
            onChange={(e) =>
              onChange("session_timeout_minutes", Number(e.target.value))
            }
          />
        </Control>
        <SelectControl
          label="API bind address"
          description="Loopback is safest for a local panel."
          value={values.api_bind_host || "127.0.0.1"}
          onChange={(v) => onChange("api_bind_host", v)}
        >
          <option value="127.0.0.1">127.0.0.1 · loopback only</option>
          <option value="0.0.0.0">0.0.0.0 · all interfaces</option>
        </SelectControl>
        <Toggle
          label="Enable control-plane API"
          description="Keep the versioned API available for clients."
          checked={values.api_enabled !== false}
          onChange={(v) => onChange("api_enabled", v)}
        />
        <Notice amber>
          <KeyRound size={17} />
          <span>
            <strong>Recommended posture.</strong> Keep the API disabled or bound
            to loopback unless protected by HTTPS and a firewall.
          </span>
        </Notice>
      </Section>
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400" role="status">
          {message}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={onReset}
            disabled={saving}
          >
            <RotateCcw size={16} />
            Restore defaults
          </button>
          <SaveButton
            onClick={onSave}
            saving={saving}
            disabled={!dirty}
            className="bg-[var(--panel-accent)] text-white hover:opacity-90"
          >
            Save panel settings
          </SaveButton>
        </div>
      </div>
    </div>
  );
}
function StorageTab({ values, onChange, onSave, onReset, saving, dirty, message, errors = {} }) {
  const o = storageValues(values);
  const set = (key, value) => onChange(key, value);
  return (
    <div className="space-y-6">
      <Section
        icon={Globe2}
        title="Website storage layout"
        description="Define where new sites and generated content should live."
        badge="Websites"
      >
        <Control
          full
          label="Default website root"
          description="Parent directory for new websites and deployments."
          error={errors.default_site_root}
        >
          <input
            className={input}
            value={values.default_site_root || ""}
            onChange={(e) => onChange("default_site_root", e.target.value)}
            placeholder="/server-engine/www"
          />
        </Control>
        <Control
          full
          label="Default index files"
          description="Ordered fallback files served for a directory request."
        >
          <TagInput
            value={o.storage_index_files}
            onChange={(next) => set("storage_index_files", next)}
            placeholder="index.php"
          />
        </Control>
      </Section>
      <Section
        icon={FolderCog}
        title="File manager behavior"
        description="Control the starting location and safer editing defaults."
      >
        <SelectControl
          label="Open file manager at"
          description="First location shown when File Manager opens."
          value={o.storage_file_manager_start}
          onChange={(v) => set("storage_file_manager_start", v)}
        >
          <option value="web-root">Website root</option>
          <option value="home">Managed home directory</option>
          <option value="last-used">Last used location</option>
        </SelectControl>
        <Toggle
          label="Show hidden files"
          description="Display dotfiles such as .env and .well-known."
          checked={o.storage_show_hidden_files}
          onChange={(v) => set("storage_show_hidden_files", v)}
        />
        <Toggle
          label="Verify text encoding before editing"
          description="Warn before opening files whose encoding may be unsafe."
          checked={o.storage_verify_encoding}
          onChange={(v) => set("storage_verify_encoding", v)}
        />
      </Section>
      <Section
        icon={Upload}
        title="Uploads and filesystem limits"
        description="Prevent oversized uploads and protect service availability."
      >
        <Control
          label="Maximum upload size"
          description="Applies to File Manager and future deployment uploads."
          error={errors.storage_upload_limit_mb}
        >
          <input
            className={input}
            type="number"
            min="1"
            value={o.storage_upload_limit_mb}
            onChange={(e) => set("storage_upload_limit_mb", Number(e.target.value))}
          />
        </Control>
        <Control
          label="Required free space"
          description="Reject uploads below this filesystem reserve."
          error={errors.storage_required_free_mb}
        >
          <input
            className={input}
            type="number"
            min="0"
            value={o.storage_required_free_mb}
            onChange={(e) => set("storage_required_free_mb", Number(e.target.value))}
          />
        </Control>
        <Notice amber>
          <ShieldCheck size={17} />
          <span>
            <strong>Safe default.</strong> Keep a free-space reserve so uploads
            cannot starve services.
          </span>
        </Notice>
      </Section>
      <Section
        icon={Database}
        title="Backup schedule and retention"
        description="Model the backup policy used for websites, databases, and panel state."
        badge="Protection"
      >
        <Toggle
          label="Enable scheduled backups"
          description="Create recurring backups according to the schedule below."
          checked={o.storage_backup_enabled}
          onChange={(v) => set("storage_backup_enabled", v)}
        />
        <SelectControl
          full
          label="Backup type"
          description="Balance speed and storage use."
          value={o.storage_backup_type}
          onChange={(v) => set("storage_backup_type", v)}
        >
          <option value="compressed">Compressed</option>
          <option value="incremental">Incremental</option>
          <option value="uncompressed">Uncompressed</option>
        </SelectControl>
        <SelectControl
          full
          label="Schedule"
          description="How often to create a backup set."
          value={o.storage_backup_schedule}
          onChange={(v) => set("storage_backup_schedule", v)}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </SelectControl>
        <Toggle
          label="Retain local copies after transfer"
          description="Keep a local restore point after remote transfer."
          checked={o.storage_backup_retain_local}
          onChange={(v) => set("storage_backup_retain_local", v)}
        />
      </Section>
      <Section
        icon={Cloud}
        title="Backup destinations"
        description="Prepare local, S3-compatible, SFTP, and other remote targets."
      >
        <SelectControl
          full
          label="Primary destination"
          description="Where scheduled backups should be sent."
          value={o.storage_backup_destination}
          onChange={(v) => set("storage_backup_destination", v)}
        >
          <option value="none">Local storage only</option>
          <option value="s3">S3-compatible object storage</option>
          <option value="sftp">SFTP server</option>
          <option value="ftp">FTP server</option>
        </SelectControl>
        <SelectControl
          full
          label="Compression profile"
          description="Tune CPU usage against backup size."
          value={o.storage_backup_compression}
          onChange={(v) => set("storage_backup_compression", v)}
        >
          <option value="balanced">Balanced</option>
          <option value="fast">Fast</option>
          <option value="maximum">Maximum</option>
        </SelectControl>
      </Section>
      <Section
        icon={ShieldCheck}
        title="Exclusions and recovery safety"
        description="Reduce backup noise and make the restore boundary explicit."
      >
        <Control
          full
          label="Exclude paths or patterns"
          description="Comma-separated directories excluded from routine backups."
        >
          <TagInput
            value={o.storage_backup_exclusions}
            onChange={(next) => set("storage_backup_exclusions", next)}
            placeholder=".git"
          />
        </Control>
      </Section>
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400" role="status">
          {message}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={onReset}
            disabled={saving}
          >
            <RotateCcw size={16} />
            Restore defaults
          </button>
          <SaveButton
            onClick={onSave}
            saving={saving}
            disabled={!dirty}
            className="bg-[var(--panel-accent)] text-white hover:opacity-90"
          >
            Save storage settings
          </SaveButton>
        </div>
      </div>
    </div>
  );
}
function SecurityTab({ values, onChange, onSave, onReset, saving, dirty, message, errors = {} }) {
  const o = securityValues(values);
  const set = (key, value) => onChange(key, value);
  return (
    <div className="space-y-6">
      <Section
        icon={KeyRound}
        title="Authentication & session policy"
        description="Reduce account takeover risk and control trusted browser sessions."
        badge="Identity"
      >
        <Control
          label="Session timeout"
          description="Authenticated sessions expire after inactivity."
          error={errors.session_timeout_minutes}
        >
          <input
            className={input}
            type="number"
            min="1"
            value={values.session_timeout_minutes ?? ""}
            onChange={(e) =>
              onChange("session_timeout_minutes", Number(e.target.value))
            }
          />
        </Control>
        <Toggle
          label="Require multi-factor authentication"
          description="Require a time-based code after the password step."
          checked={o.security_require_mfa}
          onChange={(v) => set("security_require_mfa", v)}
        />
        <Toggle
          label="Enforce strong administrator passwords"
          description="Require length, mixed case, numbers, and symbols."
          checked={o.security_strong_passwords}
          onChange={(v) => set("security_strong_passwords", v)}
        />
      </Section>
      <Section
        icon={Globe2}
        title="Panel network boundary"
        description="Restrict where the control plane can be reached."
        badge="Network"
      >
        <Control
          full
          label="Panel domain"
          description="Optional hostname for administrative access."
        >
          <input
            className={input}
            value={o.security_panel_domain}
            onChange={(e) => set("security_panel_domain", e.target.value)}
            placeholder="panel.example.com"
          />
        </Control>
        <Control
          full
          label="Panel port"
          description="The host firewall must allow this value."
          error={errors.security_panel_port}
        >
          <input
            className={input}
            type="number"
            value={o.security_panel_port}
            onChange={(e) => set("security_panel_port", Number(e.target.value))}
          />
        </Control>
        <Control
          full
          label="Authorized IP addresses"
          description="Comma-separated IPs or CIDR ranges."
        >
          <TagInput
            value={o.security_authorized_ips}
            onChange={(next) => set("security_authorized_ips", next)}
            placeholder="203.0.113.10"
          />
        </Control>
        <Control
          full
          label="Security entrance"
          description="Optional private path required before login."
        >
          <input
            className={input}
            value={o.security_entry_path}
            onChange={(e) => set("security_entry_path", e.target.value)}
            placeholder="/admin-gate"
          />
        </Control>
        <SelectControl
          full
          label="Proxy and CDN mode"
          description="Interpret the original client address behind a proxy."
          value={o.security_proxy_mode}
          onChange={(v) => set("security_proxy_mode", v)}
        >
          <option value="direct">Direct connection</option>
          <option value="trusted">Trusted reverse proxy</option>
          <option value="cdn">CDN or edge proxy</option>
        </SelectControl>
        <Notice amber>
          <LockKeyhole size={17} />
          <span>
            <strong>Lockout warning.</strong> Test the emergency path before
            applying an IP allowlist.
          </span>
        </Notice>
      </Section>
      <Section
        icon={ShieldCheck}
        title="Encryption & browser protections"
        description="Protect credentials, cookies, and state-changing requests."
      >
        <Toggle
          label="Require HTTPS for the panel"
          description="Redirect insecure panel traffic."
          checked={o.security_require_https}
          onChange={(v) => set("security_require_https", v)}
        />
        <Toggle
          label="Enable HSTS"
          description="Tell browsers to prefer HTTPS."
          checked={o.security_hsts}
          onChange={(v) => set("security_hsts", v)}
        />
        <Toggle
          label="Secure session cookies"
          description="Only send cookies over HTTPS."
          checked={o.security_secure_cookies}
          onChange={(v) => set("security_secure_cookies", v)}
        />
        <Toggle
          label="Require CSRF and referrer checks"
          description="Reject mutations outside the trusted panel context."
          checked={o.security_csrf_checks}
          onChange={(v) => set("security_csrf_checks", v)}
        />
      </Section>
      <Section
        icon={LockKeyhole}
        title="Brute-force protection"
        description="Slow automated password guessing and define recovery boundaries."
        badge="Active"
      >
        <Toggle
          label="Enable login throttling and temporary blocks"
          description="Track failed attempts before applying a lockout."
          checked={o.security_brute_force}
          onChange={(v) => set("security_brute_force", v)}
        />
        <Control
          label="Maximum failed attempts"
          description="Failures before a temporary block."
        >
          <input
            className={input}
            type="number"
            value={o.security_max_failed_attempts}
            onChange={(e) => set("security_max_failed_attempts", Number(e.target.value))}
          />
        </Control>
        <Control
          label="Lockout duration"
          description="How long a blocked address remains restricted."
        >
          <input
            className={input}
            type="number"
            value={o.security_lockout_minutes}
            onChange={(e) => set("security_lockout_minutes", Number(e.target.value))}
          />
        </Control>
      </Section>
      <Section
        icon={Database}
        title="Audit & security notifications"
        description="Make sensitive access and policy changes visible."
        badge="Operations"
      >
        <Toggle
          label="Record security audit events"
          description="Capture login, policy, access, and privileged action events."
          checked={o.security_audit_events}
          onChange={(v) => set("security_audit_events", v)}
        />
        <Toggle
          label="Alert on authentication events"
          description="Notify operators about suspicious login activity."
          checked={o.security_auth_alerts}
          onChange={(v) => set("security_auth_alerts", v)}
        />
      </Section>
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400" role="status">
          {message}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={onReset}
            disabled={saving}
          >
            <RotateCcw size={16} />
            Restore defaults
          </button>
          <SaveButton
            onClick={onSave}
            saving={saving}
            disabled={!dirty}
            className="bg-[var(--panel-accent)] text-white hover:opacity-90"
          >
            Save security settings
          </SaveButton>
        </div>
      </div>
    </div>
  );
}
function ApiTab({ values, onChange, onSave, onReset, saving, dirty, message, errors = {} }) {
  const o = apiSettingsValues(values);
  const set = (key, value) => onChange(key, value);
  const [tokens, setTokens] = React.useState([]);
  const [tokenName, setTokenName] = React.useState("Mobile app");
  const [tokenScopes, setTokenScopes] = React.useState(["read:*"]);
  const [newToken, setNewToken] = React.useState(null);
  const [pairing, setPairing] = React.useState(null);
  const qrCanvas = React.useRef(null);
  const [accessMessage, setAccessMessage] = React.useState("");
  const loadTokens = React.useCallback(async () => {
    const response = await apiRequest("/api/v1/api-access/tokens");
    if (response.ok) setTokens((await response.json()).tokens || []);
  }, []);
  React.useEffect(() => { loadTokens(); }, [loadTokens]);
  const setScope = (scope, checked) =>
    setTokenScopes((current) => checked ? [...new Set([...current, scope])] : current.filter((item) => item !== scope));
  const generateToken = async () => {
    setAccessMessage("");
    const response = await apiRequest("/api/v1/api-access/tokens", {
      method: "POST",
      body: JSON.stringify({ name: tokenName, scopes: tokenScopes, expires_days: o.api_token_expiry_days }),
    });
    if (!response.ok) { setAccessMessage(await readApiError(response)); return; }
    setNewToken(await response.json());
    await loadTokens();
  };
  const revokeToken = async (id) => {
    const response = await apiRequest(`/api/v1/api-access/tokens/${id}`, { method: "DELETE" });
    if (response.ok) await loadTokens();
  };
  const createPairing = async () => {
    const response = await apiRequest("/api/v1/api-access/pairing", { method: "POST" });
    if (response.ok) setPairing(await response.json());
    else setAccessMessage(await readApiError(response));
  };
  React.useEffect(() => {
    if (pairing?.payload && qrCanvas.current) {
      QRCode.toCanvas(qrCanvas.current, pairing.payload, { width: 220, margin: 2 });
    }
  }, [pairing]);
  return (
    <div className="space-y-6">
      <Section
        icon={Code2}
        title="External API"
        description="Prepare a stable, secure API surface for the iOS app and trusted integrations."
        badge={o.api_enabled ? "Enabled" : "Disabled"}
      >
        <Control
          full
          label="API base URL"
          description="Use this URL as the root for mobile and external clients."
        >
          <input
            className={input}
            value={`${window.location.origin}/api/v1`}
            readOnly
          />
        </Control>
        <Toggle
          label="Enable external API"
          description="Allow mobile apps and integrations to use API tokens. Browser access remains protected by the panel session."
          checked={o.api_enabled}
          onChange={(v) => set("api_enabled", v)}
        />
        <SelectControl
          full
          label="Authentication mode"
          description="Prefer scoped, expiring tokens over account passwords."
          value={o.api_auth_mode}
          onChange={(v) => set("api_auth_mode", v)}
        >
          <option value="tokens">Scoped bearer tokens</option>
          <option value="session">Session cookies for browser clients</option>
          <option value="both">Tokens and browser sessions</option>
        </SelectControl>
        <SelectControl
          full
          label="Default API version"
          description="Keep mobile clients stable while new versions are introduced."
          value={o.api_version}
          onChange={(v) => set("api_version", v)}
        >
          <option value="v1">v1 · current</option>
          <option value="v2">v2 · preview</option>
        </SelectControl>
        <Toggle
          label="Require HTTPS"
          description="Reject API traffic over cleartext HTTP."
          checked={o.api_require_https}
          onChange={(v) => set("api_require_https", v)}
        />
        <Notice>
          <ShieldCheck size={17} />
          <span>
            iOS App Transport Security expects secure HTTPS endpoints. Keep this
            enabled for production clients.
          </span>
        </Notice>
      </Section>
      <Section
        icon={KeyRound}
        title="Access tokens"
        description="Issue narrowly scoped credentials for the iOS app, CI, and other integrations."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Token inventory
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Tokens are shown once at creation and can be revoked at any time.
            </p>
          </div>
          <button
            onClick={generateToken}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Generate token
          </button>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
              <tr>
                <th className="py-3">Token</th>
                <th className="py-3">Device</th>
                <th className="py-3">Scope</th>
                <th className="py-3">Expires</th>
                <th className="py-3">Last used</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {tokens.map((token) => (
                <tr key={token.id}>
                  <td className="py-3 font-semibold text-neutral-900 dark:text-neutral-100">
                    <span>{token.name}</span>
                    <small className="ml-2 text-neutral-400">{token.token_prefix}…</small>
                  </td>
                  <td className="py-3 text-neutral-500">
                    <span className="block font-medium text-neutral-700 dark:text-neutral-300">{token.device_name || "Unknown device"}</span>
                    <small>{token.platform || "web"} · {token.last_used_ip || token.created_ip || "Unknown IP"}</small>
                  </td>
                  <td className="py-3 text-neutral-500">{token.scopes?.join(", ")}</td>
                  <td className="py-3 text-neutral-500">{token.expires_at ? new Date(token.expires_at).toLocaleDateString() : "Never"}</td>
                  <td className="py-3 text-neutral-500">{token.last_used_at ? new Date(token.last_used_at).toLocaleString() : "Never used"}</td>
                  <td className="py-3 text-right">
                    {token.status === "revoked" ? <span className="text-xs font-semibold text-neutral-400">Revoked</span> : <button onClick={() => revokeToken(token.id)} className="cursor-pointer text-sm font-semibold text-red-600">Revoke</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 grid gap-4 border-t border-neutral-200 pt-5 dark:border-neutral-800 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end">
          <FieldSet label="Token name" description="Use one token per device or integration.">
            <input className={input} value={tokenName} onChange={(event) => setTokenName(event.target.value)} />
          </FieldSet>
          <FieldSet label="Token scopes" description="Choose the minimum access this client needs.">
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-3 text-sm">
              {["read:*", "write:websites", "read:logs", "read:metrics", "write:backups"].map((scope) => (
                <label key={scope} className="inline-flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={tokenScopes.includes(scope)} onChange={(event) => setScope(scope, event.target.checked)} className="h-4 w-4 accent-blue-600" />
                  {scope}
                </label>
              ))}
            </div>
          </FieldSet>
          <button onClick={generateToken} className="inline-flex cursor-pointer items-center justify-center rounded-md bg-[var(--panel-accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90">Generate token</button>
        </div>
        {newToken && (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            <p className="font-semibold">Copy this token now</p>
            <p className="mt-1 text-xs">It will not be shown again.</p>
            <code className="mt-3 block overflow-x-auto rounded bg-white px-3 py-2 text-xs dark:bg-neutral-950">{newToken.token}</code>
          </div>
        )}
        <div className="grid gap-5 border-t border-neutral-200 pt-5 dark:border-neutral-800 md:grid-cols-2">
          <FieldSet
            label="Token expiration"
            description="Default lifetime for newly generated tokens."
          >
            <select
              className={input}
              value={o.api_token_expiry_days}
              onChange={(e) => set("api_token_expiry_days", Number(e.target.value))}
            >
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="3650">10 years</option>
            </select>
          </FieldSet>
          <FieldSet
            label="Allowed caller IPs"
            description="Optional comma-separated IPs or CIDR ranges."
          >
            <input
              className={input}
              value={o.api_token_allowed_ips}
              onChange={(e) => set("api_token_allowed_ips", e.target.value)}
              placeholder="203.0.113.10/32"
            />
          </FieldSet>
        </div>
      </Section>
      <Section
        icon={ShieldCheck}
        title="Scopes and least privilege"
        description="Limit each token to the resources and actions its client actually needs."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["read:websites", "Read websites and domains"],
            ["write:websites", "Create and update websites"],
            ["read:metrics", "Read health and metrics"],
            ["read:logs", "Read operational logs"],
            ["write:backups", "Start and restore backups"],
            ["admin:settings", "Change panel settings"],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-3 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <input
                type="checkbox"
                checked={tokenScopes.includes(key)}
                onChange={(event) => setScope(key, event.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-800 dark:focus:ring-offset-neutral-900"
              />
              <span>
                <strong className="block text-neutral-900 dark:text-neutral-100">
                  {key}
                </strong>
                <small className="text-neutral-500">{label}</small>
              </span>
            </label>
          ))}
        </div>
        <Notice amber>
          <KeyRound size={17} />
          <span>
            Never give a mobile token full administrator access. Create separate
            tokens for development, production, and CI.
          </span>
        </Notice>
      </Section>
      <Section
        icon={Globe2}
        title="Browser clients and rate limits"
        description="Control which web origins and request volumes may reach the API."
      >
        <Control
          full
          label="Allowed CORS origins"
          description="One trusted HTTPS origin per line or comma-separated value."
        >
          <textarea
            className={`${input} min-h-24`}
            value={o.api_allowed_origins}
            onChange={(e) => set("api_allowed_origins", e.target.value)}
          />
        </Control>
        <div className="grid gap-5 md:grid-cols-3">
          <FieldSet
            label="Requests per minute"
            description="Sustained limit per token."
            error={errors.api_rate_limit}
          >
            <input
              className={input}
              type="number"
              value={o.api_rate_limit}
              onChange={(e) => set("api_rate_limit", Number(e.target.value))}
            />
          </FieldSet>
          <FieldSet label="Burst capacity" description="Short spike allowance." error={errors.api_burst}>
            <input
              className={input}
              type="number"
            value={o.api_burst}
            onChange={(e) => set("api_burst", Number(e.target.value))}
            />
          </FieldSet>
          <FieldSet
            label="Maximum page size"
            description="Largest list response."
            error={errors.api_max_page_size}
          >
            <input
              className={input}
              type="number"
            value={o.api_max_page_size}
            onChange={(e) => set("api_max_page_size", Number(e.target.value))}
            />
          </FieldSet>
        </div>
      </Section>
      <Section
        icon={Bell}
        title="Webhooks and API audit"
        description="Make asynchronous events observable and safely verifiable."
      >
        <Toggle
          label="Enable signed webhooks"
          description="Sign outbound events so clients can verify their origin."
          checked={o.api_webhooks_enabled}
          onChange={(v) => set("api_webhooks_enabled", v)}
        />
        <Toggle
          label="Rotate webhook signing secrets"
          description="Allow secrets to be rotated without immediately breaking delivery."
          checked={o.api_webhook_signing}
          onChange={(v) => set("api_webhook_signing", v)}
        />
        <Toggle
          label="Record API audit events"
          description="Capture token, route, actor, status, and latency metadata."
          checked={o.api_audit_enabled}
          onChange={(v) => set("api_audit_enabled", v)}
        />
        <Control
          full
          label="Webhook endpoint"
          description="HTTPS endpoint that receives selected panel events."
        >
          <input
            className={input}
            value={o.api_webhook_url || ""}
            onChange={(e) => set("api_webhook_url", e.target.value)}
            placeholder="https://app.example.com/hooks/server-engine"
          />
        </Control>
      </Section>
      <Section
        icon={Globe2}
        title="Pair a mobile app"
        description="Create a short-lived QR pairing code so the mobile app can connect without typing a server address or password."
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">One-time device pairing</p>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">The code expires in five minutes and can be used once. The mobile app receives a scoped API token after scanning it.</p>
          </div>
          <button type="button" onClick={createPairing} className="inline-flex cursor-pointer items-center justify-center rounded-md bg-[var(--panel-accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90">Create pairing QR</button>
        </div>
        {pairing && (
          <div className="mt-5 flex flex-col gap-5 rounded-md border border-neutral-200 p-4 dark:border-neutral-800 sm:flex-row sm:items-center">
            <canvas ref={qrCanvas} className="h-[220px] w-[220px] self-center rounded bg-white p-2 sm:self-auto" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">Scan this code in the mobile app</p>
              <p className="mt-1 text-neutral-500 dark:text-neutral-400">Expires {new Date(pairing.expires_at).toLocaleTimeString()}.</p>
              <code className="mt-3 block break-all rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">{pairing.code}</code>
            </div>
          </div>
        )}
      </Section>
      {accessMessage && <p className="text-sm text-rose-600 dark:text-rose-400">{accessMessage}</p>}
    </div>
  );
}

function NotificationsTab({ values, onChange, onSave, onReset, saving, dirty, message, errors = {} }) {
  const o = notificationSettingsValues(values);
  const set = (key, value) => onChange(key, value);
  return (
    <div className="space-y-6">
      <Section
        icon={Bell}
        title="Notification delivery"
        description="Choose how Server Engine should deliver operational events."
        badge="Channels"
      >
        <Toggle
          label="Enable operational notifications"
          description="Allow the panel to create and deliver notifications."
          checked={values.notifications_enabled !== false}
          onChange={(v) => onChange("notifications_enabled", v)}
        />
        <Control
          full
          label="Primary notification email"
          description="Default recipient for security, certificate, job, and infrastructure alerts."
          error={errors.notification_email}
        >
          <input
            className={input}
            type="email"
            value={values.notification_email || ""}
            onChange={(e) => onChange("notification_email", e.target.value)}
            placeholder="ops@example.com"
          />
        </Control>
        <Toggle
          label="Email delivery"
          description="Send alerts to the configured primary email address."
          checked={o.notification_email_channel}
          onChange={(v) => set("notification_email_channel", v)}
        />
        <Toggle
          label="Slack or chat delivery"
          description="Route high-priority events to a team channel."
          checked={o.notification_slack_channel}
          onChange={(v) => set("notification_slack_channel", v)}
        />
        <Toggle
          label="Webhook delivery"
          description="Post signed event payloads to an automation endpoint."
          checked={o.notification_webhook_channel}
          onChange={(v) => set("notification_webhook_channel", v)}
        />
        <div className="flex flex-wrap gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800">
          <button
            type="button"
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            Send test notification
          </button>
          <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            No delivery test yet
          </span>
        </div>
      </Section>
      <Section
        icon={ShieldCheck}
        title="Event subscriptions"
        description="Select the events that deserve immediate attention."
      >
        <Toggle
          label="Failed or stalled jobs"
          description="Installation, restore, deployment, and maintenance failures."
          checked={o.notification_failed_jobs}
          onChange={(v) => set("notification_failed_jobs", v)}
        />
        <Toggle
          label="Security events"
          description="Failed logins, lockouts, policy changes, and access changes."
          checked={o.notification_security_events}
          onChange={(v) => set("notification_security_events", v)}
        />
        <Toggle
          label="Certificate expiry"
          description="Warn before managed TLS certificates expire or renewal fails."
          checked={o.notification_certificate_expiry}
          onChange={(v) => set("notification_certificate_expiry", v)}
        />
        <Toggle
          label="Disk and memory thresholds"
          description="Alert when infrastructure resources approach configured limits."
          checked={o.notification_resource_thresholds}
          onChange={(v) => set("notification_resource_thresholds", v)}
        />
        <Toggle
          label="Service health changes"
          description="Notify when a managed service stops or fails its health check."
          checked={o.notification_service_health}
          onChange={(v) => set("notification_service_health", v)}
        />
        <Toggle
          label="Backup completion and failure"
          description="Report successful, failed, and overdue backup runs."
          checked={o.notification_backup_events}
          onChange={(v) => set("notification_backup_events", v)}
        />
      </Section>
      <Section
        icon={LayoutDashboard}
        title="Delivery behavior"
        description="Control timing, grouping, and quiet periods for routine alerts."
      >
        <SelectControl
          full
          label="Default delivery timing"
          description="How routine events are grouped before delivery."
          value={o.notification_digest}
          onChange={(v) => set("notification_digest", v)}
        >
          <option value="immediate">Immediate</option>
          <option value="hourly">Hourly digest</option>
          <option value="daily">Daily digest</option>
        </SelectControl>
        <Toggle
          label="Quiet hours"
          description="Defer non-critical notifications during the configured window."
          checked={o.notification_quiet_hours}
          onChange={(v) => set("notification_quiet_hours", v)}
        />
        <Control
          full
          label="Quiet hours date"
          description="Optional date when this quiet-hours schedule takes effect."
        >
          <input
            className={input}
            type="date"
            value={o.notification_quiet_date}
            onChange={(e) => set("notification_quiet_date", e.target.value)}
          />
        </Control>
        <Control
          full
          label="Quiet hours start"
          description="Local server time."
        >
          <input
            className={input}
            type="time"
            value={o.notification_quiet_start}
            onChange={(e) => set("notification_quiet_start", e.target.value)}
          />
        </Control>
        <Control
          full
          label="Quiet hours end"
          description="Critical alerts still bypass quiet hours."
        >
          <input
            className={input}
            type="time"
            value={o.notification_quiet_end}
            onChange={(e) => set("notification_quiet_end", e.target.value)}
          />
        </Control>
        <Notice>
          <Bell size={17} />
          <span>
            Critical security and service-down events should bypass quiet hours
            so incidents are not hidden.
          </span>
        </Notice>
      </Section>
      <Section
        icon={Database}
        title="Telemetry and retention"
        description="Be explicit about anonymous data collection and notification history."
      >
        <Toggle
          label="Anonymous telemetry"
          description="Share minimal, non-identifying product diagnostics."
          checked={o.telemetry_enabled}
          onChange={(v) => set("telemetry_enabled", v)}
        />
        <SelectControl
          label="Notification history"
          description="How long delivered events remain visible in the activity feed."
          value={String(o.notification_history_days)}
          onChange={(v) => set("notification_history_days", Number(v))}
        >
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">1 year</option>
        </SelectControl>
        <Notice>
          <Database size={17} />
          <span>
            Notification history and delivery channels will connect to the audit
            and maintenance backends.
          </span>
        </Notice>
      </Section>
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400" role="status">
          {message}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={onReset}
            disabled={saving}
          >
            <RotateCcw size={16} />
            Restore defaults
          </button>
          <SaveButton
            onClick={onSave}
            saving={saving}
            disabled={!dirty}
            className="bg-[var(--panel-accent)] text-white hover:opacity-90"
          >
            Save notifications
          </SaveButton>
        </div>
      </div>
    </div>
  );
}
function CertificatesTab({ values, onChange, onSave, onReset, saving, dirty, message, errors = {} }) {
  const o = certificateSettingsValues(values);
  const set = (key, value) => onChange(key, value);
  return (
    <div className="space-y-6">
      <Section
        icon={ShieldCheck}
        title="Certificate authority"
        description="Choose the ACME provider and account used for managed TLS certificates."
        badge="ACME"
      >
        <SelectControl
          label="Certificate provider"
          description="Default authority for new certificate requests."
          value={o.certbot_provider}
          onChange={(v) => set("certbot_provider", v)}
        >
          <option value="letsencrypt">Let's Encrypt</option>
          <option value="zerossl">ZeroSSL</option>
          <option value="custom">Custom ACME directory</option>
        </SelectControl>
        <Control
          full
          label="ACME account email"
          description="Used for expiry notices, renewal issues, and authority communications."
          error={errors.certbot_account_email}
        >
          <input
            className={input}
            type="email"
            value={o.certbot_account_email}
            onChange={(e) => set("certbot_account_email", e.target.value)}
            placeholder="admin@example.com"
          />
        </Control>
        <Toggle
          label="Use staging environment"
          description="Use the non-production ACME endpoint while testing integrations."
          checked={o.certbot_staging}
          onChange={(v) => set("certbot_staging", v)}
        />
      </Section>
      <Section
        icon={Globe2}
        title="Challenge and issuance policy"
        description="Define how domains prove control before a certificate is issued."
      >
        <SelectControl
          label="Default challenge"
          description="HTTP-01 is simple; DNS-01 supports wildcard certificates."
          value={o.certbot_challenge}
          onChange={(v) => set("certbot_challenge", v)}
        >
          <option value="http-01">HTTP-01</option>
          <option value="dns-01">DNS-01</option>
          <option value="tls-alpn-01">TLS-ALPN-01</option>
        </SelectControl>
        <Toggle
          label="Require HTTPS after issuance"
          description="Enable TLS enforcement when a certificate is successfully deployed."
          checked={o.certbot_require_https}
          onChange={(v) => set("certbot_require_https", v)}
        />
        <Toggle
          label="Keep previous certificate during renewal"
          description="Preserve the last valid certificate if renewal or deployment fails."
          checked={o.certbot_keep_previous}
          onChange={(v) => set("certbot_keep_previous", v)}
        />
      </Section>
      <Section
        icon={RotateCcw}
        title="Renewal schedule"
        description="Renew before expiry and make failures visible to operators."
        badge="Automatic"
      >
        <Toggle
          label="Automatic renewal"
          description="Run the renewal worker for eligible certificates."
          checked={o.certbot_auto_renew}
          onChange={(v) => set("certbot_auto_renew", v)}
        />
        <Control
          label="Renewal window"
          description="Start renewal this many days before expiry."
        >
          <input
            className={input}
            type="number"
            min="1"
            max="90"
            value={o.certbot_renew_window_days}
            onChange={(e) => set("certbot_renew_window_days", Number(e.target.value))}
          />
        </Control>
        <Control
          label="Renewal run time"
          description="Preferred server-local time for scheduled renewal work."
        >
          <input
            className={input}
            type="time"
            value={o.certbot_renewal_time}
            onChange={(e) => set("certbot_renewal_time", e.target.value)}
          />
        </Control>
        <Control
          label="Expiry notification window"
          description="Notify operators this many days before expiry."
          error={errors.certbot_expiry_notify_days}
        >
          <input
            className={input}
            type="number"
            min="1"
            max="90"
            value={o.certbot_expiry_notify_days}
            onChange={(e) => set("certbot_expiry_notify_days", Number(e.target.value))}
          />
        </Control>
      </Section>
      <Section
        icon={FolderCog}
        title="Certificate storage"
        description="Keep certificate material in a predictable, protected location."
      >
        <Control
          full
          label="Certbot configuration directory"
          description="Persistent location for certificates, renewal files, and hooks."
        >
          <input
            className={input}
            value={o.certbot_config_dir}
            onChange={(e) => {
              onChange("certbot_config_dir", e.target.value);
            }}
            placeholder="/var/lib/server-engine/letsencrypt"
          />
        </Control>
        <Notice>
          <ShieldCheck size={17} />
          <span>
            Private keys should remain readable only by the service account and
            should never appear in logs or job output.
          </span>
        </Notice>
      </Section>
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400" role="status">
          {message}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={onReset}
            disabled={saving}
          >
            <RotateCcw size={16} />
            Restore defaults
          </button>
          <SaveButton
            onClick={onSave}
            saving={saving}
            disabled={!dirty}
            className="bg-[var(--panel-accent)] text-white hover:opacity-90"
          >
            Save certificates
          </SaveButton>
        </div>
      </div>
    </div>
  );
}

function MaintenanceTab({ values, onChange, onSave, onReset, saving, dirty, message, errors = {}, onRun, rotationRunning }) {
  const o = maintenanceSettingsValues(values);
  const set = (key, value) => onChange(key, value);
  const [policyService, setPolicyService] = React.useState("nginx");
  const policyServices = ["nginx", "apache", "php", "mysql", "mariadb", "postgresql", "redis", "valkey", "memcached", "mongodb", "rabbitmq", "postfix", "dovecot", "rspamd", "vsftpd", "powerdns", "haproxy", "caddy", "fail2ban", "supervisor", "ffmpeg", "imagemagick", "git"];
  const policy = o.log_rotation_service_policies[policyService] || {};
  const setPolicy = (key, value) => set("log_rotation_service_policies", {
    ...o.log_rotation_service_policies,
    [policyService]: { ...policy, [key]: value },
  });
  const clearPolicy = () => {
    const next = { ...o.log_rotation_service_policies };
    delete next[policyService];
    set("log_rotation_service_policies", next);
  };
  return (
    <div className="space-y-6">
      <Section
        icon={Database}
        title="Retention and cleanup"
        description="Keep operational history useful without allowing it to grow without bounds."
        badge="Storage"
      >
        <Control
          label="Job history retention"
          description="Completed installation and maintenance jobs remain visible for this long."
          error={errors.job_retention_days}
        >
          <input
            className={input}
            type="number"
            min="1"
            max="3650"
            value={values.job_retention_days ?? o.jobRetention ?? 30}
            onChange={(e) => {
              onChange("job_retention_days", Number(e.target.value));
            }}
          />
        </Control>
        <Control
          label="Log retention"
          description="Managed service and panel logs remain available for this long."
          error={errors.log_retention_days}
        >
          <input
            className={input}
            type="number"
            min="1"
            max="3650"
            value={values.log_retention_days ?? o.logRetention ?? 30}
            onChange={(e) => {
              onChange("log_retention_days", Number(e.target.value));
            }}
          />
        </Control>
        <Toggle
          label="Automatic cleanup"
          description="Remove expired jobs, logs, temporary packages, and stale artifacts."
          checked={o.maintenance_auto_cleanup}
          onChange={(v) => set("maintenance_auto_cleanup", v)}
        />
      </Section>
      <Section
        icon={FileText}
        title="Log retention"
        description="Rotate logs inside Server Engine automatically. No host logrotate package or cron setup is required."
        badge="Automatic"
      >
        <Toggle
          label="Enable automatic log rotation"
          description="The panel checks managed service log directories in the background and rotates them without interrupting running services."
          checked={o.log_rotation_enabled}
          onChange={(v) => set("log_rotation_enabled", v)}
        />
        <div className="space-y-4">
          <Control full label="Maximum log size" description="Size threshold used for size-only rotation and active-log protection." error={errors.log_rotation_max_size_mb}>
            <div className="flex items-center gap-2"><input className={input} type="number" min="1" max="100000" value={o.log_rotation_max_size_mb} onChange={(e) => set("log_rotation_max_size_mb", Number(e.target.value))} /><span className="shrink-0 text-sm text-neutral-500">MB</span></div>
          </Control>
          <SelectControl full label="Rotation schedule" description="Daily and weekly rotation run during the maintenance window." value={o.log_rotation_schedule} onChange={(v) => set("log_rotation_schedule", v)}>
            <option value="size-only">When size limit is reached</option><option value="daily">Daily and when size limit is reached</option><option value="weekly">Weekly and when size limit is reached</option>
          </SelectControl>
          <SelectControl full label="Compression" description="Compressed archives use gzip while the active log remains available." value={o.log_rotation_compression} onChange={(v) => set("log_rotation_compression", v)}>
            <option value="gzip">gzip</option><option value="none">Do not compress</option>
          </SelectControl>
          <Control full label="Retention count" description="Rotated archives kept for each log file." error={errors.log_rotation_retention_count}>
            <input className={input} type="number" min="1" max="100000" value={o.log_rotation_retention_count} onChange={(e) => set("log_rotation_retention_count", Number(e.target.value))} />
          </Control>
        </div>
        <div className="border-t border-neutral-200 pt-5 dark:border-neutral-800">
          <div className="space-y-4">
            <SelectControl full label="Per-service override" description="Override the global policy for one managed service." value={policyService} onChange={setPolicyService}>
              {policyServices.map((service) => <option key={service} value={service}>{service}</option>)}
            </SelectControl>
            <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className="cursor-pointer text-sm font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white" onClick={clearPolicy}>Use global defaults</button><button type="button" className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800" onClick={onRun} disabled={rotationRunning}>{rotationRunning ? "Rotating…" : "Run now"}</button></div>
          </div>
          <div className="mt-4 space-y-4">
            <Control full label="Service max size"><input className={input} type="number" min="1" value={policy.max_size_mb ?? o.log_rotation_max_size_mb} onChange={(e) => setPolicy("max_size_mb", Number(e.target.value))} /></Control>
            <SelectControl full label="Service schedule" value={policy.schedule ?? o.log_rotation_schedule} onChange={(v) => setPolicy("schedule", v)}><option value="size-only">Size only</option><option value="daily">Daily</option><option value="weekly">Weekly</option></SelectControl>
            <SelectControl full label="Service compression" value={policy.compression ?? o.log_rotation_compression} onChange={(v) => setPolicy("compression", v)}><option value="gzip">gzip</option><option value="none">None</option></SelectControl>
            <Control full label="Service archives"><input className={input} type="number" min="1" value={policy.retention_count ?? o.log_rotation_retention_count} onChange={(e) => setPolicy("retention_count", Number(e.target.value))} /></Control>
          </div>
        </div>
      </Section>
      <Section
        icon={LayoutDashboard}
        title="Maintenance window"
        description="Schedule work when it is least likely to affect active workloads."
      >
        <SelectControl
          label="Maintenance window"
          description="Preferred time range for routine background work."
          value={o.maintenance_window}
          onChange={(v) => set("maintenance_window", v)}
        >
          <option value="00:00-02:00">00:00–02:00</option>
          <option value="02:00-04:00">02:00–04:00</option>
          <option value="04:00-06:00">04:00–06:00</option>
          <option value="off">Do not schedule automatically</option>
        </SelectControl>
        <Toggle
          label="Notify before disruptive work"
          description="Warn operators before restarts, upgrades, or migrations begin."
          checked={o.maintenance_notify_before}
          onChange={(v) => set("maintenance_notify_before", v)}
        />
        <Toggle
          label="Display reboot requirements"
          description="Show a clear warning when updates require a server reboot."
          checked={o.maintenance_show_reboot}
          onChange={(v) => set("maintenance_show_reboot", v)}
        />
      </Section>
      <Section
        icon={ShieldCheck}
        title="Updates and health checks"
        description="Keep the control plane and managed services observable and secure."
        badge="Operations"
      >
        <SelectControl
          label="Automatic update policy"
          description="Choose which updates may be applied during the maintenance window."
          value={o.maintenance_update_policy}
          onChange={(v) => set("maintenance_update_policy", v)}
        >
          <option value="security">Security updates only</option>
          <option value="patch">Security and bug-fix updates</option>
          <option value="manual">Manual approval required</option>
        </SelectControl>
        <Toggle
          label="Run service health checks"
          description="Check managed service processes and report unexpected stops."
          checked={o.maintenance_health_checks}
          onChange={(v) => set("maintenance_health_checks", v)}
        />
        <Toggle
          label="Verify backups after creation"
          description="Validate backup metadata and readability after a successful run."
          checked={o.maintenance_verify_backups}
          onChange={(v) => set("maintenance_verify_backups", v)}
        />
        <Toggle
          label="Notify on failed maintenance jobs"
          description="Send an alert when cleanup, updates, or health checks fail."
          checked={o.maintenance_notify_failed_jobs}
          onChange={(v) => set("maintenance_notify_failed_jobs", v)}
        />
      </Section>
      <Section
        icon={RotateCcw}
        title="Recovery behavior"
        description="Make maintenance failures visible and safe to retry."
      >
        <Control
          label="Stale job threshold"
          description="Flag jobs as stale when they have not updated for this many hours."
        >
          <input
            className={input}
            type="number"
            min="1"
            value={o.maintenance_stale_job_hours}
            onChange={(e) => set("maintenance_stale_job_hours", Number(e.target.value))}
          />
        </Control>
        <Notice amber>
          <RotateCcw size={17} />
          <span>
            <strong>Recovery guidance.</strong> Keep maintenance actions
            idempotent and preserve the previous release before applying
            upgrades.
          </span>
        </Notice>
      </Section>
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400" role="status">
          {message}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={onReset}
            disabled={saving}
          >
            <RotateCcw size={16} />
            Restore defaults
          </button>
          <SaveButton
            onClick={onSave}
            saving={saving}
            disabled={!dirty}
            className="bg-[var(--panel-accent)] text-white hover:opacity-90"
          >
            Save maintenance
          </SaveButton>
        </div>
      </div>
    </div>
  );
}

function Field({ definition, value, settings, onChange, notificationActions, certificateActions, maintenanceActions }) {
  const [key, label, description, type] = definition;
  if (key === "__notifications__")
    return (
      <NotificationsTab
        values={settings}
        {...notificationActions}
        onChange={(k, v) => {
          notificationValues = { ...notificationValues, [k]: v };
          onChange(k, v);
        }}
      />
    );
  if (key === "__certificates__")
    return (
      <CertificatesTab
        values={settings}
        {...certificateActions}
        onChange={(k, v) => {
          certificateValues = { ...certificateValues, [k]: v };
          onChange(k, v);
        }}
      />
    );
  if (key === "__maintenance__")
    return (
      <MaintenanceTab
        values={settings}
        {...maintenanceActions}
        onChange={(k, v) => {
          maintenanceValues = { ...maintenanceValues, [k]: v };
          onChange(k, v);
        }}
      />
    );
  if (type === "boolean")
    return (
      <Toggle
        label={label}
        description={description}
        checked={Boolean(value)}
        onChange={(v) => onChange(key, v)}
      />
    );
  return (
    <Control label={label} description={description}>
      <input
        className={input}
        type={type === "number" ? "number" : type}
        value={value ?? ""}
        onChange={(e) =>
          onChange(
            key,
            type === "number" ? Number(e.target.value) : e.target.value,
          )
        }
      />
    </Control>
  );
}
export default function SettingsPage() {
  const [values, setValues] = React.useState({});
  const [panelSaved, setPanelSaved] = React.useState({});
  const [panelErrors, setPanelErrors] = React.useState({});
  const [storageErrors, setStorageErrors] = React.useState({});
  const [securityErrors, setSecurityErrors] = React.useState({});
  const [apiErrors, setApiErrors] = React.useState({});
  const [notificationErrors, setNotificationErrors] = React.useState({});
  const [certificateErrors, setCertificateErrors] = React.useState({});
  const [maintenanceErrors, setMaintenanceErrors] = React.useState({});
  const [storageSaved, setStorageSaved] = React.useState({});
  const [securitySaved, setSecuritySaved] = React.useState({});
  const [apiSaved, setApiSaved] = React.useState({});
  const [notificationSaved, setNotificationSaved] = React.useState({});
  const [certificateSaved, setCertificateSaved] = React.useState({});
  const [maintenanceSaved, setMaintenanceSaved] = React.useState({});
  const [active, setActive] = React.useState("panel");
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(true);
  const [panelSaving, setPanelSaving] = React.useState(false);
  const [storageSaving, setStorageSaving] = React.useState(false);
  const [securitySaving, setSecuritySaving] = React.useState(false);
  const [apiSaving, setApiSaving] = React.useState(false);
  const [notificationSaving, setNotificationSaving] = React.useState(false);
  const [certificateSaving, setCertificateSaving] = React.useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = React.useState(false);
  const [rotationRunning, setRotationRunning] = React.useState(false);
  const [panelMessage, setPanelMessage] = React.useState("");
  const [storageMessage, setStorageMessage] = React.useState("");
  const [securityMessage, setSecurityMessage] = React.useState("");
  const [apiMessage, setApiMessage] = React.useState("");
  const [notificationMessage, setNotificationMessage] = React.useState("");
  const [certificateMessage, setCertificateMessage] = React.useState("");
  const [maintenanceMessage, setMaintenanceMessage] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [settingsToast, setSettingsToast] = React.useState("");
  const [dialog, setDialog] = React.useState(null);
  React.useEffect(() => {
    const accent = appearanceAccentColors.find(
      (option) => option.value === values.panel_accent,
    );
    if (accent) {
      document.documentElement.style.setProperty("--panel-accent", accent.color);
    }
  }, [values.panel_accent]);
  React.useEffect(() => {
    Promise.all([
      apiRequest("/api/v1/settings"),
      apiRequest("/api/v1/settings/panel"),
      apiRequest("/api/v1/settings/storage"),
      apiRequest("/api/v1/settings/security"),
      apiRequest("/api/v1/settings/api"),
      apiRequest("/api/v1/settings/notifications"),
      apiRequest("/api/v1/settings/certificates"),
      apiRequest("/api/v1/settings/maintenance"),
    ])
      .then(async ([settingsResponse, panelResponse, storageResponse, securityResponse, apiResponse, notificationResponse, certificateResponse, maintenanceResponse]) => {
        if (!settingsResponse.ok) throw new Error(await readApiError(settingsResponse));
        if (!panelResponse.ok) throw new Error(await readApiError(panelResponse));
        if (!storageResponse.ok) throw new Error(await readApiError(storageResponse));
        if (!securityResponse.ok) throw new Error(await readApiError(securityResponse));
        if (!apiResponse.ok) throw new Error(await readApiError(apiResponse));
        if (!notificationResponse.ok) throw new Error(await readApiError(notificationResponse));
        if (!certificateResponse.ok) throw new Error(await readApiError(certificateResponse));
        if (!maintenanceResponse.ok) throw new Error(await readApiError(maintenanceResponse));
        return Promise.all([
          settingsResponse.json(),
          panelResponse.json(),
          storageResponse.json(),
          securityResponse.json(),
          apiResponse.json(),
          notificationResponse.json(),
          certificateResponse.json(),
          maintenanceResponse.json(),
        ]);
      })
      .then(([settingsBody, panelBody, storageBody, securityBody, apiBody, notificationBody, certificateBody, maintenanceBody]) => {
        setValues({ ...settingsBody.values, ...panelBody.values, ...storageBody.values, ...securityBody.values, ...apiBody.values, ...notificationBody.values, ...certificateBody.values, ...maintenanceBody.values });
        setPanelSaved(panelBody.values);
        setStorageSaved(storageBody.values);
        setSecuritySaved(securityBody.values);
        setApiSaved(apiBody.values);
        setNotificationSaved(notificationBody.values);
        setCertificateSaved(certificateBody.values);
        setMaintenanceSaved(maintenanceBody.values);
        applyPanelPreferences(panelBody.values);
      })
      .catch((e) => setMessage(e.message))
      .finally(() => setBusy(false));
  }, []);
  const update = (k, v) => {
    setValues((x) => ({ ...x, [k]: v }));
    setPanelErrors((current) => current[k] ? { ...current, [k]: "" } : current);
    setStorageErrors((current) => current[k] ? { ...current, [k]: "" } : current);
    setSecurityErrors((current) => current[k] ? { ...current, [k]: "" } : current);
    setApiErrors((current) => current[k] ? { ...current, [k]: "" } : current);
    setNotificationErrors((current) => current[k] ? { ...current, [k]: "" } : current);
    setCertificateErrors((current) => current[k] ? { ...current, [k]: "" } : current);
    setMaintenanceErrors((current) => current[k] ? { ...current, [k]: "" } : current);
  };
  const panelDirty = JSON.stringify(panelValues(values)) !== JSON.stringify(panelSaved);
  const storageDirty = JSON.stringify(storageValues(values)) !== JSON.stringify(storageSaved);
  const securityDirty = JSON.stringify(securityValues(values)) !== JSON.stringify(securitySaved);
  const apiDirty = JSON.stringify(apiSettingsValues(values)) !== JSON.stringify(apiSaved);
  const notificationDirty = JSON.stringify(notificationSettingsValues(values)) !== JSON.stringify(notificationSaved);
  const certificateDirty = JSON.stringify(certificateSettingsValues(values)) !== JSON.stringify(certificateSaved);
  const maintenanceDirty = JSON.stringify(maintenanceSettingsValues(values)) !== JSON.stringify(maintenanceSaved);
  const savePanel = async () => {
    setPanelMessage("");
    const parsed = panelSchema.safeParse(panelValues(values));
    if (!parsed.success) {
      const next = {};
      parsed.error.issues.forEach((issue) => { next[issue.path[0]] = issue.message; });
      setPanelErrors(next);
      setPanelMessage("Review the highlighted panel settings.");
      return false;
    }
    setPanelErrors({});
    setPanelSaving(true);
    const r = await apiRequest("/api/v1/settings/panel", {
      method: "PATCH",
      body: JSON.stringify({ values: panelValues(values) }),
    });
    if (r.ok) {
      const body = await r.json();
      setValues((current) => ({ ...current, ...body.values }));
      setPanelSaved(body.values);
      applyPanelPreferences(body.values);
      setPanelMessage("Panel settings saved.");
      setSettingsToast("Panel settings saved.");
    } else setPanelMessage(await readApiError(r));
    setPanelSaving(false);
    return r.ok;
  };
  const restorePanel = () =>
    setDialog({
      kind: "confirm",
      title: "Restore Panel defaults?",
      message: "Panel identity, appearance, regional, workspace, and access settings will return to their defaults.",
      submitLabel: "Restore defaults",
      onSubmit: async () => {
        setDialog(null);
        setPanelSaving(true);
        setPanelMessage("");
        const r = await apiRequest("/api/v1/settings/panel/reset", {
          method: "POST",
        });
        if (r.ok) {
          const body = await r.json();
          setValues((current) => ({ ...current, ...body.values }));
          setPanelSaved(body.values);
          setPanelErrors({});
          applyPanelPreferences(body.values);
          setPanelMessage("Panel defaults restored.");
        } else setPanelMessage(await readApiError(r));
        setPanelSaving(false);
      },
    });
  const saveStorage = async () => {
    setStorageMessage("");
    const errors = validationErrors(storageSchema, storageValues(values));
    if (Object.keys(errors).length) { setStorageErrors(errors); setStorageMessage("Review the highlighted storage settings."); return false; }
    setStorageErrors({});
    setStorageSaving(true);
    const r = await apiRequest("/api/v1/settings/storage", {
      method: "PATCH",
      body: JSON.stringify({ values: storageValues(values) }),
    });
    if (r.ok) {
      const body = await r.json();
      setValues((current) => ({ ...current, ...body.values }));
      setStorageSaved(body.values);
      setStorageMessage("Web & storage settings saved.");
      setSettingsToast("Web & storage settings saved.");
    } else setStorageMessage(await readApiError(r));
    setStorageSaving(false);
    return r.ok;
  };
  const restoreStorage = () =>
    setDialog({
      kind: "confirm",
      title: "Restore Web & storage defaults?",
      message: "Website paths, file manager behavior, upload limits, and backup policy will return to their defaults.",
      submitLabel: "Restore defaults",
      onSubmit: async () => {
        setDialog(null);
        setStorageSaving(true);
        setStorageMessage("");
        const r = await apiRequest("/api/v1/settings/storage/reset", {
          method: "POST",
        });
        if (r.ok) {
          const body = await r.json();
          setValues((current) => ({ ...current, ...body.values }));
          setStorageSaved(body.values);
          setStorageMessage("Web & storage defaults restored.");
        } else setStorageMessage(await readApiError(r));
        setStorageSaving(false);
      },
    });
  const saveSecurity = async () => {
    setSecurityMessage("");
    const errors = validationErrors(securitySchema, securityValues(values));
    if (Object.keys(errors).length) { setSecurityErrors(errors); setSecurityMessage("Review the highlighted security settings."); return false; }
    setSecurityErrors({});
    setSecuritySaving(true);
    const r = await apiRequest("/api/v1/settings/security", {
      method: "PATCH",
      body: JSON.stringify({ values: securityValues(values) }),
    });
    if (r.ok) {
      const body = await r.json();
      setValues((current) => ({ ...current, ...body.values }));
      setSecuritySaved(body.values);
      setSecurityMessage("Security settings saved.");
      setSettingsToast("Security settings saved.");
    } else setSecurityMessage(await readApiError(r));
    setSecuritySaving(false);
    return r.ok;
  };
  const restoreSecurity = () =>
    setDialog({
      kind: "confirm",
      title: "Restore Security & access defaults?",
      message: "Authentication, network boundary, encryption, throttling, audit, and notification settings will return to their defaults.",
      submitLabel: "Restore defaults",
      onSubmit: async () => {
        setDialog(null);
        setSecuritySaving(true);
        setSecurityMessage("");
        const r = await apiRequest("/api/v1/settings/security/reset", {
          method: "POST",
        });
        if (r.ok) {
          const body = await r.json();
          setValues((current) => ({ ...current, ...body.values }));
          setSecuritySaved(body.values);
          setSecurityMessage("Security defaults restored.");
        } else setSecurityMessage(await readApiError(r));
        setSecuritySaving(false);
      },
    });
  const saveApi = async () => {
    setApiMessage("");
    const errors = validationErrors(apiSchema, apiSettingsValues(values));
    if (Object.keys(errors).length) { setApiErrors(errors); setApiMessage("Review the highlighted API settings."); return false; }
    setApiErrors({});
    setApiSaving(true);
    const r = await apiRequest("/api/v1/settings/api", {
      method: "PATCH",
      body: JSON.stringify({ values: apiSettingsValues(values) }),
    });
    if (r.ok) {
      const body = await r.json();
      setValues((current) => ({ ...current, ...body.values }));
      setApiSaved(body.values);
      setApiMessage("API settings saved.");
      setSettingsToast("API settings saved.");
    } else setApiMessage(await readApiError(r));
    setApiSaving(false);
    return r.ok;
  };
  const restoreApi = () =>
    setDialog({
      kind: "confirm",
      title: "Restore API defaults?",
      message: "API access, rate limits, token policy, webhook, and audit settings will return to their defaults.",
      submitLabel: "Restore defaults",
      onSubmit: async () => {
        setDialog(null);
        setApiSaving(true);
        setApiMessage("");
        const r = await apiRequest("/api/v1/settings/api/reset", { method: "POST" });
        if (r.ok) {
          const body = await r.json();
          setValues((current) => ({ ...current, ...body.values }));
          setApiSaved(body.values);
          setApiMessage("API defaults restored.");
        } else setApiMessage(await readApiError(r));
        setApiSaving(false);
      },
    });
  const saveNotifications = async () => {
    setNotificationMessage("");
    const errors = validationErrors(notificationSchema, notificationSettingsValues(values));
    if (Object.keys(errors).length) { setNotificationErrors(errors); setNotificationMessage("Review the highlighted notification settings."); return false; }
    setNotificationErrors({});
    setNotificationSaving(true);
    const r = await apiRequest("/api/v1/settings/notifications", {
      method: "PATCH",
      body: JSON.stringify({ values: notificationSettingsValues(values) }),
    });
    if (r.ok) {
      const body = await r.json();
      setValues((current) => ({ ...current, ...body.values }));
      setNotificationSaved(body.values);
      setNotificationMessage("Notification settings saved.");
      setSettingsToast("Notification settings saved.");
    } else setNotificationMessage(await readApiError(r));
    setNotificationSaving(false);
    return r.ok;
  };
  const restoreNotifications = () =>
    setDialog({
      kind: "confirm",
      title: "Restore Notification defaults?",
      message: "Delivery channels, event subscriptions, quiet hours, and retention will return to their defaults.",
      submitLabel: "Restore defaults",
      onSubmit: async () => {
        setDialog(null);
        setNotificationSaving(true);
        setNotificationMessage("");
        const r = await apiRequest("/api/v1/settings/notifications/reset", {
          method: "POST",
        });
        if (r.ok) {
          const body = await r.json();
          setValues((current) => ({ ...current, ...body.values }));
          setNotificationSaved(body.values);
          setNotificationMessage("Notification defaults restored.");
        } else setNotificationMessage(await readApiError(r));
        setNotificationSaving(false);
      },
    });
  const saveCertificates = async () => {
    setCertificateMessage("");
    const errors = validationErrors(certificateSchema, certificateSettingsValues(values));
    if (Object.keys(errors).length) { setCertificateErrors(errors); setCertificateMessage("Review the highlighted certificate settings."); return false; }
    setCertificateErrors({});
    setCertificateSaving(true);
    const r = await apiRequest("/api/v1/settings/certificates", {
      method: "PATCH",
      body: JSON.stringify({ values: certificateSettingsValues(values) }),
    });
    if (r.ok) {
      const body = await r.json();
      setValues((current) => ({ ...current, ...body.values }));
      setCertificateSaved(body.values);
      setCertificateMessage("Certificate settings saved.");
      setSettingsToast("Certificate settings saved.");
    } else setCertificateMessage(await readApiError(r));
    setCertificateSaving(false);
    return r.ok;
  };
  const restoreCertificates = () =>
    setDialog({
      kind: "confirm",
      title: "Restore Certificate defaults?",
      message: "Certificate authority, challenge, renewal, notification, and storage settings will return to their defaults.",
      submitLabel: "Restore defaults",
      onSubmit: async () => {
        setDialog(null);
        setCertificateSaving(true);
        setCertificateMessage("");
        const r = await apiRequest("/api/v1/settings/certificates/reset", {
          method: "POST",
        });
        if (r.ok) {
          const body = await r.json();
          setValues((current) => ({ ...current, ...body.values }));
          setCertificateSaved(body.values);
          setCertificateMessage("Certificate defaults restored.");
        } else setCertificateMessage(await readApiError(r));
        setCertificateSaving(false);
      },
    });
  const saveMaintenance = async () => {
    setMaintenanceMessage("");
    const errors = validationErrors(maintenanceSchema, maintenanceSettingsValues(values));
    if (Object.keys(errors).length) { setMaintenanceErrors(errors); setMaintenanceMessage("Review the highlighted maintenance settings."); return false; }
    setMaintenanceErrors({});
    setMaintenanceSaving(true);
    const r = await apiRequest("/api/v1/settings/maintenance", {
      method: "PATCH",
      body: JSON.stringify({ values: maintenanceSettingsValues(values) }),
    });
    if (r.ok) {
      const body = await r.json();
      setValues((current) => ({ ...current, ...body.values }));
      setMaintenanceSaved(body.values);
      setMaintenanceMessage("Maintenance settings saved.");
      setSettingsToast("Maintenance settings saved.");
    } else setMaintenanceMessage(await readApiError(r));
    setMaintenanceSaving(false);
    return r.ok;
  };
  const restoreMaintenance = () =>
    setDialog({
      kind: "confirm",
      title: "Restore Maintenance defaults?",
      message: "Retention, cleanup, maintenance windows, updates, health checks, and recovery settings will return to their defaults.",
      submitLabel: "Restore defaults",
      onSubmit: async () => {
        setDialog(null);
        setMaintenanceSaving(true);
        setMaintenanceMessage("");
        const r = await apiRequest("/api/v1/settings/maintenance/reset", {
          method: "POST",
        });
        if (r.ok) {
          const body = await r.json();
          setValues((current) => ({ ...current, ...body.values }));
          setMaintenanceSaved(body.values);
          setMaintenanceMessage("Maintenance defaults restored.");
        } else setMaintenanceMessage(await readApiError(r));
        setMaintenanceSaving(false);
      },
    });
  const runLogRotation = async () => {
    setRotationRunning(true);
    const response = await apiRequest("/api/v1/settings/maintenance/log-rotation/run", { method: "POST" });
    if (response.ok) {
      const body = await response.json();
      setMaintenanceMessage(`${body.rotated || 0} log file${body.rotated === 1 ? "" : "s"} rotated.`);
      setSettingsToast("Log rotation completed.");
    } else {
      setMaintenanceMessage(await readApiError(response, "Log rotation failed."));
    }
    setRotationRunning(false);
  };
  const visible = groups.filter(
    ([id, label, , description]) =>
      !query ||
      `${id} ${label} ${description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-7">
      <div className="flex flex-col items-start justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Control plane
          </p>
          <h2 className="mt-1 text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Settings
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-neutral-500 dark:text-neutral-400">
            Configure the panel, shared server paths, access policy,
            notifications, certificates, maintenance, and external API behavior.
          </p>
        </div>
      </div>
      <div className="grid overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900">
            <Search size={16} />
            <input
              className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100"
              placeholder="Find a setting"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <nav className="mt-3 space-y-1">
            {visible.map(([id, label, Icon, description]) => (
              <button
                key={id}
                className={`flex w-full items-start gap-3 rounded-md p-3 text-left ${active === id ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100" : "text-neutral-600 hover:bg-white dark:text-neutral-400 dark:hover:bg-neutral-900"}`}
                onClick={() => setActive(id)}
              >
                <Icon size={17} className="mt-0.5 shrink-0" />
                <span>
                  <strong className="block text-sm font-semibold">
                    {label}
                  </strong>
                  <small className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                    {description}
                  </small>
                </span>
              </button>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 bg-white p-5 dark:bg-neutral-900 md:p-8">
          {message && (
            <div className="mb-6 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
              {message}
            </div>
          )}
          {busy ? (
            <div className="grid min-h-64 place-items-center text-sm text-neutral-500">
              Loading settings…
            </div>
          ) : active === "panel" ? (
            <PanelTab
              values={values}
              onChange={update}
              errors={panelErrors}
              onSave={savePanel}
              onReset={restorePanel}
              saving={panelSaving}
              dirty={panelDirty}
              message={panelMessage}
            />
          ) : active === "storage" ? (
            <StorageTab
              values={values}
              onChange={update}
              errors={storageErrors}
              onSave={saveStorage}
              onReset={restoreStorage}
              saving={storageSaving}
              dirty={storageDirty}
              message={storageMessage}
            />
          ) : active === "security" ? (
            <SecurityTab
              values={values}
              onChange={update}
              errors={securityErrors}
              onSave={saveSecurity}
              onReset={restoreSecurity}
              saving={securitySaving}
              dirty={securityDirty}
              message={securityMessage}
            />
          ) : active === "api" ? (
            <>
              <ApiTab values={values} onChange={update} errors={apiErrors} />
              <SettingsActions
                onSave={saveApi}
                onReset={restoreApi}
                saving={apiSaving}
                dirty={apiDirty}
                message={apiMessage}
              />
            </>
          ) : fields[active] ? (
            <section
              className={
                ["notifications", "certificates", "maintenance"].includes(
                  active,
                )
                  ? "space-y-6"
                  : card
              }
            >
              {!["notifications", "certificates", "maintenance"].includes(
                active,
              ) && (
                <div className="mb-6 pb-5">
                  <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    {groups.find((g) => g[0] === active)?.[1]}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {groups.find((g) => g[0] === active)?.[3]}
                  </h3>
                </div>
              )}
              {fields[active].map((def) => (
                <Field
                  key={def[0]}
                  definition={def}
                  value={values[def[0]]}
                  settings={values}
                  notificationActions={{
                    onSave: saveNotifications,
                    onReset: restoreNotifications,
                    saving: notificationSaving,
                    dirty: notificationDirty,
                    message: notificationMessage,
                    errors: notificationErrors,
                  }}
                  certificateActions={{
                    onSave: saveCertificates,
                    onReset: restoreCertificates,
                    saving: certificateSaving,
                    dirty: certificateDirty,
                    message: certificateMessage,
                    errors: certificateErrors,
                  }}
                  maintenanceActions={{
                    onSave: saveMaintenance,
                    onReset: restoreMaintenance,
                    saving: maintenanceSaving,
                    dirty: maintenanceDirty,
                    message: maintenanceMessage,
                    errors: maintenanceErrors,
                    onRun: runLogRotation,
                    rotationRunning,
                  }}
                  onChange={update}
                />
              ))}
            </section>
          ) : (
            <div className="grid min-h-64 place-items-center text-sm text-neutral-500">
              No settings match your search.
            </div>
          )}
        </main>
      </div>
      <Toast
        message={settingsToast}
        type="success"
        onClose={() => setSettingsToast("")}
      />
      <ActionDialog
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSubmit={() => dialog?.onSubmit?.()}
      />
    </div>
  );
}
