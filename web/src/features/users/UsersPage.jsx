import React from "react";
import {
  Activity,
  ChevronDown,
  CirclePlus,
  Database,
  Globe2,
  HardDrive,
  MoreHorizontal,
  Package,
  Search,
  Server,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";

const roles = [
  {
    id: "account",
    name: "Hosting account",
    description: "Website owner with scoped hosting resources.",
  },
  {
    id: "reseller",
    name: "Reseller",
    description: "Can create and manage child hosting accounts.",
  },
  {
    id: "administrator",
    name: "Server administrator",
    description: "Unrestricted panel and host control.",
  },
];
const packages = [
  {
    id: "starter",
    name: "Starter",
    disk: "10 GB",
    bandwidth: "100 GB",
    sites: 1,
  },
  {
    id: "business",
    name: "Business",
    disk: "50 GB",
    bandwidth: "500 GB",
    sites: 10,
  },
  {
    id: "agency",
    name: "Agency",
    disk: "200 GB",
    bandwidth: "2 TB",
    sites: 50,
  },
  {
    id: "unlimited",
    name: "Custom limits",
    disk: "Custom",
    bandwidth: "Custom",
    sites: "Custom",
  },
];
const initialAccounts = [
  {
    id: 1,
    name: "Platform Admin",
    username: "root",
    domain: "server-engine.local",
    type: "administrator",
    owner: "System",
    plan: "Unlimited",
    disk: "—",
    diskLimit: "—",
    bandwidth: "—",
    sites: "All",
    status: "Active",
  },
  {
    id: 2,
    name: "Acme Hosting",
    username: "acmehost",
    domain: "acme.example.com",
    type: "reseller",
    owner: "root",
    plan: "Agency",
    disk: "42 GB",
    diskLimit: "200 GB",
    bandwidth: "186 GB",
    sites: "6 / 50",
    status: "Active",
  },
  {
    id: 3,
    name: "Northwind Store",
    username: "northwind",
    domain: "northwind.example.com",
    type: "account",
    owner: "acmehost",
    plan: "Business",
    disk: "8.4 GB",
    diskLimit: "50 GB",
    bandwidth: "64 GB",
    sites: "2 / 10",
    status: "Active",
  },
  {
    id: 4,
    name: "Demo Workspace",
    username: "demo",
    domain: "demo.example.com",
    type: "account",
    owner: "acmehost",
    plan: "Starter",
    disk: "9.8 GB",
    diskLimit: "10 GB",
    bandwidth: "21 GB",
    sites: "1 / 1",
    status: "Suspended",
  },
];
const input =
  "mt-2 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const panel =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";

function Usage({ used, limit }) {
  if (limit === "—")
    return (
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Unlimited
      </span>
    );
  const percent = Math.min(
    100,
    Math.round(
      ((Number.parseFloat(used) || 0) / (Number.parseFloat(limit) || 1)) * 100,
    ),
  );
  return (
    <span className="block min-w-28">
      <span className="flex justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
        <span>{used}</span>
        <span>{limit}</span>
      </span>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <span
          className={`block h-full rounded-full ${percent >= 90 ? "bg-red-500" : percent >= 75 ? "bg-amber-500" : "bg-blue-500"}`}
          style={{ width: `${percent}%` }}
        />
      </span>
    </span>
  );
}

function AccountModal({ onClose, onCreate }) {
  const [form, setForm] = React.useState({
    name: "",
    username: "",
    domain: "",
    type: "account",
    package: "starter",
    password: "",
    shell: false,
    ssl: true,
    dns: true,
    mail: false,
  });
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const selected = packages.find((item) => item.id === form.package);
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
            plan: selected.name,
            disk: "0 GB",
            diskLimit: selected.disk,
            bandwidth: "0 GB",
            sites: `0 / ${selected.sites}`,
            owner: form.type === "reseller" ? "root" : "acmehost",
            status: "Active",
          });
          onClose();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Account provisioning
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Create hosting account
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Create an account or reseller with explicit quotas and feature
              boundaries.
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
          {[
            ["name", "Account name", "Customer or agency name"],
            ["username", "Username", "customer1"],
            ["domain", "Primary domain", "example.com"],
          ].map(([key, label, placeholder]) => (
            <label
              key={key}
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {label}
              <input
                required
                className={input}
                value={form[key]}
                onChange={(event) => change(key, event.target.value)}
                placeholder={placeholder}
              />
            </label>
          ))}
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Account type
            <select
              className={input}
              value={form.type}
              onChange={(event) => change("type", event.target.value)}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Hosting package
            <select
              className={input}
              value={form.package}
              onChange={(event) => change("package", event.target.value)}
            >
              {packages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.disk} · {item.sites} sites
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Initial password
            <input
              required
              type="password"
              className={input}
              value={form.password}
              onChange={(event) => change("password", event.target.value)}
              placeholder="Generate a secure password"
            />
          </label>
        </div>
        <div className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Package size={17} className="text-blue-500" />
            <strong className="text-sm text-slate-900 dark:text-slate-100">
              Package limits
            </strong>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <small className="text-xs text-slate-500 dark:text-slate-400">
                Disk quota
              </small>
              <strong className="mt-1 block text-sm text-slate-800 dark:text-slate-200">
                {selected.disk}
              </strong>
            </div>
            <div>
              <small className="text-xs text-slate-500 dark:text-slate-400">
                Bandwidth
              </small>
              <strong className="mt-1 block text-sm text-slate-800 dark:text-slate-200">
                {selected.bandwidth}
              </strong>
            </div>
            <div>
              <small className="text-xs text-slate-500 dark:text-slate-400">
                Websites
              </small>
              <strong className="mt-1 block text-sm text-slate-800 dark:text-slate-200">
                {selected.sites}
              </strong>
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            ["ssl", "SSL management", "Certificates and renewals."],
            [
              "dns",
              "DNS management",
              "Zones and records for assigned domains.",
            ],
            ["mail", "Mail features", "Mail and mailbox management."],
            ["shell", "Shell access", "Only for trusted operators."],
          ].map(([key, label, description]) => (
            <label
              key={key}
              className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
            >
              <input
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-offset-slate-900"
                type="checkbox"
                checked={form[key]}
                onChange={(event) => change(key, event.target.checked)}
              />
              <span>
                <strong className="block text-sm text-slate-900 dark:text-slate-100">
                  {label}
                </strong>
                <small className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {description}
                </small>
              </span>
            </label>
          ))}
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
            Create account
          </button>
        </div>
      </form>
    </div>
  );
}

export default function UsersPage() {
  const [accounts, setAccounts] = React.useState(initialAccounts);
  const [view, setView] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(false);
  const visible = accounts.filter(
    (item) =>
      (view === "all" ||
        item.type === view ||
        (view === "suspended" && item.status === "Suspended")) &&
      `${item.name} ${item.username} ${item.domain} ${item.owner}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-7">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Accounts and resellers
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Users
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500 dark:text-slate-400">
            Create hosting accounts, delegate reseller access, and control
            quotas and features from one place.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          onClick={() => setModal(true)}
        >
          <CirclePlus size={16} />
          Create account
        </button>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            Users,
            "Total accounts",
            accounts.length,
            "Hosting accounts and resellers",
          ],
          [
            UserRound,
            "Resellers",
            accounts.filter((item) => item.type === "reseller").length,
            "Delegated account owners",
          ],
          [HardDrive, "Disk allocated", "292 GB", "Across configured packages"],
          [
            ShieldCheck,
            "Active accounts",
            accounts.filter((item) => item.status === "Active").length,
            "Ready to serve traffic",
          ],
        ].map(([Icon, label, value, detail]) => (
          <div className={panel} key={label}>
            <div className="flex items-center gap-3">
              <Icon className="text-blue-500" size={20} />
              <span>
                <small className="block text-xs text-slate-500 dark:text-slate-400">
                  {label}
                </small>
                <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">
                  {value}
                </strong>
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {detail}
            </p>
          </div>
        ))}
      </section>
      <section className={panel}>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Hosting account directory
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manage ownership, packages, quotas, and account status.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex min-w-64 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-400 dark:border-slate-700 dark:bg-slate-950">
              <Search size={16} />
              <input
                className="w-full bg-transparent text-sm text-slate-900 outline-none dark:text-slate-100"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search account or domain"
              />
            </label>
            <button className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
              <ChevronDown size={15} />
              Filters
            </button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
          {[
            ["all", "All accounts"],
            ["account", "Hosting accounts"],
            ["reseller", "Resellers"],
            ["suspended", "Suspended"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${view === id ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-3 py-3 font-semibold">Account / domain</th>
                <th className="px-3 py-3 font-semibold">Type / owner</th>
                <th className="px-3 py-3 font-semibold">Package</th>
                <th className="px-3 py-3 font-semibold">Disk usage</th>
                <th className="px-3 py-3 font-semibold">Bandwidth</th>
                <th className="px-3 py-3 font-semibold">Sites</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((account) => (
                <tr
                  key={account.id}
                  className="border-b border-slate-100 dark:border-slate-800"
                >
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {account.type === "reseller" ? (
                          <Users size={17} />
                        ) : account.type === "administrator" ? (
                          <ShieldCheck size={17} />
                        ) : (
                          <Globe2 size={17} />
                        )}
                      </span>
                      <span>
                        <strong className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {account.name}
                        </strong>
                        <small className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                          {account.username} · {account.domain}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <strong className="block text-xs font-semibold capitalize text-slate-700 dark:text-slate-300">
                      {account.type}
                    </strong>
                    <small className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                      Owner: {account.owner}
                    </small>
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-700 dark:text-slate-300">
                    {account.plan}
                  </td>
                  <td className="px-3 py-4">
                    <Usage used={account.disk} limit={account.diskLimit} />
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {account.bandwidth}
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {account.sites}
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`inline-flex items-center gap-2 text-xs font-semibold ${account.status === "Active" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {account.status}
                    </span>
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
              <Server size={30} className="text-slate-400" />
              <h4 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                No accounts match these filters
              </h4>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Try another account, domain, or account type.
              </p>
            </div>
          )}
        </div>
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        <div className={panel}>
          <div className="flex items-center gap-3">
            <Activity size={18} className="text-blue-500" />
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Delegation rules
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Resellers inherit only assigned accounts and packages.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
              <span>Account creation</span>
              <strong className="text-slate-900 dark:text-slate-100">
                Package limited
              </strong>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
              <span>Service access</span>
              <strong className="text-slate-900 dark:text-slate-100">
                Scoped by role
              </strong>
            </div>
            <div className="flex justify-between gap-4">
              <span>Root access</span>
              <strong className="text-red-600 dark:text-red-400">
                Administrator only
              </strong>
            </div>
          </div>
        </div>
        <div className={panel}>
          <div className="flex items-center gap-3">
            <Database size={18} className="text-violet-500" />
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Feature privileges
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Fine-grained controls attach to each account type.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              "Websites",
              "DNS",
              "SSL",
              "Mail",
              "Databases",
              "Backups",
              "Logs",
              "Shell",
            ].map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                <ShieldCheck size={13} className="text-emerald-500" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>
      {modal && (
        <AccountModal
          onClose={() => setModal(false)}
          onCreate={(account) =>
            setAccounts((current) => [...current, account])
          }
        />
      )}
    </div>
  );
}
