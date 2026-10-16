import React from "react";
import {
  Check,
  ChevronRight,
  Forward,
  LockKeyhole,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ServiceNotInstalledState from "../../components/ServiceNotInstalledState";
import { useServiceInstallationState } from "../../hooks/useServiceInstallationState";
import StalwartConfigModal from "../services/StalwartConfigModal";
import SecurePasswordInput from "../../components/SecurePasswordInput";
import Toast from "../../components/Toast";
const tabs = [
  "Mailboxes",
  "Forwarders",
  "Autoresponders",
  "Filters",
  "Deliverability",
];
const mailDomainPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}
function Badge({ children, tone = "green" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tone === "amber" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : tone === "blue" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : tone === "rose" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"}`}
    >
      {children}
    </span>
  );
}

function ForwarderModal({ forwarder, onClose, onSave }) {
  const editing = Boolean(forwarder);
  const [form, setForm] = React.useState(
    forwarder || {
      source: "",
      destination: "",
      mode: "Deliver",
      status: "Active",
    },
  );
  const [error, setError] = React.useState("");
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <form
        className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await onSave({ ...form, id: forwarder?.id });
          } catch (saveError) {
            setError(saveError.message);
          }
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Mail routing
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-950 dark:text-white">
              {editing ? "Edit forwarder" : "Create forwarder"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Route messages from one address to another destination.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close forwarder form"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Source address
            <input
              required
              className="mt-2 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:text-neutral-100"
              value={form.source}
              onChange={(event) => set("source", event.target.value)}
              placeholder="sales@example.com"
            />
          </label>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Destination address
            <input
              required
              type="email"
              className="mt-2 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:text-neutral-100"
              value={form.destination}
              onChange={(event) => set("destination", event.target.value)}
              placeholder="team@example.net"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Routing behavior
              <select
                className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                value={form.mode}
                onChange={(event) => set("mode", event.target.value)}
              >
                <option>Deliver</option>
                <option>Copy</option>
                <option>Reject</option>
              </select>
            </label>
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Status
              <select
                className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                value={form.status}
                onChange={(event) => set("status", event.target.value)}
              >
                <option>Active</option>
                <option>Paused</option>
              </select>
            </label>
          </div>
          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <button
            type="button"
            className="cursor-pointer rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {editing ? "Save forwarder" : "Create forwarder"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MailboxTableSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-neutral-100 dark:divide-neutral-800">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="grid gap-4 px-5 py-5 sm:grid-cols-[1.5fr_1fr_0.7fr_1fr_32px] sm:items-center"
        >
          <div className="space-y-2">
            <div className="h-4 w-44 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-3 w-28 rounded bg-neutral-100 dark:bg-neutral-800/70" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-1.5 w-36 rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
          <div className="h-6 w-16 rounded-full bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-3 w-28 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-7 w-7 rounded-md bg-neutral-200 dark:bg-neutral-800" />
        </div>
      ))}
    </div>
  );
}

function EmailPageSkeleton() {
  return (
    <div
      className="animate-pulse space-y-8"
      aria-label="Loading email workspace"
    >
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-9 w-28 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-80 max-w-full rounded bg-neutral-100 dark:bg-neutral-800/70" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-44 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-10 w-32 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-5 w-5 rounded bg-neutral-200 dark:bg-neutral-800" />
            </div>
            <div className="mt-4 h-8 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="mt-2 h-3 w-32 rounded bg-neutral-100 dark:bg-neutral-800/70" />
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex gap-6 overflow-hidden border-b border-neutral-200 px-4 dark:border-neutral-800">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="my-4 h-4 w-24 shrink-0 rounded bg-neutral-200 dark:bg-neutral-800"
            />
          ))}
        </div>
        <div className="flex items-center justify-between border-b border-neutral-200 p-5 dark:border-neutral-800">
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-3 w-72 max-w-full rounded bg-neutral-100 dark:bg-neutral-800/70" />
          </div>
          <div className="h-9 w-44 rounded-lg bg-neutral-100 dark:bg-neutral-800" />
        </div>
        <MailboxTableSkeleton />
      </section>
    </div>
  );
}

function AutoresponderModal({ responder, mailboxes, onClose, onSave }) {
  const editing = Boolean(responder);
  const [form, setForm] = React.useState(
    responder || {
      address: mailboxes[0]?.address || "",
      subject: "Out of office",
      body: "I am away and will reply when I return.",
      start_at: "",
      end_at: "",
      status: "Active",
    },
  );
  const [error, setError] = React.useState("");
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <form
        className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await onSave({ ...form, id: responder?.id });
          } catch (saveError) {
            setError(saveError.message);
          }
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Automatic reply
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-950 dark:text-white">
              {editing ? "Edit autoresponder" : "Create autoresponder"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Send one automatic reply for messages addressed to a mailbox.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close autoresponder form"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Mailbox
            <select
              required
              className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              value={form.address}
              onChange={(event) => set("address", event.target.value)}
            >
              {mailboxes.map((mailbox) => (
                <option key={mailbox.id} value={mailbox.address}>
                  {mailbox.address}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Reply subject
            <input
              required
              className="mt-2 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none dark:border-neutral-700 dark:text-neutral-100"
              value={form.subject}
              onChange={(event) => set("subject", event.target.value)}
              placeholder="Out of office"
            />
          </label>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Reply message
            <textarea
              required
              className="mt-2 min-h-28 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none dark:border-neutral-700 dark:text-neutral-100"
              value={form.body}
              onChange={(event) => set("body", event.target.value)}
              placeholder="I am away..."
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Starts at
              <span className="mt-2 block">
                <input
                  type="datetime-local"
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  value={form.start_at || ""}
                  onChange={(event) => set("start_at", event.target.value)}
                />
              </span>
            </label>
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Ends at
              <span className="mt-2 block">
                <input
                  type="datetime-local"
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  value={form.end_at || ""}
                  onChange={(event) => set("end_at", event.target.value)}
                />
              </span>
            </label>
          </div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Status
            <select
              className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              value={form.status}
              onChange={(event) => set("status", event.target.value)}
            >
              <option>Active</option>
              <option>Paused</option>
            </select>
          </label>
          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <button
            type="button"
            className="cursor-pointer rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!mailboxes.length}
            className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {editing ? "Save autoresponder" : "Create autoresponder"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AutorespondersPanel({
  responders,
  loaded,
  onCreate,
  onEdit,
  onDelete,
}) {
  return (
    <>
      <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
        <div>
          <h2 className="font-semibold text-neutral-950 dark:text-white">
            Automatic replies
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Send scheduled out-of-office messages for individual mailboxes.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={15} />
          Create autoresponder
        </button>
      </div>
      {!loaded ? (
        <div className="animate-pulse space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-16 rounded-md bg-neutral-100 dark:bg-neutral-800"
            />
          ))}
        </div>
      ) : responders.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <Mail
            className="mx-auto text-neutral-300 dark:text-neutral-600"
            size={30}
          />
          <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            No autoresponders yet
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
            Create an automatic reply for a mailbox when you are away or
            unavailable.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={15} />
            Create autoresponder
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-950/40">
              <tr>
                <th className="px-5 py-3">Mailbox</th>
                <th className="px-5 py-3">Subject</th>
                <th className="px-5 py-3">Schedule</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {responders.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4 font-medium text-neutral-900 dark:text-neutral-100">
                    {item.address}
                  </td>
                  <td className="max-w-xs px-5 py-4 text-neutral-600 dark:text-neutral-400">
                    <span className="block truncate">{item.subject}</span>
                  </td>
                  <td className="px-5 py-4 text-neutral-500">
                    {item.start_at || item.end_at
                      ? `${item.start_at || "Now"} – ${item.end_at || "No end"}`
                      : "Always"}
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={item.status === "Active" ? "green" : "amber"}>
                      {item.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400"
                        onClick={() => onEdit(item)}
                      >
                        Configure
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer text-sm text-rose-600 dark:text-rose-400"
                        onClick={() => onDelete(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function FilterModal({ filter, mailboxes, onClose, onSave }) {
  const editing = Boolean(filter);
  const [form, setForm] = React.useState(
    filter || {
      address: mailboxes[0]?.address || "",
      match_type: "Sender",
      pattern: "",
      action: "Move to folder",
      action_value: "",
      status: "Active",
    },
  );
  const [error, setError] = React.useState("");
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <form
        className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await onSave({ ...form, id: filter?.id });
          } catch (saveError) {
            setError(saveError.message);
          }
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Message rule
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-950 dark:text-white">
              {editing ? "Edit filter" : "Create filter"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Apply a Sieve-style rule to messages delivered to a mailbox.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close filter form"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Mailbox
            <select
              required
              className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              value={form.address}
              onChange={(event) => set("address", event.target.value)}
            >
              {mailboxes.map((mailbox) => (
                <option key={mailbox.id} value={mailbox.address}>
                  {mailbox.address}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Match
              <select
                className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                value={form.match_type}
                onChange={(event) => set("match_type", event.target.value)}
              >
                <option>Sender</option>
                <option>Subject</option>
                <option>Recipient</option>
              </select>
            </label>
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Contains
              <input
                required
                className="mt-2 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none dark:border-neutral-700 dark:text-neutral-100"
                value={form.pattern}
                onChange={(event) => set("pattern", event.target.value)}
                placeholder="newsletter@example.com"
              />
            </label>
          </div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Action
            <select
              className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              value={form.action}
              onChange={(event) => set("action", event.target.value)}
            >
              <option>Move to folder</option>
              <option>Mark as read</option>
              <option>Star message</option>
              <option>Delete message</option>
              <option>Reject message</option>
            </select>
          </label>
          {form.action === "Move to folder" && (
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Folder name
              <input
                required
                className="mt-2 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none dark:border-neutral-700 dark:text-neutral-100"
                value={form.action_value}
                onChange={(event) => set("action_value", event.target.value)}
                placeholder="Newsletters"
              />
            </label>
          )}
          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <button
            type="button"
            className="cursor-pointer rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!mailboxes.length}
            className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {editing ? "Save filter" : "Create filter"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FiltersPanel({ filters, loaded, onCreate, onEdit, onDelete }) {
  return (
    <>
      <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
        <div>
          <h2 className="font-semibold text-neutral-950 dark:text-white">
            Mailbox filters
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Sort, label, or discard messages before they reach the inbox.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={15} />
          Create filter
        </button>
      </div>
      {!loaded ? (
        <div className="animate-pulse space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-16 rounded-md bg-neutral-100 dark:bg-neutral-800"
            />
          ))}
        </div>
      ) : filters.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <SlidersHorizontal
            className="mx-auto text-neutral-300 dark:text-neutral-600"
            size={30}
          />
          <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            No filters yet
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
            Create a rule to organize incoming messages automatically.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={15} />
            Create filter
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-950/40">
              <tr>
                <th className="px-5 py-3">Mailbox</th>
                <th className="px-5 py-3">Condition</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filters.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4 font-medium text-neutral-900 dark:text-neutral-100">
                    {item.address}
                  </td>
                  <td className="px-5 py-4 text-neutral-600 dark:text-neutral-400">
                    {item.match_type} contains “{item.pattern}”
                  </td>
                  <td className="px-5 py-4 text-neutral-600 dark:text-neutral-400">
                    {item.action}
                    {item.action_value ? `: ${item.action_value}` : ""}
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={item.status === "Active" ? "green" : "amber"}>
                      {item.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400"
                        onClick={() => onEdit(item)}
                      >
                        Configure
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer text-sm text-rose-600 dark:text-rose-400"
                        onClick={() => onDelete(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ForwardersPanel({ forwarders, loaded, onCreate, onEdit, onDelete }) {
  return (
    <>
      <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
        <div>
          <h2 className="font-semibold text-neutral-950 dark:text-white">
            Forwarding rules
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Route, copy, or pause mail delivery for hosted addresses.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={15} />
          Create forwarder
        </button>
      </div>
      {!loaded ? (
        <div className="animate-pulse space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-12 rounded-md bg-neutral-100 dark:bg-neutral-800"
            />
          ))}
        </div>
      ) : forwarders.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <Forward
            className="mx-auto text-neutral-300 dark:text-neutral-600"
            size={30}
          />
          <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            No forwarders yet
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
            Forwarders route mail from one address to another mailbox or
            external destination.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={15} />
            Create forwarder
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-950/40">
              <tr>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Destination</th>
                <th className="px-5 py-3">Behavior</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {forwarders.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4 font-medium text-neutral-900 dark:text-neutral-100">
                    {item.source}
                  </td>
                  <td className="px-5 py-4 text-neutral-600 dark:text-neutral-400">
                    {item.destination}
                  </td>
                  <td className="px-5 py-4 text-neutral-600 dark:text-neutral-400">
                    {item.mode}
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={item.status === "Active" ? "green" : "amber"}>
                      {item.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400"
                        onClick={() => onEdit(item)}
                      >
                        Configure
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer text-sm text-rose-600 dark:text-rose-400"
                        onClick={() => onDelete(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function DeliverabilityPanel({ data, loaded, loading, onRefresh }) {
  const tone = (status) =>
    status === "pass" || status === "healthy"
      ? "green"
      : status === "not_checked" || status === "warning"
        ? "amber"
        : "rose";
  const label = (status) =>
    status === "pass"
      ? "Pass"
      : status === "not_checked"
        ? "Not checked"
        : status === "healthy"
          ? "Healthy"
          : status === "warning"
            ? "Needs attention"
            : "Fail";
  if (!loaded) {
    return (
      <div className="animate-pulse space-y-4 p-5">
        <div className="h-24 rounded-lg bg-neutral-100 dark:bg-neutral-800" />
        <div className="h-40 rounded-lg bg-neutral-100 dark:bg-neutral-800" />
      </div>
    );
  }
  if (!data || data.status === "not_configured") {
    return (
      <div className="px-5 py-14 text-center">
        <Mail
          className="mx-auto text-neutral-300 dark:text-neutral-600"
          size={30}
        />
        <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Add a domain before checking deliverability
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
          Public MX, SPF, DKIM, and DMARC checks need a real mail domain first.
        </p>
        <a
          href="/domains"
          className="mt-4 inline-flex cursor-pointer items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Open Domains
        </a>
      </div>
    );
  }
  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="font-semibold text-neutral-950 dark:text-white">
            Domain deliverability
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            Verify the public DNS records that control inbound delivery and
            authenticated sending.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex cursor-pointer items-center justify-center gap-2 self-start rounded-md px-2 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 dark:text-blue-400 dark:hover:bg-blue-950/30"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          {loading ? "Checking…" : "Refresh checks"}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-950/60">
          <p className="text-xs text-neutral-500">Domains checked</p>
          <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-white">
            {data.summary.total}
          </p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/20">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Healthy
          </p>
          <p className="mt-2 text-xl font-semibold text-emerald-800 dark:text-emerald-200">
            {data.summary.healthy}
          </p>
        </div>
        <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/20">
          <p className="text-xs text-amber-700 dark:text-amber-300">Warnings</p>
          <p className="mt-2 text-xl font-semibold text-amber-800 dark:text-amber-200">
            {data.summary.warnings}
          </p>
        </div>
        <div className="rounded-lg bg-rose-50 p-4 dark:bg-rose-950/20">
          <p className="text-xs text-rose-700 dark:text-rose-300">Failed</p>
          <p className="mt-2 text-xl font-semibold text-rose-800 dark:text-rose-200">
            {data.summary.failed}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {data.domains.map((item) => (
          <div
            key={item.domain}
            className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800"
          >
            <div className="flex flex-col justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3 sm:flex-row sm:items-center dark:border-neutral-800 dark:bg-neutral-950/50">
              <div>
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {item.domain}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Checked {new Date(data.checked_at).toLocaleString()}
                </p>
              </div>
              <Badge tone={tone(item.status)}>{label(item.status)}</Badge>
            </div>
            <div className="grid divide-y divide-neutral-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-neutral-800">
              {Object.values(item.checks).map((check) => (
                <div
                  key={check.label}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {check.label}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {check.detail}
                    </p>
                  </div>
                  <Badge tone={tone(check.status)}>{label(check.status)}</Badge>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {data.message} DKIM is reported as not checked until a selector is
        configured in Stalwart; the panel will not guess a selector.
      </p>
    </div>
  );
}
export default function EmailPage() {
  const stalwartState = useServiceInstallationState("stalwart");
  const [tab, setTab] = React.useState("Mailboxes");
  const [mailboxes, setMailboxes] = React.useState([]);
  const [mailDomains, setMailDomains] = React.useState([]);
  const [forwarders, setForwarders] = React.useState([]);
  const [autoresponders, setAutoresponders] = React.useState([]);
  const [filters, setFilters] = React.useState([]);
  const [domains, setDomains] = React.useState([]);
  const [summary, setSummary] = React.useState(null);
  const [deliverability, setDeliverability] = React.useState(null);
  const [deliverabilityLoaded, setDeliverabilityLoaded] = React.useState(false);
  const [deliverabilityLoading, setDeliverabilityLoading] =
    React.useState(false);
  const [mailboxDataLoaded, setMailboxDataLoaded] = React.useState(false);
  const [forwarderDataLoaded, setForwarderDataLoaded] = React.useState(false);
  const [autoresponderDataLoaded, setAutoresponderDataLoaded] =
    React.useState(false);
  const [filterDataLoaded, setFilterDataLoaded] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(false);
  const [mailDomainModal, setMailDomainModal] = React.useState(false);
  const [mailDomainStep, setMailDomainStep] = React.useState(1);
  const [mailDomainDraft, setMailDomainDraft] = React.useState("");
  const [mailDomainCheck, setMailDomainCheck] = React.useState(null);
  const [mailDomainGuide, setMailDomainGuide] = React.useState(null);
  const [mailDomainToast, setMailDomainToast] = React.useState(null);
  const [mailDomainGuideLoading, setMailDomainGuideLoading] =
    React.useState(false);
  const [mailDomainChecking, setMailDomainChecking] = React.useState("");
  const [mailDomainCreating, setMailDomainCreating] = React.useState(false);
  const [forwarderModal, setForwarderModal] = React.useState(null);
  const [autoresponderModal, setAutoresponderModal] = React.useState(null);
  const [filterModal, setFilterModal] = React.useState(null);
  const [local, setLocal] = React.useState("");
  const [mailboxDomain, setMailboxDomain] = React.useState("");
  const [mailboxQuota, setMailboxQuota] = React.useState("1073741824");
  const [mailboxPassword, setMailboxPassword] = React.useState("");
  const [deletingMailboxId, setDeletingMailboxId] = React.useState("");
  const [mailboxNotice, setMailboxNotice] = React.useState(null);
  const [postfix, setPostfix] = React.useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("serverengine:postfix") || "null") || {
          hostname: "mail.example.com",
          domain: "example.com",
          smtpPort: 25,
          submissionPort: 587,
          tls: "may",
          relay: "",
          networks: "127.0.0.0/8",
          maxQueue: 1000,
          rate: 100,
          queueRetention: "5d",
          rejectUnknown: true,
        }
      );
    } catch {
      return {
        hostname: "mail.example.com",
        domain: "example.com",
        smtpPort: 25,
        submissionPort: 587,
        tls: "may",
        relay: "",
        networks: "127.0.0.0/8",
        maxQueue: 1000,
        rate: 100,
        queueRetention: "5d",
        rejectUnknown: true,
      };
    }
  });
  const [postfixMessage, setPostfixMessage] = React.useState("");
  const [dovecot, setDovecot] = React.useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("serverengine:dovecot") || "null") || {
          hostname: "mail.example.com",
          imap: true,
          pop3: false,
          imapPort: 143,
          imapsPort: 993,
          pop3Port: 110,
          pop3sPort: 995,
          mailbox: "maildir:~/Maildir",
          auth: "plain-login",
          tls: "required",
          maxConnections: 200,
          quota: "2 GB",
          sieve: true,
        }
      );
    } catch {
      return {
        hostname: "mail.example.com",
        imap: true,
        pop3: false,
        imapPort: 143,
        imapsPort: 993,
        pop3Port: 110,
        pop3sPort: 995,
        mailbox: "maildir:~/Maildir",
        auth: "plain-login",
        tls: "required",
        maxConnections: 200,
        quota: "2 GB",
        sieve: true,
      };
    }
  });
  const [dovecotMessage, setDovecotMessage] = React.useState("");
  const [rspamd, setRspamd] = React.useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("serverengine:rspamd") || "null") || {
          enabled: true,
          rejectScore: 15,
          addHeaderScore: 6,
          greylisting: true,
          dkim: true,
          spf: true,
          dmarc: true,
          antivirus: false,
          bayes: true,
          maxMessage: 25,
          action: "add-header",
        }
      );
    } catch {
      return {
        enabled: true,
        rejectScore: 15,
        addHeaderScore: 6,
        greylisting: true,
        dkim: true,
        spf: true,
        dmarc: true,
        antivirus: false,
        bayes: true,
        maxMessage: 25,
        action: "add-header",
      };
    }
  });
  const [rspamdMessage, setRspamdMessage] = React.useState("");
  // Kept for backwards-compatible saved settings; Stalwart configuration is
  // now opened from the header modal rather than a duplicate page tab.
  const [stalwart, setStalwart] = React.useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("serverengine:stalwart") || "null") || {
          hostname: "mail.example.com",
          smtp: true,
          imap: true,
          jmap: true,
          webAdmin: true,
          submissionPort: 587,
          jmapPort: 443,
          storage: "/server-engine/mail",
          auth: "password",
          tls: "required",
          spam: true,
          dkim: true,
          maxMailbox: "5 GB",
        }
      );
    } catch {
      return {
        hostname: "mail.example.com",
        smtp: true,
        imap: true,
        jmap: true,
        webAdmin: true,
        submissionPort: 587,
        jmapPort: 443,
        storage: "/server-engine/mail",
        auth: "password",
        tls: "required",
        spam: true,
        dkim: true,
        maxMailbox: "5 GB",
      };
    }
  });
  const [stalwartMessage, setStalwartMessage] = React.useState("");
  const [serviceCatalog, setServiceCatalog] = React.useState([]);
  const [installedServices, setInstalledServices] = React.useState([]);
  const [servicesLoaded, setServicesLoaded] = React.useState(false);
  const [stalwartConfigOpen, setStalwartConfigOpen] = React.useState(false);
  const [dismissedAlerts, setDismissedAlerts] = React.useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("serverengine:email-setup-alerts") || "[]",
      );
    } catch {
      return [];
    }
  });
  const loadEmailServices = React.useCallback(async () => {
    const [
      catalogResponse,
      installedResponse,
      summaryResponse,
      mailboxesResponse,
      mailDomainsResponse,
      forwardersResponse,
      domainsResponse,
      autorespondersResponse,
      filtersResponse,
    ] = await Promise.all([
      apiRequest("/api/v1/services/catalog"),
      apiRequest("/api/v1/services/installed"),
      apiRequest("/api/v1/email/summary"),
      apiRequest("/api/v1/email/mailboxes"),
      apiRequest("/api/v1/email/domains"),
      apiRequest("/api/v1/email/forwarders"),
      apiRequest("/api/v1/domains"),
      apiRequest("/api/v1/email/autoresponders"),
      apiRequest("/api/v1/email/filters"),
    ]);
    if (catalogResponse.ok) setServiceCatalog(await catalogResponse.json());
    if (installedResponse.ok)
      setInstalledServices(await installedResponse.json());
    if (summaryResponse.ok) setSummary(await summaryResponse.json());
    if (mailboxesResponse.ok) setMailboxes(await mailboxesResponse.json());
    if (mailDomainsResponse.ok)
      setMailDomains(await mailDomainsResponse.json());
    if (forwardersResponse.ok) setForwarders(await forwardersResponse.json());
    setForwarderDataLoaded(true);
    if (autorespondersResponse.ok)
      setAutoresponders(await autorespondersResponse.json());
    setAutoresponderDataLoaded(true);
    if (filtersResponse.ok) setFilters(await filtersResponse.json());
    setFilterDataLoaded(true);
    if (domainsResponse.ok) {
      const availableDomains = await domainsResponse.json();
      setDomains(availableDomains);
      setMailboxDomain(
        (current) => current || availableDomains[0]?.domain || "",
      );
    }
    setServicesLoaded(true);
    setMailboxDataLoaded(true);
  }, []);
  const loadDeliverability = React.useCallback(async (refresh = false) => {
    setDeliverabilityLoading(true);
    try {
      const response = await apiRequest(
        `/api/v1/email/deliverability${refresh ? "?refresh=true" : ""}`,
      );
      if (response.ok) setDeliverability(await response.json());
    } finally {
      setDeliverabilityLoaded(true);
      setDeliverabilityLoading(false);
    }
  }, []);
  React.useEffect(() => {
    loadEmailServices().catch(() => {});
    loadDeliverability().catch(() => {});
  }, [loadEmailServices, loadDeliverability]);
  const mailboxesRef = React.useRef(mailboxes);
  React.useEffect(() => {
    mailboxesRef.current = mailboxes;
  }, [mailboxes]);
  React.useEffect(() => {
    const onEmailUpdated = (event) => {
      const update = event.detail;
      if (update?.action === "mailbox-created" && update.mailbox) {
        const mailboxAlreadyExists = mailboxesRef.current.some(
          (item) => item.id === update.mailbox.id,
        );
        const domainAlreadyExists = mailboxesRef.current.some(
          (item) => item.domain === update.mailbox.domain,
        );
        setMailboxes((current) => [
          update.mailbox,
          ...current.filter((item) => item.id !== update.mailbox.id),
        ]);
        setSummary((current) =>
          current
            ? {
                ...current,
                mailboxes: current.mailboxes + (mailboxAlreadyExists ? 0 : 1),
                domains: current.domains + (domainAlreadyExists ? 0 : 1),
              }
            : current,
        );
      }
      if (update?.action === "mailbox-deleted" && update.mailboxId) {
        setDeletingMailboxId("");
        setMailboxes((current) => {
          const removed = current.find((item) => item.id === update.mailboxId);
          if (!removed) return current;
          const remainingDomainCount = current.filter(
            (item) =>
              item.domain === removed.domain && item.id !== update.mailboxId,
          ).length;
          setSummary((summary) =>
            summary
              ? {
                  ...summary,
                  mailboxes: Math.max(0, summary.mailboxes - 1),
                  domains: Math.max(
                    0,
                    summary.domains - (remainingDomainCount === 0 ? 1 : 0),
                  ),
                }
              : summary,
          );
          return current.filter((item) => item.id !== update.mailboxId);
        });
      }
    };
    const onJobsUpdated = (event) => {
      const job = event.detail?.job;
      if (!job) return;
      if (
        job.type?.startsWith("Create mailbox ") &&
        ["queued", "running"].includes(job.status)
      ) {
        setMailboxNotice({
          type: "info",
          message: job.message || "Mailbox creation is processing…",
        });
      }
      if (
        job.type === "Delete email mailbox" &&
        ["queued", "running"].includes(job.status)
      ) {
        setMailboxNotice({
          type: "info",
          message: job.message || "Mailbox deletion is processing…",
        });
      }
      if (
        job.type?.startsWith("Create mailbox ") &&
        ["succeeded", "failed", "cancelled"].includes(job.status)
      ) {
        setMailboxNotice({
          type: job.status === "succeeded" ? "success" : "error",
          message: job.message || `Mailbox creation ${job.status}.`,
        });
      }
      if (
        job.type === "Delete email mailbox" &&
        ["succeeded", "failed", "cancelled"].includes(job.status)
      ) {
        setDeletingMailboxId("");
        setMailboxNotice({
          type: job.status === "succeeded" ? "success" : "error",
          message: job.message || `Mailbox deletion ${job.status}.`,
        });
      }
    };
    const onEmailDomainUpdated = (event) => {
      const update = event.detail;
      if (update?.action === "domain-created" && update.domain) {
        setDomains((current) =>
          current.some((item) => item.domain === update.domain.domain)
            ? current
            : [...current, update.domain],
        );
        setMailboxDomain((current) => current || update.domain.domain);
      }
      if (update?.action === "domain-deleted" && update.domain) {
        setDomains((current) =>
          current.filter((item) => item.domain !== update.domain),
        );
        setMailboxDomain((current) =>
          current === update.domain ? "" : current,
        );
      }
      if (update?.action === "domain-synced" && update.domain) {
        setMailboxNotice({
          type: "success",
          message: `${update.domain} is ready for mailbox provisioning.`,
        });
      }
      if (update?.action === "domain-sync-failed" && update.domain) {
        setMailboxNotice({
          type: "error",
          message: `${update.domain} could not be provisioned in Stalwart: ${update.message || "check the mail service configuration."}`,
        });
      }
      if (update?.action === "mail-domain-created" && update.domain) {
        setMailDomains((current) =>
          current.some((item) => item.domain === update.domain.domain)
            ? current
            : [...current, update.domain],
        );
      }
    };
    window.addEventListener("serverengine:email-updated", onEmailUpdated);
    window.addEventListener("serverengine:jobs-updated", onJobsUpdated);
    window.addEventListener(
      "serverengine:email-domain-updated",
      onEmailDomainUpdated,
    );
    return () => {
      window.removeEventListener("serverengine:email-updated", onEmailUpdated);
      window.removeEventListener("serverengine:jobs-updated", onJobsUpdated);
      window.removeEventListener(
        "serverengine:email-domain-updated",
        onEmailDomainUpdated,
      );
    };
  }, []);
  const dismissSetupAlert = (key) => {
    setDismissedAlerts((current) => {
      const next = current.includes(key) ? current : [...current, key];
      localStorage.setItem(
        "serverengine:email-setup-alerts",
        JSON.stringify(next),
      );
      return next;
    });
  };
  const stalwartService = serviceCatalog.find(
    (service) => service.id === "stalwart",
  );
  const certbotInstalled = installedServices.some(
    (service) => service.id === "certbot",
  );
  const powerdnsInstalled = installedServices.some(
    (service) => service.id === "powerdns",
  );
  if (stalwartState.loading || !servicesLoaded) {
    return <EmailPageSkeleton />;
  }
  if (!stalwartState.installed) {
    return (
      <ServiceNotInstalledState
        state={stalwartState}
        icon={Mail}
        eyebrow="Hosting / Email"
        title="Stalwart Mail Server is not installed"
        description="Install Stalwart to manage mail domains, mailboxes, aliases, forwarding, delivery, and secure client access from this page."
        installLabel="Install Stalwart"
      />
    );
  }
  const filtered = mailboxes.filter((x) =>
    x.address.includes(query.toLowerCase()),
  );
  const create = async () => {
    if (!local.trim()) return;
    const response = await apiRequest("/api/v1/email/mailboxes", {
      method: "POST",
      body: JSON.stringify({
        address: `${local}@${mailboxDomain}`,
        quota_bytes: Number(mailboxQuota),
        password: mailboxPassword,
      }),
    });
    if (!response.ok)
      throw new Error(
        await readApiError(response, "Unable to queue mailbox creation."),
      );
    setMailboxNotice({
      type: "info",
      message: "Mailbox creation queued. Waiting for Stalwart…",
    });
    setLocal("");
    setMailboxPassword("");
    setModal(false);
  };
  const checkMailDomain = async (record) => {
    setMailDomainChecking(record);
    try {
      const response = await apiRequest("/api/v1/email/domains/check", {
        method: "POST",
        body: JSON.stringify({ domain: mailDomainDraft, record }),
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, "Unable to check mail DNS."),
        );
      const checked = await response.json();
      setMailDomainCheck((current) => {
        const checks = { ...(current?.checks || {}), [record]: checked.check };
        const passed = ["host", "mx", "spf", "dmarc"].every(
          (key) => checks[key]?.status === "pass",
        );
        return {
          ...(current || {}),
          domain: checked.domain,
          checks,
          passed,
          message: passed
            ? "Required mail DNS records are present."
            : "Publish the missing required records before creating this mail domain.",
        };
      });
    } catch (error) {
      setMailboxNotice({ type: "error", message: error.message });
    } finally {
      setMailDomainChecking("");
    }
  };
  const prepareMailDomain = async () => {
    const domain = mailDomainDraft.trim().toLowerCase();
    setMailDomainDraft(domain);
    setMailDomainStep(2);
    setMailDomainGuide(null);
    setMailDomainCheck(null);
    setMailDomainToast(null);
    setMailDomainGuideLoading(true);
    try {
      const response = await apiRequest("/api/v1/email/domains/guide", {
        method: "POST",
        body: JSON.stringify({ domain }),
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, "Unable to prepare mail DNS records."),
        );
      setMailDomainGuide(await response.json());
    } catch (error) {
      setMailDomainToast({ type: "error", message: error.message });
    } finally {
      setMailDomainGuideLoading(false);
    }
  };
  const createMailDomain = async () => {
    setMailDomainCreating(true);
    try {
      const response = await apiRequest("/api/v1/email/domains", {
        method: "POST",
        body: JSON.stringify({ domain: mailDomainDraft }),
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, "Unable to create mail domain."),
        );
      const created = await response.json();
      setMailDomains((current) => [
        ...current.filter((item) => item.domain !== created.domain),
        created,
      ]);
      setMailboxDomain(created.domain);
      setMailDomainModal(false);
      setMailDomainStep(1);
      setMailDomainDraft("");
      setMailDomainCheck(null);
      setMailDomainGuide(null);
      setMailboxNotice({
        type: "success",
        message: `${created.domain} is ready. You can now create mailboxes for it.`,
      });
    } catch (error) {
      setMailboxNotice({ type: "error", message: error.message });
    } finally {
      setMailDomainCreating(false);
    }
  };
  const deleteMailbox = async (mailbox) => {
    if (
      !window.confirm(
        `Delete ${mailbox.address}? This also removes the account from Stalwart.`,
      )
    )
      return;
    setDeletingMailboxId(mailbox.id);
    const response = await apiRequest(`/api/v1/email/mailboxes/${mailbox.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setDeletingMailboxId("");
      window.alert(
        await readApiError(response, "Unable to queue mailbox deletion."),
      );
      return;
    }
    setMailboxNotice({
      type: "info",
      message: "Mailbox deletion queued. Waiting for Stalwart…",
    });
  };
  const saveForwarder = async (forwarder) => {
    const editing = forwarderModal?.id;
    const response = await apiRequest(
      editing
        ? `/api/v1/email/forwarders/${editing}`
        : "/api/v1/email/forwarders",
      {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          source: forwarder.source,
          destination: forwarder.destination,
          mode: forwarder.mode,
          status: forwarder.status,
        }),
      },
    );
    if (!response.ok) return;
    setForwarderModal(null);
    await loadEmailServices();
  };
  const deleteForwarder = async (id) => {
    const response = await apiRequest(`/api/v1/email/forwarders/${id}`, {
      method: "DELETE",
    });
    if (response.ok) await loadEmailServices();
  };
  const saveAutoresponder = async (responder) => {
    const editing = autoresponderModal?.id;
    const response = await apiRequest(
      editing
        ? `/api/v1/email/autoresponders/${editing}`
        : "/api/v1/email/autoresponders",
      {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          address: responder.address,
          subject: responder.subject,
          body: responder.body,
          start_at: responder.start_at || null,
          end_at: responder.end_at || null,
          status: responder.status,
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        await readApiError(response, "Unable to save autoresponder."),
      );
    setAutoresponderModal(null);
    await loadEmailServices();
  };
  const deleteAutoresponder = async (id) => {
    const response = await apiRequest(`/api/v1/email/autoresponders/${id}`, {
      method: "DELETE",
    });
    if (response.ok) await loadEmailServices();
  };
  const saveFilter = async (filter) => {
    const editing = filterModal?.id;
    const response = await apiRequest(
      editing ? `/api/v1/email/filters/${editing}` : "/api/v1/email/filters",
      {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          address: filter.address,
          match_type: filter.match_type,
          pattern: filter.pattern,
          action: filter.action,
          action_value: filter.action_value || "",
          status: filter.status,
        }),
      },
    );
    if (!response.ok)
      throw new Error(await readApiError(response, "Unable to save filter."));
    setFilterModal(null);
    await loadEmailServices();
  };
  const deleteFilter = async (id) => {
    const response = await apiRequest(`/api/v1/email/filters/${id}`, {
      method: "DELETE",
    });
    if (response.ok) await loadEmailServices();
  };
  const updatePostfix = (key, value) =>
    setPostfix((current) => ({ ...current, [key]: value }));
  const savePostfix = () => {
    localStorage.setItem("serverengine:postfix", JSON.stringify(postfix));
    setPostfixMessage(
      "Postfix transport settings saved for this panel profile.",
    );
  };
  const updateDovecot = (key, value) =>
    setDovecot((current) => ({ ...current, [key]: value }));
  const saveDovecot = () => {
    localStorage.setItem("serverengine:dovecot", JSON.stringify(dovecot));
    setDovecotMessage("Dovecot mailbox settings saved for this panel profile.");
  };
  const updateRspamd = (key, value) =>
    setRspamd((current) => ({ ...current, [key]: value }));
  const saveRspamd = () => {
    localStorage.setItem("serverengine:rspamd", JSON.stringify(rspamd));
    setRspamdMessage("Rspamd filtering settings saved for this panel profile.");
  };
  const updateStalwart = (key, value) =>
    setStalwart((current) => ({ ...current, [key]: value }));
  const saveStalwart = () => {
    localStorage.setItem("serverengine:stalwart", JSON.stringify(stalwart));
    setStalwartMessage("Stalwart settings saved for this panel profile.");
  };
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-blue-500">Hosting / Email</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-950 dark:text-white">
            Email
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            Provision mailboxes, routing, filters, and delivery safeguards for
            every hosted domain.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setStalwartConfigOpen(true)}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Settings2 size={16} /> Stalwart configuration
          </button>
          <button
            type="button"
            onClick={() => {
              setMailDomainModal(true);
              setMailDomainStep(1);
              setMailDomainDraft("");
              setMailDomainCheck(null);
              setMailDomainGuide(null);
              setMailDomainToast(null);
            }}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Plus size={16} /> Add mail domain
          </button>
          <button
            type="button"
            onClick={() => setModal(true)}
            disabled={!mailDomains.length}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus size={16} /> Create mailbox
          </button>
        </div>
      </header>
      {servicesLoaded &&
        !certbotInstalled &&
        !dismissedAlerts.includes("certbot") && (
          <div className="flex items-start justify-between gap-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-100">
            <div>
              <p className="font-semibold">TLS certificates are not ready</p>
              <p className="mt-1 text-blue-800 dark:text-blue-200">
                Install Certbot to issue certificates for SMTP, IMAP, and the
                mail administration endpoint.
              </p>
              <a
                href="/services#certbot"
                className="mt-2 inline-block cursor-pointer font-semibold text-blue-700 underline dark:text-blue-300"
              >
                Open Certbot in Services
              </a>
            </div>
            <button
              type="button"
              aria-label="Dismiss certificate notice"
              onClick={() => dismissSetupAlert("certbot")}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
            >
              <X size={15} />
            </button>
          </div>
        )}
      {servicesLoaded &&
        !powerdnsInstalled &&
        !dismissedAlerts.includes("powerdns") && (
          <div className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-200">
            <div>
              <p className="font-semibold">DNS automation is not connected</p>
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                PowerDNS is optional, but it can help manage MX, SPF, DKIM,
                DMARC, and mail host records from Server Engine. Without it,
                manage DNS at your domain provider.
              </p>
              <a
                href="/services#powerdns"
                className="mt-2 inline-block cursor-pointer font-semibold text-blue-600 underline dark:text-blue-400"
              >
                View PowerDNS in Services
              </a>
            </div>
            <button
              type="button"
              aria-label="Dismiss DNS notice"
              onClick={() => dismissSetupAlert("powerdns")}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              <X size={15} />
            </button>
          </div>
        )}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            "Mailboxes",
            summary?.mailboxes ?? 0,
            `Across ${summary?.domains ?? 0} domains`,
            Mail,
            "blue",
          ],
          [
            "Storage used",
            formatBytes(summary?.storage_used_bytes ?? 0),
            `Of ${formatBytes(summary?.storage_quota_bytes ?? 0)} allocated`,
            SlidersHorizontal,
            "blue",
          ],
          [
            "Forwarders",
            summary?.forwarders ?? 0,
            "Active routes",
            Forward,
            "green",
          ],
          [
            "Deliverability",
            summary?.deliverability?.label ?? "Not checked",
            summary?.deliverability?.detail ?? "DNS checks pending",
            ShieldCheck,
            summary?.deliverability?.status === "healthy" ? "green" : "blue",
          ],
        ].map(([label, value, detail, Icon, tone]) => (
          <div
            key={label}
            className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {label}
              </span>
              <Icon
                size={17}
                className={
                  tone === "green" ? "text-emerald-500" : "text-blue-500"
                }
              />
            </div>
            <p className="mt-3 text-2xl font-semibold text-neutral-950 dark:text-white">
              {value}
            </p>
            <p className="mt-1 text-xs text-neutral-500">{detail}</p>
          </div>
        ))}
      </section>
      <section className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {mailboxNotice && (
          <div
            className={`border-b px-5 py-3 text-sm ${mailboxNotice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300" : mailboxNotice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300" : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300"}`}
          >
            {mailboxNotice.message}
          </div>
        )}
        <div className="flex flex-wrap border-b border-neutral-200 px-4 dark:border-neutral-800">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`border-b-2 px-4 py-4 text-sm font-medium ${tab === item ? "border-blue-600 text-blue-600" : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white"}`}
            >
              {item}
            </button>
          ))}
        </div>
        {tab === "Postfix transport" && (
          <div className="space-y-6 p-5">
            <div>
              <h2 className="font-semibold text-neutral-950 dark:text-white">
                Postfix SMTP transport
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500">
                Configure outbound and inbound SMTP transport separately from
                mailbox storage. IMAP, POP3, and mailboxes belong to Dovecot or
                the selected mail platform.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Mail hostname
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  value={postfix.hostname}
                  onChange={(event) =>
                    updatePostfix("hostname", event.target.value)
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Primary mail domain
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  value={postfix.domain}
                  onChange={(event) =>
                    updatePostfix("domain", event.target.value)
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                SMTP port
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  type="number"
                  value={postfix.smtpPort}
                  onChange={(event) =>
                    updatePostfix("smtpPort", Number(event.target.value))
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Submission port
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  type="number"
                  value={postfix.submissionPort}
                  onChange={(event) =>
                    updatePostfix("submissionPort", Number(event.target.value))
                  }
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                TLS policy
                <select
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  value={postfix.tls}
                  onChange={(event) => updatePostfix("tls", event.target.value)}
                >
                  <option value="may">Opportunistic TLS</option>
                  <option value="encrypt">Require TLS</option>
                  <option value="none">No TLS</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Relay host
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  value={postfix.relay}
                  onChange={(event) =>
                    updatePostfix("relay", event.target.value)
                  }
                  placeholder="Leave empty for direct delivery"
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Trusted networks
                <textarea
                  className="mt-1.5 min-h-20 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  value={postfix.networks}
                  onChange={(event) =>
                    updatePostfix("networks", event.target.value)
                  }
                  placeholder="One CIDR range per line"
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Queue retention
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  value={postfix.queueRetention}
                  onChange={(event) =>
                    updatePostfix("queueRetention", event.target.value)
                  }
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Maximum queue size
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  type="number"
                  value={postfix.maxQueue}
                  onChange={(event) =>
                    updatePostfix("maxQueue", Number(event.target.value))
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Outbound messages per hour
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  type="number"
                  value={postfix.rate}
                  onChange={(event) =>
                    updatePostfix("rate", Number(event.target.value))
                  }
                />
              </label>
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-blue-600"
                checked={postfix.rejectUnknown}
                onChange={(event) =>
                  updatePostfix("rejectUnknown", event.target.checked)
                }
              />
              <span>
                <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Reject unknown recipient domains
                </span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500">
                  Reduce backscatter and invalid delivery attempts for hosted
                  domains.
                </span>
              </span>
            </label>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-neutral-500">
                {postfixMessage ||
                  "Postfix configuration will be validated before the transport is reloaded."}
              </p>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={savePostfix}
              >
                Save Postfix settings
              </button>
            </div>
          </div>
        )}
        {tab === "Dovecot mailbox access" && (
          <div className="space-y-6 p-5">
            <div>
              <h2 className="font-semibold text-neutral-950 dark:text-white">
                Dovecot mailbox access
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500">
                Configure IMAP and POP3 access, mailbox storage, authentication,
                quotas, TLS, and Sieve filtering. SMTP delivery remains managed
                by Postfix.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Mail hostname
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  value={dovecot.hostname}
                  onChange={(event) =>
                    updateDovecot("hostname", event.target.value)
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Mailbox location
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  value={dovecot.mailbox}
                  onChange={(event) =>
                    updateDovecot("mailbox", event.target.value)
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Authentication mechanisms
                <select
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  value={dovecot.auth}
                  onChange={(event) =>
                    updateDovecot("auth", event.target.value)
                  }
                >
                  <option value="plain-login">PLAIN and LOGIN</option>
                  <option value="plain">PLAIN only</option>
                  <option value="oauthbearer">OAuth2 / OAUTHBEARER</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                TLS policy
                <select
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  value={dovecot.tls}
                  onChange={(event) => updateDovecot("tls", event.target.value)}
                >
                  <option value="required">Required</option>
                  <option value="may">Optional</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={dovecot.imap}
                  onChange={(event) =>
                    updateDovecot("imap", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Enable IMAP
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-neutral-500">
                    Standard ports {dovecot.imapPort} and {dovecot.imapsPort}{" "}
                    for secure IMAPS.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={dovecot.pop3}
                  onChange={(event) =>
                    updateDovecot("pop3", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Enable POP3
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-neutral-500">
                    Standard ports {dovecot.pop3Port} and {dovecot.pop3sPort}{" "}
                    for secure POP3S.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={dovecot.sieve}
                  onChange={(event) =>
                    updateDovecot("sieve", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Enable Sieve filtering
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-neutral-500">
                    Allow users to manage server-side delivery rules.
                  </span>
                </span>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Maximum connections
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  type="number"
                  min="1"
                  value={dovecot.maxConnections}
                  onChange={(event) =>
                    updateDovecot("maxConnections", Number(event.target.value))
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Default mailbox quota
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  value={dovecot.quota}
                  onChange={(event) =>
                    updateDovecot("quota", event.target.value)
                  }
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-neutral-500">
                {dovecotMessage ||
                  "Dovecot configuration will be validated before the mailbox service is reloaded."}
              </p>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={saveDovecot}
              >
                Save Dovecot settings
              </button>
            </div>
          </div>
        )}
        {tab === "Rspamd filtering" && (
          <div className="space-y-6 p-5">
            <div>
              <h2 className="font-semibold text-neutral-950 dark:text-white">
                Rspamd mail filtering
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500">
                Score incoming messages, verify sender authentication, sign
                outgoing mail, and apply safe actions before messages reach the
                mailbox.
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-blue-600"
                checked={rspamd.enabled}
                onChange={(event) =>
                  updateRspamd("enabled", event.target.checked)
                }
              />
              <span>
                <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Enable Rspamd filtering
                </span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500">
                  Connect the filter to Postfix before enabling enforcement.
                </span>
              </span>
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Reject score
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  type="number"
                  min="1"
                  value={rspamd.rejectScore}
                  onChange={(event) =>
                    updateRspamd("rejectScore", Number(event.target.value))
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Add spam header at score
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  type="number"
                  min="0"
                  value={rspamd.addHeaderScore}
                  onChange={(event) =>
                    updateRspamd("addHeaderScore", Number(event.target.value))
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Maximum message size (MB)
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  type="number"
                  min="1"
                  value={rspamd.maxMessage}
                  onChange={(event) =>
                    updateRspamd("maxMessage", Number(event.target.value))
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Score action
                <select
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  value={rspamd.action}
                  onChange={(event) =>
                    updateRspamd("action", event.target.value)
                  }
                >
                  <option value="add-header">Add spam header</option>
                  <option value="quarantine">Quarantine</option>
                  <option value="reject">Reject</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={rspamd.greylisting}
                  onChange={(event) =>
                    updateRspamd("greylisting", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Greylisting
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500">
                    Temporarily defer unfamiliar senders to reduce automated
                    abuse.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={rspamd.bayes}
                  onChange={(event) =>
                    updateRspamd("bayes", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Bayesian learning
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500">
                    Learn from safe and spam feedback when training data is
                    available.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={rspamd.spf}
                  onChange={(event) =>
                    updateRspamd("spf", event.target.checked)
                  }
                />
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  SPF checks
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={rspamd.dkim}
                  onChange={(event) =>
                    updateRspamd("dkim", event.target.checked)
                  }
                />
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  DKIM signing and verification
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={rspamd.dmarc}
                  onChange={(event) =>
                    updateRspamd("dmarc", event.target.checked)
                  }
                />
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  DMARC policy checks
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={rspamd.antivirus}
                  onChange={(event) =>
                    updateRspamd("antivirus", event.target.checked)
                  }
                />
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Antivirus integration
                </span>
              </label>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-neutral-500">
                {rspamdMessage ||
                  "Rspamd will report scores, symbols, and actions after the mail transport integration is connected."}
              </p>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={saveRspamd}
              >
                Save Rspamd settings
              </button>
            </div>
          </div>
        )}
        {tab === "Stalwart Mail Server" && (
          <div className="space-y-6 p-5">
            <div>
              <h2 className="font-semibold text-neutral-950 dark:text-white">
                Stalwart Mail Server
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500">
                Configure the combined mail platform: SMTP delivery, IMAP and
                JMAP access, domains, identities, storage, web administration,
                authentication, spam filtering, and DKIM.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Mail hostname
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  value={stalwart.hostname}
                  onChange={(event) =>
                    updateStalwart("hostname", event.target.value)
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Mail storage root
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  value={stalwart.storage}
                  onChange={(event) =>
                    updateStalwart("storage", event.target.value)
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Submission port
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  type="number"
                  value={stalwart.submissionPort}
                  onChange={(event) =>
                    updateStalwart("submissionPort", Number(event.target.value))
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                JMAP HTTPS port
                <input
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                  type="number"
                  value={stalwart.jmapPort}
                  onChange={(event) =>
                    updateStalwart("jmapPort", Number(event.target.value))
                  }
                />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Authentication
                <select
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  value={stalwart.auth}
                  onChange={(event) =>
                    updateStalwart("auth", event.target.value)
                  }
                >
                  <option value="password">Password</option>
                  <option value="oidc">OpenID Connect</option>
                  <option value="ldap">LDAP</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                TLS policy
                <select
                  className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  value={stalwart.tls}
                  onChange={(event) =>
                    updateStalwart("tls", event.target.value)
                  }
                >
                  <option value="required">Required</option>
                  <option value="may">Optional</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={stalwart.smtp}
                  onChange={(event) =>
                    updateStalwart("smtp", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    SMTP service
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500">
                    Inbound and outbound mail transport.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={stalwart.imap}
                  onChange={(event) =>
                    updateStalwart("imap", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    IMAP access
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={stalwart.jmap}
                  onChange={(event) =>
                    updateStalwart("jmap", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    JMAP API
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500">
                    Modern mail and synchronization API.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={stalwart.webAdmin}
                  onChange={(event) =>
                    updateStalwart("webAdmin", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Web administration
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={stalwart.spam}
                  onChange={(event) =>
                    updateStalwart("spam", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Spam filtering
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-600"
                  checked={stalwart.dkim}
                  onChange={(event) =>
                    updateStalwart("dkim", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    DKIM signing
                  </span>
                </span>
              </label>
            </div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Default mailbox quota
              <input
                className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100"
                value={stalwart.maxMailbox}
                onChange={(event) =>
                  updateStalwart("maxMailbox", event.target.value)
                }
              />
            </label>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-neutral-500">
                {stalwartMessage ||
                  "Stalwart configuration will be validated before the mail platform is started."}
              </p>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={saveStalwart}
              >
                Save Stalwart settings
              </button>
            </div>
          </div>
        )}
        {tab === "Mailboxes" && (
          <>
            <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
              <div>
                <h2 className="font-semibold text-neutral-950 dark:text-white">
                  Mailbox inventory
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Quotas, activity, and access controls for hosted accounts.
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
                <Search size={15} className="text-neutral-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search mailboxes"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400 sm:w-56"
                />
              </label>
            </div>
            {!mailboxDataLoaded ? (
              <MailboxTableSkeleton />
            ) : mailboxes.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <Mail
                  className="mx-auto text-neutral-300 dark:text-neutral-600"
                  size={30}
                />
                <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  No mailboxes yet
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
                  Create a mailbox after adding a mail domain to start receiving
                  and sending mail.
                </p>
                <button
                  type="button"
                  onClick={() => setModal(true)}
                  className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Plus size={15} />
                  Create mailbox
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-950/40">
                    <tr>
                      <th className="px-5 py-3">Mailbox</th>
                      <th className="px-5 py-3">Quota usage</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Last activity</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {filtered.map((item) => (
                      <tr key={item.id}>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-neutral-950 dark:text-white">
                            {item.address}
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                            <LockKeyhole size={12} /> Password protected
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-between text-xs text-neutral-500">
                            <span>{formatBytes(item.used_bytes)}</span>
                            <span>{formatBytes(item.quota_bytes)}</span>
                          </div>
                          <div className="mt-2 h-1.5 w-44 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                            <span
                              className={`block h-full rounded-full ${item.status === "Paused" ? "w-0" : "bg-blue-500"}`}
                              style={{
                                width: `${item.quota_bytes ? Math.min(100, (item.used_bytes / item.quota_bytes) * 100) : 0}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            tone={item.status === "Paused" ? "amber" : "green"}
                          >
                            {item.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-neutral-500">
                          {item.last_activity
                            ? new Date(item.last_activity).toLocaleString()
                            : "Never"}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            title="Delete mailbox"
                            aria-label={`Delete ${item.address}`}
                            disabled={deletingMailboxId === item.id}
                            onClick={() => deleteMailbox(item)}
                            className="rounded-md p-2 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                          >
                            <Trash2
                              size={17}
                              className={
                                deletingMailboxId === item.id
                                  ? "animate-pulse"
                                  : ""
                              }
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {tab === "Forwarders" && (
          <ForwardersPanel
            forwarders={forwarders}
            loaded={forwarderDataLoaded}
            onCreate={() => setForwarderModal({})}
            onEdit={setForwarderModal}
            onDelete={deleteForwarder}
          />
        )}
        {tab === "Autoresponders" && (
          <AutorespondersPanel
            responders={autoresponders}
            loaded={autoresponderDataLoaded}
            onCreate={() => setAutoresponderModal({})}
            onEdit={setAutoresponderModal}
            onDelete={deleteAutoresponder}
          />
        )}
        {tab === "Filters" && (
          <FiltersPanel
            filters={filters}
            loaded={filterDataLoaded}
            onCreate={() => setFilterModal({})}
            onEdit={setFilterModal}
            onDelete={deleteFilter}
          />
        )}
        {tab === "Deliverability" && (
          <DeliverabilityPanel
            data={deliverability}
            loaded={deliverabilityLoaded}
            loading={deliverabilityLoading}
            onRefresh={() => loadDeliverability(true)}
          />
        )}
        {![
          "Mailboxes",
          "Forwarders",
          "Autoresponders",
          "Filters",
          "Deliverability",
          "Postfix transport",
          "Dovecot mailbox access",
          "Rspamd filtering",
          "Stalwart Mail Server",
        ].includes(tab) && (
          <div className="space-y-5 p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 className="font-semibold text-neutral-950 dark:text-white">
                  {tab} configuration
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Manage {tab.toLowerCase()} behavior for hosted domains.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus size={15} />
                Create {tab === "Autoresponders" ? "autoresponder" : "rule"}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {["Domain scope", "Current status", "Last updated"].map(
                (label, index) => (
                  <div
                    key={label}
                    className="rounded-md bg-neutral-50 p-4 dark:bg-neutral-950/60"
                  >
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                      {index === 0
                        ? "example.com"
                        : index === 1
                          ? "Ready"
                          : "Just now"}
                    </p>
                  </div>
                ),
              )}
            </div>
            <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="flex items-start gap-3">
                <ShieldCheck size={18} className="mt-0.5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    {tab === "Deliverability"
                      ? "Mail authentication is healthy"
                      : `${tab} are ready to configure`}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Use the action above to add a new configuration, then manage
                    existing entries here.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
      {stalwartConfigOpen && stalwartService && (
        <StalwartConfigModal
          service={stalwartService}
          installed={installedServices.filter(
            (service) => service.id === "stalwart",
          )}
          onClose={() => setStalwartConfigOpen(false)}
        />
      )}
      {mailDomainModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/50 p-4">
          <div className="w-full max-w-5xl rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">
                  Add mail domain
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Verify DNS before activating a domain for mailbox creation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMailDomainModal(false)}
                className="text-neutral-400"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-6 space-y-4">
              {mailDomainStep === 1 ? (
                <div className="space-y-4">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Enter the domain you want to use for mail. DNS setup comes
                    next.
                  </p>
                  <label className="block text-sm font-medium">
                    Domain name
                    <input
                      autoFocus
                      value={mailDomainDraft}
                      onChange={(event) => {
                        setMailDomainDraft(event.target.value);
                        setMailDomainCheck(null);
                      }}
                      placeholder="example.com"
                      autoComplete="off"
                      spellCheck="false"
                      className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                  {mailDomainDraft &&
                    !mailDomainPattern.test(mailDomainDraft.trim()) && (
                      <p className="text-sm text-rose-600 dark:text-rose-400">
                        Enter a valid domain such as example.com. Use letters,
                        numbers, dots, and hyphens only.
                      </p>
                    )}
                </div>
              ) : (
                <>
                  {mailDomainGuideLoading && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200">
                      Starting Stalwart domain setup and generating the complete
                      DNS records…
                    </div>
                  )}
                  {mailDomainGuide && (
                    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
                      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/50">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            DNS records for {mailDomainDraft}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Add these records at the authoritative DNS provider,
                            then check them.
                          </p>
                        </div>
                      </div>
                      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                        {mailDomainGuide.records.map((record) => {
                          const check = mailDomainCheck?.checks?.[record.key];
                          const status = check?.status || "not_checked";
                          return (
                            <div
                              key={record.key}
                              className="grid gap-3 px-4 py-3 sm:grid-cols-[64px_minmax(220px,1fr)_minmax(260px,1.4fr)_auto] sm:items-center"
                            >
                              <span className="text-xs font-semibold text-neutral-500">
                                {record.type}
                              </span>
                              <div>
                                <p className="font-mono text-sm text-neutral-900 dark:text-neutral-100">
                                  {record.name === "@"
                                    ? mailDomainDraft
                                    : record.name}
                                </p>
                                <p className="mt-1 text-xs text-neutral-500">
                                  {record.key === "host"
                                    ? "Resolves the mail hostname to this server."
                                    : record.key === "mx"
                                      ? "Routes incoming mail to Stalwart."
                                      : record.key === "spf"
                                        ? "Authorizes this server IP to send mail."
                                        : record.key === "dkim"
                                          ? "Public signing key generated by Stalwart."
                                          : "Defines the domain anti-spoofing policy."}
                                </p>
                              </div>
                              <p className="break-all text-sm text-neutral-600 dark:text-neutral-400">
                                {record.value}
                              </p>
                              {status === "pass" ? (
                                <span className="text-xs font-semibold text-emerald-600">
                                  Pass
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => checkMailDomain(record.key)}
                                  disabled={Boolean(mailDomainChecking)}
                                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold disabled:cursor-wait disabled:opacity-50 ${status === "not_checked" ? "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200" : "border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300"}`}
                                >
                                  {mailDomainChecking === record.key
                                    ? "Checking…"
                                    : "Check"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {mailDomainCheck && (
                        <p
                          className={`border-t px-4 py-3 text-xs ${mailDomainCheck.passed ? "border-emerald-200 text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-300" : "border-rose-200 text-rose-700 dark:border-rose-900/50 dark:text-rose-300"}`}
                        >
                          {mailDomainCheck.message}
                        </p>
                      )}
                    </div>
                  )}
                  {!mailDomainGuideLoading && !mailDomainGuide && (
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950/50 dark:text-neutral-300">
                      No DNS records are available yet. Try again after the
                      Stalwart management API is reachable.
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setMailDomainModal(false);
                  setMailDomainStep(1);
                  setMailDomainToast(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              {mailDomainStep === 1 ? (
                <button
                  type="button"
                  onClick={prepareMailDomain}
                  disabled={
                    !mailDomainPattern.test(mailDomainDraft.trim()) ||
                    mailDomainGuideLoading
                  }
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMailDomainStep(1);
                      setMailDomainCheck(null);
                      setMailDomainToast(null);
                    }}
                    className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={createMailDomain}
                    disabled={!mailDomainCheck?.passed || mailDomainCreating}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {mailDomainCreating ? "Creating…" : "Create mail domain"}
                  </button>
                </>
              )}
            </div>
          </div>
          <Toast
            message={mailDomainToast?.message}
            type={mailDomainToast?.type}
            onClose={() => setMailDomainToast(null)}
          />
        </div>
      )}
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">
                  Create mailbox
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Add a professional address on example.com.
                </p>
              </div>
              <button
                onClick={() => setModal(false)}
                className="text-neutral-400"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium">
                Mail domain
                <select
                  value={mailboxDomain}
                  onChange={(event) => setMailboxDomain(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900"
                >
                  {mailDomains.map((domain) => (
                    <option key={domain.domain} value={domain.domain}>
                      {domain.domain}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500">
                  Only verified mail domains are available here.
                </span>
              </label>
              <label className="block text-sm font-medium">
                Mailbox name
                <div className="mt-2 flex items-center rounded-lg border border-neutral-300 dark:border-neutral-700">
                  <input
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    placeholder="name"
                    className="min-w-0 flex-1 bg-transparent px-3 py-2.5 outline-none"
                  />
                  <span className="border-l border-neutral-200 px-3 text-sm text-neutral-500 dark:border-neutral-700">
                    @{mailboxDomain || "your-domain.com"}
                  </span>
                </div>
              </label>
              <label className="block text-sm font-medium">
                Mailbox quota
                <select
                  value={mailboxQuota}
                  onChange={(event) => setMailboxQuota(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value="1073741824">1 GB</option>
                  <option value="5368709120">5 GB</option>
                  <option value="10737418240">10 GB</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Password
                <SecurePasswordInput
                  value={mailboxPassword}
                  onChange={(event) => setMailboxPassword(event.target.value)}
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="mt-2 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 outline-none dark:border-neutral-700"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={
                  !mailDomains.length ||
                  !mailboxDomain ||
                  !local.trim() ||
                  mailboxPassword.length < 8
                }
                className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create mailbox
              </button>
            </div>
          </div>
        </div>
      )}
      {forwarderModal && (
        <ForwarderModal
          forwarder={forwarderModal.id ? forwarderModal : null}
          onClose={() => setForwarderModal(null)}
          onSave={saveForwarder}
        />
      )}
      {autoresponderModal && (
        <AutoresponderModal
          responder={autoresponderModal.id ? autoresponderModal : null}
          mailboxes={mailboxes}
          onClose={() => setAutoresponderModal(null)}
          onSave={saveAutoresponder}
        />
      )}
      {filterModal && (
        <FilterModal
          filter={filterModal.id ? filterModal : null}
          mailboxes={mailboxes}
          onClose={() => setFilterModal(null)}
          onSave={saveFilter}
        />
      )}
    </div>
  );
}
