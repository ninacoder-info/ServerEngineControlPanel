import React from "react";
import {
  Activity,
  Download,
  FileText,
  GitBranch,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";

const STORAGE_KEY = "serverengine:git";
const tabs = [
  ["runtime", "Runtime", Activity],
  ["configuration", "Configuration", SlidersHorizontal],
  ["identity", "Identity", GitBranch],
  ["security", "Security", ShieldCheck],
  ["storage", "Storage", Download],
  ["logs", "Error log", FileText],
];
const inputClass =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  home: "/opt/server-engine/git",
  repositories: "/server-engine/sources",
  deployRoot: "/server-engine/www",
  name: "",
  email: "",
  branch: "main",
  defaultRemote: "origin",
  cloneDepth: "Full history",
  protocol: "https and ssh",
  credentialUrls: "die",
  verifyObjects: true,
  verifyHostKeys: true,
  safeRepositories: "/server-engine/sources\n/server-engine/www",
  hooks: "disabled",
  fsmonitor: true,
  keepReflogs: true,
  pruneAfter: "30 days",
  sshKey: "Managed deploy key",
};

function readSettings() {
  try {
    return {
      ...defaults,
      ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"),
    };
  } catch {
    return defaults;
  }
}

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">
          {hint}
        </span>
      )}
    </label>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
      />
      <span>
        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </span>
        {description && (
          <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3 text-sm last:border-0 dark:border-neutral-800">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="max-w-[72%] break-all text-right font-medium text-neutral-900 dark:text-neutral-100">
        {value || "—"}
      </span>
    </div>
  );
}

function SaveFooter({ onSave, saving }) {
  return (
    <div className="flex justify-end border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <SaveButton onClick={onSave} saving={saving}>
        Save changes
      </SaveButton>
    </div>
  );
}

export default function GitConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed) ? installed[0] : installed;
  const [tab, setTab] = React.useState("runtime");
  const [settings, setSettings] = React.useState(readSettings);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const version = current?.version || service?.version || "—";
  const root =
    current?.root || current?.path || "/opt/server-engine/services/git";
  const set = (key, value) =>
    setSettings((valueState) => ({ ...valueState, [key]: value }));

  const save = async () => {
    setSaving(true);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    setSaving(false);
    setToast({ type: "success", message: "Git settings saved." });
    return true;
  };

  const renderTab = () => {
    if (tab === "configuration") {
      return (
        <div className="space-y-6">
          <Section
            title="Repository defaults"
            description="These defaults apply to repositories managed through Server Engine, not to the operating system Git installation."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Repository root"
                hint="New clones and managed checkouts are kept below this directory."
              >
                <input
                  className={`${inputClass} font-mono text-xs`}
                  value={settings.repositories}
                  onChange={(event) => set("repositories", event.target.value)}
                />
              </Field>
              <Field
                label="Website release root"
                hint="Deployment integrations can publish releases below this path."
              >
                <input
                  className={`${inputClass} font-mono text-xs`}
                  value={settings.deployRoot}
                  onChange={(event) => set("deployRoot", event.target.value)}
                />
              </Field>
              <Field label="Default branch">
                <input
                  className={inputClass}
                  value={settings.branch}
                  onChange={(event) => set("branch", event.target.value)}
                />
              </Field>
              <Field label="Default remote">
                <input
                  className={inputClass}
                  value={settings.defaultRemote}
                  onChange={(event) => set("defaultRemote", event.target.value)}
                />
              </Field>
              <Field
                label="Clone depth"
                hint="Shallow clones use less disk but do not include complete history."
              >
                <select
                  className={inputClass}
                  value={settings.cloneDepth}
                  onChange={(event) => set("cloneDepth", event.target.value)}
                >
                  <option>Full history</option>
                  <option>Latest commit only</option>
                  <option>Last 10 commits</option>
                  <option>Last 50 commits</option>
                </select>
              </Field>
              <Field
                label="Repository protocol"
                hint="External protocol helpers remain disabled."
              >
                <select
                  className={inputClass}
                  value={settings.protocol}
                  onChange={(event) => set("protocol", event.target.value)}
                >
                  <option>HTTPS and SSH</option>
                  <option>HTTPS only</option>
                  <option>SSH only</option>
                </select>
              </Field>
            </div>
          </Section>
          <Section
            title="Managed paths"
            description="Git uses these paths inside the Server Engine service area and does not write to the host Git configuration."
          >
            <div className="border-y border-neutral-200 dark:border-neutral-800">
              <Row label="Git runtime" value={`${root}/bin/git`} />
              <Row label="Runtime home" value={settings.home} />
              <Row label="Repositories" value={settings.repositories} />
              <Row label="Hooks" value={`${settings.home}/hooks`} />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "identity") {
      return (
        <div className="space-y-6">
          <Section
            title="Commit identity"
            description="Set the author identity used by Server Engine operations. It does not change the global identity of the host user."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Author name"
                hint="Required before creating commits from the panel."
              >
                <input
                  className={inputClass}
                  value={settings.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="Server Engine Deploy"
                />
              </Field>
              <Field
                label="Author email"
                hint="Use a verified project or deployment address."
              >
                <input
                  className={inputClass}
                  type="email"
                  value={settings.email}
                  onChange={(event) => set("email", event.target.value)}
                  placeholder="deploy@example.com"
                />
              </Field>
            </div>
          </Section>
          <Section
            title="Authentication"
            description="Credentials are kept outside repository URLs and are never written into commit history."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="SSH key"
                hint="The key is used only by the managed Git runtime."
              >
                <select
                  className={inputClass}
                  value={settings.sshKey}
                  onChange={(event) => set("sshKey", event.target.value)}
                >
                  <option>Managed deploy key</option>
                  <option>Upload a deploy key</option>
                  <option>Use HTTPS token</option>
                </select>
              </Field>
              <Field
                label="Credential in URL"
                hint="Recommended: refuse plaintext passwords and tokens in remotes."
              >
                <select
                  className={inputClass}
                  value={settings.credentialUrls}
                  onChange={(event) =>
                    set("credentialUrls", event.target.value)
                  }
                >
                  <option value="die">Reject</option>
                  <option value="warn">Warn</option>
                  <option value="allow">Allow</option>
                </select>
              </Field>
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "security") {
      return (
        <div className="space-y-6">
          <Section
            title="Repository trust"
            description="Git protects repositories owned by another user unless they are explicitly listed as safe. Keep this list narrow."
          >
            <Field
              label="Safe repository directories"
              hint="One Server Engine path per line. Avoid using * unless every repository is trusted."
            >
              <textarea
                className={`${inputClass} min-h-28 font-mono text-xs`}
                value={settings.safeRepositories}
                onChange={(event) =>
                  set("safeRepositories", event.target.value)
                }
              />
            </Field>
          </Section>
          <Section title="Transport and object checks">
            <div className="space-y-3">
              <Toggle
                label="Verify SSH host keys"
                description="Reject repository hosts that are not present in the managed known-hosts file."
                checked={settings.verifyHostKeys}
                onChange={(value) => set("verifyHostKeys", value)}
              />
              <Toggle
                label="Verify fetched objects"
                description="Run Git object checks during fetch and reject malformed or unsafe objects."
                checked={settings.verifyObjects}
                onChange={(value) => set("verifyObjects", value)}
              />
              <Toggle
                label="Disable repository hooks by default"
                description="Prevent untrusted repositories from executing hooks during panel operations."
                checked={settings.hooks === "disabled"}
                onChange={(value) =>
                  set("hooks", value ? "disabled" : "managed")
                }
              />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "storage") {
      return (
        <div className="space-y-6">
          <Section
            title="Repository storage"
            description="Manage cleanup and performance without touching repositories outside the Server Engine paths."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Prune unreachable objects after"
                hint="Longer retention helps recover interrupted deployments."
              >
                <select
                  className={inputClass}
                  value={settings.pruneAfter}
                  onChange={(event) => set("pruneAfter", event.target.value)}
                >
                  <option>7 days</option>
                  <option>30 days</option>
                  <option>90 days</option>
                  <option>Never automatically</option>
                </select>
              </Field>
              <Field
                label="Object storage"
                hint="Server Engine keeps Git objects with the managed repository."
              >
                <select
                  className={inputClass}
                  defaultValue="Managed repository storage"
                >
                  <option>Managed repository storage</option>
                  <option>Separate object volume</option>
                </select>
              </Field>
            </div>
          </Section>
          <Section title="Performance">
            <div className="space-y-3">
              <Toggle
                label="Filesystem monitor"
                description="Speed up status checks for large working trees when supported by the runtime."
                checked={settings.fsmonitor}
                onChange={(value) => set("fsmonitor", value)}
              />
              <Toggle
                label="Keep reflogs for recovery"
                description="Retain local references so interrupted deployments can be recovered more easily."
                checked={settings.keepReflogs}
                onChange={(value) => set("keepReflogs", value)}
              />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "runtime") {
      return (
        <div className="space-y-6">
          <Section
            title="Runtime status"
            description="This is the managed Git runtime. Existing system Git commands and configuration are not replaced."
          >
            <div className="border-y border-neutral-200 dark:border-neutral-800">
              <Row label="Status" value="Installed" />
              <Row label="Version" value={version} />
              <Row label="Git binary" value={`${root}/bin/git`} />
              <Row label="SSH binary" value={`${root}/bin/ssh`} />
              <Row label="Managed home" value={settings.home} />
            </div>
          </Section>
          <Section
            title="Verification commands"
            description="Use the Server Engine terminal to verify the managed runtime and its effective configuration."
          >
            <div className="space-y-2 rounded-md bg-neutral-950 p-4 font-mono text-xs leading-6 text-neutral-200">
              <p>{root}/bin/git --version</p>
              <p>
                GIT_CONFIG_GLOBAL={settings.home}/config {root}/bin/git config
                --list --show-origin
              </p>
              <p>
                {root}/bin/git -C {settings.repositories} status
              </p>
            </div>
          </Section>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <Section
          title="Git error log"
          description="Clone failures, rejected hosts, object verification errors, hook failures, and cleanup events appear here."
        >
          <div className="border-y border-neutral-200 dark:border-neutral-800">
            <Row label="Log file" value={`${root}/logs/error.log`} />
            <Row label="Tail" value="50 lines" />
            <Row
              label="Live streaming"
              value="Available when the host agent is connected"
            />
          </div>
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
            No Git errors have been reported yet.
          </div>
        </Section>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section
        className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="git-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <GitBranch
                size={19}
                className="text-blue-600 dark:text-blue-400"
              />
              <h2
                id="git-title"
                className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
              >
                Git
              </h2>
            </div>
            <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Installed · v{version}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Git configuration"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex gap-5 overflow-x-auto border-b border-neutral-200 px-6 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">
          {tabs.map(([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              onClick={() => setTab(id)}
              className={`${buttonClass} rounded-none border-b-2 px-1 pb-3 pt-0 ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        <div className="px-6 py-5">{renderTab()}</div>
      </section>
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
