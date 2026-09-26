import React from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronDown,
  CirclePlus,
  Globe2,
  LockKeyhole,
  MoreHorizontal,
  Network,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  X,
} from "lucide-react";

const tabs = [
  ["rules", "Firewall rules"],
  ["forwarding", "Port forwarding"],
  ["aliases", "Aliases"],
  ["blocked", "Blocked addresses"],
  ["activity", "Traffic activity"],
];
const initialRules = [
  {
    id: 1,
    enabled: true,
    action: "Allow",
    protocol: "TCP",
    source: "Any",
    destination: "Any",
    service: "HTTP / HTTPS",
    port: "80, 443",
    interface: "WAN",
    states: 1284,
    note: "Public websites",
  },
  {
    id: 2,
    enabled: true,
    action: "Allow",
    protocol: "TCP",
    source: "Management network",
    destination: "Panel",
    service: "Control panel",
    port: "8888",
    interface: "WAN",
    states: 42,
    note: "Trusted administrators only",
  },
  {
    id: 3,
    enabled: true,
    action: "Allow",
    protocol: "TCP",
    source: "Any",
    destination: "Any",
    service: "SSH",
    port: "22",
    interface: "WAN",
    states: 8,
    note: "Review source restriction",
  },
  {
    id: 4,
    enabled: true,
    action: "Deny",
    protocol: "TCP",
    source: "Threat blocklist",
    destination: "Any",
    service: "All services",
    port: "Any",
    interface: "WAN",
    states: 317,
    note: "Automated protection",
  },
];
const input =
  "mt-2 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const panel =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";

function RuleModal({ onClose, onCreate }) {
  const [form, setForm] = React.useState({
    action: "Allow",
    protocol: "TCP",
    source: "Any",
    destination: "Any",
    service: "Custom service",
    port: "",
    interface: "WAN",
    note: "",
  });
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate({
            ...form,
            id: crypto.randomUUID(),
            enabled: true,
            states: 0,
          });
          onClose();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Rule editor
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Add firewall rule
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Rules are evaluated from top to bottom. Keep trusted allow rules
              above broad deny rules.
            </p>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Action
            <select
              className={input}
              value={form.action}
              onChange={(event) => change("action", event.target.value)}
            >
              <option>Allow</option>
              <option>Deny</option>
              <option>Reject</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Interface
            <select
              className={input}
              value={form.interface}
              onChange={(event) => change("interface", event.target.value)}
            >
              <option>WAN</option>
              <option>LAN</option>
              <option>Docker bridge</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Protocol
            <select
              className={input}
              value={form.protocol}
              onChange={(event) => change("protocol", event.target.value)}
            >
              <option>TCP</option>
              <option>UDP</option>
              <option>TCP / UDP</option>
              <option>ICMP</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Service
            <select
              className={input}
              value={form.service}
              onChange={(event) => change("service", event.target.value)}
            >
              <option>Custom service</option>
              <option>SSH</option>
              <option>HTTP / HTTPS</option>
              <option>DNS</option>
              <option>Mail</option>
              <option>Database</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Source address or alias
            <input
              className={input}
              value={form.source}
              onChange={(event) => change("source", event.target.value)}
              placeholder="Any, 203.0.113.0/24, TrustedAdmins"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Destination address or alias
            <input
              className={input}
              value={form.destination}
              onChange={(event) => change("destination", event.target.value)}
              placeholder="Any, WebServers"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Port or port alias
            <input
              required
              className={input}
              value={form.port}
              onChange={(event) => change("port", event.target.value)}
              placeholder="22, 80, 443 or WebPorts"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Rule note
            <input
              className={input}
              value={form.note}
              onChange={(event) => change("note", event.target.value)}
              placeholder="Why this access is required"
            />
          </label>
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>
            Keep an emergency management rule before applying a broad deny rule,
            or you may lock yourself out.
          </span>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <CirclePlus size={16} />
            Add rule
          </button>
        </div>
      </form>
    </div>
  );
}

export default function FirewallPage() {
  const [tab, setTab] = React.useState("rules");
  const [rules, setRules] = React.useState(initialRules);
  const [query, setQuery] = React.useState("");
  const [action, setAction] = React.useState("all");
  const [modal, setModal] = React.useState(false);
  const visible = rules.filter(
    (rule) =>
      (action === "all" || rule.action.toLowerCase() === action) &&
      `${rule.service} ${rule.source} ${rule.destination} ${rule.note}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-7">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Network security
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Firewall
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500 dark:text-slate-400">
            Control inbound access, service exposure, trusted networks, and
            traffic decisions for this server.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
            <RefreshCw size={16} />
            Reload policy
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            onClick={() => setModal(true)}
          >
            <CirclePlus size={16} />
            Add rule
          </button>
        </div>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={panel}>
          <div className="flex items-center gap-3">
            <Shield className="text-emerald-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Firewall status
              </small>
              <strong className="mt-1 block text-xl text-emerald-600 dark:text-emerald-400">
                Protected
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Policy loaded and enforcing
          </p>
        </div>
        <div className={panel}>
          <div className="flex items-center gap-3">
            <Network className="text-blue-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Active rules
              </small>
              <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">
                {rules.filter((rule) => rule.enabled).length}
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Across WAN and LAN
          </p>
        </div>
        <div className={panel}>
          <div className="flex items-center gap-3">
            <ShieldAlert className="text-amber-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Blocked states
              </small>
              <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">
                317
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Since the last policy reload
          </p>
        </div>
        <div className={panel}>
          <div className="flex items-center gap-3">
            <LockKeyhole className="text-violet-500" size={20} />
            <span>
              <small className="block text-xs text-slate-500 dark:text-slate-400">
                Management access
              </small>
              <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">
                Restricted
              </strong>
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Trusted network rule enabled
          </p>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 pt-5 dark:border-slate-800">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`whitespace-nowrap border-b-2 px-4 pb-3 text-sm font-semibold ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tab === "rules" ? (
          <div className="p-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Inbound rules
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Rules are ordered from highest priority to lowest priority.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="flex min-w-64 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-400 dark:border-slate-700 dark:bg-slate-950">
                  <Search size={16} />
                  <input
                    className="w-full bg-transparent text-sm text-slate-900 outline-none dark:text-slate-100"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search rules"
                  />
                </label>
                <select
                  className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
                >
                  <option value="all">All actions</option>
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                  <option value="reject">Reject</option>
                </select>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-3 py-3 font-semibold">Order</th>
                    <th className="px-3 py-3 font-semibold">Decision</th>
                    <th className="px-3 py-3 font-semibold">Source</th>
                    <th className="px-3 py-3 font-semibold">Destination</th>
                    <th className="px-3 py-3 font-semibold">Service / port</th>
                    <th className="px-3 py-3 font-semibold">Interface</th>
                    <th className="px-3 py-3 font-semibold">States</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((rule, index) => (
                    <tr
                      key={rule.id}
                      className={`border-b border-slate-100 dark:border-slate-800 ${!rule.enabled ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 py-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        {index + 1}
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex items-center gap-2 text-xs font-semibold ${rule.action === "Allow" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          <span className="h-2 w-2 rounded-full bg-current" />
                          {rule.action}
                          <small className="font-normal text-slate-400">
                            {rule.protocol}
                          </small>
                        </span>
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-700 dark:text-slate-300">
                        {rule.source}
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-700 dark:text-slate-300">
                        {rule.destination}
                      </td>
                      <td className="px-3 py-4">
                        <strong className="block text-sm text-slate-800 dark:text-slate-200">
                          {rule.service}
                        </strong>
                        <small className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                          {rule.port}
                        </small>
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {rule.interface}
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {rule.states.toLocaleString()}
                      </td>
                      <td className="px-3 py-4 text-right">
                        <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                          <MoreHorizontal size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible.length === 0 && (
                <div className="grid place-items-center py-16 text-center">
                  <Shield size={30} className="text-slate-400" />
                  <h4 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                    No rules match
                  </h4>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    Try a different action or search term.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid min-h-80 place-items-center p-8 text-center">
            <Globe2 size={30} className="text-slate-400" />
            <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
              {tabs.find((item) => item[0] === tab)?.[1]}
            </h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
              This workspace is ready for port forwards, reusable address and
              port aliases, blocked address review, and traffic states.
            </p>
            <button className="mt-5 inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
              <ChevronDown size={15} />
              Configure section
            </button>
          </div>
        )}
      </section>
      {modal && (
        <RuleModal
          onClose={() => setModal(false)}
          onCreate={(rule) => setRules((current) => [...current, rule])}
        />
      )}
    </div>
  );
}
