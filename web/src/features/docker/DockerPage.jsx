import React from "react";
import {
  Activity,
  Box,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Container,
  Copy,
  Database,
  FileCode2,
  FolderOpen,
  Image,
  Layers3,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Square,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";

const tabs = [
  ["overview", "Overview", Box],
  ["containers", "Containers", Container],
  ["images", "Images", Image],
  ["volumes", "Volumes", Database],
  ["networks", "Networks", Network],
  ["compose", "Compose apps", FileCode2],
];

const initialContainers = [
  { id: "a8f1c2d3e4", name: "server-engine-mysql", image: "mysql:8.4", status: "Running", ports: "3306 → 3307", cpu: "1.8%", memory: "284 MB", uptime: "3 days" },
  { id: "c91e4a77b2", name: "server-engine-redis", image: "redis:8.6", status: "Running", ports: "6379 → 6379", cpu: "0.4%", memory: "42 MB", uptime: "3 days" },
  { id: "2d8bc03f11", name: "checkout-worker", image: "checkout-worker:latest", status: "Stopped", ports: "—", cpu: "—", memory: "—", uptime: "Exited 2 hours ago" },
];

const images = [
  ["mysql", "8.4", "421 MB", "3 days ago", "1 container"],
  ["redis", "8.6", "126 MB", "3 days ago", "1 container"],
  ["checkout-worker", "latest", "218 MB", "Yesterday", "1 container"],
  ["nginx", "1.27-alpine", "48 MB", "Sep 24", "0 containers"],
];

const volumes = [
  ["server-engine_mysql_data", "local", "4.8 GB", "server-engine-mysql"],
  ["server-engine_redis_data", "local", "64 MB", "server-engine-redis"],
  ["checkout_uploads", "local", "812 MB", "checkout-worker"],
];

const input = "mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

function Section({ title, description, actions, children }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>{description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}</div>{actions}</div><div className="mt-5">{children}</div></section>;
}

function Stat({ icon: Icon, label, value, detail, tone = "slate" }) {
  const tones = { slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400", emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400", amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400" };
  return <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><span className={`grid h-9 w-9 place-items-center rounded-md ${tones[tone]}`}><Icon size={18} /></span><strong className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</strong></div><p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p></div>;
}

function ContainerModal({ container, onClose, onSave }) {
  const editing = Boolean(container);
  const [form, setForm] = React.useState(container || { name: "", image: "", ports: "", restart: "Unless stopped", command: "" });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8"><section className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-slate-900"><div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Docker workload</p><h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{editing ? "Edit container" : "Create container"}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Define the image, ports, restart behavior, and command.</p></div><button type="button" aria-label="Close container form" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose}><X size={17} /></button></div><form className="space-y-5 p-5" onSubmit={(event) => { event.preventDefault(); onSave(form); }}><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Container name<input required className={input} value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="my-app" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Image<input required className={`${input} font-mono`} value={form.image} onChange={(event) => set("image", event.target.value)} placeholder="nginx:1.27-alpine" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Published ports<input className={input} value={form.ports} onChange={(event) => set("ports", event.target.value)} placeholder="8080:80, 8443:443" /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Restart policy<select className={input} value={form.restart} onChange={(event) => set("restart", event.target.value)}><option>Unless stopped</option><option>Always</option><option>On failure</option><option>Never</option></select></label></div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Start command<input className={`${input} font-mono`} value={form.command || ""} onChange={(event) => set("command", event.target.value)} placeholder="Optional command override" /></label><div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"><button type="button" className="cursor-pointer rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800" onClick={onClose}>Cancel</button><button type="submit" className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><CheckCircle2 size={16} />{editing ? "Save container" : "Create container"}</button></div></form></section></div>;
}

function ContainersTab({ containers, onCreate, onEdit, onAction }) {
  return <Section title="Containers" description="Run, inspect, restart, and troubleshoot Docker workloads." actions={<button type="button" className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={onCreate}><Plus size={15} />Create container</button>}><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400"><th className="px-3 py-3">Container</th><th className="px-3 py-3">Image</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Ports</th><th className="px-3 py-3">CPU / memory</th><th className="px-3 py-3" /></tr></thead><tbody>{containers.map((item) => <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800"><td className="px-3 py-4"><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.name}</p><p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{item.id}</p></td><td className="px-3 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">{item.image}</td><td className="px-3 py-4"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${item.status === "Running" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}><span className={`h-2 w-2 rounded-full ${item.status === "Running" ? "bg-emerald-500" : "bg-slate-400"}`} />{item.status}</span><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.uptime}</p></td><td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">{item.ports}</td><td className="px-3 py-4 text-xs text-slate-600 dark:text-slate-400">{item.cpu} · {item.memory}</td><td className="px-3 py-4 text-right"><div className="flex justify-end gap-3"><button type="button" className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400" onClick={() => onEdit(item)}>Inspect</button><button type="button" className="cursor-pointer text-sm text-slate-600 dark:text-slate-400" onClick={() => onAction(item)}>{item.status === "Running" ? "Stop" : "Start"}</button></div></td></tr>)}</tbody></table></div></Section>;
}

function ResourcesTab({ title, description, rows, headers, icon: Icon, action }) {
  return <Section title={title} description={description} actions={<button type="button" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{action || "Refresh"}</button>}><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">{headers.map((header) => <th key={header} className="px-3 py-3">{header}</th>)}<th className="px-3 py-3" /></tr></thead><tbody>{rows.map((row) => <tr key={row[0]} className="border-b border-slate-100 dark:border-slate-800"><td className="px-3 py-4"><div className="flex items-center gap-2"><Icon size={15} className="text-slate-400" /><span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row[0]}</span></div></td>{row.slice(1).map((value, index) => <td key={`${row[0]}-${index}`} className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">{value}</td>)}<td className="px-3 py-4 text-right"><button type="button" className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400">Inspect</button></td></tr>)}</tbody></table></div></Section>;
}

function Overview({ containers, onTab }) {
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={Container} label="Containers" value={containers.length} detail={`${containers.filter((item) => item.status === "Running").length} running`} tone="blue" /><Stat icon={Image} label="Images" value="8" detail="4.2 GB local storage" /><Stat icon={Database} label="Volumes" value="3" detail="5.7 GB persistent data" tone="emerald" /><Stat icon={Activity} label="Engine health" value="Ready" detail="Docker Engine 28.3" tone="emerald" /></div><Section title="Resource usage" description="Current Docker host utilization."><div className="grid gap-5 md:grid-cols-3">{[["CPU", "12%", "bg-blue-500", "30%"], ["Memory", "2.4 / 8 GB", "bg-emerald-500", "30%"], ["Storage", "18.6 / 80 GB", "bg-amber-500", "23%"]].map(([label, value, color, width]) => <div key={label}><div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-400">{label}</span><strong className="text-slate-900 dark:text-slate-100">{value}</strong></div><div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><span className={`block h-full rounded-full ${color}`} style={{ width }} /></div></div>)}</div></Section><div className="grid gap-5 xl:grid-cols-2"><Section title="Recent container events" description="Latest lifecycle events from the Docker engine."><div className="space-y-4">{[["server-engine-mysql", "Started", "12 minutes ago"], ["checkout-worker", "Stopped", "2 hours ago"], ["server-engine-redis", "Health check passed", "3 hours ago"]].map(([name, event, time]) => <div key={`${name}-${event}`} className="flex items-start gap-3"><span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800 dark:text-slate-200">{name} <span className="font-normal text-slate-500">· {event}</span></p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{time}</p></div></div>)}</div></Section><Section title="Common actions" description="Open the Docker tools you use most often."><div className="grid gap-2 sm:grid-cols-2"><button type="button" className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800" onClick={() => onTab("containers")}><Container size={17} className="text-blue-600" /><span><strong className="block text-sm text-slate-800 dark:text-slate-200">Inspect containers</strong><small className="text-xs text-slate-500">Logs, stats, console, restart</small></span></button><button type="button" className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800" onClick={() => onTab("compose")}><FileCode2 size={17} className="text-blue-600" /><span><strong className="block text-sm text-slate-800 dark:text-slate-200">Deploy Compose app</strong><small className="text-xs text-slate-500">Paste or manage a compose file</small></span></button></div></Section></div></div>;
}

export default function DockerPage() {
  const [tab, setTab] = React.useState("overview");
  const [containers, setContainers] = React.useState(initialContainers);
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(null);
  const save = (value) => { setContainers((current) => current.some((item) => item.id === value.id) ? current.map((item) => item.id === value.id ? { ...item, ...value } : item) : [...current, { ...value, id: Date.now().toString(), status: "Stopped", cpu: "—", memory: "—", uptime: "Created just now" }]); setModal(null); };
  const action = (item) => setContainers((current) => current.map((container) => container.id === item.id ? { ...container, status: container.status === "Running" ? "Stopped" : "Running", uptime: "Just now" } : container));
  const filtered = containers.filter((item) => `${item.name} ${item.image} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  const body = { overview: <Overview containers={containers} onTab={setTab} />, containers: <><label className="mb-4 flex max-w-md items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-slate-400 dark:border-slate-700"><Search size={15} /><input className="w-full bg-transparent text-sm text-slate-900 outline-none dark:text-slate-100" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search containers" /></label><ContainersTab containers={filtered} onCreate={() => setModal({})} onEdit={setModal} onAction={action} /></>, images: <ResourcesTab title="Images" description="Local images available for new and existing containers." headers={["Image", "Size", "Last pulled", "Used by"]} rows={images} icon={Image} action="Pull image" />, volumes: <ResourcesTab title="Volumes" description="Persistent Docker data that survives container recreation." headers={["Volume", "Driver", "Size", "Attached to"]} rows={volumes} icon={Database} action="Create volume" />, networks: <ResourcesTab title="Networks" description="Connect containers with isolated Docker networks." headers={["Network", "Driver", "Scope"]} rows={[["bridge", "bridge", "local"], ["server-engine", "bridge", "local"], ["host", "host", "local"]]} icon={Network} action="Create network" />, compose: <Section title="Compose apps" description="Manage multi-container applications from Compose projects." actions={<button type="button" className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Plus size={15} />Deploy Compose app</button>}><div className="space-y-3">{[["server-engine-stack", "3 services", "Running", "docker-compose.yml"], ["checkout-production", "2 services", "Needs attention", "compose.production.yml"]].map(([name, services, status, file]) => <div key={name} className="flex flex-col justify-between gap-3 rounded-md border border-slate-200 p-4 sm:flex-row sm:items-center dark:border-slate-800"><div><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{services} · {file}</p></div><div className="flex items-center gap-4"><span className={`text-xs font-semibold ${status === "Running" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{status}</span><button type="button" className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400">Manage</button></div></div>)}</div></Section> }[tab];
  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-medium text-blue-600 dark:text-blue-400">Services / Containers</p><h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Docker</h2><p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Manage containers, images, persistent storage, networks, and Compose applications from one workspace.</p></div><div className="flex items-center gap-2"><span className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-500" />Docker Engine available</span><button type="button" title="Refresh Docker data" aria-label="Refresh Docker data" className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RefreshCw size={15} /></button></div></div><div className="border-b border-slate-200 dark:border-slate-800"><div className="flex gap-5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}><Icon size={15} />{label}</button>)}</div></div>{body}{modal && <ContainerModal container={modal.id ? modal : null} onClose={() => setModal(null)} onSave={save} />}</div>;
}
