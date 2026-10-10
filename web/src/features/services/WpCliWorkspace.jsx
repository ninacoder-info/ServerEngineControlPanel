import React from "react";
import {
  CheckCircle2,
  Database,
  FileCode2,
  Save,
  ShieldCheck,
} from "lucide-react";

const defaults = {
  siteRoot: "/server-engine/www/example.com",
  phpVersion: "8.3",
  wpPath: "wp",
  backupSchedule: "Daily",
  backupPath: "/server-engine/backups/wordpress",
  updateChannel: "Stable",
  maintenance: false,
  multisite: false,
  verifyChecksums: true,
  automaticUpdates: false,
  cacheClear: true,
};

const input =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

export default function WpCliWorkspace() {
  const [settings, setSettings] = React.useState(() => {
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem("serverengine:wp-cli") || "{}"),
      };
    } catch {
      return defaults;
    }
  });
  const [saved, setSaved] = React.useState(false);
  const set = (key, value) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const save = () => {
    localStorage.setItem("serverengine:wp-cli", JSON.stringify(settings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };
  return (
    <section className="mb-7 space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <FileCode2 size={19} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              WP-CLI
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <CheckCircle2 size={13} />
              Ready
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Run safe WordPress maintenance and deployment tasks against a
            selected website using its configured isolated PHP runtime.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <ShieldCheck size={15} />
          Command policy
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">WordPress sites</span>
          <strong className="mt-1 block text-2xl text-neutral-900 dark:text-neutral-100">
            0
          </strong>
          <span className="text-xs text-neutral-500">No site selected</span>
        </div>
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">PHP runtime</span>
          <strong className="mt-1 block text-2xl text-neutral-900 dark:text-neutral-100">
            {settings.phpVersion}
          </strong>
          <span className="text-xs text-neutral-500">Isolated CLI mapping</span>
        </div>
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">Backup</span>
          <strong className="mt-1 block text-lg text-emerald-600">
            {settings.backupSchedule}
          </strong>
          <span className="text-xs text-neutral-500">Database and files</span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Website root
          <input
            className={`${input} font-mono text-xs`}
            value={settings.siteRoot}
            onChange={(event) => set("siteRoot", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          PHP version
          <select
            className={input}
            value={settings.phpVersion}
            onChange={(event) => set("phpVersion", event.target.value)}
          >
            <option>8.4</option>
            <option>8.3</option>
            <option>8.2</option>
            <option>8.1</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          WP-CLI binary
          <input
            className={`${input} font-mono text-xs`}
            value={settings.wpPath}
            onChange={(event) => set("wpPath", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Update channel
          <select
            className={input}
            value={settings.updateChannel}
            onChange={(event) => set("updateChannel", event.target.value)}
          >
            <option>Stable</option>
            <option>Nightly</option>
            <option>Development</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Backup schedule
          <select
            className={input}
            value={settings.backupSchedule}
            onChange={(event) => set("backupSchedule", event.target.value)}
          >
            <option>Manual</option>
            <option>Daily</option>
            <option>Weekly</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Backup directory
          <input
            className={`${input} font-mono text-xs`}
            value={settings.backupPath}
            onChange={(event) => set("backupPath", event.target.value)}
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue-600"
            checked={settings.verifyChecksums}
            onChange={(event) => set("verifyChecksums", event.target.checked)}
          />
          <span>
            <strong className="block text-neutral-800 dark:text-neutral-200">
              Verify WordPress checksums
            </strong>
            <span className="mt-1 block text-xs text-neutral-500">
              Detect modified core files before updates.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue-600"
            checked={settings.cacheClear}
            onChange={(event) => set("cacheClear", event.target.checked)}
          />
          <span>
            <strong className="block text-neutral-800 dark:text-neutral-200">
              Clear caches after deploy
            </strong>
            <span className="mt-1 block text-xs text-neutral-500">
              Flush object, page, and rewrite caches after changes.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue-600"
            checked={settings.multisite}
            onChange={(event) => set("multisite", event.target.checked)}
          />
          <span>
            <strong className="block text-neutral-800 dark:text-neutral-200">
              WordPress multisite
            </strong>
            <span className="mt-1 block text-xs text-neutral-500">
              Use network-aware commands and backups.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue-600"
            checked={settings.automaticUpdates}
            onChange={(event) => set("automaticUpdates", event.target.checked)}
          />
          <span>
            <strong className="block text-neutral-800 dark:text-neutral-200">
              Allow automatic updates
            </strong>
            <span className="mt-1 block text-xs text-neutral-500">
              Keep disabled until backups and rollback are verified.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue-600"
            checked={settings.maintenance}
            onChange={(event) => set("maintenance", event.target.checked)}
          />
          <span>
            <strong className="block text-neutral-800 dark:text-neutral-200">
              Maintenance mode
            </strong>
            <span className="mt-1 block text-xs text-neutral-500">
              Block visitors while maintenance commands run.
            </span>
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          WP-CLI execution and site discovery will connect to the host agent
          later.
        </p>
        <button
          type="button"
          onClick={save}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
          {saved ? "Saved" : "Save WP-CLI settings"}
        </button>
      </div>
    </section>
  );
}
