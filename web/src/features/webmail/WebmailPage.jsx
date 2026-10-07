import React from "react";
import {
  Archive,
  ChevronDown,
  Clock3,
  FileText,
  Inbox,
  Mail,
  Menu,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";

const contacts = [
  { name: "Sarah Chen", email: "schen@company.com", initials: "SC", color: "bg-violet-100 text-violet-700" },
  { name: "Lewis Clarke", email: "lewis@company.com", initials: "LC", color: "bg-blue-100 text-blue-700" },
  { name: "James Collins", email: "james@company.com", initials: "JC", color: "bg-amber-100 text-amber-700" },
];

const initialThreads = [
  { id: 1, sender: "Sarah Chen", email: "schen@company.com", initials: "SC", color: "bg-violet-100 text-violet-700", subject: "Project timeline update", preview: "I have reviewed the latest sprint progress and found a few blockers…", time: "10:24 AM", unread: true, starred: true, messages: ["Hi team,\n\nI have reviewed the latest sprint progress and found a few blockers in the API integration. Could we schedule a meeting to discuss a revised timeline?\n\nThanks,\nSarah"] },
  { id: 2, sender: "Lewis Clarke", email: "lewis@company.com", initials: "LC", color: "bg-blue-100 text-blue-700", subject: "Re: DNS records for ninacoder.top", preview: "The MX record is now pointing to the new mail hostname.", time: "9:35 AM", unread: true, starred: false, messages: ["The MX record is now pointing to the new mail hostname. I will verify propagation again this afternoon."] },
  { id: 3, sender: "GitHub", email: "noreply@github.com", initials: "GH", color: "bg-neutral-200 text-neutral-700", subject: "Security alert for your repository", preview: "A dependency in one of your repositories has a security update.", time: "Yesterday", unread: false, starred: false, messages: ["A dependency in one of your repositories has a security update available. Review the advisory in GitHub."] },
  { id: 4, sender: "Amanda Harvey", email: "amanda@company.com", initials: "AH", color: "bg-rose-100 text-rose-700", subject: "Quarterly marketing strategy", preview: "Can you review the attached draft before Friday?", time: "Oct 6", unread: false, starred: false, messages: ["Can you review the attached draft before Friday? I would like to send it to the team before the planning meeting."] },
  { id: 5, sender: "Cloud provider", email: "billing@example.net", initials: "CP", color: "bg-emerald-100 text-emerald-700", subject: "Your invoice is ready", preview: "Your monthly invoice is now available to download.", time: "Oct 5", unread: false, starred: false, messages: ["Your monthly invoice is now available to download from the billing portal."] },
];

function Avatar({ thread, small = false }) {
  return <span className={`grid shrink-0 place-items-center rounded-full font-semibold ${small ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-xs"} ${thread.color}`}>{thread.initials}</span>;
}

function WebmailLogin({ onLogin }) {
  const [form, setForm] = React.useState({ email: "", password: "" });
  const [error, setError] = React.useState("");
  function submit(event) {
    event.preventDefault();
    if (!form.email.includes("@")) return setError("Enter a valid email address.");
    if (!form.password) return setError("Enter your mailbox password.");
    onLogin(form.email);
  }
  return <main className="grid min-h-screen place-items-center bg-[#f6f8fc] px-4 py-8 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <section className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white"><Mail size={22} /></span><div><p className="text-lg font-semibold">Server Engine Mail</p><p className="text-sm text-neutral-500">Secure mailbox access</p></div></div>
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">Sign in to your mailbox</h1>
      <p className="mt-2 text-sm leading-6 text-neutral-500">Use your complete email address and mailbox password.</p>
      <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
        <label className="block text-sm font-medium">Email address<input type="email" autoFocus autoComplete="username" value={form.email} onChange={(event) => { setForm({ ...form, email: event.target.value }); setError(""); }} placeholder="you@example.com" className="mt-2 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950" /></label>
        <label className="block text-sm font-medium">Password<input type="password" autoComplete="current-password" value={form.password} onChange={(event) => { setForm({ ...form, password: event.target.value }); setError(""); }} className="mt-2 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950" /></label>
        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">{error}</p>}
        <button className="min-h-11 w-full rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Sign in</button>
      </form>
      <p className="mt-7 flex items-center justify-center gap-2 text-xs text-neutral-500"><ShieldCheck size={14} /> Your mailbox is managed by Server Engine</p>
    </section>
  </main>;
}

function ComposeModal({ account, onClose }) {
  const [to, setTo] = React.useState("");
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/30 p-4 sm:items-center">
    <form onSubmit={(event) => { event.preventDefault(); onClose(); }} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center justify-between bg-neutral-900 px-5 py-3 text-white"><p className="text-sm font-semibold">New message</p><button type="button" onClick={onClose} aria-label="Close compose"><X size={17} /></button></div>
      <div className="space-y-1 px-5 pt-4"><label className="flex items-center gap-3 border-b border-neutral-200 py-2 text-sm dark:border-neutral-800"><span className="w-12 text-neutral-500">From</span><span>{account}</span></label><label className="flex items-center gap-3 border-b border-neutral-200 py-2 text-sm dark:border-neutral-800"><span className="w-12 text-neutral-500">To</span><input required autoFocus value={to} onChange={(event) => setTo(event.target.value)} placeholder="recipient@example.com" className="min-w-0 flex-1 bg-transparent outline-none" /></label><input required placeholder="Subject" className="w-full border-b border-neutral-200 py-3 text-sm outline-none dark:border-neutral-800 dark:bg-neutral-900" /><textarea placeholder="Write your message…" className="min-h-64 w-full resize-y py-4 text-sm outline-none dark:bg-neutral-900" /></div>
      <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3 dark:border-neutral-800"><div className="flex gap-1 text-neutral-500"><button type="button" className="rounded-md p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><Paperclip size={17} /></button><button type="button" className="rounded-md p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><MoreHorizontal size={17} /></button></div><button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Send size={15} />Send</button></div>
    </form>
  </div>;
}

function WebmailInbox({ account, onLogout }) {
  const [threads, setThreads] = React.useState(initialThreads);
  const [selectedId, setSelectedId] = React.useState(1);
  const [folder, setFolder] = React.useState("Inbox");
  const [query, setQuery] = React.useState("");
  const [compose, setCompose] = React.useState(false);
  const [mobileNav, setMobileNav] = React.useState(false);
  const [showContacts, setShowContacts] = React.useState(false);
  const [listWidth, setListWidth] = React.useState(430);
  const resizeRef = React.useRef(false);
  React.useEffect(() => {
    const move = (event) => {
      if (!resizeRef.current) return;
      setListWidth(Math.max(340, Math.min(720, event.clientX - 256)));
    };
    const stop = () => {
      resizeRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, []);
  const selected = threads.find((thread) => thread.id === selectedId) || threads[0];
  const visibleThreads = threads.filter((thread) => `${thread.sender} ${thread.email} ${thread.subject} ${thread.preview}`.toLowerCase().includes(query.toLowerCase()));
  const selectThread = (thread) => { setSelectedId(thread.id); setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, unread: false } : item)); };
  const nav = [
    ["Inbox", Inbox, "3"], ["Starred", Star, ""], ["Snoozed", Clock3, ""], ["Sent", Send, ""], ["Drafts", FileText, ""], ["Trash", Trash2, ""],
  ];
  return <div className="flex h-screen min-h-[620px] overflow-hidden bg-[#f6f8fc] text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    {mobileNav && <button aria-label="Close navigation" className="fixed inset-0 z-20 bg-neutral-950/40 lg:hidden" onClick={() => setMobileNav(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white transition-transform dark:border-neutral-800 dark:bg-neutral-900 lg:relative lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-16 items-center gap-3 border-b border-neutral-200 px-5 dark:border-neutral-800"><span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white"><Mail size={18} /></span><span className="font-semibold">Server Engine Mail</span></div>
      <div className="p-4"><button onClick={() => setCompose(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"><PenLine size={16} />Compose</button></div>
      <nav className="space-y-1 px-3">{nav.map(([label, Icon, count]) => <button key={label} onClick={() => { setFolder(label); setShowContacts(false); setMobileNav(false); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${folder === label && !showContacts ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"}`}><Icon size={17} className={label === "Starred" && folder === label ? "fill-current" : ""} /><span className="flex-1 text-left">{label}</span>{count && <span className="text-xs font-semibold">{count}</span>}</button>)}<div className="my-3 border-t border-neutral-200 dark:border-neutral-800" /><button onClick={() => { setShowContacts(true); setMobileNav(false); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${showContacts ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"}`}><Users size={17} /><span className="flex-1 text-left">Contacts</span></button></nav>
      <div className="mt-auto border-t border-neutral-200 p-4 dark:border-neutral-800"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700">{account.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{account}</p><p className="text-xs text-neutral-500">Mailbox</p></div><button onClick={onLogout} title="Sign out" className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"><ChevronDown size={16} /></button></div></div>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6"><button className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 lg:hidden" onClick={() => setMobileNav(true)}><Menu size={19} /></button><div className="relative max-w-xl flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mail" className="h-10 w-full rounded-lg bg-neutral-100 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:bg-neutral-800" /></div><button title="Settings" className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"><Settings size={18} /></button></header>
      {showContacts ? <section className="flex-1 overflow-y-auto p-5 sm:p-8"><div className="mx-auto max-w-4xl"><div><p className="text-sm text-blue-600">Mailbox</p><h1 className="mt-1 text-2xl font-semibold">Contacts</h1><p className="mt-1 text-sm text-neutral-500">People you email frequently. Full contact sync can come after the mailbox core.</p></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{contacts.map((contact) => <article key={contact.email} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-full text-xs font-semibold ${contact.color}`}>{contact.initials}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{contact.name}</p><p className="truncate text-xs text-neutral-500">{contact.email}</p></div></div><button onClick={() => setCompose(true)} className="mt-4 text-xs font-semibold text-blue-600 dark:text-blue-400">Write message</button></article>)}</div></div></section> : <div className="flex min-h-0 flex-1"><section style={{ "--webmail-list-width": `${listWidth}px` }} className="flex min-h-0 min-w-0 w-full shrink-0 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 lg:w-[var(--webmail-list-width)]"><div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800"><div><h1 className="text-lg font-semibold">{folder}</h1><p className="mt-1 text-xs text-neutral-500">{visibleThreads.length} conversations</p></div><button className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"><MoreHorizontal size={18} /></button></div><div className="min-h-0 flex-1 overflow-y-auto">{visibleThreads.map((thread) => <button key={thread.id} onClick={() => selectThread(thread)} className={`flex w-full gap-3 border-b border-neutral-100 px-5 py-4 text-left transition hover:bg-blue-50/60 dark:border-neutral-800 dark:hover:bg-blue-950/20 ${selectedId === thread.id ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}><Avatar thread={thread} small /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className={`truncate text-sm ${thread.unread ? "font-bold text-neutral-950 dark:text-white" : "font-medium text-neutral-800 dark:text-neutral-200"}`}>{thread.sender}</p><span className="shrink-0 text-xs text-neutral-500">{thread.time}</span></div><p className={`mt-1 truncate text-sm ${thread.unread ? "font-semibold text-neutral-900 dark:text-neutral-100" : "text-neutral-700 dark:text-neutral-300"}`}>{thread.subject}</p><p className="mt-1 truncate text-xs text-neutral-500">{thread.preview}</p></div>{thread.starred && <Star size={15} className="mt-1 shrink-0 fill-amber-400 text-amber-400" />}</button>)}</div></section><div role="separator" aria-orientation="vertical" aria-valuemin="340" aria-valuemax="720" aria-valuenow={listWidth} tabIndex={0} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); resizeRef.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }} onKeyDown={(event) => { if (event.key === "ArrowLeft") setListWidth((value) => Math.max(340, value - 24)); if (event.key === "ArrowRight") setListWidth((value) => Math.min(720, value + 24)); }} className="hidden w-0.5 shrink-0 cursor-col-resize bg-neutral-200 transition-colors hover:bg-blue-500 lg:block dark:bg-neutral-800" title="Resize inbox and message panes" /><section className="hidden min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-neutral-900 lg:flex"><div className="flex items-center justify-between border-b border-neutral-200 px-7 py-4 dark:border-neutral-800"><div className="flex items-center gap-2 text-sm text-neutral-500"><button className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><Archive size={17} /></button><button className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><Trash2 size={17} /></button></div><div className="flex items-center gap-2 text-neutral-500"><button className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><Star size={17} className={selected?.starred ? "fill-amber-400 text-amber-400" : ""} /></button><button className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><MoreHorizontal size={17} /></button></div></div>{selected && <article className="min-h-0 flex-1 overflow-y-auto px-7 py-8"><h2 className="text-2xl font-semibold tracking-tight">{selected.subject}</h2><div className="mt-6 flex items-start gap-3"><Avatar thread={selected} /><div className="min-w-0"><p className="font-semibold">{selected.sender}</p><p className="mt-1 text-xs text-neutral-500">{selected.email} · to {account}</p></div><span className="ml-auto text-xs text-neutral-500">{selected.time}</span></div><div className="mt-8 max-w-3xl whitespace-pre-line text-sm leading-7 text-neutral-700 dark:text-neutral-300">{selected.messages[0]}</div><div className="mt-10 flex gap-3"><button onClick={() => setCompose(true)} className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"><PenLine size={15} />Reply</button><button className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"><Archive size={15} />Archive</button></div></article>}</section></div>}
    </main>
    {compose && <ComposeModal account={account} onClose={() => setCompose(false)} />}
  </div>;
}

export default function WebmailPage() {
  const [account, setAccount] = React.useState(() => sessionStorage.getItem("serverengine:webmail-account") || "");
  function login(email) { sessionStorage.setItem("serverengine:webmail-account", email); setAccount(email); }
  function logout() { sessionStorage.removeItem("serverengine:webmail-account"); setAccount(""); }
  return account ? <WebmailInbox account={account} onLogout={logout} /> : <WebmailLogin onLogin={login} />;
}
