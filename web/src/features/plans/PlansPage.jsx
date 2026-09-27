import React from "react";
import { Check, CirclePlus, MoreHorizontal, Package, ShieldCheck, X } from "lucide-react";

const initialPlans = [
  {
    id: "starter",
    name: "Starter",
    description: "For one small website or landing page.",
    disk: "10 GB",
    bandwidth: "100 GB",
    websites: "1",
    databases: "2",
    mailboxes: "5",
    status: "Active",
  },
  {
    id: "business",
    name: "Business",
    description: "Balanced resources for client websites and stores.",
    disk: "50 GB",
    bandwidth: "500 GB",
    websites: "10",
    databases: "10",
    mailboxes: "25",
    status: "Active",
  },
  {
    id: "agency",
    name: "Agency",
    description: "A larger allocation for teams and resellers.",
    disk: "200 GB",
    bandwidth: "2 TB",
    websites: "50",
    databases: "50",
    mailboxes: "100",
    status: "Active",
  },
];

const panel =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";

function Limit({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm last:border-0 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <strong className="text-slate-900 dark:text-slate-100">{value}</strong>
    </div>
  );
}

const input =
  "mt-2 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

function PlanModal({ onClose, onSave }) {
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    disk: "10 GB",
    bandwidth: "100 GB",
    websites: "1",
    databases: "2",
    mailboxes: "5",
    ftp: "2",
    cron: "5",
    php: "8.3",
    webserver: "Nginx",
    database: "MySQL",
    reseller: true,
    features: ["ssl", "dns", "backups", "git"],
  });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleFeature = (feature) =>
    setForm((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((item) => item !== feature)
        : [...current.features, feature],
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8">
      <form
        className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(form);
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Resource profile</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Create hosting plan</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Set the limits and features available to accounts assigned to this plan.</p>
          </div>
          <button type="button" aria-label="Close plan form" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(100vh-12rem)] space-y-7 overflow-y-auto p-6">
          <section>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Plan details</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Plan name<input required className={input} value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Professional" />
              </label>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Description<input required className={input} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="For production websites and stores" />
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Resource limits</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["disk", "Disk quota", "50 GB"],
                ["bandwidth", "Monthly bandwidth", "500 GB"],
                ["websites", "Websites", "10"],
                ["databases", "Databases", "10"],
                ["mailboxes", "Mailboxes", "25"],
                ["ftp", "FTP accounts", "10"],
                ["cron", "Cron jobs", "20"],
              ].map(([key, label, placeholder]) => (
                <label key={key} className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {label}<input required className={input} value={form[key]} onChange={(event) => set(key, event.target.value)} placeholder={placeholder} />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Runtime defaults</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {[
                ["webserver", "Web server", ["Nginx", "Apache HTTP Server"]],
                ["php", "PHP runtime", ["8.3", "8.4", "8.2", "Latest installed"]],
                ["database", "Database engine", ["MySQL", "MariaDB", "PostgreSQL"]],
              ].map(([key, label, options]) => (
                <label key={key} className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {label}<select className={input} value={form[key]} onChange={(event) => set(key, event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Feature access</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["ssl", "SSL certificates", "Issue and renew TLS certificates."],
                ["dns", "DNS management", "Manage assigned zones and records."],
                ["mail", "Email services", "Create mailboxes and aliases."],
                ["backups", "Backups", "Create and restore website backups."],
                ["git", "Git deployments", "Connect repositories and deploy hooks."],
                ["shell", "SSH access", "Allow shell access for trusted users."],
              ].map(([id, label, description]) => (
                <label key={id} className="flex cursor-pointer items-start gap-3 border border-slate-200 p-3 dark:border-slate-800">
                  <input type="checkbox" className="mt-1 h-4 w-4 cursor-pointer accent-blue-600" checked={form.features.includes(id)} onChange={() => toggleFeature(id)} />
                  <span><strong className="block text-sm text-slate-900 dark:text-slate-100">{label}</strong><small className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</small></span>
                </label>
              ))}
            </div>
          </section>

          <label className="flex cursor-pointer items-start gap-3 border-y border-slate-200 py-4 dark:border-slate-800">
            <input type="checkbox" className="mt-1 h-4 w-4 cursor-pointer accent-blue-600" checked={form.reseller} onChange={(event) => set("reseller", event.target.checked)} />
            <span><strong className="block text-sm text-slate-900 dark:text-slate-100">Allow reseller assignment</strong><small className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Resellers can assign this plan to accounts they manage.</small></span>
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <button type="button" className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100" onClick={onClose}>Cancel</button>
          <button type="submit" className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><CirclePlus size={16} />Create plan</button>
        </div>
      </form>
    </div>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = React.useState(initialPlans);
  const [modal, setModal] = React.useState(false);

  const createPlan = (form) => {
    const id = `custom-${plans.length + 1}`;
    setPlans((current) => [
      ...current,
      {
        id,
        name: form.name,
        description: form.description,
        disk: form.disk,
        bandwidth: form.bandwidth,
        websites: form.websites,
        databases: form.databases,
        mailboxes: form.mailboxes,
        status: "Active",
      },
    ]);
    setModal(false);
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Accounts & plans
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Hosting plans
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-500 dark:text-slate-400">
            Define reusable resource limits and feature access for hosting accounts and resellers.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={() => setModal(true)}
        >
          <CirclePlus size={16} />
          Create plan
        </button>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          [Package, "Active plans", plans.filter((plan) => plan.status === "Active").length],
          [ShieldCheck, "Accounts using plans", "3"],
          [Check, "Unassigned accounts", "1"],
        ].map(([Icon, label, value]) => (
          <div className={panel} key={label}>
            <div className="flex items-center gap-3">
              <Icon size={19} className="text-blue-500" />
              <span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span>
                <strong className="mt-1 block text-xl text-slate-900 dark:text-slate-100">{value}</strong>
              </span>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {plans.map((plan) => (
          <article className={panel} key={plan.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{plan.name}</h3>
                  <span className={`text-xs font-semibold ${plan.status === "Active" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {plan.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{plan.description}</p>
              </div>
              <button type="button" aria-label={`More actions for ${plan.name}`} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <MoreHorizontal size={17} />
              </button>
            </div>
            <div className="mt-5 border-t border-slate-200 pt-1 dark:border-slate-800">
              <Limit label="Disk quota" value={plan.disk} />
              <Limit label="Monthly bandwidth" value={plan.bandwidth} />
              <Limit label="Websites" value={plan.websites} />
              <Limit label="Databases" value={plan.databases} />
              <Limit label="Mailboxes" value={plan.mailboxes} />
            </div>
            <button type="button" className="mt-5 inline-flex cursor-pointer items-center text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              Edit plan
            </button>
          </article>
        ))}
      </section>
      {modal && <PlanModal onClose={() => setModal(false)} onSave={createPlan} />}
    </div>
  );
}
