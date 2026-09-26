import React from "react";
import {
  Bell,
  Cloud,
  Code2,
  Database,
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
import { apiRequest, readApiError } from "../../lib/api";

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
  "mt-2 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const card =
  "rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950";
const row =
  "grid gap-5 border-b border-slate-200 py-5 last:border-b-0 dark:border-slate-800 md:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)] md:items-center";
function Section({ icon: Icon, title, description, badge, children }) {
  return (
    <section className={card}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Icon size={17} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {description}
            </p>
          </div>
        </div>
        {badge && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
function Control({ label, description, children, full = false }) {
  return (
    <label className={`${row}${full ? " md:grid-cols-1" : ""}`}>
      <span>
        <strong className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {label}
        </strong>
        <small className="mt-1 block text-sm leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </small>
      </span>
      <span>{children}</span>
    </label>
  );
}
function Toggle({ label, description, checked, onChange }) {
  return (
    <label className={row}>
      <span>
        <strong className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {label}
        </strong>
        <small className="mt-1 block text-sm leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </small>
      </span>
      <span className="flex justify-start md:justify-end">
        <input
          className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-offset-slate-900"
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
function FieldSet({ label, description, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {label}
      </span>
      <small className="mt-1 block text-sm leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </small>
      {children}
    </label>
  );
}
function Notice({ children, amber = false }) {
  return (
    <div
      className={`mt-5 flex items-start gap-2 rounded-md border p-4 text-sm leading-6 ${amber ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}
    >
      {children}
    </div>
  );
}
function PanelTab({ values, onChange }) {
  const d = {
    theme: "system",
    density: "comfortable",
    accent: "blue",
    landing: "overview",
    date: "local",
    hints: true,
  };
  const [o, setO] = React.useState(() => ({
    ...d,
    ...JSON.parse(localStorage.getItem("serverengine:panel-options") || "{}"),
  }));
  const set = (k, v) =>
    setO((x) => {
      const n = { ...x, [k]: v };
      localStorage.setItem("serverengine:panel-options", JSON.stringify(n));
      return n;
    });
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
        >
          <select
            className={input}
            value={values.language || "en"}
            onChange={(e) => onChange("language", e.target.value)}
          >
            <option value="en">English</option>
            <option disabled>Vietnamese · coming soon</option>
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
          onChange={(v) => set("theme", v)}
        >
          <option value="system">Use system preference</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </SelectControl>
        <SelectControl
          label="Interface density"
          description="Spacing in tables, cards, and forms."
          value={o.density}
          onChange={(v) => set("density", v)}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </SelectControl>
        <SelectControl
          label="Accent color"
          description="Interface accent color."
          value={o.accent}
          onChange={(v) => set("accent", v)}
        >
          <option value="blue">Blue</option>
          <option value="cyan">Cyan</option>
          <option value="violet">Violet</option>
        </SelectControl>
      </Section>
      <Section
        icon={Globe2}
        title="Regional format"
        description="Keep timestamps consistent across jobs, logs, and certificates."
      >
        <Control
          label="Timezone"
          description="Used for timestamps shown by the control panel."
        >
          <input
            className={input}
            value={values.timezone || ""}
            onChange={(e) => onChange("timezone", e.target.value)}
            placeholder="UTC"
          />
        </Control>
        <SelectControl
          label="Date and time format"
          description="How dates appear in the console."
          value={o.date}
          onChange={(v) => set("date", v)}
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
          onChange={(v) => set("landing", v)}
        >
          <option value="overview">Overview</option>
          <option value="websites">Websites</option>
          <option value="services">Services</option>
        </SelectControl>
        <Toggle
          label="Show contextual hints"
          description="Display explanations beside advanced controls."
          checked={o.hints}
          onChange={(v) => set("hints", v)}
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
    </div>
  );
}
function StorageTab({ values, onChange }) {
  const d = {
    start: "web-root",
    hidden: true,
    encoding: true,
    upload: 2048,
    free: 512,
    index: "index.php,index.html",
    backups: true,
    type: "compressed",
    schedule: "daily",
    destination: "none",
    compression: "balanced",
    exclude: ".git,node_modules,cache",
  };
  const [o, setO] = React.useState(() => ({
    ...d,
    ...JSON.parse(localStorage.getItem("serverengine:storage-options") || "{}"),
  }));
  const set = (k, v) =>
    setO((x) => {
      const n = { ...x, [k]: v };
      localStorage.setItem("serverengine:storage-options", JSON.stringify(n));
      return n;
    });
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
          <input
            className={input}
            value={o.index}
            onChange={(e) => set("index", e.target.value)}
            placeholder="index.php,index.html"
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
          value={o.start}
          onChange={(v) => set("start", v)}
        >
          <option value="web-root">Website root</option>
          <option value="home">Managed home directory</option>
          <option value="last-used">Last used location</option>
        </SelectControl>
        <Toggle
          label="Show hidden files"
          description="Display dotfiles such as .env and .well-known."
          checked={o.hidden}
          onChange={(v) => set("hidden", v)}
        />
        <Toggle
          label="Verify text encoding before editing"
          description="Warn before opening files whose encoding may be unsafe."
          checked={o.encoding}
          onChange={(v) => set("encoding", v)}
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
        >
          <input
            className={input}
            type="number"
            min="1"
            value={o.upload}
            onChange={(e) => set("upload", Number(e.target.value))}
          />
        </Control>
        <Control
          label="Required free space"
          description="Reject uploads below this filesystem reserve."
        >
          <input
            className={input}
            type="number"
            min="0"
            value={o.free}
            onChange={(e) => set("free", Number(e.target.value))}
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
          checked={o.backups}
          onChange={(v) => set("backups", v)}
        />
        <SelectControl
          full
          label="Backup type"
          description="Balance speed and storage use."
          value={o.type}
          onChange={(v) => set("type", v)}
        >
          <option value="compressed">Compressed</option>
          <option value="incremental">Incremental</option>
          <option value="uncompressed">Uncompressed</option>
        </SelectControl>
        <SelectControl
          full
          label="Schedule"
          description="How often to create a backup set."
          value={o.schedule}
          onChange={(v) => set("schedule", v)}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </SelectControl>
        <Toggle
          label="Retain local copies after transfer"
          description="Keep a local restore point after remote transfer."
          checked={o.retain ?? true}
          onChange={(v) => set("retain", v)}
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
          value={o.destination}
          onChange={(v) => set("destination", v)}
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
          value={o.compression}
          onChange={(v) => set("compression", v)}
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
          <input
            className={input}
            value={o.exclude}
            onChange={(e) => set("exclude", e.target.value)}
            placeholder=".git,node_modules,cache"
          />
        </Control>
      </Section>
    </div>
  );
}
function SecurityTab({ values, onChange }) {
  const d = {
    mfa: false,
    strong: true,
    ssl: false,
    hsts: true,
    cookies: true,
    csrf: true,
    domain: "",
    port: 8888,
    entry: "",
    ips: "",
    proxy: "direct",
    brute: true,
    attempts: 5,
    lockout: 15,
    audit: true,
    alerts: true,
  };
  const [o, setO] = React.useState(() => ({
    ...d,
    ...JSON.parse(
      localStorage.getItem("serverengine:security-options") || "{}",
    ),
  }));
  const set = (k, v) =>
    setO((x) => {
      const n = { ...x, [k]: v };
      localStorage.setItem("serverengine:security-options", JSON.stringify(n));
      return n;
    });
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
          checked={o.mfa}
          onChange={(v) => set("mfa", v)}
        />
        <Toggle
          label="Enforce strong administrator passwords"
          description="Require length, mixed case, numbers, and symbols."
          checked={o.strong}
          onChange={(v) => set("strong", v)}
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
            value={o.domain}
            onChange={(e) => set("domain", e.target.value)}
            placeholder="panel.example.com"
          />
        </Control>
        <Control
          full
          label="Panel port"
          description="The host firewall must allow this value."
        >
          <input
            className={input}
            type="number"
            value={o.port}
            onChange={(e) => set("port", Number(e.target.value))}
          />
        </Control>
        <Control
          full
          label="Authorized IP addresses"
          description="Comma-separated IPs or CIDR ranges."
        >
          <input
            className={input}
            value={o.ips}
            onChange={(e) => set("ips", e.target.value)}
            placeholder="203.0.113.10, 10.0.0.0/8"
          />
        </Control>
        <Control
          full
          label="Security entrance"
          description="Optional private path required before login."
        >
          <input
            className={input}
            value={o.entry}
            onChange={(e) => set("entry", e.target.value)}
            placeholder="/admin-gate"
          />
        </Control>
        <SelectControl
          full
          label="Proxy and CDN mode"
          description="Interpret the original client address behind a proxy."
          value={o.proxy}
          onChange={(v) => set("proxy", v)}
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
          checked={o.ssl}
          onChange={(v) => set("ssl", v)}
        />
        <Toggle
          label="Enable HSTS"
          description="Tell browsers to prefer HTTPS."
          checked={o.hsts}
          onChange={(v) => set("hsts", v)}
        />
        <Toggle
          label="Secure session cookies"
          description="Only send cookies over HTTPS."
          checked={o.cookies}
          onChange={(v) => set("cookies", v)}
        />
        <Toggle
          label="Require CSRF and referrer checks"
          description="Reject mutations outside the trusted panel context."
          checked={o.csrf}
          onChange={(v) => set("csrf", v)}
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
          checked={o.brute}
          onChange={(v) => set("brute", v)}
        />
        <Control
          label="Maximum failed attempts"
          description="Failures before a temporary block."
        >
          <input
            className={input}
            type="number"
            value={o.attempts}
            onChange={(e) => set("attempts", Number(e.target.value))}
          />
        </Control>
        <Control
          label="Lockout duration"
          description="How long a blocked address remains restricted."
        >
          <input
            className={input}
            type="number"
            value={o.lockout}
            onChange={(e) => set("lockout", Number(e.target.value))}
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
          checked={o.audit}
          onChange={(v) => set("audit", v)}
        />
        <Toggle
          label="Alert on authentication events"
          description="Notify operators about suspicious login activity."
          checked={o.alerts}
          onChange={(v) => set("alerts", v)}
        />
      </Section>
    </div>
  );
}
function ApiTab() {
  const defaults = {
    https: true,
    auth: "tokens",
    version: "v1",
    origins: "https://app.example.com",
    rate: 120,
    burst: 30,
    pageSize: 100,
    webhooks: true,
    signing: true,
    audit: true,
  };
  const [o, setO] = React.useState(() => ({
    ...defaults,
    ...JSON.parse(localStorage.getItem("serverengine:api-options") || "{}"),
  }));
  const [tokens, setTokens] = React.useState([
    {
      name: "iOS development",
      scope: "Read websites, metrics",
      expires: "2026-12-31",
      last: "Never used",
    },
    {
      name: "CI deployment",
      scope: "Websites, files, jobs",
      expires: "2026-10-15",
      last: "Today 09:42",
    },
  ]);
  const set = (k, v) =>
    setO((x) => {
      const n = { ...x, [k]: v };
      localStorage.setItem("serverengine:api-options", JSON.stringify(n));
      return n;
    });
  const addToken = () =>
    setTokens((items) => [
      ...items,
      {
        name: "New mobile token",
        scope: "Choose scopes",
        expires: "Not created",
        last: "Never used",
      },
    ]);
  return (
    <div className="space-y-6">
      <Section
        icon={Code2}
        title="External API"
        description="Prepare a stable, secure API surface for the iOS app and trusted integrations."
        badge="UI ready"
      >
        <Control
          full
          label="API base URL"
          description="Use this URL as the root for mobile and external clients."
        >
          <input
            className={input}
            value="https://panel.example.com/api/v1"
            readOnly
          />
        </Control>
        <SelectControl
          full
          label="Authentication mode"
          description="Prefer scoped, expiring tokens over account passwords."
          value={o.auth}
          onChange={(v) => set("auth", v)}
        >
          <option value="tokens">Scoped bearer tokens</option>
          <option value="session">Session cookies for browser clients</option>
          <option value="both">Tokens and browser sessions</option>
        </SelectControl>
        <SelectControl
          full
          label="Default API version"
          description="Keep mobile clients stable while new versions are introduced."
          value={o.version}
          onChange={(v) => set("version", v)}
        >
          <option value="v1">v1 · current</option>
          <option value="v2">v2 · preview</option>
        </SelectControl>
        <Toggle
          label="Require HTTPS"
          description="Reject API traffic over cleartext HTTP."
          checked={o.https}
          onChange={(v) => set("https", v)}
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
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Token inventory
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Tokens are shown once at creation and can be revoked at any time.
            </p>
          </div>
          <button
            onClick={addToken}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Generate token
          </button>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
              <tr>
                <th className="py-3">Token</th>
                <th className="py-3">Scope</th>
                <th className="py-3">Expires</th>
                <th className="py-3">Last used</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tokens.map((token) => (
                <tr key={token.name}>
                  <td className="py-3 font-semibold text-slate-900 dark:text-slate-100">
                    {token.name}
                  </td>
                  <td className="py-3 text-slate-500">{token.scope}</td>
                  <td className="py-3 text-slate-500">{token.expires}</td>
                  <td className="py-3 text-slate-500">{token.last}</td>
                  <td className="py-3 text-right">
                    <button className="text-sm font-semibold text-red-600">
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-5 border-t border-slate-200 pt-5 dark:border-slate-800 md:grid-cols-2">
          <FieldSet
            label="Token expiration"
            description="Default lifetime for newly generated tokens."
          >
            <select
              className={input}
              value={o.expiry || "90"}
              onChange={(e) => set("expiry", e.target.value)}
            >
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="never">Never expire</option>
            </select>
          </FieldSet>
          <FieldSet
            label="Allowed caller IPs"
            description="Optional comma-separated IPs or CIDR ranges."
          >
            <input
              className={input}
              value={o.tokenIps || ""}
              onChange={(e) => set("tokenIps", e.target.value)}
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
              className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800"
            >
              <input
                type="checkbox"
                defaultChecked={key.startsWith("read:")}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-offset-slate-900"
              />
              <span>
                <strong className="block text-slate-900 dark:text-slate-100">
                  {key}
                </strong>
                <small className="text-slate-500">{label}</small>
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
            value={o.origins}
            onChange={(e) => set("origins", e.target.value)}
          />
        </Control>
        <div className="grid gap-5 md:grid-cols-3">
          <FieldSet
            label="Requests per minute"
            description="Sustained limit per token."
          >
            <input
              className={input}
              type="number"
              value={o.rate}
              onChange={(e) => set("rate", Number(e.target.value))}
            />
          </FieldSet>
          <FieldSet label="Burst capacity" description="Short spike allowance.">
            <input
              className={input}
              type="number"
              value={o.burst}
              onChange={(e) => set("burst", Number(e.target.value))}
            />
          </FieldSet>
          <FieldSet
            label="Maximum page size"
            description="Largest list response."
          >
            <input
              className={input}
              type="number"
              value={o.pageSize}
              onChange={(e) => set("pageSize", Number(e.target.value))}
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
          checked={o.webhooks}
          onChange={(v) => set("webhooks", v)}
        />
        <Toggle
          label="Rotate webhook signing secrets"
          description="Allow secrets to be rotated without immediately breaking delivery."
          checked={o.signing}
          onChange={(v) => set("signing", v)}
        />
        <Toggle
          label="Record API audit events"
          description="Capture token, route, actor, status, and latency metadata."
          checked={o.audit}
          onChange={(v) => set("audit", v)}
        />
        <Control
          full
          label="Webhook endpoint"
          description="HTTPS endpoint that receives selected panel events."
        >
          <input
            className={input}
            value={o.webhookUrl || ""}
            onChange={(e) => set("webhookUrl", e.target.value)}
            placeholder="https://app.example.com/hooks/server-engine"
          />
        </Control>
      </Section>
    </div>
  );
}

function NotificationsTab({ values, onChange }) {
  const d = {
    email: true,
    slack: false,
    webhook: false,
    digest: "immediate",
    quiet: false,
    quietDate: "",
    quietStart: "22:00",
    quietEnd: "07:00",
    failedJobs: true,
    security: true,
    certificates: true,
    disk: true,
    serviceDown: true,
    backup: true,
  };
  const [o, setO] = React.useState(() => {
    try {
      return {
        ...d,
        ...JSON.parse(
          localStorage.getItem("serverengine:notification-options") || "{}",
        ),
      };
    } catch {
      return d;
    }
  });
  const set = (k, v) =>
    setO((x) => {
      const n = { ...x, [k]: v };
      localStorage.setItem(
        "serverengine:notification-options",
        JSON.stringify(n),
      );
      return n;
    });
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
          checked={o.email}
          onChange={(v) => set("email", v)}
        />
        <Toggle
          label="Slack or chat delivery"
          description="Route high-priority events to a team channel."
          checked={o.slack}
          onChange={(v) => set("slack", v)}
        />
        <Toggle
          label="Webhook delivery"
          description="Post signed event payloads to an automation endpoint."
          checked={o.webhook}
          onChange={(v) => set("webhook", v)}
        />
        <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Send test notification
          </button>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
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
          checked={o.failedJobs}
          onChange={(v) => set("failedJobs", v)}
        />
        <Toggle
          label="Security events"
          description="Failed logins, lockouts, policy changes, and access changes."
          checked={o.security}
          onChange={(v) => set("security", v)}
        />
        <Toggle
          label="Certificate expiry"
          description="Warn before managed TLS certificates expire or renewal fails."
          checked={o.certificates}
          onChange={(v) => set("certificates", v)}
        />
        <Toggle
          label="Disk and memory thresholds"
          description="Alert when infrastructure resources approach configured limits."
          checked={o.disk}
          onChange={(v) => set("disk", v)}
        />
        <Toggle
          label="Service health changes"
          description="Notify when a managed service stops or fails its health check."
          checked={o.serviceDown}
          onChange={(v) => set("serviceDown", v)}
        />
        <Toggle
          label="Backup completion and failure"
          description="Report successful, failed, and overdue backup runs."
          checked={o.backup}
          onChange={(v) => set("backup", v)}
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
          value={o.digest}
          onChange={(v) => set("digest", v)}
        >
          <option value="immediate">Immediate</option>
          <option value="hourly">Hourly digest</option>
          <option value="daily">Daily digest</option>
        </SelectControl>
        <Toggle
          label="Quiet hours"
          description="Defer non-critical notifications during the configured window."
          checked={o.quiet}
          onChange={(v) => set("quiet", v)}
        />
        <Control
          full
          label="Quiet hours date"
          description="Optional date when this quiet-hours schedule takes effect."
        >
          <input
            className={input}
            type="date"
            value={o.quietDate}
            onChange={(e) => set("quietDate", e.target.value)}
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
            value={o.quietStart}
            onChange={(e) => set("quietStart", e.target.value)}
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
            value={o.quietEnd}
            onChange={(e) => set("quietEnd", e.target.value)}
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
          checked={values.telemetry_enabled === true}
          onChange={(v) => onChange("telemetry_enabled", v)}
        />
        <SelectControl
          label="Notification history"
          description="How long delivered events remain visible in the activity feed."
          value={o.retention || "30"}
          onChange={(v) => set("retention", v)}
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
    </div>
  );
}
function CertificatesTab({ values, onChange }) {
  const d = {
    provider: "letsencrypt",
    challenge: "http-01",
    autoRenew: true,
    window: 30,
    staging: false,
    notify: 14,
    config: "/var/lib/server-engine/letsencrypt",
    account: "",
    renewalHour: "03:00",
  };
  const [o, setO] = React.useState(() => {
    try {
      return {
        ...d,
        ...JSON.parse(
          localStorage.getItem("serverengine:certificate-options") || "{}",
        ),
      };
    } catch {
      return d;
    }
  });
  const set = (k, v) =>
    setO((x) => {
      const n = { ...x, [k]: v };
      localStorage.setItem(
        "serverengine:certificate-options",
        JSON.stringify(n),
      );
      return n;
    });
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
          value={o.provider}
          onChange={(v) => set("provider", v)}
        >
          <option value="letsencrypt">Let's Encrypt</option>
          <option value="zerossl">ZeroSSL</option>
          <option value="custom">Custom ACME directory</option>
        </SelectControl>
        <Control
          full
          label="ACME account email"
          description="Used for expiry notices, renewal issues, and authority communications."
        >
          <input
            className={input}
            type="email"
            value={o.account}
            onChange={(e) => set("account", e.target.value)}
            placeholder="admin@example.com"
          />
        </Control>
        <Toggle
          label="Use staging environment"
          description="Use the non-production ACME endpoint while testing integrations."
          checked={o.staging}
          onChange={(v) => set("staging", v)}
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
          value={o.challenge}
          onChange={(v) => set("challenge", v)}
        >
          <option value="http-01">HTTP-01</option>
          <option value="dns-01">DNS-01</option>
          <option value="tls-alpn-01">TLS-ALPN-01</option>
        </SelectControl>
        <Toggle
          label="Require HTTPS after issuance"
          description="Enable TLS enforcement when a certificate is successfully deployed."
          checked={o.requireHttps ?? true}
          onChange={(v) => set("requireHttps", v)}
        />
        <Toggle
          label="Keep previous certificate during renewal"
          description="Preserve the last valid certificate if renewal or deployment fails."
          checked={o.keepPrevious ?? true}
          onChange={(v) => set("keepPrevious", v)}
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
          checked={o.autoRenew}
          onChange={(v) => set("autoRenew", v)}
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
            value={o.window}
            onChange={(e) => set("window", Number(e.target.value))}
          />
        </Control>
        <Control
          label="Renewal run time"
          description="Preferred server-local time for scheduled renewal work."
        >
          <input
            className={input}
            type="time"
            value={o.renewalHour}
            onChange={(e) => set("renewalHour", e.target.value)}
          />
        </Control>
        <Control
          label="Expiry notification window"
          description="Notify operators this many days before expiry."
        >
          <input
            className={input}
            type="number"
            min="1"
            max="90"
            value={o.notify}
            onChange={(e) => set("notify", Number(e.target.value))}
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
            value={values.certbot_config_dir || o.config}
            onChange={(e) => {
              onChange("certbot_config_dir", e.target.value);
              set("config", e.target.value);
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
    </div>
  );
}

function MaintenanceTab({ values, onChange }) {
  const d = {
    window: "02:00-04:00",
    autoCleanup: true,
    failedJobs: true,
    health: true,
    updates: "security",
    reboot: true,
    verifyBackups: true,
    staleHours: 24,
    notify: true,
  };
  const [o, setO] = React.useState(() => {
    try {
      return {
        ...d,
        ...JSON.parse(
          localStorage.getItem("serverengine:maintenance-options") || "{}",
        ),
      };
    } catch {
      return d;
    }
  });
  const set = (k, v) =>
    setO((x) => {
      const n = { ...x, [k]: v };
      localStorage.setItem(
        "serverengine:maintenance-options",
        JSON.stringify(n),
      );
      return n;
    });
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
        >
          <input
            className={input}
            type="number"
            min="1"
            max="3650"
            value={values.job_retention_days ?? o.jobRetention ?? 30}
            onChange={(e) => {
              onChange("job_retention_days", Number(e.target.value));
              set("jobRetention", Number(e.target.value));
            }}
          />
        </Control>
        <Control
          label="Log retention"
          description="Managed service and panel logs remain available for this long."
        >
          <input
            className={input}
            type="number"
            min="1"
            max="3650"
            value={values.log_retention_days ?? o.logRetention ?? 30}
            onChange={(e) => {
              onChange("log_retention_days", Number(e.target.value));
              set("logRetention", Number(e.target.value));
            }}
          />
        </Control>
        <Toggle
          label="Automatic cleanup"
          description="Remove expired jobs, logs, temporary packages, and stale artifacts."
          checked={o.autoCleanup}
          onChange={(v) => set("autoCleanup", v)}
        />
      </Section>
      <Section
        icon={LayoutDashboard}
        title="Maintenance window"
        description="Schedule work when it is least likely to affect active workloads."
      >
        <SelectControl
          label="Maintenance window"
          description="Preferred time range for routine background work."
          value={o.window}
          onChange={(v) => set("window", v)}
        >
          <option value="00:00-02:00">00:00–02:00</option>
          <option value="02:00-04:00">02:00–04:00</option>
          <option value="04:00-06:00">04:00–06:00</option>
          <option value="off">Do not schedule automatically</option>
        </SelectControl>
        <Toggle
          label="Notify before disruptive work"
          description="Warn operators before restarts, upgrades, or migrations begin."
          checked={o.notify}
          onChange={(v) => set("notify", v)}
        />
        <Toggle
          label="Display reboot requirements"
          description="Show a clear warning when updates require a server reboot."
          checked={o.reboot}
          onChange={(v) => set("reboot", v)}
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
          value={o.updates}
          onChange={(v) => set("updates", v)}
        >
          <option value="security">Security updates only</option>
          <option value="patch">Security and bug-fix updates</option>
          <option value="manual">Manual approval required</option>
        </SelectControl>
        <Toggle
          label="Run service health checks"
          description="Check managed service processes and report unexpected stops."
          checked={o.health}
          onChange={(v) => set("health", v)}
        />
        <Toggle
          label="Verify backups after creation"
          description="Validate backup metadata and readability after a successful run."
          checked={o.verifyBackups}
          onChange={(v) => set("verifyBackups", v)}
        />
        <Toggle
          label="Notify on failed maintenance jobs"
          description="Send an alert when cleanup, updates, or health checks fail."
          checked={o.failedJobs}
          onChange={(v) => set("failedJobs", v)}
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
            value={o.staleHours}
            onChange={(e) => set("staleHours", Number(e.target.value))}
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
    </div>
  );
}

function Field({ definition, value, onChange }) {
  const [key, label, description, type] = definition;
  if (key === "__notifications__")
    return (
      <NotificationsTab
        values={notificationValues}
        onChange={(k, v) => {
          notificationValues = { ...notificationValues, [k]: v };
          onChange(k, v);
        }}
      />
    );
  if (key === "__certificates__")
    return (
      <CertificatesTab
        values={certificateValues}
        onChange={(k, v) => {
          certificateValues = { ...certificateValues, [k]: v };
          onChange(k, v);
        }}
      />
    );
  if (key === "__maintenance__")
    return (
      <MaintenanceTab
        values={maintenanceValues}
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
  const [saved, setSaved] = React.useState({});
  const [active, setActive] = React.useState("panel");
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [dialog, setDialog] = React.useState(null);
  React.useEffect(() => {
    apiRequest("/api/v1/settings")
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r));
        return r.json();
      })
      .then((body) => {
        setValues(body.values);
        setSaved(body.values);
      })
      .catch((e) => setMessage(e.message))
      .finally(() => setBusy(false));
  }, []);
  const update = (k, v) => setValues((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    const r = await apiRequest("/api/v1/settings", {
      method: "PATCH",
      body: JSON.stringify({ values }),
    });
    if (r.ok) {
      const body = await r.json();
      setValues(body.values);
      setSaved(body.values);
      setMessage("Settings saved safely.");
    } else setMessage(await readApiError(r));
    setBusy(false);
  };
  const reset = () =>
    setDialog({
      kind: "confirm",
      title: "Reset all settings?",
      message: "Every setting will return to the Server Engine default.",
      submitLabel: "Reset settings",
      onSubmit: async () => {
        setDialog(null);
        setBusy(true);
        const r = await apiRequest("/api/v1/settings/reset", {
          method: "POST",
        });
        if (r.ok) {
          const body = await r.json();
          setValues(body.values);
          setSaved(body.values);
          setMessage("Settings reset to defaults.");
        } else setMessage(await readApiError(r));
        setBusy(false);
      },
    });
  const visible = groups.filter(
    ([id, label, , description]) =>
      !query ||
      `${id} ${label} ${description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  return (
    <div className="space-y-7">
      <div className="flex flex-col items-start justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Control plane
          </p>
          <h2 className="mt-1 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Settings
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500 dark:text-slate-400">
            Configure the panel, shared server paths, access policy,
            notifications, certificates, maintenance, and external API behavior.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            onClick={reset}
            disabled={busy}
          >
            <RotateCcw size={16} />
            Reset defaults
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-blue-600 bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            onClick={save}
            disabled={busy || !dirty}
          >
            <Save size={16} />
            {busy ? "Loading…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>
      <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-400 dark:border-slate-700 dark:bg-slate-900">
            <Search size={16} />
            <input
              className="w-full bg-transparent text-sm text-slate-900 outline-none dark:text-slate-100"
              placeholder="Find a setting"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <nav className="mt-3 space-y-1">
            {visible.map(([id, label, Icon, description]) => (
              <button
                key={id}
                className={`flex w-full items-start gap-3 rounded-md p-3 text-left ${active === id ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-900"}`}
                onClick={() => setActive(id)}
              >
                <Icon size={17} className="mt-0.5 shrink-0" />
                <span>
                  <strong className="block text-sm font-semibold">
                    {label}
                  </strong>
                  <small className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {description}
                  </small>
                </span>
              </button>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 bg-white p-5 dark:bg-slate-900 md:p-8">
          {message && (
            <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
              {message}
            </div>
          )}
          {busy ? (
            <div className="grid min-h-64 place-items-center text-sm text-slate-500">
              Loading settings…
            </div>
          ) : active === "panel" ? (
            <PanelTab values={values} onChange={update} />
          ) : active === "storage" ? (
            <StorageTab values={values} onChange={update} />
          ) : active === "security" ? (
            <SecurityTab values={values} onChange={update} />
          ) : active === "api" ? (
            <ApiTab />
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
                <div className="mb-6 border-b border-slate-200 pb-5 dark:border-slate-800">
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    {groups.find((g) => g[0] === active)?.[1]}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {groups.find((g) => g[0] === active)?.[3]}
                  </h3>
                </div>
              )}
              {fields[active].map((def) => (
                <Field
                  key={def[0]}
                  definition={def}
                  value={values[def[0]]}
                  onChange={update}
                />
              ))}
            </section>
          ) : (
            <div className="grid min-h-64 place-items-center text-sm text-slate-500">
              No settings match your search.
            </div>
          )}
        </main>
      </div>
      <ActionDialog
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSubmit={() => dialog?.onSubmit?.()}
      />
    </div>
  );
}
