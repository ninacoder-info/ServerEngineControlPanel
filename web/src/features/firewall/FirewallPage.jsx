import React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronDown,
  CirclePlus,
  Edit3,
  Globe2,
  LockKeyhole,
  Network,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import ServiceStoppedState from "../../components/ServiceStoppedState";
import ActionDialog from "../../components/ActionDialog";
import { apiRequest, readApiError } from "../../lib/api";
import NftablesConfigModal from "./NftablesConfigModal";

const tabs = [
  ["rules", "Firewall rules"],
  ["outbound", "Outbound rules"],
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
    source: "0.0.0.0/0",
    destination: "0.0.0.0/0",
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
    source: "0.0.0.0/0",
    destination: "0.0.0.0/0",
    service: "Control panel",
    port: "2309",
    interface: "WAN",
    states: 42,
    note: "Restrict source before exposing",
  },
  {
    id: 3,
    enabled: true,
    action: "Allow",
    protocol: "TCP",
    source: "0.0.0.0/0",
    destination: "0.0.0.0/0",
    service: "SSH",
    port: "22",
    interface: "WAN",
    states: 8,
    note: "Review source restriction",
  },
];
const input =
  "mt-2 block min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const panel =
  "rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";

function DismissibleNotice({ children, onDismiss, className = "" }) {
  return (
    <div className={`relative pr-12 ${className}`}>
      <button
        type="button"
        aria-label="Dismiss notice"
        title="Dismiss notice"
        onClick={onDismiss}
        className="absolute right-2 top-2 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-current opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
      >
        <X size={15} />
      </button>
      {children}
    </div>
  );
}

function PortTagsField({ value, onChange }) {
  const [draft, setDraft] = React.useState("");
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  function addItem() {
    const next = draft.trim();
    if (!next || items.includes(next)) return;
    onChange([...items, next].join(", "));
    setDraft("");
  }

  function removeItem(item) {
    onChange(items.filter((current) => current !== item).join(", "));
  }

  return (
    <div className="mt-2 rounded-md border border-neutral-300 px-2 py-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-neutral-700">
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              className="cursor-pointer text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-100"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => removeItem(item)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-[9rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
          required={items.length === 0}
          value={draft}
          placeholder="Type a port or alias and press Enter"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addItem();
            }
          }}
        />
        <button
          type="button"
          className="cursor-pointer px-1 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
          onClick={addItem}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function isValidFirewallAddress(value) {
  const address = value.trim();
  const slashIndex = address.indexOf("/");
  const host = slashIndex === -1 ? address : address.slice(0, slashIndex);
  const prefix = slashIndex === -1 ? null : address.slice(slashIndex + 1);
  if (prefix !== null && !/^\d+$/.test(prefix)) return false;
  if (host.includes(":")) {
    const compressed = host.includes("::");
    const groups = host.split(":").filter(Boolean).length;
    return (
      /^[0-9a-fA-F:]+$/.test(host) &&
      (compressed || groups === 8) &&
      (prefix === null || Number(prefix) <= 128)
    );
  }
  const octets = host.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d+$/.test(octet) && Number(octet) <= 255) &&
    (prefix === null || Number(prefix) <= 32)
  );
}

function AddressTagsField({ label, value, onChange, multiple = true }) {
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState("");
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item === "Any" ? "0.0.0.0/0" : item));

  function addItem() {
    const next = draft.trim();
    if (!next) return;
    const normalized = next === "Any" ? "0.0.0.0/0" : next;
    if (!multiple && items.length > 0) {
      setError("Remove the existing address before adding another.");
      return;
    }
    if (!isValidFirewallAddress(normalized)) {
      setError("Enter an IP address or CIDR range.");
      return;
    }
    if (!items.includes(normalized))
      onChange([...items, normalized].join(", "));
    setDraft("");
    setError("");
  }

  function removeItem(item) {
    onChange(items.filter((current) => current !== item).join(", "));
  }

  return (
    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
      {label}
      <div className="mt-2 rounded-md border border-neutral-300 px-2 py-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-neutral-700">
        <div className="flex flex-wrap items-center gap-1.5">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                className="cursor-pointer text-blue-500 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => removeItem(item)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            className="min-w-[12rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
            required={items.length === 0}
            value={draft}
            placeholder={multiple ? "IP or CIDR, then Enter" : "IP or CIDR"}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addItem();
              }
            }}
          />
          <button
            type="button"
            className="cursor-pointer px-1 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
            onClick={addItem}
          >
            Add
          </button>
        </div>
      </div>
      <span className="mt-1 block text-xs font-normal text-neutral-500 dark:text-neutral-400">
        Use 0.0.0.0/0 for any IPv4 address or ::/0 for any IPv6 address.
      </span>
      {error && (
        <span className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </label>
  );
}

function RuleModal({ rule, direction = "inbound", onClose, onSave }) {
  const [form, setForm] = React.useState({
    action: "Allow",
    protocol: "TCP",
    source: "0.0.0.0/0",
    destination: "0.0.0.0/0",
    service: "Custom service",
    port: "",
    interface: "WAN",
    note: "",
  });
  React.useEffect(() => {
    if (rule)
      setForm({
        action: rule.action,
        protocol: rule.protocol,
        source: rule.source === "Any" ? "0.0.0.0/0" : rule.source,
        destination:
          rule.destination === "Any" ? "0.0.0.0/0" : rule.destination,
        service: rule.service || "Custom service",
        port: rule.port,
        interface: rule.interface || "WAN",
        note: rule.note || "",
      });
  }, [rule]);
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/60 p-4">
      <form
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        onSubmit={async (event) => {
          event.preventDefault();
          const saved = await onSave(form);
          if (saved) onClose();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Rule editor
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              {rule
                ? `Edit ${direction} firewall rule`
                : `Add ${direction} firewall rule`}
            </h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              {direction === "outbound"
                ? "Outbound rules control traffic leaving this server."
                : "Rules are evaluated from highest priority to lowest priority."}
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
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
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
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
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
          <AddressTagsField
            label="Source"
            value={form.source}
            onChange={(value) => change("source", value)}
          />
          <AddressTagsField
            label="Destination"
            value={form.destination}
            onChange={(value) => change("destination", value)}
          />
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Port or port alias
            <PortTagsField
              value={form.port}
              onChange={(value) => change("port", value)}
            />
          </label>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Note
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
            className="rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <CirclePlus size={16} />
            {rule ? "Save rule" : "Add rule"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ForwardingModal({ forwarding, onClose, onSave }) {
  const [form, setForm] = React.useState({
    protocol: "TCP",
    source: "Any",
    interface: "Any",
    listen_address: "Any",
    listen_port: "",
    target_address: "",
    target_port: "",
    note: "",
    enabled: true,
  });
  const [errors, setErrors] = React.useState({});
  React.useEffect(() => {
    if (forwarding) setForm({ ...form, ...forwarding });
  }, [forwarding]);
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    const next = {};
    if (!form.listen_port.trim()) next.listen_port = "Public port is required.";
    if (!form.target_address.trim())
      next.target_address = "Target host is required.";
    if (!form.target_port.trim()) next.target_port = "Target port is required.";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    if (await onSave(form)) onClose();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/60 p-4">
      <form
        onSubmit={save}
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              NAT gateway
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              {forwarding ? "Edit port forwarding" : "Add port forwarding"}
            </h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Forward traffic arriving on this server to an IPv4 service behind
              it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Protocol
            <select
              className={input}
              value={form.protocol}
              onChange={(event) => change("protocol", event.target.value)}
            >
              <option>TCP</option>
              <option>UDP</option>
              <option>TCP / UDP</option>
            </select>
          </label>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Network interface
            <select
              className={input}
              value={form.interface}
              onChange={(event) => change("interface", event.target.value)}
            >
              <option>Any</option>
              <option>eth0</option>
              <option>ens3</option>
              <option>enp1s0</option>
              <option>virbr0</option>
            </select>
          </label>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Public/listen address
            <span className="mt-1 block text-xs font-normal text-neutral-500">
              Use Any for all server addresses.
            </span>
            <input
              className={input}
              value={form.listen_address}
              onChange={(event) => change("listen_address", event.target.value)}
              placeholder="Any or 51.161.115.162"
            />
          </label>
          <label
            className={`text-sm font-medium ${errors.listen_port ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            Public port
            <input
              className={`${input} ${errors.listen_port ? "border-rose-500" : ""}`}
              value={form.listen_port}
              onChange={(event) => change("listen_port", event.target.value)}
              placeholder="2222"
            />
            {errors.listen_port && (
              <span className="mt-1 block text-xs font-normal">
                {errors.listen_port}
              </span>
            )}
          </label>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Source restriction
            <span className="mt-1 block text-xs font-normal text-neutral-500">
              Optional client IP or CIDR.
            </span>
            <input
              className={input}
              value={form.source}
              onChange={(event) => change("source", event.target.value)}
              placeholder="Any or 203.0.113.0/24"
            />
          </label>
          <div />
          <label
            className={`text-sm font-medium ${errors.target_address ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            Target host
            <input
              className={`${input} ${errors.target_address ? "border-rose-500" : ""}`}
              value={form.target_address}
              onChange={(event) => change("target_address", event.target.value)}
              placeholder="192.168.122.233"
            />
            {errors.target_address && (
              <span className="mt-1 block text-xs font-normal">
                {errors.target_address}
              </span>
            )}
          </label>
          <label
            className={`text-sm font-medium ${errors.target_port ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            Target port
            <input
              className={`${input} ${errors.target_port ? "border-rose-500" : ""}`}
              value={form.target_port}
              onChange={(event) => change("target_port", event.target.value)}
              placeholder="22"
            />
            {errors.target_port && (
              <span className="mt-1 block text-xs font-normal">
                {errors.target_port}
              </span>
            )}
          </label>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 md:col-span-2">
            Note
            <input
              className={input}
              value={form.note}
              onChange={(event) => change("note", event.target.value)}
              placeholder="SSH access to the test VPS"
            />
          </label>
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600"
            checked={form.enabled}
            onChange={(event) => change("enabled", event.target.checked)}
          />
          <span>
            <span className="block font-medium">Enable forwarding rule</span>
            <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
              The rule is applied immediately after saving.
            </span>
          </span>
        </label>
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>
            IP forwarding must be enabled and the target host must route replies
            through this server. Server Engine will not change the host's
            default route.
          </span>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
          >
            Cancel
          </button>
          <button className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <CirclePlus size={16} />
            {forwarding ? "Save forwarding" : "Add forwarding"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ForwardingTab({
  forwardings,
  backend,
  onCreate,
  onEdit,
  onToggle,
  onDelete,
}) {
  const [showForwardingWarning, setShowForwardingWarning] =
    React.useState(true);
  return (
    <div className="p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Port forwarding
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Publish a service behind this server by translating an incoming port
            to an internal IPv4 host and port.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <CirclePlus size={15} />
          Add forwarding
        </button>
      </div>
      {backend && !backend.forwarding_enabled && showForwardingWarning && (
        <DismissibleNotice
          onDismiss={() => setShowForwardingWarning(false)}
          className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"
        >
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>
            IP forwarding is disabled on this server. The rule can be saved, but
            traffic will not reach the target until IPv4 forwarding is enabled.
          </span>
        </DismissibleNotice>
      )}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Public listener</th>
              <th className="px-3 py-3">Target</th>
              <th className="px-3 py-3">Protocol</th>
              <th className="px-3 py-3">Packets</th>
              <th className="px-3 py-3">Note</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {forwardings.map((forwarding) => (
              <tr
                key={forwarding.id}
                className={`border-b border-neutral-100 dark:border-neutral-800 ${!forwarding.enabled ? "opacity-50" : ""}`}
              >
                <td className="px-3 py-4">
                  <span
                    className={`inline-flex items-center gap-2 text-xs font-semibold ${forwarding.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-500"}`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {forwarding.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-3 py-4">
                  <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    {forwarding.listen_address}:{forwarding.listen_port}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {forwarding.interface} · {forwarding.source}
                  </p>
                </td>
                <td className="px-3 py-4 text-sm text-neutral-700 dark:text-neutral-300">
                  {forwarding.target_address}:{forwarding.target_port}
                </td>
                <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                  {forwarding.protocol}
                </td>
                <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                  {Number(forwarding.states || 0).toLocaleString()}
                </td>
                <td className="max-w-xs px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                  {forwarding.note || "—"}
                </td>
                <td className="px-3 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(forwarding)}
                      className="cursor-pointer text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(forwarding)}
                      className="cursor-pointer text-sm font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-300"
                    >
                      {forwarding.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(forwarding)}
                      className="cursor-pointer text-sm font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {forwardings.length === 0 && (
          <div className="grid place-items-center py-16 text-center">
            <ArrowDownToLine size={30} className="text-neutral-400" />
            <h4 className="mt-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              No port forwarding rules
            </h4>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Add a rule to publish a service behind this server.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AliasValuesField({ values, onChange, kind }) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const value = draft.trim();
    if (!value || values.includes(value)) return;
    onChange([...values, value]);
    setDraft("");
  };
  return (
    <div className="mt-2 rounded-md border border-neutral-300 p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-neutral-700">
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            {value}
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChange(values.filter((item) => item !== value))}
              className="cursor-pointer text-neutral-400 hover:text-neutral-800 dark:hover:text-white"
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-[12rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none dark:text-neutral-100"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={
            kind === "Port"
              ? "80 or 8000-8010, then Enter"
              : "IP or CIDR, then Enter"
          }
        />
        <button
          type="button"
          onClick={add}
          className="cursor-pointer px-1 text-sm font-semibold text-blue-600 dark:text-blue-400"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function AliasModal({ alias, onClose, onSave }) {
  const [form, setForm] = React.useState({
    name: "",
    kind: "Address",
    values: [],
    note: "",
    enabled: true,
  });
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (alias) setForm({ ...form, ...alias });
  }, [alias]);
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(form.name))
      return setError(
        "Use a name beginning with a letter; letters, numbers, hyphens, and underscores are allowed.",
      );
    if (!form.values.length) return setError("Add at least one value.");
    if (await onSave(form)) onClose();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/60 p-4">
      <form
        onSubmit={save}
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Reusable network object
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              {alias ? "Edit alias" : "Add alias"}
            </h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Create a named group once, then use it in firewall rule sources,
              destinations, or ports.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 space-y-5">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Alias name
            <input
              className={input}
              value={form.name}
              onChange={(event) => change("name", event.target.value)}
              placeholder="trusted-admins"
              disabled={Boolean(alias)}
            />
          </label>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Alias type
            <select
              className={input}
              value={form.kind}
              onChange={(event) => change("kind", event.target.value)}
              disabled={Boolean(alias)}
            >
              <option>Address</option>
              <option>Port</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Values
            <AliasValuesField
              values={form.values}
              onChange={(value) => change("values", value)}
              kind={form.kind}
            />
          </label>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Note
            <input
              className={input}
              value={form.note}
              onChange={(event) => change("note", event.target.value)}
              placeholder="Office and VPN administrator addresses"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-blue-600"
              checked={form.enabled}
              onChange={(event) => change("enabled", event.target.checked)}
            />
            Use this alias in applied rules
          </label>
          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
          >
            Cancel
          </button>
          <button className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <CirclePlus size={16} />
            {alias ? "Save alias" : "Add alias"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AliasesTab({ aliases, onCreate, onEdit, onToggle, onDelete }) {
  return (
    <div className="p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Aliases
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Manage reusable address and port groups. Updating an alias
            re-applies every firewall rule that uses it.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <CirclePlus size={15} />
          Add alias
        </button>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[850px] text-left">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Values</th>
              <th className="px-3 py-3">Note</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {aliases.map((alias) => (
              <tr
                key={alias.id}
                className={`border-b border-neutral-100 dark:border-neutral-800 ${!alias.enabled ? "opacity-50" : ""}`}
              >
                <td className="px-3 py-4">
                  <span
                    className={`inline-flex items-center gap-2 text-xs font-semibold ${alias.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-500"}`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {alias.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-3 py-4 font-mono text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  {alias.name}
                </td>
                <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                  {alias.kind}
                </td>
                <td className="max-w-md px-3 py-4">
                  <div className="flex flex-wrap gap-1">
                    {alias.values.map((value) => (
                      <code
                        key={value}
                        className="rounded bg-neutral-100 px-1.5 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {value}
                      </code>
                    ))}
                  </div>
                </td>
                <td className="max-w-xs px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                  {alias.note || "—"}
                </td>
                <td className="px-3 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(alias)}
                      className="cursor-pointer text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(alias)}
                      className="cursor-pointer text-sm font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-300"
                    >
                      {alias.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(alias)}
                      className="cursor-pointer text-sm font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {aliases.length === 0 && (
          <div className="grid place-items-center py-16 text-center">
            <Network size={30} className="text-neutral-400" />
            <h4 className="mt-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              No aliases yet
            </h4>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Add address groups or port groups to simplify your rules.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockedAddressModal({ entry, onClose, onSave }) {
  const [form, setForm] = React.useState({
    address: "",
    note: "",
    expires_at: "",
    enabled: true,
  });
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (entry)
      setForm({
        address: entry.address || "",
        note: entry.note || "",
        expires_at: entry.expires_at ? entry.expires_at.slice(0, 16) : "",
        enabled: entry.enabled ?? true,
      });
  }, [entry]);
  const save = async (event) => {
    event.preventDefault();
    if (!form.address.trim())
      return setError("IP address or CIDR range is required.");
    if (!isValidFirewallAddress(form.address))
      return setError("Enter a valid IPv4/IPv6 address or CIDR range.");
    if (
      await onSave({
        ...form,
        expires_at: form.expires_at
          ? new Date(form.expires_at).toISOString()
          : null,
      })
    )
      onClose();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/60 p-4">
      <form
        onSubmit={save}
        className="w-full max-w-xl rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
              Traffic deny list
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              {entry ? "Edit blocked address" : "Block an address"}
            </h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Drop new connections from an IP address or CIDR range before other
              firewall rules are evaluated.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 space-y-5">
          <div>
            <AddressTagsField
              label="IP address or CIDR range"
              value={form.address}
              multiple={false}
              onChange={(value) => {
                setForm({ ...form, address: value });
                setError("");
              }}
            />
            {error && (
              <span className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">
                {error}
              </span>
            )}
          </div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Expires at
            <span className="mt-1 block text-xs font-normal text-neutral-500">
              Leave empty for a permanent block.
            </span>
            <input
              type="datetime-local"
              className={input}
              value={form.expires_at}
              onChange={(event) =>
                setForm({ ...form, expires_at: event.target.value })
              }
            />
          </label>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Reason
            <input
              className={input}
              value={form.note}
              onChange={(event) =>
                setForm({ ...form, note: event.target.value })
              }
              placeholder="Repeated SSH scans"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-blue-600"
              checked={form.enabled}
              onChange={(event) =>
                setForm({ ...form, enabled: event.target.checked })
              }
            />
            Apply this block immediately
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
          >
            Cancel
          </button>
          <button className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700">
            <ShieldAlert size={16} />
            {entry ? "Save block" : "Block address"}
          </button>
        </div>
      </form>
    </div>
  );
}

function BlockedAddressesTab({
  entries,
  onCreate,
  onEdit,
  onToggle,
  onDelete,
}) {
  const [query, setQuery] = React.useState("");
  const visible = entries.filter((entry) =>
    `${entry.address} ${entry.note}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Blocked addresses
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Deny hostile IPs or networks at the firewall boundary. Expired
            entries remain visible for audit but are no longer applied.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
        >
          <ShieldAlert size={15} />
          Block address
        </button>
      </div>
      <label className="mt-5 flex max-w-md items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-neutral-400 dark:border-neutral-700">
        <Search size={15} />
        <input
          className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search blocked addresses"
        />
      </label>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Address</th>
              <th className="px-3 py-3">Reason</th>
              <th className="px-3 py-3">Expires</th>
              <th className="px-3 py-3">Packets</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => (
              <tr
                key={entry.id}
                className={`border-b border-neutral-100 dark:border-neutral-800 ${!entry.enabled ? "opacity-50" : ""}`}
              >
                <td className="px-3 py-4">
                  <span
                    className={`inline-flex items-center gap-2 text-xs font-semibold ${entry.enabled ? "text-rose-600 dark:text-rose-400" : "text-neutral-500"}`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {entry.enabled ? "Blocked" : "Paused"}
                  </span>
                </td>
                <td className="px-3 py-4 font-mono text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  {entry.address}
                </td>
                <td className="max-w-sm px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                  {entry.note || "—"}
                </td>
                <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                  {entry.expires_at
                    ? new Date(entry.expires_at).toLocaleString()
                    : "Permanent"}
                </td>
                <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                  {Number(entry.states || 0).toLocaleString()}
                </td>
                <td className="px-3 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(entry)}
                      className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(entry)}
                      className="cursor-pointer text-sm font-semibold text-neutral-600 dark:text-neutral-300"
                    >
                      {entry.enabled ? "Pause" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry)}
                      className="cursor-pointer text-sm font-semibold text-rose-600 dark:text-rose-400"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="py-16 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No blocked addresses match your search.
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityStat({ icon: Icon, label, value, detail }) {
  return (
    <div className={panel}>
      <div className="flex items-center gap-3">
        <Icon size={19} className="text-blue-500" />
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
          <p className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {value}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
        {detail}
      </p>
    </div>
  );
}

function DdosConfigModal({ value, onChange, onSave, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="w-full max-w-3xl rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Firewall configuration
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              DDoS protection
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Set local connection and request limits for this server.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close DDoS configuration"
            onClick={onClose}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={18} />
          </button>
        </div>
        <form
          className="space-y-5 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-blue-600"
              checked={value.enabled}
              onChange={(event) => onChange("enabled", event.target.checked)}
            />
            <span>
              <span className="block font-semibold text-neutral-900 dark:text-neutral-100">
                Enable local traffic protection
              </span>
              <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                Apply limits before requests reach the website runtime.
              </span>
            </span>
          </label>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Mitigation mode
              <select
                className={input}
                value={value.mode}
                onChange={(event) => onChange("mode", event.target.value)}
              >
                <option value="rate-limit">Rate limit</option>
                <option value="challenge">Challenge suspicious clients</option>
                <option value="block">Block over-limit clients</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Requests per second
              <input
                className={input}
                type="number"
                min="1"
                value={value.requestsPerSecond}
                onChange={(event) =>
                  onChange("requestsPerSecond", Number(event.target.value))
                }
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Burst allowance
              <input
                className={input}
                type="number"
                min="1"
                value={value.burst}
                onChange={(event) =>
                  onChange("burst", Number(event.target.value))
                }
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Concurrent connections
              <input
                className={input}
                type="number"
                min="1"
                value={value.concurrent}
                onChange={(event) =>
                  onChange("concurrent", Number(event.target.value))
                }
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Temporary ban duration
              <input
                className={input}
                value={value.banDuration}
                onChange={(event) =>
                  onChange("banDuration", event.target.value)
                }
                placeholder="10m"
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Trusted proxy networks
              <textarea
                className={`${input} min-h-24`}
                value={value.trustedProxies}
                onChange={(event) =>
                  onChange("trustedProxies", event.target.value)
                }
                placeholder="One CIDR range per line"
              />
            </label>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-blue-600"
              checked={value.logMitigations}
              onChange={(event) =>
                onChange("logMitigations", event.target.checked)
              }
            />
            <span>
              <span className="block font-medium">Log mitigation events</span>
              <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                Keep rate-limit and temporary-block decisions available for
                review.
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Shield size={15} />
              Save DDoS policy
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TrafficActivityTab({
  data,
  loading,
  onRefresh,
  rules,
  forwardings,
  blockedAddresses,
}) {
  const [showBackendWarning, setShowBackendWarning] = React.useState(true);
  const [showEmptyWarning, setShowEmptyWarning] = React.useState(true);
  const summary = data?.summary || {};
  const configuredEntries = [
    ...rules.map((rule) => ({
      id: rule.id,
      type: "Firewall rule",
      name: rule.service || "Firewall rule",
      match: `${rule.protocol || "TCP"} · ${rule.port || "Any"}`,
      action: rule.action || "Allow",
      packets: rule.states || 0,
      note: rule.note || "",
    })),
    ...forwardings.map((forwarding) => ({
      id: forwarding.id,
      type: "Port forwarding",
      name: `${forwarding.listen_address}:${forwarding.listen_port}`,
      match: `${forwarding.target_address}:${forwarding.target_port}`,
      action: forwarding.enabled ? "Forward" : "Paused",
      packets: forwarding.states || 0,
      note: forwarding.note || "",
    })),
    ...blockedAddresses.map((blocked) => ({
      id: blocked.id,
      type: "Blocked address",
      name: blocked.address,
      match: "Input and forwarded traffic",
      action: blocked.enabled ? "Drop" : "Paused",
      packets: blocked.states || 0,
      note: blocked.note || "",
    })),
  ];
  const entries = data?.entries?.length
    ? data.entries
    : data
      ? configuredEntries
      : [];

  return (
    <div className="p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Traffic activity
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Packet counters from managed nftables rules, blocked addresses, and
            port forwarding. This is not a request or connection log.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh counters
        </button>
      </div>
      {data?.last_apply && (
        <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
          Counters since the last policy apply:{" "}
          {new Date(data.last_apply).toLocaleString()}
        </p>
      )}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ActivityStat
          icon={Network}
          label="Packets counted"
          value={data ? Number(summary.packets || 0).toLocaleString() : "—"}
          detail="Matched managed rules"
        />
        <ActivityStat
          icon={ShieldAlert}
          label="Blocked packets"
          value={
            data ? Number(summary.blocked_packets || 0).toLocaleString() : "—"
          }
          detail="Deny, reject, and address blocks"
        />
        <ActivityStat
          icon={ArrowUpFromLine}
          label="Forwarded packets"
          value={
            data ? Number(summary.forwarded_packets || 0).toLocaleString() : "—"
          }
          detail="Port forwarding counters"
        />
        <ActivityStat
          icon={Activity}
          label="Active counters"
          value={
            data ? Number(summary.active_sources || 0).toLocaleString() : "—"
          }
          detail="Rules with traffic"
        />
      </div>
      {data?.backend && !data.backend.available && showBackendWarning && (
        <DismissibleNotice
          onDismiss={() => setShowBackendWarning(false)}
          className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"
        >
          {data.backend.message}
        </DismissibleNotice>
      )}
      {data &&
        Number(summary.packets || 0) === 0 &&
        entries.length > 0 &&
        showEmptyWarning && (
          <DismissibleNotice
            onDismiss={() => setShowEmptyWarning(false)}
            className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-200"
          >
            The firewall is ready, but no packets have matched these managed
            rules since the last policy apply. Generate traffic to a configured
            port, then refresh counters.
          </DismissibleNotice>
        )}
      {loading && !data ? (
        <div className="mt-5 space-y-3">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-14 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800"
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Source/rule</th>
                <th className="px-3 py-3">Match</th>
                <th className="px-3 py-3">Decision</th>
                <th className="px-3 py-3">Packets</th>
                <th className="px-3 py-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={`${entry.type}-${entry.id}`}
                  className="border-b border-neutral-100 dark:border-neutral-800"
                >
                  <td className="px-3 py-4 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {entry.type}
                  </td>
                  <td className="px-3 py-4 font-mono text-sm text-neutral-800 dark:text-neutral-200">
                    {entry.name}
                  </td>
                  <td className="px-3 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                    {entry.match}
                  </td>
                  <td
                    className={`px-3 py-4 text-sm font-semibold ${["Deny", "Reject", "Drop"].includes(entry.action) ? "text-rose-600 dark:text-rose-400" : entry.action === "Forward" ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400"}`}
                  >
                    {entry.action}
                  </td>
                  <td className="px-3 py-4 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    {Number(entry.packets || 0).toLocaleString()}
                  </td>
                  <td className="max-w-sm px-3 py-4 text-sm text-neutral-500 dark:text-neutral-400">
                    {entry.note || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && entries.length === 0 && (
            <div className="py-16 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No firewall rules, forwarding rules, or blocked addresses have
              been configured yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FirewallPage() {
  const [tab, setTab] = React.useState("rules");
  const [rules, setRules] = React.useState(initialRules);
  const [outboundRules, setOutboundRules] = React.useState([]);
  const [forwardings, setForwardings] = React.useState([]);
  const [aliases, setAliases] = React.useState([]);
  const [blockedAddresses, setBlockedAddresses] = React.useState([]);
  const [activity, setActivity] = React.useState(null);
  const [activityLoading, setActivityLoading] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [action, setAction] = React.useState("all");
  const [modal, setModal] = React.useState(null);
  const [ruleDirection, setRuleDirection] = React.useState("inbound");
  const [forwardingModal, setForwardingModal] = React.useState(null);
  const [aliasModal, setAliasModal] = React.useState(null);
  const [blockedModal, setBlockedModal] = React.useState(null);
  const [nftablesModal, setNftablesModal] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState(null);
  const [blockedStates, setBlockedStates] = React.useState(0);
  const [firewallStatus, setFirewallStatus] = React.useState("loading");
  const [backend, setBackend] = React.useState(null);
  const [showBackendNotice, setShowBackendNotice] = React.useState(true);
  const [applyWarnings, setApplyWarnings] = React.useState([]);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [waf, setWaf] = React.useState(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("serverengine:waf-policy") || "null",
        ) || {
          engine: "DetectionOnly",
          crs: true,
          paranoia: 1,
          anomaly: 5,
          audit: true,
          auditParts: "ABIJDEFHZ",
          requestBodyLimit: 131072,
          responseBodyLimit: 524288,
          nginx: true,
          apache: false,
          exclusions: "",
        }
      );
    } catch {
      return {
        engine: "DetectionOnly",
        crs: true,
        paranoia: 1,
        anomaly: 5,
        audit: true,
        auditParts: "ABIJDEFHZ",
        requestBodyLimit: 131072,
        responseBodyLimit: 524288,
        nginx: true,
        apache: false,
        exclusions: "",
      };
    }
  });
  const [wafMessage, setWafMessage] = React.useState("");
  const [ddos, setDdos] = React.useState({
    enabled: true,
    requestsPerSecond: 25,
    burst: 50,
    concurrent: 200,
    banDuration: "10m",
    trustedProxies: "",
    mode: "rate-limit",
    logMitigations: true,
  });
  const [ddosMessage, setDdosMessage] = React.useState("");
  const load = React.useCallback(async () => {
    setLoading(true);
    const response = await apiRequest("/api/v1/firewall");
    if (response.ok) {
      const value = await response.json();
      setRules(value.rules || []);
      setOutboundRules(value.outbound_rules || []);
      setOutboundRules(value.outbound_rules || []);
      setForwardings(value.forwardings || []);
      setAliases(value.aliases || []);
      setBlockedAddresses(value.blocked_addresses || []);
      setBlockedStates(value.blocked_states || 0);
      setFirewallStatus(value.status || "protected");
      setBackend(value.backend || null);
      setApplyWarnings(value.apply_warnings || []);
      setError("");
    } else
      setError(await readApiError(response, "Unable to load firewall policy"));
    setLoading(false);
  }, []);
  const loadActivity = React.useCallback(async () => {
    setActivityLoading(true);
    const response = await apiRequest("/api/v1/firewall/traffic-activity");
    if (response.ok) setActivity(await response.json());
    else
      setError(await readApiError(response, "Unable to load traffic activity"));
    setActivityLoading(false);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);
  React.useEffect(() => {
    const refresh = () => load();
    window.addEventListener("serverengine:firewall-updated", refresh);
    return () =>
      window.removeEventListener("serverengine:firewall-updated", refresh);
  }, [load]);
  React.useEffect(() => {
    if (tab === "activity") loadActivity();
  }, [tab, loadActivity]);
  const createRule = async (rule) => {
    const response = await apiRequest("/api/v1/firewall/rules", {
      method: "POST",
      body: JSON.stringify(rule),
    });
    if (!response.ok) {
      setError(await readApiError(response));
      return false;
    }
    const created = await response.json();
    setRules((current) => [...current, created]);
    await load();
    return true;
  };
  const updateRule = async (rule) => {
    const response = await apiRequest(`/api/v1/firewall/rules/${modal.id}`, {
      method: "PUT",
      body: JSON.stringify(rule),
    });
    if (!response.ok) {
      setError(await readApiError(response));
      return false;
    }
    const updated = await response.json();
    setRules((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    await load();
    return true;
  };
  const toggleRule = async (rule) => {
    const response = await apiRequest(`/api/v1/firewall/rules/${rule.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    if (response.ok) {
      setRules((current) =>
        current.map((item) =>
          item.id === rule.id ? { ...item, enabled: !item.enabled } : item,
        ),
      );
      await load();
    } else setError(await readApiError(response));
  };
  const deleteRule = async (rule) => {
    const response = await apiRequest(`/api/v1/firewall/rules/${rule.id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setRules((current) => current.filter((item) => item.id !== rule.id));
      await load();
    } else setError(await readApiError(response));
  };
  const createOutboundRule = async (rule) => {
    const response = await apiRequest("/api/v1/firewall/outbound-rules", {
      method: "POST",
      body: JSON.stringify(rule),
    });
    if (!response.ok) {
      setError(await readApiError(response));
      return false;
    }
    await load();
    return true;
  };
  const updateOutboundRule = async (rule) => {
    const response = await apiRequest(
      `/api/v1/firewall/outbound-rules/${modal.id}`,
      { method: "PUT", body: JSON.stringify(rule) },
    );
    if (!response.ok) {
      setError(await readApiError(response));
      return false;
    }
    await load();
    return true;
  };
  const toggleOutboundRule = async (rule) => {
    const response = await apiRequest(
      `/api/v1/firewall/outbound-rules/${rule.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ enabled: !rule.enabled }),
      },
    );
    if (!response.ok) setError(await readApiError(response));
    else await load();
  };
  const deleteOutboundRule = async (rule) => {
    setConfirmDialog({
      kind: "confirm",
      title: "Delete outbound rule?",
      message: `Delete ${rule.service || "this outbound rule"}? This cannot be undone.`,
      submitLabel: "Delete rule",
      onSubmit: async () => {
        setConfirmDialog(null);
        const response = await apiRequest(
          `/api/v1/firewall/outbound-rules/${rule.id}`,
          { method: "DELETE" },
        );
        if (!response.ok) setError(await readApiError(response));
        else await load();
      },
    });
  };
  const reloadPolicy = async () => {
    const response = await apiRequest("/api/v1/firewall/reload", {
      method: "POST",
    });
    if (response.ok) {
      const value = await response.json();
      setRules(value.rules || []);
      setOutboundRules(value.outbound_rules || []);
      setBlockedStates(value.blocked_states || 0);
      setFirewallStatus(value.status || "protected");
      setBackend(value.backend || null);
      setApplyWarnings(value.apply_warnings || []);
      setError("");
    } else setError(await readApiError(response));
  };
  const createForwarding = async (forwarding) => {
    const response = await apiRequest("/api/v1/firewall/forwardings", {
      method: "POST",
      body: JSON.stringify(forwarding),
    });
    if (!response.ok) {
      setError(await readApiError(response));
      return false;
    }
    await load();
    return true;
  };
  const updateForwarding = async (forwarding) => {
    const response = await apiRequest(
      `/api/v1/firewall/forwardings/${forwardingModal.id}`,
      { method: "PUT", body: JSON.stringify(forwarding) },
    );
    if (!response.ok) {
      setError(await readApiError(response));
      return false;
    }
    await load();
    return true;
  };
  const toggleForwarding = async (forwarding) => {
    const response = await apiRequest(
      `/api/v1/firewall/forwardings/${forwarding.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ enabled: !forwarding.enabled }),
      },
    );
    if (!response.ok) setError(await readApiError(response));
    else await load();
  };
  const deleteForwarding = async (forwarding) => {
    if (
      !window.confirm(
        `Delete forwarding ${forwarding.listen_port} → ${forwarding.target_address}:${forwarding.target_port}?`,
      )
    )
      return;
    const response = await apiRequest(
      `/api/v1/firewall/forwardings/${forwarding.id}`,
      { method: "DELETE" },
    );
    if (!response.ok) setError(await readApiError(response));
    else await load();
  };
  const createAlias = async (alias) => {
    const response = await apiRequest("/api/v1/firewall/aliases", {
      method: "POST",
      body: JSON.stringify(alias),
    });
    if (!response.ok) {
      setError(await readApiError(response));
      return false;
    }
    await load();
    return true;
  };
  const updateAlias = async (alias) => {
    const response = await apiRequest(
      `/api/v1/firewall/aliases/${aliasModal.id}`,
      { method: "PUT", body: JSON.stringify(alias) },
    );
    if (!response.ok) {
      setError(await readApiError(response));
      return false;
    }
    await load();
    return true;
  };
  const toggleAlias = async (alias) => {
    const response = await apiRequest(`/api/v1/firewall/aliases/${alias.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !alias.enabled }),
    });
    if (!response.ok) setError(await readApiError(response));
    else await load();
  };
  const deleteAlias = async (alias) => {
    if (
      !window.confirm(
        `Delete alias ${alias.name}? Rules using it will stop matching this alias.`,
      )
    )
      return;
    const response = await apiRequest(`/api/v1/firewall/aliases/${alias.id}`, {
      method: "DELETE",
    });
    if (!response.ok) setError(await readApiError(response));
    else await load();
  };
  const createBlockedAddress = async (entry) => {
    const response = await apiRequest("/api/v1/firewall/blocked-addresses", {
      method: "POST",
      body: JSON.stringify(entry),
    });
    if (!response.ok) {
      setError(await readApiError(response));
      return false;
    }
    await load();
    return true;
  };
  const updateBlockedAddress = async (entry) => {
    const response = await apiRequest(
      `/api/v1/firewall/blocked-addresses/${blockedModal.id}`,
      { method: "PUT", body: JSON.stringify(entry) },
    );
    if (!response.ok) {
      setError(await readApiError(response));
      return false;
    }
    await load();
    return true;
  };
  const toggleBlockedAddress = async (entry) => {
    const response = await apiRequest(
      `/api/v1/firewall/blocked-addresses/${entry.id}`,
      { method: "PATCH", body: JSON.stringify({ enabled: !entry.enabled }) },
    );
    if (!response.ok) setError(await readApiError(response));
    else await load();
  };
  const deleteBlockedAddress = async (entry) => {
    if (!window.confirm(`Remove block for ${entry.address}?`)) return;
    const response = await apiRequest(
      `/api/v1/firewall/blocked-addresses/${entry.id}`,
      { method: "DELETE" },
    );
    if (!response.ok) setError(await readApiError(response));
    else await load();
  };
  const displayedRules = tab === "outbound" ? outboundRules : rules;
  const visible = displayedRules.filter(
    (rule) =>
      (action === "all" || rule.action.toLowerCase() === action) &&
      `${rule.service} ${rule.source} ${rule.destination} ${rule.note}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const updateWaf = (key, value) =>
    setWaf((current) => ({ ...current, [key]: value }));
  const saveWaf = () => {
    localStorage.setItem("serverengine:waf-policy", JSON.stringify(waf));
    setWafMessage("WAF policy saved for this panel profile.");
  };
  const updateDdos = (key, value) =>
    setDdos((current) => ({ ...current, [key]: value }));
  const saveDdos = async () => {
    const response = await apiRequest("/api/v1/firewall/ddos-policy", {
      method: "PUT",
      body: JSON.stringify(ddos),
    });
    if (!response.ok) {
      showToast(
        await readApiError(response, "Unable to save DDoS protection policy"),
        "error",
      );
      return false;
    }
    setDdos(await response.json());
    setDdosMessage("");
    showToast("DDoS protection policy saved", "success");
    return true;
  };
  const firewallDisabled = !loading && firewallStatus === "disabled";
  return (
    <div className="space-y-7">
      {!firewallDisabled && (
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
              Network security
            </p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Firewall
            </h2>
            <p className="mt-2 max-w-3xl text-base leading-7 text-neutral-500 dark:text-neutral-400">
              Control inbound access, service exposure, trusted networks, and
              traffic decisions for this server.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              onClick={() => setNftablesModal(true)}
            >
              <Network size={16} />
              Configure nftables
            </button>
          </div>
        </div>
      )}
      {firewallDisabled ? (
        <ServiceStoppedState
          icon={Network}
          eyebrow="Firewall disabled"
          title="nftables is not enabled"
          description="Server Engine is not applying its managed nftables tables. Configure nftables to enable firewall rules, blocked addresses, and port forwarding."
          configureLabel="Configure nftables"
          onConfigure={() => setNftablesModal(true)}
          onCheck={load}
          borderTop={false}
        />
      ) : (
        <>
          {backend && showBackendNotice && (
            <DismissibleNotice
              onDismiss={() => setShowBackendNotice(false)}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${backend.available ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"}`}
            >
              {backend.available ? (
                <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={17} className="mt-0.5 shrink-0" />
              )}
              <div>
                <p className="font-semibold">
                  {backend.available
                    ? "Firewall backend ready"
                    : "Firewall backend unavailable"}
                </p>
                <p className="mt-1">{backend.message}</p>
                {applyWarnings.length > 0 && (
                  <p className="mt-1">{applyWarnings.join(" ")}</p>
                )}
              </div>
            </DismissibleNotice>
          )}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={panel}>
              <div className="flex items-center gap-3">
                <Shield className="text-emerald-500" size={20} />
                <span>
                  <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                    Firewall status
                  </small>
                  <strong className="mt-1 block text-xl text-emerald-600 dark:text-emerald-400">
                    {firewallStatus === "protected"
                      ? "Protected"
                      : firewallStatus}
                  </strong>
                </span>
              </div>
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                Policy loaded and enforcing
              </p>
            </div>
            <div className={panel}>
              <div className="flex items-center gap-3">
                <Network className="text-blue-500" size={20} />
                <span>
                  <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                    Active rules
                  </small>
                  <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                    {rules.filter((rule) => rule.enabled).length}
                  </strong>
                </span>
              </div>
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                Across WAN and LAN
              </p>
            </div>
            <div className={panel}>
              <div className="flex items-center gap-3">
                <ShieldAlert className="text-amber-500" size={20} />
                <span>
                  <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                    Blocked states
                  </small>
                  <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                    {blockedStates.toLocaleString()}
                  </strong>
                </span>
              </div>
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                Since the last policy reload
              </p>
            </div>
            <div className={panel}>
              <div className="flex items-center gap-3">
                <LockKeyhole className="text-violet-500" size={20} />
                <span>
                  <small className="block text-xs text-neutral-500 dark:text-neutral-400">
                    Management access
                  </small>
                  <strong className="mt-1 block text-xl text-neutral-900 dark:text-neutral-100">
                    Restricted
                  </strong>
                </span>
              </div>
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                Trusted network rule enabled
              </p>
            </div>
          </section>
          {error && (
            <div className="border-b border-rose-300 pb-3 text-sm text-rose-600 dark:border-rose-900 dark:text-rose-400">
              {error}
            </div>
          )}
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
            {tab === "waf" ? (
              <div className="space-y-6 p-5">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                    ModSecurity WAF
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                    Inspect and tune OWASP Core Rule Set protection for websites
                    behind Nginx or Apache. Start in detection mode, review
                    events, then move to blocking after false positives are
                    resolved.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Engine mode
                    <select
                      className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      value={waf.engine}
                      onChange={(event) =>
                        updateWaf("engine", event.target.value)
                      }
                    >
                      <option value="Off">Off</option>
                      <option value="DetectionOnly">Detection only</option>
                      <option value="On">Blocking</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    CRS paranoia level
                    <select
                      className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      value={waf.paranoia}
                      onChange={(event) =>
                        updateWaf("paranoia", Number(event.target.value))
                      }
                    >
                      <option value="1">1 · Baseline</option>
                      <option value="2">2 · Hardened</option>
                      <option value="3">3 · Strict</option>
                      <option value="4">4 · Maximum</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Inbound anomaly threshold
                    <input
                      className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      type="number"
                      min="1"
                      value={waf.anomaly}
                      onChange={(event) =>
                        updateWaf("anomaly", Number(event.target.value))
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Request body limit (bytes)
                    <input
                      className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      type="number"
                      min="1024"
                      value={waf.requestBodyLimit}
                      onChange={(event) =>
                        updateWaf(
                          "requestBodyLimit",
                          Number(event.target.value),
                        )
                      }
                    />
                  </label>
                </div>
                <div className="space-y-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-blue-600"
                      checked={waf.crs}
                      onChange={(event) =>
                        updateWaf("crs", event.target.checked)
                      }
                    />
                    <span>
                      <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        Enable OWASP Core Rule Set
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                        Use the maintained generic attack-detection rules for
                        SQL injection, XSS, protocol abuse, scanners, and common
                        exploit patterns.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-blue-600"
                      checked={waf.audit}
                      onChange={(event) =>
                        updateWaf("audit", event.target.checked)
                      }
                    />
                    <span>
                      <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        Audit suspicious transactions
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                        Keep request evidence for incident review without
                        logging every successful request.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-blue-600"
                      checked={waf.nginx}
                      onChange={(event) =>
                        updateWaf("nginx", event.target.checked)
                      }
                    />
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      Protect Nginx websites
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-blue-600"
                      checked={waf.apache}
                      onChange={(event) =>
                        updateWaf("apache", event.target.checked)
                      }
                    />
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      Protect Apache websites
                    </span>
                  </label>
                </div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Rule exclusions
                  <textarea
                    className="mt-1.5 min-h-24 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    value={waf.exclusions}
                    onChange={(event) =>
                      updateWaf("exclusions", event.target.value)
                    }
                    placeholder="One rule ID or website path per line"
                  />
                </label>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {wafMessage ||
                      "Review detection events before enabling blocking in production."}
                  </p>
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    onClick={saveWaf}
                  >
                    Save WAF policy
                  </button>
                </div>
              </div>
            ) : tab === "ddos" ? (
              <div className="space-y-6 p-5">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                    DDoS and traffic protection
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                    Protect the origin from connection floods and
                    application-layer bursts. This controls the local server;
                    upstream or provider-level volumetric attacks still require
                    edge protection.
                  </p>
                </div>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-blue-600"
                    checked={ddos.enabled}
                    onChange={(event) =>
                      updateDdos("enabled", event.target.checked)
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      Enable origin traffic protection
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                      Apply limits before requests reach the website runtime.
                    </span>
                  </span>
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Mitigation mode
                    <select
                      className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      value={ddos.mode}
                      onChange={(event) =>
                        updateDdos("mode", event.target.value)
                      }
                    >
                      <option value="rate-limit">Rate limit</option>
                      <option value="challenge">
                        Challenge suspicious clients
                      </option>
                      <option value="block">Block over-limit clients</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Requests per second
                    <input
                      className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      type="number"
                      min="1"
                      value={ddos.requestsPerSecond}
                      onChange={(event) =>
                        updateDdos(
                          "requestsPerSecond",
                          Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Burst allowance
                    <input
                      className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      type="number"
                      min="1"
                      value={ddos.burst}
                      onChange={(event) =>
                        updateDdos("burst", Number(event.target.value))
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Concurrent connections
                    <input
                      className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      type="number"
                      min="1"
                      value={ddos.concurrent}
                      onChange={(event) =>
                        updateDdos("concurrent", Number(event.target.value))
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Temporary ban duration
                    <input
                      className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      value={ddos.banDuration}
                      onChange={(event) =>
                        updateDdos("banDuration", event.target.value)
                      }
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Trusted proxy networks
                  <textarea
                    className="mt-1.5 min-h-24 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    value={ddos.trustedProxies}
                    onChange={(event) =>
                      updateDdos("trustedProxies", event.target.value)
                    }
                    placeholder="One CIDR range per line"
                  />
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-blue-600"
                    checked={ddos.logMitigations}
                    onChange={(event) =>
                      updateDdos("logMitigations", event.target.checked)
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      Log mitigation events
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                      Record rate-limit, challenge, and temporary-ban decisions
                      for review.
                    </span>
                  </span>
                </label>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {ddosMessage ||
                      "Provider-level volumetric DDoS protection must be configured at the hosting or CDN edge."}
                  </p>
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    onClick={saveDdos}
                  >
                    Save DDoS policy
                  </button>
                </div>
              </div>
            ) : tab === "forwarding" ? (
              <ForwardingTab
                forwardings={forwardings}
                backend={backend}
                onCreate={() => setForwardingModal({})}
                onEdit={setForwardingModal}
                onToggle={toggleForwarding}
                onDelete={deleteForwarding}
              />
            ) : tab === "aliases" ? (
              <AliasesTab
                aliases={aliases}
                onCreate={() => setAliasModal({})}
                onEdit={setAliasModal}
                onToggle={toggleAlias}
                onDelete={deleteAlias}
              />
            ) : tab === "blocked" ? (
              <BlockedAddressesTab
                entries={blockedAddresses}
                onCreate={() => setBlockedModal({})}
                onEdit={setBlockedModal}
                onToggle={toggleBlockedAddress}
                onDelete={deleteBlockedAddress}
              />
            ) : tab === "activity" ? (
              <TrafficActivityTab
                data={activity}
                loading={activityLoading}
                onRefresh={loadActivity}
                rules={rules}
                forwardings={forwardings}
                blockedAddresses={blockedAddresses}
              />
            ) : tab === "rules" || tab === "outbound" ? (
              <div className="p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      {tab === "outbound" ? "Outbound rules" : "Inbound rules"}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {tab === "outbound"
                        ? "Outbound traffic is allowed by default. Add rules only when restricting egress."
                        : "Rules are ordered from highest priority to lowest priority."}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <label className="flex min-w-64 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-950">
                      <Search size={16} />
                      <input
                        className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search rules"
                      />
                    </label>
                    <select
                      className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300"
                      value={action}
                      onChange={(event) => setAction(event.target.value)}
                    >
                      <option value="all">All actions</option>
                      <option value="allow">Allow</option>
                      <option value="deny">Deny</option>
                      <option value="reject">Reject</option>
                    </select>
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      onClick={() => {
                        setRuleDirection(
                          tab === "outbound" ? "outbound" : "inbound",
                        );
                        setModal({});
                      }}
                    >
                      <CirclePlus size={15} />
                      Add rule
                    </button>
                  </div>
                </div>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[860px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                        <th className="px-3 py-3 font-semibold">Order</th>
                        <th className="px-3 py-3 font-semibold">Decision</th>
                        <th className="px-3 py-3 font-semibold">Source</th>
                        <th className="px-3 py-3 font-semibold">Destination</th>
                        <th className="px-3 py-3 font-semibold">
                          Service / port
                        </th>
                        <th className="px-3 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((rule, index) => (
                        <tr
                          key={rule.id}
                          className={`border-b border-neutral-100 dark:border-neutral-800 ${!rule.enabled ? "opacity-50" : ""}`}
                        >
                          <td className="px-3 py-4 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                            {index + 1}
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-flex items-center gap-2 text-xs font-semibold ${rule.action === "Allow" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                            >
                              <span className="h-2 w-2 rounded-full bg-current" />
                              {rule.action}
                              <small className="font-normal text-neutral-400">
                                {rule.protocol}
                              </small>
                            </span>
                          </td>
                          <td className="px-3 py-4 text-sm text-neutral-700 dark:text-neutral-300">
                            {rule.source}
                          </td>
                          <td className="px-3 py-4 text-sm text-neutral-700 dark:text-neutral-300">
                            {rule.destination}
                          </td>
                          <td className="px-3 py-4">
                            <strong className="block text-sm text-neutral-800 dark:text-neutral-200">
                              {rule.service}
                            </strong>
                            <small className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                              {rule.port}
                            </small>
                          </td>
                          <td className="px-3 py-4 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                aria-label="Edit rule"
                                data-tooltip="Edit rule"
                                className="css-tooltip cursor-pointer rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-blue-600 dark:hover:bg-neutral-800 dark:hover:text-blue-400"
                                onClick={() => {
                                  setRuleDirection(
                                    tab === "outbound" ? "outbound" : "inbound",
                                  );
                                  setModal(rule);
                                }}
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                type="button"
                                aria-label={
                                  rule.enabled ? "Disable rule" : "Enable rule"
                                }
                                data-tooltip={
                                  rule.enabled ? "Disable rule" : "Enable rule"
                                }
                                className="css-tooltip cursor-pointer rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-amber-600 dark:hover:bg-neutral-800 dark:hover:text-amber-400"
                                onClick={() =>
                                  tab === "outbound"
                                    ? toggleOutboundRule(rule)
                                    : toggleRule(rule)
                                }
                              >
                                <CheckCircle2 size={16} />
                              </button>
                              <button
                                type="button"
                                aria-label="Delete rule"
                                data-tooltip="Delete rule"
                                className="css-tooltip cursor-pointer rounded-md p-2 text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                onClick={() =>
                                  tab === "outbound"
                                    ? deleteOutboundRule(rule)
                                    : deleteRule(rule)
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visible.length === 0 && (
                    <div className="grid place-items-center py-16 text-center">
                      <Shield size={30} className="text-neutral-400" />
                      <h4 className="mt-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                        No rules match
                      </h4>
                      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                        Try a different action or search term.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid min-h-80 place-items-center p-8 text-center">
                <Globe2 size={30} className="text-neutral-400" />
                <h3 className="mt-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  {tabs.find((item) => item[0] === tab)?.[1]}
                </h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                  This workspace is ready for port forwards, reusable address
                  and port aliases, blocked address review, and traffic states.
                </p>
                <button className="mt-5 inline-flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
                  <ChevronDown size={15} />
                  Configure section
                </button>
              </div>
            )}
          </section>
        </>
      )}
      {modal && (
        <RuleModal
          rule={modal.id ? modal : null}
          direction={ruleDirection}
          onClose={() => setModal(false)}
          onSave={
            ruleDirection === "outbound"
              ? modal.id
                ? updateOutboundRule
                : createOutboundRule
              : modal.id
                ? updateRule
                : createRule
          }
        />
      )}
      {forwardingModal && (
        <ForwardingModal
          forwarding={forwardingModal.id ? forwardingModal : null}
          onClose={() => setForwardingModal(null)}
          onSave={forwardingModal.id ? updateForwarding : createForwarding}
        />
      )}
      {aliasModal && (
        <AliasModal
          alias={aliasModal.id ? aliasModal : null}
          onClose={() => setAliasModal(null)}
          onSave={aliasModal.id ? updateAlias : createAlias}
        />
      )}
      {blockedModal && (
        <BlockedAddressModal
          entry={blockedModal.id ? blockedModal : null}
          onClose={() => setBlockedModal(null)}
          onSave={blockedModal.id ? updateBlockedAddress : createBlockedAddress}
        />
      )}
      {nftablesModal && (
        <NftablesConfigModal
          onClose={() => setNftablesModal(false)}
          ddos={ddos}
          onDdosChange={updateDdos}
          onDdosLoaded={setDdos}
          onDdosSave={saveDdos}
          onSaved={async () => {
            await load();
          }}
        />
      )}
      <ActionDialog
        dialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onSubmit={() => confirmDialog?.onSubmit?.()}
      />
    </div>
  );
}
