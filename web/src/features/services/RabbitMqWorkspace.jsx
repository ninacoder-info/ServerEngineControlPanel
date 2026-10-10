import React from "react";
import {
  Activity,
  CheckCircle2,
  CircleStop,
  Save,
  ShieldCheck,
} from "lucide-react";

const initial = {
  enabled: true,
  amqpPort: "5672",
  managementPort: "15672",
  bindAddress: "127.0.0.1",
  memoryLimit: "60%",
  diskLimit: "50 GB free",
  heartbeat: "60s",
  maxChannels: "2048",
  defaultVhost: "/",
  queueMode: "lazy",
  tls: false,
  management: true,
};

const input =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

export default function RabbitMqWorkspace() {
  const [settings, setSettings] = React.useState(() => {
    try {
      return {
        ...initial,
        ...JSON.parse(localStorage.getItem("serverengine:rabbitmq") || "{}"),
      };
    } catch {
      return initial;
    }
  });
  const [saved, setSaved] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const set = (key, value) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const save = () => {
    localStorage.setItem("serverengine:rabbitmq", JSON.stringify(settings));
    setSaved(true);
    setMessage("RabbitMQ settings saved for this panel profile.");
    window.setTimeout(() => setSaved(false), 3000);
  };
  return (
    <section className="mb-7 space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={19} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              RabbitMQ
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
              <CircleStop size={13} />
              Stopped
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Manage queues, exchanges, worker messaging, and broker limits for
            background jobs and distributed applications.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <ShieldCheck size={15} />
          Runtime checks
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">Queues</span>
          <strong className="mt-1 block text-2xl text-neutral-900 dark:text-neutral-100">
            —
          </strong>
          <span className="text-xs text-neutral-500">Broker not connected</span>
        </div>
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">Consumers</span>
          <strong className="mt-1 block text-2xl text-neutral-900 dark:text-neutral-100">
            —
          </strong>
          <span className="text-xs text-neutral-500">
            Runtime data unavailable
          </span>
        </div>
        <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">Messages</span>
          <strong className="mt-1 block text-2xl text-neutral-900 dark:text-neutral-100">
            —
          </strong>
          <span className="text-xs text-neutral-500">
            Waiting for service agent
          </span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          AMQP port
          <input
            className={input}
            value={settings.amqpPort}
            onChange={(event) => set("amqpPort", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Management port
          <input
            className={input}
            value={settings.managementPort}
            onChange={(event) => set("managementPort", event.target.value)}
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
          Default virtual host
          <input
            className={input}
            value={settings.defaultVhost}
            onChange={(event) => set("defaultVhost", event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Memory watermark
          <select
            className={input}
            value={settings.memoryLimit}
            onChange={(event) => set("memoryLimit", event.target.value)}
          >
            <option>40%</option>
            <option>60%</option>
            <option>70%</option>
            <option>80%</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Disk free threshold
          <select
            className={input}
            value={settings.diskLimit}
            onChange={(event) => set("diskLimit", event.target.value)}
          >
            <option>10 GB free</option>
            <option>50 GB free</option>
            <option>100 GB free</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Heartbeat
          <select
            className={input}
            value={settings.heartbeat}
            onChange={(event) => set("heartbeat", event.target.value)}
          >
            <option>30s</option>
            <option>60s</option>
            <option>120s</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Maximum channels
          <input
            className={input}
            value={settings.maxChannels}
            onChange={(event) => set("maxChannels", event.target.value)}
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue-600"
            checked={settings.management}
            onChange={(event) => set("management", event.target.checked)}
          />
          <span>
            <strong className="block text-neutral-800 dark:text-neutral-200">
              Management plugin
            </strong>
            <span className="mt-1 block text-xs text-neutral-500">
              Enable the local admin dashboard.
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
              TLS listeners
            </strong>
            <span className="mt-1 block text-xs text-neutral-500">
              Require encrypted client connections.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue-600"
            checked={settings.enabled}
            onChange={(event) => set("enabled", event.target.checked)}
          />
          <span>
            <strong className="block text-neutral-800 dark:text-neutral-200">
              Start with panel
            </strong>
            <span className="mt-1 block text-xs text-neutral-500">
              Start the broker when Server Engine starts.
            </span>
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {message ||
            "RabbitMQ installation and broker actions will be connected to the host agent later."}
        </p>
        <button
          type="button"
          onClick={save}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
          {saved ? "Saved" : "Save RabbitMQ settings"}
        </button>
      </div>
    </section>
  );
}
