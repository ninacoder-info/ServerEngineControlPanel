import React from "react";
import { X } from "lucide-react";
import Button from "../../components/Button";
import Toast from "../../components/Toast";
import { apiRequest, readApiError } from "../../lib/api";
import FormField from "../../components/FormField";
import { z } from "zod";

const input = "mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100";
const providers = ["nginx", "apache", "openlitespeed", "caddy"];

function Field({ label, value, onChange, children, hint, error, tooltip }) {
  const inferredError = error || (typeof hint === "string" && /^(Enter|Install|Project name)/.test(hint) ? hint : "");
  return <FormField label={label} hint={inferredError ? undefined : hint} error={inferredError} tooltip={tooltip}>{children || <input className={input} value={value} onChange={(event) => onChange(event.target.value)} />}</FormField>;
}

const projectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required."),
  domain: z.string().trim().min(1, "Domain is required.").regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i, "Enter a valid domain."),
  project_path: z.string().trim().optional(),
  target: z.string().trim().optional(),
  node_version: z.string().trim().optional(),
  port: z.coerce.number().int().min(1, "Port must be between 1 and 65535.").max(65535, "Port must be between 1 and 65535."),
  timeout: z.coerce.number().int().min(1, "Timeout must be at least 1 second.").max(3600, "Timeout must be 3600 seconds or less."),
  server_type: z.enum(["nginx", "apache", "openlitespeed", "caddy"]),
  ssl_enabled: z.boolean(),
  websocket: z.boolean(),
});

export default function ProjectCreateModal({ mode, template, root, nodeVersions = [], onClose, onCreated }) {
  const isNode = mode === "node";
  const nodeDefaults = {
    react: { install_command: "npm install", build_command: "npm run build", run_command: "npm run dev", port: "5173" },
    nextjs: { install_command: "npm install", build_command: "npm run build", run_command: "npm run start", port: "3000" },
    express: { install_command: "npm install express", build_command: "", run_command: "node server.js", port: "3001" },
    nestjs: { install_command: "npm install", build_command: "npm run build", run_command: "npm run start:prod", port: "3000" },
  }[template?.id] || {};
  const [form, setForm] = React.useState({
    name: template?.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "",
    domain: "",
    project_path: root.replace(/\/$/, "") + "/",
    document_root: template?.documentRoot || ".",
    node_version: nodeVersions[0] || "",
    package_manager: "npm",
    install_command: nodeDefaults.install_command || "npm install",
    build_command: nodeDefaults.build_command || "npm run build",
    run_command: nodeDefaults.run_command || "npm run start",
    process_manager: "pm2",
    port: nodeDefaults.port || "3000",
    server_type: "nginx",
    ssl_enabled: false,
    target: "",
    path: "/",
    send_host: "$host",
    websocket: true,
    timeout: "60",
  });
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const set = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); };
  const updateDomain = (value) => {
    const domain = value.replace(/[^a-zA-Z0-9.-]/g, "").toLowerCase();
    setForm((current) => ({ ...current, domain, ...(isNode && (current.project_path.endsWith("/") || current.project_path.includes("/server-engine/www/")) ? { project_path: `${root.replace(/\/$/, "")}/${domain}` } : {}) }));
    setErrors((current) => ({ ...current, domain: "" }));
  };
  async function submit(event) {
    event.preventDefault();
    const validation = projectSchema.safeParse({
      ...form,
      project_path: isNode ? form.project_path : undefined,
      target: isNode ? undefined : form.target,
      node_version: isNode ? form.node_version : undefined,
    });
    const issues = validation.success ? [] : validation.error.issues;
    if (!isNode && !form.target.trim()) issues.push({ path: ["target"], message: "Enter a target URL or Unix socket." });
    if (isNode && !form.node_version) issues.push({ path: ["node_version"], message: "Install a Node.js runtime first." });
    if (issues.length) {
      setErrors(Object.fromEntries(issues.map((issue) => [issue.path[0], issue.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    const payload = isNode
      ? { ...form, template_id: template?.id || "existing", port: Number(form.port) }
      : { ...form, timeout: Number(form.timeout) };
    const response = await apiRequest(`/api/v1/projects/${isNode ? "node" : "proxy"}`, { method: "POST", body: JSON.stringify(payload) });
    if (!response.ok) {
      setToast({ type: "error", message: await readApiError(response) });
      setBusy(false);
      return;
    }
    const created = await response.json();
    onCreated(created, isNode ? "Node.js project" : "Reverse proxy");
    setBusy(false);
    onClose();
  }
  return <div className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"><form onSubmit={submit} className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-neutral-900"><div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">{isNode ? "Node.js project" : "Reverse proxy"}</p><h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{isNode ? "Create Node.js project" : "Create reverse proxy"}</h2><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{isNode ? "Prepare a project folder, runtime, process manager, and web-server route." : "Expose an existing HTTP service or Unix socket through a domain."}</p></div><button type="button" aria-label="Close" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={onClose}><X size={18} /></button></div><div className="max-h-[calc(100vh-14rem)] space-y-6 overflow-y-auto px-6 py-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Project name" value={form.name} onChange={(value) => set("name", value)} hint={errors.name} /><Field label="Domain" value={form.domain} onChange={updateDomain} hint={errors.domain} /></div><div className="grid gap-4 sm:grid-cols-2">{isNode ? <><Field label="Project folder" value={form.project_path} onChange={(value) => set("project_path", value)} hint={`Inside ${root}`} /><Field label="Document root" value={form.document_root} onChange={(value) => set("document_root", value)} /></> : <Field label="Target" value={form.target} onChange={(value) => set("target", value)} hint={errors.target || "Example: http://127.0.0.1:3000 or unix:/server-engine/run/app.sock"} />}</div>{isNode ? <><div className="grid gap-4 sm:grid-cols-3"><Field label="Node.js version" value={form.node_version} onChange={(value) => set("node_version", value)} hint={errors.node_version}><select className={input} value={form.node_version} onChange={(event) => set("node_version", event.target.value)}>{nodeVersions.length ? nodeVersions.map((version) => <option key={version} value={version}>{version}</option>) : <option value="">No installed runtimes</option>}</select></Field><Field label="Package manager"><select className={input} value={form.package_manager} onChange={(event) => set("package_manager", event.target.value)}><option>npm</option><option>pnpm</option><option>yarn</option></select></Field><Field label="Port" value={form.port} onChange={(value) => set("port", value)} /></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Install command" value={form.install_command} onChange={(value) => set("install_command", value)} /><Field label="Build command" value={form.build_command} onChange={(value) => set("build_command", value)} /><Field label="Start command" value={form.run_command} onChange={(value) => set("run_command", value)} /><Field label="Process manager"><select className={input} value={form.process_manager} onChange={(event) => set("process_manager", event.target.value)}><option value="pm2">PM2</option><option value="supervisor">Supervisor</option><option value="none">Run manually</option></select></Field></div></> : <><div className="grid gap-4 sm:grid-cols-3"><Field label="Path" value={form.path} onChange={(value) => set("path", value)} /><Field label="Send host" value={form.send_host} onChange={(value) => set("send_host", value)} /><Field label="Timeout (seconds)" value={form.timeout} onChange={(value) => set("timeout", value)} /></div><label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={form.websocket} onChange={(event) => set("websocket", event.target.checked)} /><span><strong className="block">WebSocket forwarding</strong><span className="text-xs text-neutral-500 dark:text-neutral-400">Keep upgrade headers enabled for real-time applications.</span></span></label></>}<div className="grid gap-4 sm:grid-cols-2"><Field label="Web server provider"><select className={input} value={form.server_type} onChange={(event) => set("server_type", event.target.value)}>{providers.map((provider) => <option key={provider} value={provider}>{provider === "nginx" ? "Nginx" : provider === "apache" ? "Apache HTTP Server" : provider === "openlitespeed" ? "OpenLiteSpeed" : "Caddy"}</option>)}</select></Field><label className="flex cursor-pointer items-center gap-3 self-end pb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300"><input type="checkbox" className="h-4 w-4 accent-blue-600" checked={form.ssl_enabled} onChange={(event) => set("ssl_enabled", event.target.checked)} />Enable TLS</label></div></div><div className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4 dark:border-neutral-800"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? "Creating…" : isNode ? "Create Node.js project" : "Create proxy"}</Button></div></form>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</div>;
}
