import React from "react";
import {
  Check,
  ChevronRight,
  Forward,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
const tabs = [
  "Mailboxes",
  "Forwarders",
  "Autoresponders",
  "Filters",
  "Deliverability",
  "Postfix transport",
  "Dovecot mailbox access",
  "Rspamd filtering",
  "Stalwart Mail Server",
];
const initialMailboxes = [
  {
    address: "admin@example.com",
    quota: "2 GB",
    used: "420 MB",
    status: "Active",
    activity: "Today",
  },
  {
    address: "support@example.com",
    quota: "5 GB",
    used: "1.8 GB",
    status: "Active",
    activity: "Yesterday",
  },
  {
    address: "billing@example.com",
    quota: "1 GB",
    used: "960 MB",
    status: "Near quota",
    activity: "Sep 24",
  },
];
const initialForwarders = [
  { id: 1, source: "sales@example.com", destination: "sales-team@example.com", mode: "Deliver", status: "Active" },
  { id: 2, source: "support@example.com", destination: "helpdesk@example.net", mode: "Deliver", status: "Active" },
  { id: 3, source: "all@example.com", destination: "archive@example.com", mode: "Copy", status: "Active" },
];
function Badge({ children, tone = "green" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tone === "amber" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : tone === "blue" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"}`}
    >
      {children}
    </span>
  );
}

function ForwarderModal({ forwarder, onClose, onSave }) {
  const editing = Boolean(forwarder);
  const [form, setForm] = React.useState(forwarder || { source: "", destination: "", mode: "Deliver", status: "Active" });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <form className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, id: forwarder?.id || Date.now() }); }}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Mail routing</p><h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{editing ? "Edit forwarder" : "Create forwarder"}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Route messages from one address to another destination.</p></div>
          <button type="button" aria-label="Close forwarder form" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Source address<input required className="mt-2 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:text-slate-100" value={form.source} onChange={(event) => set("source", event.target.value)} placeholder="sales@example.com" /></label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Destination address<input required type="email" className="mt-2 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:text-slate-100" value={form.destination} onChange={(event) => set("destination", event.target.value)} placeholder="team@example.net" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Routing behavior<select className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" value={form.mode} onChange={(event) => set("mode", event.target.value)}><option>Deliver</option><option>Copy</option><option>Reject</option></select></label><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Status<select className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" value={form.status} onChange={(event) => set("status", event.target.value)}><option>Active</option><option>Paused</option></select></label></div>
        </div>
        <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"><button type="button" className="cursor-pointer rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800" onClick={onClose}>Cancel</button><button type="submit" className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{editing ? "Save forwarder" : "Create forwarder"}</button></div>
      </form>
    </div>
  );
}

function ForwardersPanel({ forwarders, onCreate, onEdit, onDelete }) {
  return <>
    <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"><div><h2 className="font-semibold text-slate-950 dark:text-white">Forwarding rules</h2><p className="mt-1 text-sm text-slate-500">Route, copy, or pause mail delivery for hosted addresses.</p></div><button type="button" onClick={onCreate} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Plus size={15} />Create forwarder</button></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40"><tr><th className="px-5 py-3">Source</th><th className="px-5 py-3">Destination</th><th className="px-5 py-3">Behavior</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{forwarders.map((item) => <tr key={item.id}><td className="px-5 py-4 font-medium text-slate-900 dark:text-slate-100">{item.source}</td><td className="px-5 py-4 text-slate-600 dark:text-slate-400">{item.destination}</td><td className="px-5 py-4 text-slate-600 dark:text-slate-400">{item.mode}</td><td className="px-5 py-4"><Badge tone={item.status === "Active" ? "green" : "amber"}>{item.status}</Badge></td><td className="px-5 py-4 text-right"><div className="flex justify-end gap-3"><button type="button" className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400" onClick={() => onEdit(item)}>Configure</button><button type="button" className="cursor-pointer text-sm text-rose-600 dark:text-rose-400" onClick={() => onDelete(item.id)}>Delete</button></div></td></tr>)}</tbody></table></div>
  </>;
}
export default function EmailPage() {
  const [tab, setTab] = React.useState(() => window.location.hash === "#postfix" ? "Postfix transport" : window.location.hash === "#dovecot" ? "Dovecot mailbox access" : window.location.hash === "#rspamd" ? "Rspamd filtering" : window.location.hash === "#stalwart" ? "Stalwart Mail Server" : "Mailboxes");
  const [mailboxes, setMailboxes] = React.useState(initialMailboxes);
  const [forwarders, setForwarders] = React.useState(initialForwarders);
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(false);
  const [forwarderModal, setForwarderModal] = React.useState(null);
  const [local, setLocal] = React.useState("");
  const [postfix, setPostfix] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("serverengine:postfix") || "null") || { hostname: "mail.example.com", domain: "example.com", smtpPort: 25, submissionPort: 587, tls: "may", relay: "", networks: "127.0.0.0/8", maxQueue: 1000, rate: 100, queueRetention: "5d", rejectUnknown: true };
    } catch {
      return { hostname: "mail.example.com", domain: "example.com", smtpPort: 25, submissionPort: 587, tls: "may", relay: "", networks: "127.0.0.0/8", maxQueue: 1000, rate: 100, queueRetention: "5d", rejectUnknown: true };
    }
  });
  const [postfixMessage, setPostfixMessage] = React.useState("");
  const [dovecot, setDovecot] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("serverengine:dovecot") || "null") || { hostname: "mail.example.com", imap: true, pop3: false, imapPort: 143, imapsPort: 993, pop3Port: 110, pop3sPort: 995, mailbox: "maildir:~/Maildir", auth: "plain-login", tls: "required", maxConnections: 200, quota: "2 GB", sieve: true };
    } catch {
      return { hostname: "mail.example.com", imap: true, pop3: false, imapPort: 143, imapsPort: 993, pop3Port: 110, pop3sPort: 995, mailbox: "maildir:~/Maildir", auth: "plain-login", tls: "required", maxConnections: 200, quota: "2 GB", sieve: true };
    }
  });
  const [dovecotMessage, setDovecotMessage] = React.useState("");
  const [rspamd, setRspamd] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("serverengine:rspamd") || "null") || { enabled: true, rejectScore: 15, addHeaderScore: 6, greylisting: true, dkim: true, spf: true, dmarc: true, antivirus: false, bayes: true, maxMessage: 25, action: "add-header" };
    } catch {
      return { enabled: true, rejectScore: 15, addHeaderScore: 6, greylisting: true, dkim: true, spf: true, dmarc: true, antivirus: false, bayes: true, maxMessage: 25, action: "add-header" };
    }
  });
  const [rspamdMessage, setRspamdMessage] = React.useState("");
  const [stalwart, setStalwart] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("serverengine:stalwart") || "null") || { hostname: "mail.example.com", smtp: true, imap: true, jmap: true, webAdmin: true, submissionPort: 587, jmapPort: 443, storage: "/server-engine/mail", auth: "password", tls: "required", spam: true, dkim: true, maxMailbox: "5 GB" };
    } catch {
      return { hostname: "mail.example.com", smtp: true, imap: true, jmap: true, webAdmin: true, submissionPort: 587, jmapPort: 443, storage: "/server-engine/mail", auth: "password", tls: "required", spam: true, dkim: true, maxMailbox: "5 GB" };
    }
  });
  const [stalwartMessage, setStalwartMessage] = React.useState("");
  const filtered = mailboxes.filter((x) =>
    x.address.includes(query.toLowerCase()),
  );
  const create = () => {
    if (!local.trim()) return;
    setMailboxes((items) => [
      ...items,
      {
        address: `${local}@example.com`,
        quota: "1 GB",
        used: "0 MB",
        status: "Active",
        activity: "Never",
      },
    ]);
    setLocal("");
    setModal(false);
  };
  const saveForwarder = (forwarder) => {
    setForwarders((items) => items.some((item) => item.id === forwarder.id)
      ? items.map((item) => item.id === forwarder.id ? forwarder : item)
      : [...items, forwarder]);
    setForwarderModal(null);
  };
  const updatePostfix = (key, value) => setPostfix((current) => ({ ...current, [key]: value }));
  const savePostfix = () => {
    localStorage.setItem("serverengine:postfix", JSON.stringify(postfix));
    setPostfixMessage("Postfix transport settings saved for this panel profile.");
  };
  const updateDovecot = (key, value) => setDovecot((current) => ({ ...current, [key]: value }));
  const saveDovecot = () => {
    localStorage.setItem("serverengine:dovecot", JSON.stringify(dovecot));
    setDovecotMessage("Dovecot mailbox settings saved for this panel profile.");
  };
  const updateRspamd = (key, value) => setRspamd((current) => ({ ...current, [key]: value }));
  const saveRspamd = () => {
    localStorage.setItem("serverengine:rspamd", JSON.stringify(rspamd));
    setRspamdMessage("Rspamd filtering settings saved for this panel profile.");
  };
  const updateStalwart = (key, value) => setStalwart((current) => ({ ...current, [key]: value }));
  const saveStalwart = () => {
    localStorage.setItem("serverengine:stalwart", JSON.stringify(stalwart));
    setStalwartMessage("Stalwart Mail Server settings saved for this panel profile.");
  };
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-blue-500">Hosting / Email</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Email
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Provision mailboxes, routing, filters, and delivery safeguards for
            every hosted domain.
          </p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus size={16} /> Create mailbox
        </button>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Mailboxes", mailboxes.length, "Across 1 domain", Mail, "blue"],
          [
            "Storage used",
            "2.9 GB",
            "Of 8 GB allocated",
            SlidersHorizontal,
            "blue",
          ],
          ["Forwarders", "4", "Active routes", Forward, "green"],
          [
            "Deliverability",
            "98%",
            "SPF and DKIM healthy",
            ShieldCheck,
            "green",
          ],
        ].map(([label, value, detail, Icon, tone]) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {label}
              </span>
              <Icon
                size={17}
                className={
                  tone === "green" ? "text-emerald-500" : "text-blue-500"
                }
              />
            </div>
            <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">
              {value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
          </div>
        ))}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap border-b border-slate-200 px-4 dark:border-slate-800">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`border-b-2 px-4 py-4 text-sm font-medium ${tab === item ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}
            >
              {item}
            </button>
          ))}
        </div>
        {tab === "Postfix transport" && (
          <div className="space-y-6 p-5">
            <div><h2 className="font-semibold text-slate-950 dark:text-white">Postfix SMTP transport</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Configure outbound and inbound SMTP transport separately from mailbox storage. IMAP, POP3, and mailboxes belong to Dovecot or the selected mail platform.</p></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Mail hostname<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" value={postfix.hostname} onChange={(event) => updatePostfix("hostname", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Primary mail domain<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" value={postfix.domain} onChange={(event) => updatePostfix("domain", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">SMTP port<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" type="number" value={postfix.smtpPort} onChange={(event) => updatePostfix("smtpPort", Number(event.target.value))} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Submission port<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" type="number" value={postfix.submissionPort} onChange={(event) => updatePostfix("submissionPort", Number(event.target.value))} /></label></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">TLS policy<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" value={postfix.tls} onChange={(event) => updatePostfix("tls", event.target.value)}><option value="may">Opportunistic TLS</option><option value="encrypt">Require TLS</option><option value="none">No TLS</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Relay host<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" value={postfix.relay} onChange={(event) => updatePostfix("relay", event.target.value)} placeholder="Leave empty for direct delivery" /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Trusted networks<textarea className="mt-1.5 min-h-20 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" value={postfix.networks} onChange={(event) => updatePostfix("networks", event.target.value)} placeholder="One CIDR range per line" /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Queue retention<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" value={postfix.queueRetention} onChange={(event) => updatePostfix("queueRetention", event.target.value)} /></label></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Maximum queue size<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" type="number" value={postfix.maxQueue} onChange={(event) => updatePostfix("maxQueue", Number(event.target.value))} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Outbound messages per hour<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" type="number" value={postfix.rate} onChange={(event) => updatePostfix("rate", Number(event.target.value))} /></label></div>
            <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={postfix.rejectUnknown} onChange={(event) => updatePostfix("rejectUnknown", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Reject unknown recipient domains</span><span className="mt-1 block text-xs leading-5 text-slate-500">Reduce backscatter and invalid delivery attempts for hosted domains.</span></span></label>
            <div className="flex items-center justify-between gap-4"><p className="text-sm text-slate-500">{postfixMessage || "Postfix configuration will be validated before the transport is reloaded."}</p><button type="button" className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={savePostfix}>Save Postfix settings</button></div>
          </div>
        )}
        {tab === "Dovecot mailbox access" && (
          <div className="space-y-6 p-5">
            <div><h2 className="font-semibold text-slate-950 dark:text-white">Dovecot mailbox access</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Configure IMAP and POP3 access, mailbox storage, authentication, quotas, TLS, and Sieve filtering. SMTP delivery remains managed by Postfix.</p></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Mail hostname<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" value={dovecot.hostname} onChange={(event) => updateDovecot("hostname", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Mailbox location<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" value={dovecot.mailbox} onChange={(event) => updateDovecot("mailbox", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Authentication mechanisms<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" value={dovecot.auth} onChange={(event) => updateDovecot("auth", event.target.value)}><option value="plain-login">PLAIN and LOGIN</option><option value="plain">PLAIN only</option><option value="oauthbearer">OAuth2 / OAUTHBEARER</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">TLS policy<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" value={dovecot.tls} onChange={(event) => updateDovecot("tls", event.target.value)}><option value="required">Required</option><option value="may">Optional</option><option value="disabled">Disabled</option></select></label></div>
            <div className="space-y-3"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={dovecot.imap} onChange={(event) => updateDovecot("imap", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Enable IMAP</span><span className="mt-1 block text-xs leading-5 text-slate-500">Standard ports {dovecot.imapPort} and {dovecot.imapsPort} for secure IMAPS.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={dovecot.pop3} onChange={(event) => updateDovecot("pop3", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Enable POP3</span><span className="mt-1 block text-xs leading-5 text-slate-500">Standard ports {dovecot.pop3Port} and {dovecot.pop3sPort} for secure POP3S.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={dovecot.sieve} onChange={(event) => updateDovecot("sieve", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Enable Sieve filtering</span><span className="mt-1 block text-xs leading-5 text-slate-500">Allow users to manage server-side delivery rules.</span></span></label></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Maximum connections<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" type="number" min="1" value={dovecot.maxConnections} onChange={(event) => updateDovecot("maxConnections", Number(event.target.value))} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Default mailbox quota<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" value={dovecot.quota} onChange={(event) => updateDovecot("quota", event.target.value)} /></label></div>
            <div className="flex items-center justify-between gap-4"><p className="text-sm text-slate-500">{dovecotMessage || "Dovecot configuration will be validated before the mailbox service is reloaded."}</p><button type="button" className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={saveDovecot}>Save Dovecot settings</button></div>
          </div>
        )}
        {tab === "Rspamd filtering" && (
          <div className="space-y-6 p-5">
            <div><h2 className="font-semibold text-slate-950 dark:text-white">Rspamd mail filtering</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Score incoming messages, verify sender authentication, sign outgoing mail, and apply safe actions before messages reach the mailbox.</p></div>
            <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={rspamd.enabled} onChange={(event) => updateRspamd("enabled", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Enable Rspamd filtering</span><span className="mt-1 block text-xs leading-5 text-slate-500">Connect the filter to Postfix before enabling enforcement.</span></span></label>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Reject score<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" type="number" min="1" value={rspamd.rejectScore} onChange={(event) => updateRspamd("rejectScore", Number(event.target.value))} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Add spam header at score<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" type="number" min="0" value={rspamd.addHeaderScore} onChange={(event) => updateRspamd("addHeaderScore", Number(event.target.value))} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Maximum message size (MB)<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" type="number" min="1" value={rspamd.maxMessage} onChange={(event) => updateRspamd("maxMessage", Number(event.target.value))} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Score action<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" value={rspamd.action} onChange={(event) => updateRspamd("action", event.target.value)}><option value="add-header">Add spam header</option><option value="quarantine">Quarantine</option><option value="reject">Reject</option></select></label></div>
            <div className="grid gap-3 md:grid-cols-2"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={rspamd.greylisting} onChange={(event) => updateRspamd("greylisting", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Greylisting</span><span className="mt-1 block text-xs text-slate-500">Temporarily defer unfamiliar senders to reduce automated abuse.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={rspamd.bayes} onChange={(event) => updateRspamd("bayes", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Bayesian learning</span><span className="mt-1 block text-xs text-slate-500">Learn from safe and spam feedback when training data is available.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={rspamd.spf} onChange={(event) => updateRspamd("spf", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">SPF checks</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={rspamd.dkim} onChange={(event) => updateRspamd("dkim", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">DKIM signing and verification</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={rspamd.dmarc} onChange={(event) => updateRspamd("dmarc", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">DMARC policy checks</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={rspamd.antivirus} onChange={(event) => updateRspamd("antivirus", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">Antivirus integration</span></label></div>
            <div className="flex items-center justify-between gap-4"><p className="text-sm text-slate-500">{rspamdMessage || "Rspamd will report scores, symbols, and actions after the mail transport integration is connected."}</p><button type="button" className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={saveRspamd}>Save Rspamd settings</button></div>
          </div>
        )}
        {tab === "Stalwart Mail Server" && (
          <div className="space-y-6 p-5">
            <div><h2 className="font-semibold text-slate-950 dark:text-white">Stalwart Mail Server</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Configure the combined mail platform: SMTP delivery, IMAP and JMAP access, domains, identities, storage, web administration, authentication, spam filtering, and DKIM.</p></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Mail hostname<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" value={stalwart.hostname} onChange={(event) => updateStalwart("hostname", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Mail storage root<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" value={stalwart.storage} onChange={(event) => updateStalwart("storage", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Submission port<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" type="number" value={stalwart.submissionPort} onChange={(event) => updateStalwart("submissionPort", Number(event.target.value))} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">JMAP HTTPS port<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" type="number" value={stalwart.jmapPort} onChange={(event) => updateStalwart("jmapPort", Number(event.target.value))} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Authentication<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" value={stalwart.auth} onChange={(event) => updateStalwart("auth", event.target.value)}><option value="password">Password</option><option value="oidc">OpenID Connect</option><option value="ldap">LDAP</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">TLS policy<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" value={stalwart.tls} onChange={(event) => updateStalwart("tls", event.target.value)}><option value="required">Required</option><option value="may">Optional</option></select></label></div>
            <div className="grid gap-3 md:grid-cols-2"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={stalwart.smtp} onChange={(event) => updateStalwart("smtp", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">SMTP service</span><span className="mt-1 block text-xs text-slate-500">Inbound and outbound mail transport.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={stalwart.imap} onChange={(event) => updateStalwart("imap", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">IMAP access</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={stalwart.jmap} onChange={(event) => updateStalwart("jmap", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">JMAP API</span><span className="mt-1 block text-xs text-slate-500">Modern mail and synchronization API.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={stalwart.webAdmin} onChange={(event) => updateStalwart("webAdmin", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Web administration</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={stalwart.spam} onChange={(event) => updateStalwart("spam", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Spam filtering</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={stalwart.dkim} onChange={(event) => updateStalwart("dkim", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">DKIM signing</span></span></label></div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Default mailbox quota<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-700 dark:text-slate-100" value={stalwart.maxMailbox} onChange={(event) => updateStalwart("maxMailbox", event.target.value)} /></label>
            <div className="flex items-center justify-between gap-4"><p className="text-sm text-slate-500">{stalwartMessage || "Stalwart configuration will be validated before the mail platform is started."}</p><button type="button" className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={saveStalwart}>Save Stalwart settings</button></div>
          </div>
        )}
        {tab === "Mailboxes" && (
          <>
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div>
                <h2 className="font-semibold text-slate-950 dark:text-white">
                  Mailbox inventory
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Quotas, activity, and access controls for hosted accounts.
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <Search size={15} className="text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search mailboxes"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 sm:w-56"
                />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40">
                  <tr>
                    <th className="px-5 py-3">Mailbox</th>
                    <th className="px-5 py-3">Quota usage</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Last activity</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((item) => (
                    <tr key={item.address}>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-950 dark:text-white">
                          {item.address}
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <LockKeyhole size={12} /> Password protected
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{item.used}</span>
                          <span>{item.quota}</span>
                        </div>
                        <div className="mt-2 h-1.5 w-44 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                          <span
                            className={`block h-full rounded-full ${item.status === "Near quota" ? "w-[92%] bg-amber-500" : "w-[30%] bg-blue-500"}`}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          tone={
                            item.status === "Near quota" ? "amber" : "green"
                          }
                        >
                          {item.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {item.activity}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button className="rounded-md p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                          <MoreHorizontal size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "Forwarders" && (
          <ForwardersPanel
            forwarders={forwarders}
            onCreate={() => setForwarderModal({})}
            onEdit={setForwarderModal}
            onDelete={(id) => setForwarders((items) => items.filter((item) => item.id !== id))}
          />
        )}
        {!['Mailboxes', 'Forwarders', 'Postfix transport', 'Dovecot mailbox access', 'Rspamd filtering', 'Stalwart Mail Server'].includes(tab) && (
          <div className="space-y-5 p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 className="font-semibold text-slate-950 dark:text-white">{tab} configuration</h2>
                <p className="mt-1 text-sm text-slate-500">Manage {tab.toLowerCase()} behavior for hosted domains.</p>
              </div>
              <button type="button" className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Plus size={15} />Create {tab === "Autoresponders" ? "autoresponder" : "rule"}</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {["Domain scope", "Current status", "Last updated"].map((label, index) => <div key={label} className="rounded-md bg-slate-50 p-4 dark:bg-slate-950/60"><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{index === 0 ? "example.com" : index === 1 ? "Ready" : "Just now"}</p></div>)}
            </div>
            <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><div className="flex items-start gap-3"><ShieldCheck size={18} className="mt-0.5 text-emerald-500" /><div><p className="text-sm font-medium text-slate-800 dark:text-slate-200">{tab === "Deliverability" ? "Mail authentication is healthy" : `${tab} are ready to configure`}</p><p className="mt-1 text-sm text-slate-500">Use the action above to add a new configuration, then manage existing entries here.</p></div></div></div>
          </div>
        )}
      </section>
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  Create mailbox
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add a professional address on example.com.
                </p>
              </div>
              <button
                onClick={() => setModal(false)}
                className="text-slate-400"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium">
                Mailbox name
                <div className="mt-2 flex items-center rounded-lg border border-slate-300 dark:border-slate-700">
                  <input
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    placeholder="name"
                    className="min-w-0 flex-1 bg-transparent px-3 py-2.5 outline-none"
                  />
                  <span className="border-l border-slate-200 px-3 text-sm text-slate-500 dark:border-slate-700">
                    @example.com
                  </span>
                </div>
              </label>
              <label className="block text-sm font-medium">
                Mailbox quota
                <select className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
                  <option>1 GB</option>
                  <option>5 GB</option>
                  <option>Unlimited</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Password
                <input
                  type="password"
                  placeholder="Generate a secure password"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 outline-none dark:border-slate-700"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={create}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
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
    </div>
  );
}
