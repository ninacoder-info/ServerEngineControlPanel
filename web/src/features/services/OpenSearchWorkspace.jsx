import React from "react";
import {
  Activity,
  CheckCircle2,
  Database,
  Save,
  ShieldCheck,
} from "lucide-react";

const defaults = {
  clusterName: "server-engine-search",
  nodeName: "search-node-1",
  httpPort: "9200",
  transportPort: "9300",
  bindAddress: "127.0.0.1",
  heap: "1 GB",
  shards: "1",
  replicas: "0",
  dataPath: "/server-engine/data/opensearch",
  snapshotPath: "/server-engine/backups/opensearch",
  security: true,
  tls: false,
  snapshots: "Daily",
};

const input =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

export default function OpenSearchWorkspace() {
  const [settings, setSettings] = React.useState(() => {
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem("serverengine:opensearch") || "{}"),
      };
    } catch {
      return defaults;
    }
  });
  const [saved, setSaved] = React.useState(false);
  const set = (key, value) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const save = () => {
    localStorage.setItem("serverengine:opensearch", JSON.stringify(settings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };
  return (
    <section className="mb-7 space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={19} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              OpenSearch
            </h2>
            <span className="text-xs font-semibold text-neutral-500">3</span>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Configure application search, log indexing, cluster identity,
            storage, security, and snapshot retention.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
          <span className="h-2 w-2 rounded-full bg-neutral-400" />
          Stopped
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">Documents</span>
          <strong className="mt-1 block text-2xl text-neutral-900 dark:text-neutral-100">
            —
          </strong>
          <span className="text-xs text-neutral-500">
            Connect the node to inspect
          </span>
        </div>
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">Indexes</span>
          <strong className="mt-1 block text-2xl text-neutral-900 dark:text-neutral-100">
            —
          </strong>
          <span className="text-xs text-neutral-500">
            Runtime data unavailable
          </span>
        </div>
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">Cluster mode</span>
          <strong className="mt-1 block text-lg text-amber-600">
            Single node
          </strong>
          <span className="text-xs text-neutral-500">
            Ready for a future cluster
          </span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Cluster name
          <input
            className={input}
            value={settings.clusterName}
            onChange={(event) => set("clusterName", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Node name
          <input
            className={input}
            value={settings.nodeName}
            onChange={(event) => set("nodeName", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          HTTP port
          <input
            className={input}
            value={settings.httpPort}
            onChange={(event) => set("httpPort", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Transport port
          <input
            className={input}
            value={settings.transportPort}
            onChange={(event) => set("transportPort", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Bind address
          <input
            className={input}
            value={settings.bindAddress}
            onChange={(event) => set("bindAddress", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          JVM heap
          <select
            className={input}
            value={settings.heap}
            onChange={(event) => set("heap", event.target.value)}
          >
            <option>512 MB</option>
            <option>1 GB</option>
            <option>2 GB</option>
            <option>4 GB</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Primary shards
          <select
            className={input}
            value={settings.shards}
            onChange={(event) => set("shards", event.target.value)}
          >
            <option>1</option>
            <option>2</option>
            <option>3</option>
            <option>5</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Replica count
          <select
            className={input}
            value={settings.replicas}
            onChange={(event) => set("replicas", event.target.value)}
          >
            <option>0</option>
            <option>1</option>
            <option>2</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Data directory
          <input
            className={`${input} font-mono text-xs`}
            value={settings.dataPath}
            onChange={(event) => set("dataPath", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Snapshot directory
          <input
            className={`${input} font-mono text-xs`}
            value={settings.snapshotPath}
            onChange={(event) => set("snapshotPath", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Snapshot schedule
          <select
            className={input}
            value={settings.snapshots}
            onChange={(event) => set("snapshots", event.target.value)}
          >
            <option>Manual</option>
            <option>Daily</option>
            <option>Weekly</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue-600"
            checked={settings.security}
            onChange={(event) => set("security", event.target.checked)}
          />
          <span>
            <strong className="block text-neutral-800 dark:text-neutral-200">
              Security plugin
            </strong>
            <span className="mt-1 block text-xs text-neutral-500">
              Require authenticated requests and manage users, roles, and
              permissions.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue-600"
            checked={settings.tls}
            onChange={(event) => set("tls", event.target.checked)}
          />
          <span>
            <strong className="block text-neutral-800 dark:text-neutral-200">
              TLS transport
            </strong>
            <span className="mt-1 block text-xs text-neutral-500">
              Encrypt HTTP and node-to-node traffic before exposing the service.
            </span>
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          OpenSearch runtime actions and index management will connect to the
          host agent later.
        </p>
        <button
          type="button"
          onClick={save}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
          {saved ? "Saved" : "Save OpenSearch settings"}
        </button>
      </div>
    </section>
  );
}
