import React from "react";
import {
  Check,
  ChevronDown,
  Globe2,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

const initialDomains = [
  {
    domain: "example.com",
    type: "Primary",
    root: "/server-engine/www/example.com",
    dns: "Healthy",
    tls: "Active",
    records: 8,
  },
  {
    domain: "shop.example.com",
    type: "Subdomain",
    root: "/server-engine/www/shop",
    dns: "Healthy",
    tls: "Active",
    records: 5,
  },
  {
    domain: "example.net",
    type: "Alias",
    root: "Redirects to example.com",
    dns: "Review",
    tls: "Pending",
    records: 4,
  },
];
const records = [
  ["A", "example.com", "203.0.113.24", "300"],
  ["CNAME", "www", "example.com", "300"],
  ["MX", "@", "mail.example.com", "3600"],
  ["TXT", "@", "v=spf1 a mx ~all", "3600"],
  ["CAA", "@", '0 issue "letsencrypt.org"', "3600"],
];
const tabs = ["Domains", "DNS records", "Redirects", "TLS certificates"];
function Badge({ children, tone = "slate" }) {
  const styles = {
    green:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}
export default function DomainsPage() {
  const [tab, setTab] = React.useState("Domains");
  const [domains, setDomains] = React.useState(initialDomains);
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState({
    domain: "",
    root: "/server-engine/www/",
    type: "Addon domain",
    tls: true,
  });
  const filtered = domains.filter((item) =>
    item.domain.includes(query.toLowerCase()),
  );
  const add = () => {
    if (!form.domain.trim()) return;
    setDomains((items) => [
      ...items,
      {
        domain: form.domain,
        type: form.type,
        root: form.root || "/server-engine/www/",
        dns: "Pending",
        tls: form.tls ? "Pending" : "Off",
        records: 0,
      },
    ]);
    setForm({
      domain: "",
      root: "/server-engine/www/",
      type: "Addon domain",
      tls: true,
    });
    setModal(false);
  };
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-blue-500">Hosting / Domains & DNS</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Domains & DNS
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Manage domains, DNS zones, redirects, and certificates from one
            focused workspace.
          </p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus size={16} /> Add domain
        </button>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Domains", domains.length, "Registered names", Globe2, "blue"],
          ["DNS health", "96%", "Zones resolving", ShieldCheck, "green"],
          ["TLS ready", "2 / 3", "Certificates active", LockKeyhole, "green"],
          ["Aliases", "1", "Redirect destinations", ChevronDown, "slate"],
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
                  tone === "green"
                    ? "text-emerald-500"
                    : tone === "blue"
                      ? "text-blue-500"
                      : "text-slate-400"
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
        {tab === "Domains" && (
          <>
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div>
                <h2 className="font-semibold text-slate-950 dark:text-white">
                  Domain inventory
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Web roots, DNS health, and TLS state at a glance.
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <Search size={15} className="text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search domains"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 sm:w-56"
                />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40">
                  <tr>
                    <th className="px-5 py-3">Domain</th>
                    <th className="px-5 py-3">Type / web root</th>
                    <th className="px-5 py-3">DNS</th>
                    <th className="px-5 py-3">TLS</th>
                    <th className="px-5 py-3">Records</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((item) => (
                    <tr
                      key={item.domain}
                      className="text-slate-700 dark:text-slate-300"
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-950 dark:text-white">
                          {item.domain}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Last checked 2 minutes ago
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone="blue">{item.type}</Badge>
                        <div className="mt-2 max-w-xs truncate text-xs text-slate-500">
                          {item.root}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          tone={item.dns === "Healthy" ? "green" : "amber"}
                        >
                          {item.dns}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          tone={
                            item.tls === "Active"
                              ? "green"
                              : item.tls === "Pending"
                                ? "amber"
                                : "slate"
                          }
                        >
                          {item.tls}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {item.records} records
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
        {tab === "DNS records" && (
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-950 dark:text-white">
                  Zone records
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  The active zone for example.com.
                </p>
              </div>
              <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <Plus size={15} /> Add record
              </button>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-3">Type</th>
                    <th className="py-3">Name</th>
                    <th className="py-3">Value</th>
                    <th className="py-3">TTL</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {records.map((row) => (
                    <tr key={row.join("-")}>
                      <td className="py-3 font-semibold text-blue-600">
                        {row[0]}
                      </td>
                      <td className="py-3 text-slate-700 dark:text-slate-300">
                        {row[1]}
                      </td>
                      <td className="max-w-md truncate py-3 font-mono text-xs text-slate-500">
                        {row[2]}
                      </td>
                      <td className="py-3 text-slate-500">{row[3]}s</td>
                      <td className="py-3 text-right text-slate-400">•••</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab !== "Domains" && tab !== "DNS records" && (
          <div className="p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">
              <ShieldCheck size={22} />
            </div>
            <h2 className="mt-4 font-semibold text-slate-950 dark:text-white">
              {tab}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Manage {tab.toLowerCase()} with the same domain-level controls.
              The UI is ready for the domain service API.
            </p>
          </div>
        )}
      </section>
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  Add domain
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a hosted domain and prepare its zone.
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
                Domain name
                <input
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  placeholder="yourdomain.com"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 outline-none focus:border-blue-500 dark:border-slate-700"
                />
              </label>
              <label className="block text-sm font-medium">
                Document root
                <input
                  value={form.root}
                  onChange={(e) => setForm({ ...form, root: e.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 outline-none focus:border-blue-500 dark:border-slate-700"
                />
              </label>
              <label className="block text-sm font-medium">
                Domain type
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"
                >
                  <option>Addon domain</option>
                  <option>Primary domain</option>
                  <option>Subdomain</option>
                  <option>Alias</option>
                </select>
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.tls}
                  onChange={(e) => setForm({ ...form, tls: e.target.checked })}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-offset-slate-900"
                />
                Request a TLS certificate automatically
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
                onClick={add}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Create domain
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
