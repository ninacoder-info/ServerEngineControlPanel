import React from "react";
import { Ban, ChevronRight, Construction, FileText, Globe2, Lock, PanelTop, Save, Settings2, Shield, SlidersHorizontal, WandSparkles, Waypoints, X } from "lucide-react";
import Button from "../../components/Button";
import FormField from "../../components/FormField";
import Toast from "../../components/Toast";
import ConfigEditor from "../services/ConfigEditor";
import { apiRequest, readApiError } from "../../lib/api";
import { z } from "zod";

const input = "mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100";
const tabs = [
  ["domain", "Domain manager", Globe2],
  ["target", "Proxy", Waypoints],
  ["access", "Limit access", Lock],
  ["rewrite", "URL rewrite", WandSparkles],
  ["config", "Server config", Settings2],
  ["logs", "Logs", FileText],
  ["ssl", "SSL", Shield],
  ["redirects", "Redirects", ChevronRight],
  ["hotlink", "Hotlink", Ban],
  ["maintenance", "Maintenance", Construction],
  ["headers", "Headers", PanelTop],
  ["cache", "Cache", SlidersHorizontal],
];
const providers = ["nginx", "apache", "openlitespeed", "caddy"];
const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function Field({ label, value, onChange, error, hint, type = "text", placeholder }) {
  return <FormField label={label} error={error} hint={error ? undefined : hint}>
    <input type={type} className={input} value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </FormField>;
}

function Toggle({ checked, onChange, label, description }) {
  return <label className="flex cursor-pointer items-start gap-3 py-2">
    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
    <span><span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</span><span className="mt-0.5 block text-xs leading-4 text-neutral-500 dark:text-neutral-400">{description}</span></span>
  </label>;
}

function DomainTagsField({ domain, aliases, onChange, error }) {
  const [draft, setDraft] = React.useState("");
  const values = [domain, ...(Array.isArray(aliases) ? aliases : parseLines(aliases))].filter(Boolean);
  const add = (raw) => {
    const incoming = parseLines(String(raw || "").replace(/,/g, "\n"));
    if (!incoming.length) return;
    const next = [...values, ...incoming].filter((value, index, list) => list.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
    onChange(next[0] || "", next.slice(1));
    setDraft("");
  };
  const remove = (value) => {
    const next = values.filter((item) => item !== value);
    onChange(next[0] || "", next.slice(1));
  };
  return <div className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"><span className={error ? "text-rose-600 dark:text-rose-400" : ""}>Domains</span><p className="mt-1 text-xs font-normal text-neutral-500 dark:text-neutral-400">Add the primary domain and any aliases that should serve this proxy. Press Enter or type a comma after each domain.</p><div className={`mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-md border bg-transparent px-2 py-1.5 ${error ? "border-rose-500" : "border-neutral-300 dark:border-neutral-700"}`}>{values.map((value, index) => <span key={value} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${index === 0 ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"}`}><span className="max-w-[18rem] truncate">{value}</span>{index === 0 && <span className="text-[10px] uppercase tracking-wide opacity-70">primary</span>}<button type="button" className="cursor-pointer rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${value}`} onClick={() => remove(value)}><X size={12} /></button></span>)}<input className="min-w-[12rem] flex-1 bg-transparent px-1 py-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100" value={draft} onChange={(event) => { if (event.target.value.includes(",")) add(event.target.value); else setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(draft); } }} onBlur={() => { if (draft.trim()) add(draft); }} placeholder={values.length ? "Add another domain" : "example.com"} /></div>{error && <span className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">{error}</span>}</div>;
}

function Section({ title, description, children }) {
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>{description && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}</div>{children}</div>;
}

function parseLines(value) {
  return String(value || "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function certificateExpiry(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function ProxySslPanel({ form, set, certificate, certificateText, setCertificateText, privateKeyText, setPrivateKeyText, readFile, certificateBusy, installCertificate }) {
  if (!form.ssl_enabled) return <Section title="SSL and certificates" description="Enable HTTPS to configure a certificate for this proxy."><Toggle checked={false} onChange={(value) => set("ssl_enabled", value)} label="Enable HTTPS" description="Show certificate issuance and upload options." /></Section>;
  return <Section title="SSL and certificates" description="Issue or install a trusted certificate, then configure HTTPS behavior for this proxy."><div className="flex items-center justify-between gap-4 rounded-md bg-neutral-50 px-4 py-3 dark:bg-neutral-800"><div><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Certificate status</p><p className="mt-1 break-all text-xs text-neutral-500 dark:text-neutral-400">{certificate?.available ? certificate.certificate_path : "No certificate is attached to this proxy."}</p>{certificateExpiry(certificate?.expires_at) && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Expires {certificateExpiry(certificate?.expires_at)}</p>}</div><span className={`text-sm font-semibold ${certificate?.available ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{certificate?.available ? "Issued" : "Not issued"}</span></div><Toggle checked={form.ssl_enabled} onChange={(value) => set("ssl_enabled", value)} label="Enable HTTPS" description="Serve this proxy over TLS after a certificate is installed." /><Toggle checked={form.ssl_enforce_tls} onChange={(value) => set("ssl_enforce_tls", value)} label="Force HTTPS redirect" description="Redirect HTTP visitors to HTTPS after certificate installation succeeds." /><Toggle checked={form.ssl_allow_http} onChange={(value) => set("ssl_allow_http", value)} label="Allow HTTP" description="Keep the HTTP listener available when HTTPS is enabled and force redirect is off." /><div className="space-y-4 border-t border-neutral-200 pt-4 dark:border-neutral-800"><FormField label="Certificate method"><select className={input} value="upload" disabled><option value="upload">Upload or paste PEM files</option></select></FormField><p className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">Paste a PEM certificate and private key or select the files. Server Engine stores them for this proxy and reloads the selected provider.</p><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Certificate PEM<textarea className={`${input} min-h-28 font-mono text-xs`} value={certificateText} onChange={(event) => setCertificateText(event.target.value)} placeholder="-----BEGIN CERTIFICATE-----" /><input type="file" accept=".pem,.crt,.cer" onChange={readFile(setCertificateText)} className="mt-2 block w-full text-xs text-neutral-500" /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Private key<textarea className={`${input} min-h-28 font-mono text-xs`} value={privateKeyText} onChange={(event) => setPrivateKeyText(event.target.value)} placeholder="-----BEGIN PRIVATE KEY-----" /><input type="file" accept=".pem,.key" onChange={readFile(setPrivateKeyText)} className="mt-2 block w-full text-xs text-neutral-500" /></label><Button type="button" variant="primary" disabled={certificateBusy} onClick={installCertificate}>{certificateBusy ? "Installing…" : certificate?.available ? "Replace certificate" : "Install certificate"}</Button></div></Section>;
}

const schema = z.object({
  name: z.string().trim().min(1, "Project name is required."),
  domain: z.string().trim().regex(domainPattern, "Enter a valid domain."),
  target: z.string().trim().min(1, "Target is required."),
  path: z.string().trim().startsWith("/", "Path must start with /."),
  timeout: z.coerce.number().int().min(1).max(3600),
  cache_ttl: z.coerce.number().int().min(0).max(31536000),
  server_type: z.enum(providers),
});

export default function ProxyEditModal({ existing, serverType = "nginx", onClose, onCreated }) {
  const editing = Boolean(existing?.id);
  const [tab, setTab] = React.useState("domain");
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState({});
  const [toast, setToast] = React.useState(null);
  const [config, setConfig] = React.useState(null);
  const [configText, setConfigText] = React.useState("");
  const [configBusy, setConfigBusy] = React.useState(false);
  const [certificate, setCertificate] = React.useState(null);
  const [certificateText, setCertificateText] = React.useState("");
  const [privateKeyText, setPrivateKeyText] = React.useState("");
  const [certificateBusy, setCertificateBusy] = React.useState(false);
  const initialRedirect = Array.isArray(existing?.redirects) ? existing.redirects[0] || {} : {};
  const [redirectSource, setRedirectSource] = React.useState(initialRedirect.source_path || "");
  const [redirectTarget, setRedirectTarget] = React.useState(initialRedirect.target || "");
  const [redirectCode, setRedirectCode] = React.useState(String(initialRedirect.code || "301"));
  const [redirectKeepPath, setRedirectKeepPath] = React.useState(initialRedirect.keep_path !== false);
  const [form, setForm] = React.useState(() => ({
    name: "",
    domain: "",
    canonical_domain: "",
    rewrite_rules: "",
    target: "",
    path: "/",
    send_host: "$host",
    websocket: true,
    buffering: true,
    server_type: serverType,
    ssl_enabled: false,
    ssl_enforce_tls: false,
    ssl_allow_http: true,
    certificate_path: "",
    private_key_path: "",
    access_log_enabled: true,
    error_log_enabled: true,
    redirects: [],
    cache_enabled: false,
    maintenance_enabled: false,
    maintenance_response_code: "503",
    maintenance_message: "We'll be back shortly.",
    maintenance_start: "",
    maintenance_end: "",
    enabled: true,
    ...(existing || {}),
    aliases: Array.isArray(existing?.aliases) ? existing.aliases : parseLines(existing?.aliases),
    access_allowed_ips: Array.isArray(existing?.access_allowed_ips) ? existing.access_allowed_ips : parseLines(existing?.access_allowed_ips),
    maintenance_bypass: Array.isArray(existing?.maintenance_bypass) ? existing.maintenance_bypass : parseLines(existing?.maintenance_bypass),
    headers: existing?.headers && typeof existing.headers === "object" && !Array.isArray(existing.headers) ? existing.headers : {},
    hotlink: existing?.hotlink && typeof existing.hotlink === "object" && !Array.isArray(existing.hotlink) ? {
      enabled: Boolean(existing.hotlink.enabled),
      domains: Array.isArray(existing.hotlink.domains) ? existing.hotlink.domains : parseLines(existing.hotlink.domains),
      extensions: Array.isArray(existing.hotlink.extensions) ? existing.hotlink.extensions : parseLines(existing.hotlink.extensions),
      action: existing.hotlink.action || "403",
      redirect: existing.hotlink.redirect || "",
    } : { enabled: false, domains: [], extensions: ["jpg", "jpeg", "png", "gif", "webp", "svg"], action: "403", redirect: "" },
    timeout: String(existing?.timeout ?? 60),
    cache_ttl: String(existing?.cache_ttl ?? 300),
  }));

  const set = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); };
  const setList = (key, value) => set(key, parseLines(value));
  const updateHeader = (index, key, value) => {
    const entries = Object.entries(form.headers);
    const next = entries.map(([header, content], current) => current === index ? [key === "name" ? value : header, key === "value" ? value : content] : [header, content]);
    set("headers", Object.fromEntries(next.filter(([header]) => header.trim())));
  };
  React.useEffect(() => {
    if (tab !== "config" || !existing?.id || config) return;
    apiRequest(`/api/v1/projects/proxy/${existing.id}/configuration`).then(async (response) => {
      if (!response.ok) throw new Error(await readApiError(response));
      const value = await response.json(); setConfig(value); setConfigText(value.content || "");
    }).catch((error) => setToast({ type: "error", message: error.message || "Unable to load configuration." }));
  }, [tab, existing?.id, config]);
  React.useEffect(() => {
    if (tab !== "ssl" || !existing?.id || certificate) return;
    apiRequest(`/api/v1/projects/proxy/${existing.id}/certificate`).then(async (response) => {
      if (response.ok) setCertificate(await response.json());
    }).catch(() => {});
  }, [tab, existing?.id, certificate]);

  const readFile = (setter) => (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result || ""));
    reader.readAsText(file);
  };
  async function installCertificate() {
    setCertificateBusy(true);
    const response = await apiRequest(`/api/v1/projects/proxy/${existing.id}/certificate`, { method: "POST", body: JSON.stringify({ method: "upload", certificate: certificateText, private_key: privateKeyText }) });
    if (!response.ok) setToast({ type: "error", message: await readApiError(response) });
    else {
      const value = await response.json();
      setCertificate({ available: true, status: "issued", certificate_path: value.route?.certificate_path || "", private_key_path: value.route?.private_key_path || "" });
      setForm((current) => ({ ...current, ssl_enabled: true, certificate_path: value.route?.certificate_path || current.certificate_path, private_key_path: value.route?.private_key_path || current.private_key_path }));
      setCertificateOpen(false); setCertificateText(""); setPrivateKeyText("");
      setToast({ type: "success", message: "Certificate installed and provider reload queued." });
    }
    setCertificateBusy(false);
  }

  async function saveConfig() {
    setConfigBusy(true);
    const response = await apiRequest(`/api/v1/projects/proxy/${existing.id}/configuration`, { method: "PUT", body: JSON.stringify({ content: configText }) });
    setToast({ type: response.ok ? "success" : "error", message: response.ok ? "Server configuration saved and reload queued." : await readApiError(response) });
    setConfigBusy(false);
  }

  async function submit(event) {
    event.preventDefault();
    const result = schema.safeParse(form);
    if (!result.success) { setErrors(Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]))); return; }
    setBusy(true); setErrors({});
    const payload = { ...form, timeout: Number(form.timeout), cache_ttl: Number(form.cache_ttl), aliases: form.aliases, access_allowed_ips: form.access_allowed_ips, maintenance_bypass: form.maintenance_bypass, redirects: redirectSource.trim() || redirectTarget.trim() ? [{ source_path: redirectSource.trim() || "/", target: redirectTarget.trim(), code: redirectCode, keep_path: redirectKeepPath }] : [] };
    const response = await apiRequest(`/api/v1/projects/proxy${editing ? `/${existing.id}` : ""}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
    if (!response.ok) { setToast({ type: "error", message: await readApiError(response) }); setBusy(false); return; }
    let value = await response.json();
    if (editing && Boolean(form.enabled) !== Boolean(existing.enabled)) {
      const actionResponse = await apiRequest(`/api/v1/projects/proxy/${existing.id}/actions`, { method: "POST", body: JSON.stringify({ action: form.enabled ? "enable" : "disable" }) });
      if (!actionResponse.ok) { setToast({ type: "error", message: await readApiError(actionResponse) }); setBusy(false); return; }
      value = await actionResponse.json();
    }
    onCreated(value, "Reverse proxy", editing); setBusy(false); onClose();
  }

  const headerEntries = Object.entries(form.headers);
  return <div className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-3 sm:p-6">
    <form onSubmit={submit} className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Reverse proxy</p><h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{editing ? "Edit reverse proxy" : "Create reverse proxy"}</h2><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Manage routing, TLS, security, caching, logs, and generated server configuration.</p></div><button type="button" aria-label="Close" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={onClose}><X size={18} /></button></div>
      <div>
        <nav className="flex flex-nowrap gap-5 overflow-x-auto border-b border-neutral-200 px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">{tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`inline-flex cursor-pointer shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}><Icon size={15} />{label}</button>)}</nav>
        <div className="max-h-[calc(100vh-15rem)] overflow-y-auto px-6 py-5">
          {tab === "domain" && <Section title="Domain manager" description="Control the public hostnames served by this proxy route."><DomainTagsField domain={form.domain} aliases={form.aliases} error={errors.domain} onChange={(domain, aliases) => { set("domain", domain.toLowerCase().replace(/[^a-z0-9.-]/g, "")); set("aliases", aliases); }} /><div className="grid gap-4 sm:grid-cols-2"><Field label="Project name" value={form.name} onChange={(value) => set("name", value)} error={errors.name} /><Field label="Canonical domain" value={form.canonical_domain} onChange={(value) => set("canonical_domain", value.toLowerCase().replace(/[^a-z0-9.-]/g, ""))} placeholder={form.domain || "app.example.com"} /></div></Section>}
          {tab === "target" && <Section title="Proxy target and routing" description="Forward requests to an HTTP service or Unix socket."><Field label="Upstream target" value={form.target} onChange={(value) => set("target", value)} error={errors.target} placeholder="http://127.0.0.1:3000 or unix:/server-engine/run/app.sock" /><div className="grid gap-4 sm:grid-cols-2"><Field label="Public path" value={form.path} onChange={(value) => set("path", value)} error={errors.path} placeholder="/" /><Field label="Upstream Host header" value={form.send_host} onChange={(value) => set("send_host", value)} placeholder="$host" /></div><p className="rounded-md bg-neutral-50 p-3 text-xs leading-5 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">The target is kept server-side. The generated provider configuration forwards the client IP, original protocol, and host.</p></Section>}
          {tab === "rewrite" && <Section title="URL rewrite rules" description="Add provider-specific rules for this proxy host."><ConfigEditor path="location.conf" value={form.rewrite_rules || ""} onChange={(value) => set("rewrite_rules", value)} /></Section>}
          {tab === "ssl" && <ProxySslPanel form={form} set={set} certificate={certificate} certificateText={certificateText} setCertificateText={setCertificateText} privateKeyText={privateKeyText} setPrivateKeyText={setPrivateKeyText} readFile={readFile} certificateBusy={certificateBusy} installCertificate={installCertificate} />}
          {tab === "access" && <Section title="Access restrictions" description="Limit which client networks may reach the upstream."><Field label="Allowed IPs and CIDR networks" value={form.access_allowed_ips.join(", ")} onChange={(value) => setList("access_allowed_ips", value)} hint="Leave empty to allow all clients. Example: 203.0.113.0/24, 2001:db8::/32" /><p className="text-xs text-neutral-500 dark:text-neutral-400">The generated Nginx configuration applies allow/deny rules before proxying. Wildcard and malformed addresses are rejected by the server.</p></Section>}
         {tab === "redirects" && <Section title="Redirects" description="Save a path redirect into the active proxy configuration. The provider reloads after you save."><div className="space-y-1"><FormField label="Canonical host"><select className={input} value={form.canonical_domain || ""} onChange={(event) => set("canonical_domain", event.target.value)}><option value="">Keep all hosts available</option>{[form.domain, ...form.aliases].filter((value, index, values) => value && values.indexOf(value) === index).map((host) => <option key={host} value={host}>Use {host} as canonical</option>)}</select></FormField><p className="text-xs text-neutral-500 dark:text-neutral-400">All other configured hosts redirect to this host. Paths and query strings are preserved.</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Source path" value={redirectSource} onChange={setRedirectSource} placeholder="/old-path" /><Field label="Destination URL" value={redirectTarget} onChange={setRedirectTarget} placeholder="https://example.com/new-path" /></div><div className="grid gap-4 sm:grid-cols-2"><FormField label="Redirect type"><select className={input} value={redirectCode} onChange={(event) => setRedirectCode(event.target.value)}><option value="301">301 · Permanent</option><option value="302">302 · Temporary</option><option value="307">307 · Preserve method</option><option value="308">308 · Permanent method</option></select></FormField><Toggle checked={redirectKeepPath} onChange={setRedirectKeepPath} label="Keep query string" description="Preserve the original query string when redirecting." /></div><div className="flex flex-wrap gap-2"><button type="button" className="inline-flex cursor-pointer items-center rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-blue-500 hover:text-blue-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-blue-400 dark:hover:text-blue-400" onClick={() => { setRedirectSource("/old-path"); setRedirectTarget("/new-path"); setRedirectCode("301"); setRedirectKeepPath(true); }}>Path move</button><button type="button" className="inline-flex cursor-pointer items-center rounded-full border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:border-rose-400 dark:border-rose-900 dark:text-rose-400" onClick={() => { setRedirectSource(""); setRedirectTarget(""); }}>Remove redirect</button></div></Section>}
          {tab === "headers" && <Section title="Headers and WebSocket options" description="Control connection upgrades and additional headers sent to the upstream."><Toggle checked={form.websocket} onChange={(value) => set("websocket", value)} label="WebSocket forwarding" description="Forward Upgrade and Connection headers for realtime applications." /><div className="space-y-3">{headerEntries.map(([name, value], index) => <div key={`${name}-${index}`} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><input className={input} value={name} onChange={(event) => updateHeader(index, "name", event.target.value)} placeholder="X-App-Version" /><input className={input} value={value} onChange={(event) => updateHeader(index, "value", event.target.value)} placeholder="$http_x_app_version" /><button type="button" className="cursor-pointer text-sm font-semibold text-rose-600" onClick={() => set("headers", Object.fromEntries(headerEntries.filter((_, current) => current !== index)))}>Remove</button></div>)}</div><Button type="button" variant="secondary" onClick={() => set("headers", { ...form.headers, "": "" })}>Add header</Button></Section>}
          {tab === "cache" && <Section title="Caching, buffering, and timeouts" description="Tune upstream delivery for APIs, streaming, and larger responses."><div className="grid gap-4 sm:grid-cols-2"><Field label="Response timeout (seconds)" type="number" value={form.timeout} onChange={(value) => set("timeout", value)} error={errors.timeout} /><Field label="Cache TTL (seconds)" type="number" value={form.cache_ttl} onChange={(value) => set("cache_ttl", value)} error={errors.cache_ttl} /></div><Toggle checked={form.buffering} onChange={(value) => set("buffering", value)} label="Response buffering" description="Buffer upstream responses for steadier delivery. Disable for streaming responses." /><Toggle checked={form.cache_enabled} onChange={(value) => set("cache_enabled", value)} label="Enable proxy cache" description="Enable provider-level response caching with the configured TTL." /></Section>}
          {tab === "logs" && <Section title="Logs" description="Control per-proxy request and error logs."><div className="grid gap-4 sm:grid-cols-2"><Toggle checked={form.access_log_enabled} onChange={(value) => set("access_log_enabled", value)} label="Access log" description="Record requests handled by this proxy route." /><Toggle checked={form.error_log_enabled} onChange={(value) => set("error_log_enabled", value)} label="Error log" description="Record upstream and provider errors for this route." /></div><p className="text-xs text-neutral-500 dark:text-neutral-400">Logs are written under <code>/server-engine/logs/proxy/</code> using this route’s ID.</p></Section>}
          {tab === "maintenance" && <Section title="Maintenance mode" description="Temporarily stop forwarding traffic while keeping trusted addresses available."><Toggle checked={form.maintenance_enabled} onChange={(value) => set("maintenance_enabled", value)} label="Enable maintenance mode" description="Return the maintenance response instead of forwarding requests." /><div className="grid gap-4 sm:grid-cols-2"><FormField label="Response code"><select className={input} value={form.maintenance_response_code} onChange={(event) => set("maintenance_response_code", event.target.value)}><option value="503">503 Service Unavailable</option><option value="200">200 OK</option></select></FormField><Field label="Bypass IPs" value={form.maintenance_bypass.join(", ")} onChange={(value) => setList("maintenance_bypass", value)} /></div><FormField label="Maintenance message"><textarea className={`${input} min-h-24`} value={form.maintenance_message} onChange={(event) => set("maintenance_message", event.target.value)} /></FormField><div className="grid gap-4 sm:grid-cols-2"><Field label="Start (UTC)" type="datetime-local" value={form.maintenance_start} onChange={(value) => set("maintenance_start", value)} /><Field label="End (UTC)" type="datetime-local" value={form.maintenance_end} onChange={(value) => set("maintenance_end", value)} /></div></Section>}
          {tab === "config" && <Section title="Server config editor" description="Inspect or override the generated provider configuration. Saving queues a provider reload.">{config ? <ConfigEditor path={config.config_path || `${form.server_type || "nginx"}.conf`} value={configText} onChange={setConfigText} height="28rem" /> : <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading generated configuration…</p>}</Section>}
          {tab === "hotlink" && <Section title="Hotlink protection" description="Prevent other sites from embedding selected assets through this proxy host."><Toggle checked={form.hotlink.enabled} onChange={(value) => set("hotlink", { ...form.hotlink, enabled: value })} label="Enable hotlink protection" description="Apply referer-based protection to the configured file extensions." /><Field label="Protected extensions" value={(form.hotlink.extensions || []).join(", ")} onChange={(value) => set("hotlink", { ...form.hotlink, extensions: parseLines(value) })} hint="Example: jpg, png, webp" /><Field label="Allowed domains" value={(form.hotlink.domains || []).join(", ")} onChange={(value) => set("hotlink", { ...form.hotlink, domains: parseLines(value) })} /><div className="grid gap-4 sm:grid-cols-2"><FormField label="Action"><select className={input} value={form.hotlink.action || "403"} onChange={(event) => set("hotlink", { ...form.hotlink, action: event.target.value })}><option value="403">Return 403</option><option value="redirect">Redirect</option></select></FormField><Field label="Redirect URL" value={form.hotlink.redirect || ""} onChange={(value) => set("hotlink", { ...form.hotlink, redirect: value })} /></div></Section>}
        </div>
      </div>
      <div className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4 dark:border-neutral-800"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>{tab === "config" && editing ? <Button type="button" variant="primary" disabled={!config || configBusy} onClick={saveConfig}><Save size={15} />{configBusy ? "Saving…" : "Save configuration"}</Button> : <Button type="submit" variant="primary" disabled={busy}><Save size={15} />{busy ? "Saving…" : editing ? "Save proxy" : "Create proxy"}</Button>}</div>
    </form>
    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
  </div>;
}
