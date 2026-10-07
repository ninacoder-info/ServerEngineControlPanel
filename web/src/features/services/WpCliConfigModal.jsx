import React from "react";
import {
  Activity,
  Check,
  CircleHelp,
  FileCode2,
  FileText,
  KeyRound,
  Package,
  Settings2,
  TerminalSquare,
  X,
} from "lucide-react";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";
import { apiRequest } from "../../lib/api";

const STORAGE_KEY = "serverengine:wp-cli-config";
const inputClass =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const tabs = [
  ["runtime", "Runtime", Activity],
  ["overview", "Overview", FileCode2],
  ["php", "PHP runtime", Settings2],
  ["wordpress", "WordPress", Package],
  ["packages", "Packages", Package],
  ["logs", "Output", FileText],
];

const defaults = {
  sitePath: "/server-engine/www/example.com",
  siteUrl: "https://example.com",
  phpVersion: "",
  globalConfig: "/opt/server-engine/services/wp-cli/config/config.yml",
  cacheDirectory: "/opt/server-engine/services/wp-cli/data/cache",
  packagesDirectory: "/opt/server-engine/services/wp-cli/data/packages",
  skipPlugins: "",
  skipThemes: "",
  verifyChecksums: true,
  skipPackages: false,
  allowUpdates: false,
  maintenanceMode: false,
  memoryLimit: "512M",
};

function readSettings() {
  try {
    return { ...defaults, ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">{hint}</span>}
    </label>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" className="mt-1 h-4 w-4 cursor-pointer accent-blue-600" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</span>
        {description && <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">{description}</span>}
      </span>
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
        {description && <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3 text-sm last:border-0 dark:border-neutral-800">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="max-w-[72%] break-all text-right font-medium text-neutral-900 dark:text-neutral-100">{value || "—"}</span>
    </div>
  );
}

function SaveFooter({ onSave, saving }) {
  return <div className="flex justify-end pt-2"><SaveButton onClick={onSave} saving={saving}>Save changes</SaveButton></div>;
}

export default function WpCliConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed) ? installed[0] : installed;
  const [tab, setTab] = React.useState("runtime");
  const [settings, setSettings] = React.useState(readSettings);
  const [phpVersions, setPhpVersions] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const version = current?.version || service?.version || "—";
  const root = current?.path || `/opt/server-engine/services/wp-cli/versions/${version}`;

  React.useEffect(() => {
    apiRequest("/api/v1/services/installed")
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => {
        const versions = items.filter((item) => item.id === "php" || item.id?.startsWith("php@"));
        setPhpVersions(versions);
        setSettings((currentSettings) => ({
          ...currentSettings,
          phpVersion: currentSettings.phpVersion || versions[versions.length - 1]?.version || "",
        }));
      })
      .catch(() => {});
  }, []);

  const set = (key, value) => setSettings((currentSettings) => ({ ...currentSettings, [key]: value }));
  const save = async () => {
    setSaving(true);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    setSaving(false);
    setToast({ type: "success", message: "WP-CLI settings saved." });
  };
  const reset = () => {
    setSettings({ ...defaults, phpVersion: phpVersions[phpVersions.length - 1]?.version || "" });
    setToast({ type: "success", message: "WP-CLI defaults restored." });
  };

  const renderTab = () => {
    if (tab === "overview") return (
      <div className="space-y-6">
        <Section title="Command defaults" description="These defaults are used when Server Engine runs WP-CLI against a selected WordPress website.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WordPress directory" hint="The directory containing wp-config.php."><input className={`${inputClass} font-mono text-xs`} value={settings.sitePath} onChange={(event) => set("sitePath", event.target.value)} /></Field>
            <Field label="Site URL" hint="Used when WP-CLI needs a URL context."><input className={inputClass} value={settings.siteUrl} onChange={(event) => set("siteUrl", event.target.value)} /></Field>
            <Field label="Global config file"><input className={`${inputClass} font-mono text-xs`} value={settings.globalConfig} onChange={(event) => set("globalConfig", event.target.value)} /></Field>
            <Field label="PHP memory limit"><select className={inputClass} value={settings.memoryLimit} onChange={(event) => set("memoryLimit", event.target.value)}><option>256M</option><option>512M</option><option>1G</option><option>2G</option></select></Field>
          </div>
        </Section>
        <Section title="Safety defaults" description="Keep destructive operations restricted until backups and rollback are verified.">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Toggle label="Verify WordPress checksums" description="Check core files before updates or repair tasks." checked={settings.verifyChecksums} onChange={(value) => set("verifyChecksums", value)} />
            <Toggle label="Allow update commands" description="Permit automated core, plugin, and theme updates." checked={settings.allowUpdates} onChange={(value) => set("allowUpdates", value)} />
            <Toggle label="Maintenance mode for deployments" description="Put the site into maintenance mode during configured deployment tasks." checked={settings.maintenanceMode} onChange={(value) => set("maintenanceMode", value)} />
            <Toggle label="Skip WP-CLI packages" description="Useful for diagnosing a third-party command package problem." checked={settings.skipPackages} onChange={(value) => set("skipPackages", value)} />
          </div>
        </Section>
        <Section title="Managed paths" description="WP-CLI itself is a command-line tool, so its useful state is its binary, cache, package directory, and selected PHP runtime.">
          <div className="border-y border-neutral-200 dark:border-neutral-800"><Row label="Version" value={version} /><Row label="Executable" value={`${root}/bin/wp`} /><Row label="Cache" value={settings.cacheDirectory} /><Row label="Packages" value={settings.packagesDirectory} /></div>
        </Section>
        <SaveFooter onSave={save} saving={saving} />
      </div>
    );

    if (tab === "php") return (
      <div className="space-y-6">
        <Section title="PHP runtime" description="WP-CLI requires PHP. Choose the managed PHP CLI runtime used for commands; if it is removed, select another installed version here.">
          <Field label="PHP CLI version" hint="WP-CLI supports PHP 7.2.24 or later. Extensions required by WordPress should be enabled on this runtime.">
            <select className={inputClass} value={settings.phpVersion} onChange={(event) => set("phpVersion", event.target.value)}>
              <option value="">Select an installed PHP version</option>
              {phpVersions.map((item) => <option key={item.id} value={item.version}>{item.name} · {item.status}</option>)}
            </select>
          </Field>
          <div className="border-y border-neutral-200 dark:border-neutral-800"><Row label="Selected PHP command" value={settings.phpVersion ? `/opt/server-engine/services/php/versions/${settings.phpVersion}/usr/bin/php` : "No PHP runtime selected"} /><Row label="WP-CLI command" value={`${root}/bin/wp --info`} /></div>
        </Section>
        <Section title="PHP invocation" description="These options affect command execution without changing the website's PHP-FPM runtime.">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="PHP memory limit"><select className={inputClass} value={settings.memoryLimit} onChange={(event) => set("memoryLimit", event.target.value)}><option>256M</option><option>512M</option><option>1G</option><option>2G</option></select></Field><Field label="WordPress directory"><input className={`${inputClass} font-mono text-xs`} value={settings.sitePath} onChange={(event) => set("sitePath", event.target.value)} /></Field></div>
        </Section>
        <SaveFooter onSave={save} saving={saving} />
      </div>
    );

    if (tab === "wordpress") return (
      <div className="space-y-6">
        <Section title="WordPress context" description="WP-CLI reads project defaults from wp-cli.yml and wp-cli.local.yml. Project settings override global defaults.">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="WordPress path"><input className={`${inputClass} font-mono text-xs`} value={settings.sitePath} onChange={(event) => set("sitePath", event.target.value)} /></Field><Field label="Site URL"><input className={inputClass} value={settings.siteUrl} onChange={(event) => set("siteUrl", event.target.value)} /></Field><Field label="Skip plugins" hint="Comma-separated plugin slugs. Leave empty to load all plugins."><input className={inputClass} value={settings.skipPlugins} onChange={(event) => set("skipPlugins", event.target.value)} /></Field><Field label="Skip themes" hint="Comma-separated theme slugs. Leave empty to load the active theme."><input className={inputClass} value={settings.skipThemes} onChange={(event) => set("skipThemes", event.target.value)} /></Field></div>
        </Section>
        <Section title="Update protection"><div className="space-y-3"><Toggle label="Verify checksums before updates" checked={settings.verifyChecksums} onChange={(value) => set("verifyChecksums", value)} /><Toggle label="Allow automated updates" description="Keep disabled for production sites until a backup job and rollback path are configured." checked={settings.allowUpdates} onChange={(value) => set("allowUpdates", value)} /><Toggle label="Enable maintenance mode during updates" checked={settings.maintenanceMode} onChange={(value) => set("maintenanceMode", value)} /></div></Section>
        <SaveFooter onSave={save} saving={saving} />
      </div>
    );

    if (tab === "packages") return (
      <div className="space-y-6">
        <Section title="WP-CLI package manager" description="Packages add commands to WP-CLI and are stored separately from the executable.">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Package directory"><input className={`${inputClass} font-mono text-xs`} value={settings.packagesDirectory} onChange={(event) => set("packagesDirectory", event.target.value)} /></Field><Field label="Cache directory"><input className={`${inputClass} font-mono text-xs`} value={settings.cacheDirectory} onChange={(event) => set("cacheDirectory", event.target.value)} /></Field></div>
          <div className="rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800"><div className="flex items-start gap-3"><CircleHelp size={17} className="mt-0.5 shrink-0 text-neutral-500" /><p className="leading-6 text-neutral-600 dark:text-neutral-300">Packages are loaded for every command unless “Skip WP-CLI packages” is enabled. Install only trusted packages because they execute inside the WP-CLI process.</p></div></div>
        </Section>
        <Section title="Useful commands"><div className="space-y-2 rounded-md bg-neutral-950 p-4 font-mono text-xs leading-6 text-neutral-200"><p>{root}/bin/wp package list</p><p>{root}/bin/wp package install &lt;package&gt;</p><p>{root}/bin/wp package uninstall &lt;package&gt;</p></div></Section>
        <SaveFooter onSave={save} saving={saving} />
      </div>
    );

    if (tab === "runtime") return (
      <div className="space-y-6">
        <Section title="WP-CLI runtime" description="WP-CLI does not run as a background daemon. Each command starts a PHP process, performs its task, and exits.">
          <div className="border-y border-neutral-200 dark:border-neutral-800"><Row label="Status" value="Installed" /><Row label="Version" value={version} /><Row label="Executable" value={`${root}/bin/wp`} /><Row label="Selected PHP" value={settings.phpVersion || "Not selected"} /><Row label="Run as" value="serverengine" /></div>
        </Section>
        <Section title="Quick diagnostics"><div className="space-y-2 rounded-md bg-neutral-950 p-4 font-mono text-xs leading-6 text-neutral-200"><p>{root}/bin/wp --info</p><p>{root}/bin/wp cli version</p><p>{root}/bin/wp core version --path={settings.sitePath}</p></div></Section>
      </div>
    );

    return (
      <div className="space-y-6">
        <Section title="Command output" description="WP-CLI is request-driven, so errors appear in the command result and panel activity log rather than a continuously running service log.">
          <div className="border-y border-neutral-200 dark:border-neutral-800"><Row label="Activity log" value="Panel activity and job output" /><Row label="PHP errors" value="Selected PHP runtime error log" /><Row label="WordPress errors" value={`${settings.sitePath}/wp-content/debug.log`} /></div>
        </Section>
        <Section title="Troubleshooting"><div className="rounded-md border border-neutral-200 p-4 text-sm leading-6 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">If a command fails, check the selected PHP extensions, the WordPress path, `wp-config.php`, and whether a package or plugin is causing bootstrap errors.</div></Section>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-neutral-900" role="dialog" aria-modal="true" aria-labelledby="wp-cli-title">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800"><div><div className="flex items-center gap-2"><TerminalSquare size={19} className="text-blue-600 dark:text-blue-400" /><h2 id="wp-cli-title" className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">WP-CLI</h2><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Check size={13} />Installed</span></div><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">WordPress command-line tools and managed PHP execution.</p></div><button type="button" aria-label="Close WP-CLI configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200" onClick={onClose}><X size={18} /></button></div>
        <div className="flex gap-5 overflow-x-auto border-b border-neutral-200 px-6 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">{tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`${buttonClass} rounded-none border-b-2 px-1 pb-3 pt-0 ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}><Icon size={15} />{label}</button>)}</div>
        <div className="px-6 py-5">{renderTab()}</div>
        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-6 py-4 dark:border-neutral-800"><button type="button" className={`${buttonClass} text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800`} onClick={reset}><KeyRound size={15} />Restore defaults</button><span className="text-xs text-neutral-500 dark:text-neutral-400">Each tab has its own save action.</span></div>
      </section>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
