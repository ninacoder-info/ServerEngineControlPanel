import React from "react";
import { Cpu, HardDrive, MemoryStick, Network } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useTranslation } from "../../lib/i18n";

function formatBytes(value) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1024) return `${value.toFixed(0)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = -1;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 100 ? amount.toFixed(0) : amount >= 10 ? amount.toFixed(1) : amount.toFixed(2)} ${units[unit]}`;
}

function Sparkline({
  values,
  color = "text-blue-500",
  fill = "fill-blue-500/10",
}) {
  const safeValues = values.filter((value) => Number.isFinite(value));
  const points = safeValues.length > 1 ? safeValues : safeValues.length === 1 ? [0, safeValues[0]] : [0, 0];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const line = points
    .map(
      (value, index) =>
        `${(index / (points.length - 1)) * 100},${34 - ((value - min) / range) * 28}`,
    )
    .join(" ");
  const area = `0,38 ${line} 100,38`;
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="h-12 w-full overflow-visible"
      aria-hidden="true"
    >
      <polygon points={area} className={`${fill} opacity-60`} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={color}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Metric({ icon: Icon, label, value, detail, values, color, fill }) {
  const { t } = useTranslation();
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Icon size={17} />
          </span>
          {label}
        </div>
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
          {t("dashboard.liveFiveMinutes")}
        </span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {detail}
          </p>
        </div>
        <div className="w-24 shrink-0">
          <Sparkline values={values} color={color} fill={fill} />
        </div>
      </div>
    </article>
  );
}

export default function ResourceMetricCards() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = React.useState(null);
  const [history, setHistory] = React.useState({
    cpu: [],
    memory: [],
    disk: [],
    network: [],
  });

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await apiRequest("/api/v1/metrics");
      if (!response.ok || !active) return;
      const next = await response.json();
      setMetrics(next);
      setHistory((previous) => ({
        cpu: [...previous.cpu, next.cpu.percent].slice(-60),
        memory: [...previous.memory, next.memory.percent].slice(-60),
        disk: [...previous.disk, next.disk.percent].slice(-60),
        network: [
          ...previous.network,
          next.network.download + next.network.upload,
        ].slice(-60),
      }));
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const cpu = metrics?.cpu;
  const memory = metrics?.memory;
  const disk = metrics?.disk;
  const network = metrics?.network;
  return (
    <section
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="System resources"
    >
      <Metric
        icon={Cpu}
        label="CPU"
        value={cpu ? `${cpu.percent.toFixed(1)}%` : "—"}
        detail={cpu ? `${t("dashboard.load")} ${cpu.load.toFixed(2)}` : t("dashboard.collectingSample")}
        values={history.cpu}
        color="text-blue-500"
        fill="fill-blue-500/10"
      />
      <Metric
        icon={MemoryStick}
        label="Memory"
        value={memory ? `${memory.percent.toFixed(1)}%` : "—"}
        detail={
          memory
            ? `${formatBytes(memory.used)} of ${formatBytes(memory.total)}`
            : t("dashboard.collectingSample")
        }
        values={history.memory}
        color="text-violet-500"
        fill="fill-violet-500/10"
      />
      <Metric
        icon={HardDrive}
        label="Disk"
        value={disk ? `${disk.percent.toFixed(1)}%` : "—"}
        detail={
          disk
            ? `${formatBytes(disk.used)} of ${formatBytes(disk.total)}`
            : t("dashboard.collectingSample")
        }
        values={history.disk}
        color="text-amber-500"
        fill="fill-amber-500/10"
      />
      <Metric
        icon={Network}
        label="Network"
        value={network ? `↓ ${formatBytes(network.download)}/s` : "—"}
        detail={
          network
            ? `↑ ${formatBytes(network.upload)}/s ${t("dashboard.downloadUpload")}`
            : t("dashboard.collectingSample")
        }
        values={history.network}
        color="text-emerald-500"
        fill="fill-emerald-500/10"
      />
    </section>
  );
}
