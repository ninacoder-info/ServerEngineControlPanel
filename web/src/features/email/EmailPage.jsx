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
function Badge({ children, tone = "green" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tone === "amber" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : tone === "blue" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"}`}
    >
      {children}
    </span>
  );
}
export default function EmailPage() {
  const [tab, setTab] = React.useState("Mailboxes");
  const [mailboxes, setMailboxes] = React.useState(initialMailboxes);
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(false);
  const [local, setLocal] = React.useState("");
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
        {tab !== "Mailboxes" && (
          <div className="p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">
              <Mail size={22} />
            </div>
            <h2 className="mt-4 font-semibold text-slate-950 dark:text-white">
              {tab}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Configure {tab.toLowerCase()} for your domains. The workspace is
              ready for mailbox and mail-routing APIs.
            </p>
            <button className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-600">
              Open configuration <ChevronRight size={15} />
            </button>
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
    </div>
  );
}
