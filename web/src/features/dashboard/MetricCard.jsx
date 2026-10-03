export default function MetricCard({ label, value, detail, icon: Icon, good }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">{label}</span>
        <Icon size={18} className="text-neutral-500 dark:text-neutral-400" />
      </div>
      <p className="mt-5 text-2xl font-semibold">{value}</p>
      <p
        className={`mt-1 text-xs ${good ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400"}`}
      >
        {detail}
      </p>
    </div>
  );
}
