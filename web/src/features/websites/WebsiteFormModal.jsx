import React from "react";
import { Ban, Check, ChevronDown, ChevronLeft, ChevronRight, Code2, Construction, Copy, CornerUpRight, Database, Eye, EyeOff, FileText, Folder, FolderCog, GitBranch, Globe2, KeyRound, Lock, LockKeyhole, Package, RotateCcw, Save, Server, Settings2, Shield, ShieldCheck, Waypoints, WandSparkles, X } from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "../services/ConfigEditor";
import { generateSecurePassword } from "../../lib/passwords";

const empty = { name: "", domain: "", aliases: "", project_path: "/server-engine/www/", web_root: ".", php_version: "", framework: "generic_php", server_type: "nginx", ssl_enabled: false, ssl_enforce_tls: false, ssl_allow_http: true, access_allowed_ips: [], access_auth_enabled: false, access_auth_username: "", access_auth_password: "", redirects: [], proxies: [], maintenance_enabled: false, maintenance_response_code: "503", maintenance_message: "We’ll be back shortly.", maintenance_bypass: [], maintenance_start: "", maintenance_end: "", database_enabled: false, database_engine: "", database_name: "", database_user: "", notes: "", tags: "", wordpress_version: "latest", wordpress_admin_user: "", wordpress_admin_password: "", wordpress_database_prefix: "wp_", wordpress_site_title: "", laravel_version: "" };
const emptyInitialValues = {};
const providerNames = { nginx: "Nginx", apache: "Apache HTTP Server", openlitespeed: "OpenLiteSpeed", caddy: "Caddy" };
const tabs = [["site", "Website", Globe2], ["runtime", "Runtime", Server], ["security", "TLS & redirects", ShieldCheck], ["database", "Database", Database]];
const editTabs = [["site", "Domain manager", Globe2], ["php", "PHP version", Code2], ["access", "Limit access", Lock], ["rewrite", "URL rewrite", WandSparkles], ["config", "Server config", Settings2], ["ssl", "SSL", Shield], ["git", "Git manager", GitBranch], ["redirect", "Redirects", CornerUpRight], ["proxy", "Proxy", Waypoints], ["hotlink", "Hotlink", Ban], ["maintenance", "Maintenance", Construction]];
const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const splitDomainList = (value) => value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
const sanitizeDomainList = (value) => splitDomainList(value).map((item) => item.replace(/[^a-zA-Z0-9.-]/g, "").toLowerCase()).join(", ");
const normalizedRoot = (value) => (value || "/server-engine/www").replace(/\/+$/, "");
const domainProjectPath = (root, domain) => `${normalizedRoot(root)}/${domain}`;
const buttonClass = "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold";
const rewritePresets = {
  "React SPA": "try_files $uri $uri/ /index.html;",
  WordPress: "try_files $uri $uri/ /index.php?$query_string;",
  Laravel: "try_files $uri $uri/ /index.php?$query_string;",
  Symfony: "try_files $uri /index.php$is_args$args;",
  CodeIgniter: "try_files $uri $uri/ /index.php?/$uri$is_args$args;",
  "Static / PHP": "try_files $uri $uri/ =404;",
};
const applicationLabels = { wordpress: "WordPress", laravel: "Laravel", drupal: "Drupal", symfony: "Symfony", cakephp: "CakePHP", codeigniter4: "CodeIgniter 4", yii: "Yii", slim: "Slim", laminas: "Laminas" };

function Field({ label, value, onChange, error, placeholder, children }) {
  return <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"><span className={error ? "text-rose-600 dark:text-rose-400" : ""}>{label}</span>{children || <input className={`mt-1.5 w-full rounded-md border bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-1 dark:text-neutral-100 ${error ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500" : "border-neutral-300 focus:border-blue-500 focus:ring-blue-500 dark:border-neutral-700"}`} value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}{error && <span className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">{error}</span>}</label>;
}
function DomainTagsField({ domain, aliases, onChange, error }) {
  const [draft, setDraft] = React.useState("");
  const values = [domain, ...splitDomainList(aliases)].filter(Boolean);
  const add = (raw) => {
    const incoming = splitDomainList(raw.replace(/,/g, "\n"));
    if (!incoming.length) return;
    const next = [...values, ...incoming].filter((value, index, list) => list.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
    onChange(next[0] || "", next.slice(1).join(", "));
    setDraft("");
  };
  const remove = (value) => {
    const next = values.filter((item) => item !== value);
    onChange(next[0] || "", next.slice(1).join(", "));
  };
  return <div className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"><span className={error ? "text-rose-600 dark:text-rose-400" : ""}>Domains</span><p className="mt-1 text-xs font-normal text-neutral-500 dark:text-neutral-400">Add the primary domain and any aliases that should serve this project. Press Enter or type a comma after each domain.</p><div className={`mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-md border bg-transparent px-2 py-1.5 ${error ? "border-rose-500" : "border-neutral-300 dark:border-neutral-700"}`}>{values.map((value, index) => <span key={value} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${index === 0 ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"}`}><span className="max-w-[18rem] truncate">{value}</span>{index === 0 && <span className="text-[10px] uppercase tracking-wide opacity-70">primary</span>}<button type="button" className="cursor-pointer rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${value}`} onClick={() => remove(value)}><X size={12} /></button></span>)}<input className="min-w-[12rem] flex-1 bg-transparent px-1 py-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100" value={draft} onChange={(event) => { if (event.target.value.includes(",")) add(event.target.value); else setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(draft); } }} onBlur={() => { if (draft.trim()) add(draft); }} placeholder={values.length ? "Add another domain" : "example.com"} /></div>{error && <span className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">{error}</span>}</div>;
}
function SelectField({ label, value, onChange, children, error }) {
  return <Field label={label} error={error}><select className={`mt-1.5 w-full rounded-md border bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:ring-1 dark:bg-neutral-900 dark:text-neutral-100 ${error ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500" : "border-neutral-300 focus:border-blue-500 focus:ring-blue-500 dark:border-neutral-700"}`} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>{label === "PHP-FPM version" && <p className="mt-1 text-xs font-normal text-neutral-500 dark:text-neutral-400">Use the newest installed PHP runtime for the latest WordPress and application compatibility.</p>}</Field>;
}
function CheckRow({ checked, onChange, label, description, divided = true }) {
  return <label className={`flex cursor-pointer items-start gap-3 py-2 ${divided ? "border-b border-neutral-200 last:border-b-0 dark:border-neutral-800" : ""}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600" /><span><span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</span><span className="mt-0.5 block text-xs leading-4 text-neutral-500 dark:text-neutral-400">{description}</span></span></label>;
}
function Summary({ icon: Icon, title, children }) {
  return <div className="flex items-start gap-3 border-b border-neutral-200 py-3 last:border-b-0 dark:border-neutral-800"><Icon size={17} className="mt-0.5 shrink-0 text-blue-600" /><div><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</p><p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">{children}</p></div></div>;
}

function WebsiteServerConfig({ siteId, serverType, onActions }) {
  const [config, setConfig] = React.useState(null);
  const [content, setContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  React.useEffect(() => {
    let active = true;
    apiRequest(`/api/v1/websites/${siteId}/configuration?server_type=${encodeURIComponent(serverType)}`).then((response) => response.ok ? response.json() : null).then((value) => { if (active) setConfig(value); }).catch(() => { if (active) setConfig(null); });
    return () => { active = false; };
  }, [siteId, serverType]);
  React.useEffect(() => { if (config) setContent(config.content || ""); }, [config]);
  const configNames = { nginx: "nginx.conf", apache: "httpd.conf", openlitespeed: "vhost.conf", caddy: "Caddyfile" };
  async function save() {
    setSaving(true); setNotice("");
    const response = await apiRequest(`/api/v1/websites/${siteId}/configuration?server_type=${encodeURIComponent(serverType)}`, { method: "PUT", body: JSON.stringify({ content }) });
    setNotice(response.ok ? "Configuration saved. Reload queued." : await readApiError(response));
    if (response.ok) setConfig((value) => ({ ...value, content, has_previous: true }));
    setSaving(false);
  }
  async function restore(target) {
    setRestoreOpen(false); setSaving(true); setNotice("");
    const response = await apiRequest(`/api/v1/websites/${siteId}/configuration/restore?server_type=${encodeURIComponent(serverType)}`, { method: "POST", body: JSON.stringify({ restore: target }) });
    if (response.ok) { const value = await response.json(); setContent(value.content || ""); setConfig((current) => ({ ...current, ...value })); setNotice(`${target === "previous" ? "Previous edit" : "Original configuration"} restored. Reload queued.`); } else setNotice(await readApiError(response));
    setSaving(false);
  }
  React.useEffect(() => {
    onActions?.({ save, restore, saving, ready: Boolean(config), hasPrevious: Boolean(config?.has_previous) });
    return () => onActions?.(null);
  }, [config, saving, content, siteId, serverType]);
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{providerNames[serverType]} website profile</h3><code className="mt-2 block break-all text-xs text-neutral-500 dark:text-neutral-400">{config?.config_path || "Loading configuration path…"}</code></div>{notice && <p className={`text-sm ${notice.includes("saved") || notice.includes("restored") ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{notice}</p>}<ConfigEditor path={configNames[serverType] || "server.conf"} value={content || "Loading website configuration…"} onChange={setContent} /></div>;
}

function WebsiteSslPanel({ siteId, form, change }) {
  const [certificate, setCertificate] = React.useState(null);
  const [method, setMethod] = React.useState("acme");
  const [email, setEmail] = React.useState("");
  const [staging, setStaging] = React.useState(false);
  const [certificateText, setCertificateText] = React.useState("");
  const [privateKey, setPrivateKey] = React.useState("");
  const [chain, setChain] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [jobId, setJobId] = React.useState("");
  React.useEffect(() => {
    let active = true;
    apiRequest(`/api/v1/websites/${siteId}/certificate`).then((response) => response.ok ? response.json() : null).then((value) => { if (active) setCertificate(value); }).catch(() => {});
    return () => { active = false; };
  }, [siteId]);
  React.useEffect(() => {
    const onJob = (event) => {
      const job = event.detail?.job;
      if (!job || job.id !== jobId) return;
      setBusy(job.status === "queued" || job.status === "running");
      if (["succeeded", "failed", "cancelled"].includes(job.status)) {
        setMessage(job.message || `Certificate job ${job.status}.`);
        if (job.status === "succeeded") apiRequest(`/api/v1/websites/${siteId}/certificate`).then((response) => response.ok ? response.json() : null).then((value) => value && setCertificate(value)).catch(() => {});
      }
    };
    window.addEventListener("serverengine:jobs-updated", onJob);
    return () => window.removeEventListener("serverengine:jobs-updated", onJob);
  }, [jobId, siteId]);
  const readFile = (setter) => (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result || ""));
    reader.readAsText(file);
  };
  async function requestCertificate() {
    setBusy(true); setMessage("");
    const response = await apiRequest(`/api/v1/websites/${siteId}/certificate`, { method: "POST", body: JSON.stringify({ method, email, staging, certificate: certificateText, private_key: privateKey, chain }) });
    if (!response.ok) { setMessage(await readApiError(response)); setBusy(false); return; }
    const value = await response.json();
    setJobId(value.job?.id || "");
    setMessage("Certificate job queued. Keep this dialog open to see the result.");
    change("ssl_enabled", true);
  }
  const statusLabel = certificate?.available ? (certificate.status === "issued" ? "Issued" : certificate.status) : "Not issued";
  if (!form.ssl_enabled) return <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">SSL and certificates</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Enable HTTPS to configure a certificate for this website.</p></div><CheckRow divided={false} checked={false} onChange={(value) => change("ssl_enabled", value)} label="Enable HTTPS" description="Show certificate issuance and upload options." /></div>;
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">SSL and certificates</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Issue a trusted certificate with ACME or install a certificate and private key you already have.</p></div><div className="flex items-center justify-between gap-4 rounded-md bg-neutral-50 px-4 py-3 dark:bg-neutral-800"><div><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Certificate status</p><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{certificate?.available ? certificate.certificate_path : "No certificate is attached to this website."}</p></div><span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{statusLabel}</span></div><CheckRow divided={false} checked={form.ssl_enabled} onChange={(value) => change("ssl_enabled", value)} label="Enable HTTPS" description="Serve this website over TLS after a certificate is installed." /><CheckRow divided={false} checked={form.ssl_enforce_tls} onChange={(value) => change("ssl_enforce_tls", value)} label="Force HTTPS redirect" description="Redirect HTTP visitors to HTTPS after certificate issuance succeeds." /><div className="space-y-4 border-t border-neutral-200 pt-4 dark:border-neutral-800"><SelectField label="Certificate method" value={method} onChange={setMethod}><option value="acme">Let's Encrypt / ACME</option><option value="upload">Upload or paste PEM files</option></SelectField>{method === "acme" ? <><Field label="Certificate account email (optional)" value={email} onChange={setEmail} placeholder="admin@example.com" /><CheckRow divided={false} checked={staging} onChange={setStaging} label="Use ACME staging" description="Test validation without issuing a trusted production certificate." /></> : <div className="space-y-4"><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Certificate PEM<textarea className="mt-1.5 min-h-28 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 font-mono text-xs text-neutral-900 outline-none dark:border-neutral-700 dark:text-neutral-100" value={certificateText} onChange={(event) => setCertificateText(event.target.value)} placeholder="-----BEGIN CERTIFICATE-----" /><input type="file" accept=".pem,.crt,.cer" onChange={readFile(setCertificateText)} className="mt-2 block w-full text-xs text-neutral-500" /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Private key<textarea className="mt-1.5 min-h-28 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 font-mono text-xs text-neutral-900 outline-none dark:border-neutral-700 dark:text-neutral-100" value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} placeholder="-----BEGIN PRIVATE KEY-----" /><input type="file" accept=".pem,.key" onChange={readFile(setPrivateKey)} className="mt-2 block w-full text-xs text-neutral-500" /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Intermediate chain <span className="font-normal text-neutral-500">optional</span><textarea className="mt-1.5 min-h-20 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 font-mono text-xs text-neutral-900 outline-none dark:border-neutral-700 dark:text-neutral-100" value={chain} onChange={(event) => setChain(event.target.value)} placeholder="Optional CA bundle PEM" /></label></div>}<button type="button" disabled={busy} className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50`} onClick={requestCertificate}>{busy ? "Working…" : method === "acme" ? "Issue certificate" : "Install certificate"}</button>{message && <p className="text-sm text-neutral-600 dark:text-neutral-300">{message}</p>}</div></div>;
}

function WebsiteHotlinkPanel({ form, change }) {
  const current = form.hotlink || {};
  const [enabled, setEnabled] = React.useState(Boolean(current.enabled));
  const [extensions, setExtensions] = React.useState((current.extensions || ["jpg", "jpeg", "png", "gif", "webp", "svg"]).join(", "));
  const [domains, setDomains] = React.useState((current.domains || []).join(", "));
  const [allowEmpty, setAllowEmpty] = React.useState(current.allow_empty !== false);
  const [action, setAction] = React.useState(current.action || "403");
  const [redirect, setRedirect] = React.useState(current.redirect || "");
  const update = (changes) => {
    const next = { enabled, extensions, domains: splitDomainList(domains), allow_empty: allowEmpty, action, redirect, ...changes };
    change("hotlink", next);
    if (Object.hasOwn(changes, "enabled")) setEnabled(changes.enabled);
    if (Object.hasOwn(changes, "extensions")) setExtensions(changes.extensions);
    if (Object.hasOwn(changes, "domains")) setDomains(changes.domains);
    if (Object.hasOwn(changes, "allow_empty")) setAllowEmpty(changes.allow_empty);
    if (Object.hasOwn(changes, "action")) setAction(changes.action);
    if (Object.hasOwn(changes, "redirect")) setRedirect(changes.redirect);
  };
  React.useEffect(() => {
    if (!form.hotlink || Object.keys(form.hotlink).length === 0) return;
    setEnabled(Boolean(form.hotlink.enabled));
    setExtensions((form.hotlink.extensions || []).join(", "));
    setDomains((form.hotlink.domains || []).join(", "));
    setAllowEmpty(form.hotlink.allow_empty !== false);
    setAction(form.hotlink.action || "403");
    setRedirect(form.hotlink.redirect || "");
  }, [form.hotlink]);
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Hotlink protection</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Block other websites from embedding your protected files. Save to apply the active web-server rule.</p></div><CheckRow divided={false} checked={enabled} onChange={(value) => update({ enabled: value })} label="Enable hotlink protection" description="Validate the Referer header before serving matching files." /><Field label="Protected file extensions"><input value={extensions} onChange={(event) => update({ extensions: event.target.value })} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="jpg, jpeg, png, gif, webp" /></Field><Field label="Additional allowed referrers"><input value={domains} onChange={(event) => update({ domains: event.target.value })} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="cdn.example.com, partner.example.com" /></Field><CheckRow divided={false} checked={allowEmpty} onChange={(value) => update({ allow_empty: value })} label="Allow direct requests" description="Allow requests with no Referer header." /><div className="flex flex-wrap gap-5"><label className="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"><input type="radio" checked={action === "403"} onChange={() => update({ action: "403" })} className="h-4 w-4 accent-blue-600" />403 Forbidden</label><label className="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"><input type="radio" checked={action === "redirect"} onChange={() => update({ action: "redirect" })} className="h-4 w-4 accent-blue-600" />Redirect</label></div>{action === "redirect" && <Field label="Redirect URL"><input value={redirect} onChange={(event) => update({ redirect: event.target.value })} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="https://example.com/blocked-hotlink" /></Field>}</div>;
}

function EditWebsiteTab({ tab, form, change, serverType, siteId, phpVersions = [], onActions }) {
  const [indexFiles, setIndexFiles] = React.useState("index.php, index.html, index.htm");
  const initialRedirect = form.redirects?.[0] || {};
  const [redirectSource, setRedirectSource] = React.useState(initialRedirect.source_path || "/");
  const [redirectTarget, setRedirectTarget] = React.useState(initialRedirect.target || "");
  const [redirectCode, setRedirectCode] = React.useState(initialRedirect.code || "301");
  const [redirectKeepPath, setRedirectKeepPath] = React.useState(initialRedirect.keep_path !== false);
  React.useEffect(() => {
    const saved = form.redirects?.[0];
    if (!saved || saved.target === redirectTarget) return;
    setRedirectSource(saved.source_path || "/");
    setRedirectTarget(saved.target || "");
    setRedirectCode(saved.code || "301");
    setRedirectKeepPath(saved.keep_path !== false);
  }, [form.redirects, redirectTarget]);
  const updateRedirect = (changes) => {
    const next = { source_path: redirectSource, target: redirectTarget, code: redirectCode, keep_path: redirectKeepPath, ...changes };
    if (next.target.trim()) change("redirects", [{ ...next, source_path: next.source_path || "/" }]);
    else change("redirects", []);
    if (Object.hasOwn(changes, "source_path")) setRedirectSource(changes.source_path);
    if (Object.hasOwn(changes, "target")) setRedirectTarget(changes.target);
    if (Object.hasOwn(changes, "code")) setRedirectCode(changes.code);
    if (Object.hasOwn(changes, "keep_path")) setRedirectKeepPath(changes.keep_path);
  };
  const initialProxy = form.proxies?.[0] || {};
  const [proxyTarget, setProxyTarget] = React.useState(initialProxy.target || "");
  const [proxyPath, setProxyPath] = React.useState(initialProxy.path || "/");
  const [proxyWebSockets, setProxyWebSockets] = React.useState(initialProxy.websockets !== false);
  const [proxyBuffering, setProxyBuffering] = React.useState(initialProxy.buffering !== false);
  const [proxyTimeout, setProxyTimeout] = React.useState(initialProxy.timeout || "60");
  const updateProxy = (changes) => {
    const next = { target: proxyTarget, path: proxyPath, websockets: proxyWebSockets, buffering: proxyBuffering, timeout: proxyTimeout, ...changes };
    if (next.target.trim()) change("proxies", [{ ...next, path: next.path || "/" }]);
    else change("proxies", []);
    if (Object.hasOwn(changes, "target")) setProxyTarget(changes.target);
    if (Object.hasOwn(changes, "path")) setProxyPath(changes.path);
    if (Object.hasOwn(changes, "websockets")) setProxyWebSockets(changes.websockets);
    if (Object.hasOwn(changes, "buffering")) setProxyBuffering(changes.buffering);
    if (Object.hasOwn(changes, "timeout")) setProxyTimeout(changes.timeout);
  };
  React.useEffect(() => {
    const saved = form.proxies?.[0];
    if (!saved || saved.target === proxyTarget) return;
    setProxyTarget(saved.target || "");
    setProxyPath(saved.path || "/");
    setProxyWebSockets(saved.websockets !== false);
    setProxyBuffering(saved.buffering !== false);
    setProxyTimeout(saved.timeout || "60");
  }, [form.proxies, proxyTarget]);
  const [certificateMethod, setCertificateMethod] = React.useState("acme");
  const [certificateAutoRenew, setCertificateAutoRenew] = React.useState(true);
  const [certificateHsts, setCertificateHsts] = React.useState(false);
  const [certificateOcsp, setCertificateOcsp] = React.useState(true);
  const [tlsProfile, setTlsProfile] = React.useState("modern");
  const [hotlinkEnabled, setHotlinkEnabled] = React.useState(false);
  const [hotlinkExtensions, setHotlinkExtensions] = React.useState("jpg, jpeg, png, gif, webp, svg");
  const [hotlinkDomains, setHotlinkDomains] = React.useState("");
  const [hotlinkAllowEmpty, setHotlinkAllowEmpty] = React.useState(true);
  const [hotlinkAction, setHotlinkAction] = React.useState("403");
  const [hotlinkRedirect, setHotlinkRedirect] = React.useState("");
  const updateHotlink = (changes) => {
    const next = { enabled: hotlinkEnabled, extensions: hotlinkExtensions, domains: splitDomainList(hotlinkDomains), allow_empty: hotlinkAllowEmpty, action: hotlinkAction, redirect: hotlinkRedirect, ...changes };
    change("hotlink", next);
    if (Object.hasOwn(changes, "enabled")) setHotlinkEnabled(changes.enabled);
    if (Object.hasOwn(changes, "extensions")) setHotlinkExtensions(changes.extensions);
    if (Object.hasOwn(changes, "domains")) setHotlinkDomains(changes.domains);
    if (Object.hasOwn(changes, "allow_empty")) setHotlinkAllowEmpty(changes.allow_empty);
    if (Object.hasOwn(changes, "action")) setHotlinkAction(changes.action);
    if (Object.hasOwn(changes, "redirect")) setHotlinkRedirect(changes.redirect);
  };
  React.useEffect(() => {
    const saved = form.hotlink;
    if (!saved || Object.keys(saved).length === 0) return;
    setHotlinkEnabled(Boolean(saved.enabled));
    setHotlinkExtensions((saved.extensions || []).join(", "));
    setHotlinkDomains((saved.domains || []).join(", "));
    setHotlinkAllowEmpty(saved.allow_empty !== false);
    setHotlinkAction(saved.action || "403");
    setHotlinkRedirect(saved.redirect || "");
  }, [form.hotlink]);
  const applyRewritePreset = (name) => change("rewrite_rules", rewritePresets[name]);
  if (tab === "access") return <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Access restrictions</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Restrict this website by client network and optionally require HTTP Basic Authentication.</p></div><Field label="Allowed IP addresses"><input value={(form.access_allowed_ips || []).join(", ")} onChange={(event) => change("access_allowed_ips", splitDomainList(event.target.value))} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="203.0.113.10, 198.51.100.0/24" /><span className="mt-1 block text-xs font-normal text-neutral-500 dark:text-neutral-400">Only these addresses and networks can access the website. Leave empty to allow all.</span></Field><CheckRow divided={false} checked={form.access_auth_enabled} onChange={(value) => change("access_auth_enabled", value)} label="Require HTTP authentication" description="Protect the website with a username and password before serving content." />{form.access_auth_enabled && <div className="grid gap-4 border-t border-neutral-200 pt-4 dark:border-neutral-800 sm:grid-cols-2"><Field label="Username" value={form.access_auth_username} onChange={(value) => change("access_auth_username", value)} placeholder="admin" /><Field label="Password" value={form.access_auth_password} onChange={(value) => change("access_auth_password", value)} placeholder="Leave blank to keep the current password"><input type="password" className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" value={form.access_auth_password || ""} onChange={(event) => change("access_auth_password", event.target.value)} placeholder="Leave blank to keep the current password" /></Field></div>}<div className="border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">Hidden files such as .env and .git are always blocked by the generated server configuration.</div></div>;
  if (tab === "rewrite") return <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">URL rewrite rules</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Rules are inserted into this website’s request location and applied after saving.</p></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Application preset</p><div className="flex flex-wrap gap-2">{Object.keys(rewritePresets).map((name) => <button type="button" key={name} className="inline-flex cursor-pointer items-center rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-blue-500 hover:text-blue-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-blue-400 dark:hover:text-blue-400" onClick={() => applyRewritePreset(name)}>{name}</button>)}</div></div><ConfigEditor path="location.conf" value={form.rewrite_rules} onChange={(value) => change("rewrite_rules", value)} /></div>;
  if (tab === "config") return <WebsiteServerConfig siteId={siteId} serverType={serverType} onActions={onActions} />;
  if (tab === "ssl") return <WebsiteSslPanel siteId={siteId} form={form} change={change} />;
  if (tab === "hotlink") return <WebsiteHotlinkPanel form={form} change={change} />;
  if (tab === "ssl") return <div className="space-y-3"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">SSL and certificates</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Secure this website and all configured domain aliases with HTTPS.</p></div><div className="flex items-center justify-between gap-4 rounded-md bg-neutral-50 px-4 py-3 dark:bg-neutral-800"><div><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Certificate status</p><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">No certificate has been issued for this website yet.</p></div><span className="text-sm font-semibold text-amber-600 dark:text-amber-400">Not issued</span></div><CheckRow divided={false} checked={form.ssl_enabled} onChange={(value) => change("ssl_enabled", value)} label="Enable HTTPS" description="Serve this website over TLS when the certificate is ready." /><CheckRow divided={false} checked={form.ssl_enforce_tls} onChange={(value) => change("ssl_enforce_tls", value)} label="Force HTTPS redirect" description="Redirect every HTTP request to the secure URL with a permanent redirect." /><div className="space-y-4"><div><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Certificate coverage</p><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">The certificate will cover the primary domain and configured aliases.</p></div><div className="flex flex-wrap gap-2">{[form.domain, ...form.aliases.split(",").map((item) => item.trim()).filter(Boolean)].filter(Boolean).map((domain) => <span key={domain} className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">{domain}</span>)}</div></div><div className="space-y-4"><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Issuance and renewal</p><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Certificate method" value={certificateMethod} onChange={setCertificateMethod}><option value="acme">Let’s Encrypt · automatic</option><option value="manual">Upload certificate</option></SelectField><SelectField label="TLS profile" value={tlsProfile} onChange={setTlsProfile}><option value="modern">Modern · TLS 1.2 and 1.3</option><option value="compatible">Compatible · broader clients</option></SelectField></div><CheckRow divided={false} checked={certificateAutoRenew} onChange={setCertificateAutoRenew} label="Automatic renewal" description="Renew before expiry and reload the active web server after validation." /></div><div className="space-y-3"><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Advanced TLS</p><CheckRow divided={false} checked={certificateHsts} onChange={setCertificateHsts} label="HSTS" description="Tell browsers to use HTTPS for future visits. Enable only after HTTPS is confirmed." /><CheckRow divided={false} checked={certificateOcsp} onChange={setCertificateOcsp} label="OCSP stapling" description="Improve certificate validation performance when supported by the web server." /></div><div className="flex flex-wrap gap-3"><button type="button" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} onClick={() => change("ssl_enabled", true)}>Issue certificate</button><button type="button" className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap px-1 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">View certificate details</button></div></div>;
  if (tab === "php") return <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">PHP runtime</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Choose the installed PHP-FPM runtime used by this website. OPcache is configured globally for each PHP runtime.</p></div><SelectField label="PHP-FPM version" value={form.php_version} onChange={(value) => change("php_version", value)}><option value="">Static site / no PHP</option>{phpVersions.map((version) => <option key={version} value={version}>PHP {version}</option>)}</SelectField>{!phpVersions.length && <p className="text-sm text-amber-600 dark:text-amber-400">No PHP-FPM runtimes are installed yet.</p>}</div>;
  if (tab === "git") return <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Git deployment</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Connect a repository and deploy updates into this project folder.</p></div><Field label="Repository URL"><input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700 dark:text-neutral-100" placeholder="https://github.com/example/project.git" /></Field><Field label="Branch"><input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700 dark:text-neutral-100" placeholder="main" /></Field></div>;
  if (tab === "composer") return <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Composer deployment</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Install and maintain PHP dependencies for this website.</p></div><CheckRow checked={true} onChange={() => {}} label="Install dependencies on deploy" description="Run composer install with the managed Composer runtime after deployment." /><CheckRow checked={false} onChange={() => {}} label="Production mode" description="Use --no-dev and optimize the Composer autoloader." /></div>;
  if (tab === "redirect") return <div className="space-y-3"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Redirects</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Save a path redirect into the active web-server configuration. The server reloads after you save.</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Source path"><input value={redirectSource} onChange={(event) => updateRedirect({ source_path: event.target.value })} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="/old-path" /></Field><Field label="Destination URL"><input value={redirectTarget} onChange={(event) => updateRedirect({ target: event.target.value })} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="https://example.com/new-path" /></Field></div><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Redirect type" value={redirectCode} onChange={(value) => updateRedirect({ code: value })}><option value="301">301 · Permanent</option><option value="302">302 · Temporary</option><option value="307">307 · Preserve method</option><option value="308">308 · Permanent method</option></SelectField><CheckRow divided={false} checked={redirectKeepPath} onChange={(value) => updateRedirect({ keep_path: value })} label="Keep query string" description="Preserve the original query string when redirecting." /></div><div className="flex flex-wrap gap-2"><button type="button" className="inline-flex cursor-pointer items-center rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-blue-500 hover:text-blue-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-blue-400 dark:hover:text-blue-400" onClick={() => updateRedirect({ source_path: "/", target: `https://${form.domain || "example.com"}`, code: "301", keep_path: true })}>Canonical domain</button><button type="button" className="inline-flex cursor-pointer items-center rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-blue-500 hover:text-blue-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-blue-400 dark:hover:text-blue-400" onClick={() => updateRedirect({ source_path: "/old-path", target: "/new-path", code: "301", keep_path: true })}>Path move</button><button type="button" className="inline-flex cursor-pointer items-center rounded-full border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:border-rose-400 dark:border-rose-900 dark:text-rose-400" onClick={() => updateRedirect({ target: "" })}>Remove redirect</button></div></div>;
  if (tab === "proxy") return <div className="space-y-3"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Proxy</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Forward a path to a Node.js, Python, Docker, or other HTTP application. Save to generate the active web-server rule.</p></div><div className="flex flex-wrap gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Common upstreams</span>{["Node.js · 3000", "Python · 8000", "API · 8080"].map((preset) => <button type="button" key={preset} className="inline-flex cursor-pointer items-center rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-blue-500 hover:text-blue-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-blue-400 dark:hover:text-blue-400" onClick={() => updateProxy({ target: `http://127.0.0.1:${preset.endsWith("3000") ? "3000" : preset.endsWith("8000") ? "8000" : "8080"}` })}>{preset}</button>)}</div><div className="grid gap-4 sm:grid-cols-2"><Field label="Upstream URL"><input value={proxyTarget} onChange={(event) => updateProxy({ target: event.target.value })} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="http://127.0.0.1:3000" /></Field><Field label="Public path"><input value={proxyPath} onChange={(event) => updateProxy({ path: event.target.value })} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="/app" /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Response timeout (seconds)"><input type="number" min="1" value={proxyTimeout} onChange={(event) => updateProxy({ timeout: event.target.value })} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" /></Field><div className="space-y-1"><CheckRow divided={false} checked={proxyWebSockets} onChange={(value) => updateProxy({ websockets: value })} label="WebSocket support" description="Forward Upgrade and Connection headers for realtime apps." /><CheckRow divided={false} checked={proxyBuffering} onChange={(value) => updateProxy({ buffering: value })} label="Response buffering" description="Buffer upstream responses for steadier delivery." /></div></div><div className="flex gap-2"><button type="button" className="inline-flex cursor-pointer items-center rounded-full border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 dark:border-rose-900 dark:text-rose-400" onClick={() => updateProxy({ target: "" })}>Remove proxy</button></div><Summary icon={Globe2} title="Forwarded headers">Host, client IP, protocol, and forwarded-for headers are enabled by default.</Summary></div>;
  if (tab === "hotlink") return <div className="space-y-3"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Hotlink protection</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Stop other websites from embedding or consuming your images and static assets without permission.</p></div><CheckRow divided={false} checked={hotlinkEnabled} onChange={setHotlinkEnabled} label="Enable hotlink protection" description="Check the request referrer before serving protected file types." /><div className="space-y-4"><div><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Protected files</p><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Use extensions separated by commas. These are the assets most commonly targeted for bandwidth theft.</p></div><Field label="File extensions"><input value={hotlinkExtensions} onChange={(event) => setHotlinkExtensions(event.target.value)} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="jpg, jpeg, png, gif, webp" /></Field><div className="flex flex-wrap gap-2">{["Images", "Video", "Downloads"].map((preset) => <button type="button" key={preset} className="inline-flex cursor-pointer items-center rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-blue-500 hover:text-blue-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-blue-400 dark:hover:text-blue-400" onClick={() => setHotlinkExtensions(preset === "Images" ? "jpg, jpeg, png, gif, webp, svg" : preset === "Video" ? "mp4, webm, mov, m4v" : "zip, pdf, mp3, mp4")}>{preset}</button>)}</div></div><div className="space-y-4"><div><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Allowed referrers</p><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Your primary domain and aliases are trusted automatically. Add CDN or campaign domains here.</p></div><Field label="Additional domains"><input value={hotlinkDomains} onChange={(event) => setHotlinkDomains(event.target.value)} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="cdn.example.com, partner.example.com" /></Field><CheckRow divided={false} checked={hotlinkAllowEmpty} onChange={setHotlinkAllowEmpty} label="Allow direct requests" description="Allow visitors who open the asset URL directly without a referrer." /></div><div className="space-y-4"><div><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Blocked request action</p><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Choose what an untrusted referrer receives.</p></div><div className="flex flex-wrap gap-5"><label className="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"><input type="radio" name="hotlink-action" value="403" checked={hotlinkAction === "403"} onChange={(event) => setHotlinkAction(event.target.value)} className="h-4 w-4 cursor-pointer accent-blue-600" />403 Forbidden</label><label className="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"><input type="radio" name="hotlink-action" value="redirect" checked={hotlinkAction === "redirect"} onChange={(event) => setHotlinkAction(event.target.value)} className="h-4 w-4 cursor-pointer accent-blue-600" />Redirect</label></div>{hotlinkAction === "redirect" && <Field label="Redirect URL"><input value={hotlinkRedirect} onChange={(event) => setHotlinkRedirect(event.target.value)} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="https://example.com/blocked-hotlink" /></Field>}</div></div>;
  if (tab === "maintenance") return <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Maintenance</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Temporarily take this website out of service while you deploy, migrate, or repair it.</p></div><CheckRow divided={false} checked={form.maintenance_enabled} onChange={(value) => change("maintenance_enabled", value)} label="Enable maintenance mode" description="Visitors receive the maintenance response instead of the application. Your configured bypass addresses remain available." /><div className="space-y-4 border-t border-neutral-200 pt-4 dark:border-neutral-800"><div><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Visitor response</p><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Choose the status returned while maintenance is active.</p></div><div className="flex flex-wrap gap-5"><label className="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"><input type="radio" name="maintenance-status" value="503" checked={form.maintenance_response_code === "503"} onChange={(event) => change("maintenance_response_code", event.target.value)} className="h-4 w-4 cursor-pointer accent-blue-600" />503 Service Unavailable</label><label className="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"><input type="radio" name="maintenance-status" value="200" checked={form.maintenance_response_code === "200"} onChange={(event) => change("maintenance_response_code", event.target.value)} className="h-4 w-4 cursor-pointer accent-blue-600" />200 OK</label></div><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Maintenance message<textarea value={form.maintenance_message} onChange={(event) => change("maintenance_message", event.target.value)} rows="3" className="mt-1.5 w-full resize-y rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="We’ll be back shortly." /></label></div><div className="space-y-4 border-t border-neutral-200 pt-4 dark:border-neutral-800"><div><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Access exceptions</p><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Allow trusted office, VPN, or deployment addresses to view the live site during maintenance.</p></div><Field label="Allowed IP addresses"><input value={(form.maintenance_bypass || []).join(", ")} onChange={(event) => change("maintenance_bypass", splitDomainList(event.target.value))} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" placeholder="203.0.113.10, 198.51.100.0/24" /></Field></div><div className="space-y-4 border-t border-neutral-200 pt-4 dark:border-neutral-800"><div><p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Schedule</p><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Leave blank to activate immediately when enabled, or define a UTC window.</p></div><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Start (UTC)<input type="datetime-local" value={form.maintenance_start} onChange={(event) => change("maintenance_start", event.target.value)} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">End (UTC)<input type="datetime-local" value={form.maintenance_end} onChange={(event) => change("maintenance_end", event.target.value)} className="mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100" /></label></div></div></div>;
  return null;
}

export function FolderPicker({ value, defaultRoot, onSelect, onClose }) {
  const [current, setCurrent] = React.useState(value || defaultRoot);
  const [data, setData] = React.useState({ directories: [], parent: null });
  const [newFolder, setNewFolder] = React.useState("");
  const [error, setError] = React.useState("");
  const [pathLoaded, setPathLoaded] = React.useState(false);
  const load = React.useCallback(() => {
    setPathLoaded(false);
    setError("");
    return apiRequest(`/api/v1/websites/directories?path=${encodeURIComponent(current)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response));
        setData(await response.json());
        setPathLoaded(true);
      })
      .catch((reason) => {
        if (current !== defaultRoot) {
          setCurrent(defaultRoot);
          setError("That folder no longer exists. Showing the website root instead.");
        } else {
          setError(reason.message);
        }
      });
  }, [current, defaultRoot]);
  React.useEffect(() => { load(); }, [load]);
  async function createFolder(event) {
    event.preventDefault();
    if (!pathLoaded || !newFolder.trim()) return;
    const response = await apiRequest("/api/v1/websites/directories", { method: "POST", body: JSON.stringify({ path: current, name: newFolder.trim() }) });
    if (!response.ok) setError(await readApiError(response));
    else { setNewFolder(""); load(); }
  }
  return <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"><section className="w-full max-w-xl rounded-xl bg-white shadow-xl dark:bg-neutral-900"><div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Choose project folder</h3><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Only folders inside the website root are available.</p></div><button type="button" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={onClose}><X size={17} /></button></div><div className="space-y-4 px-5 py-5"><div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 ${error ? "border-rose-500 dark:border-rose-500" : "border-neutral-300 dark:border-neutral-700"}`}><Folder size={16} className={error ? "text-rose-600 dark:text-rose-400" : "text-blue-600"} /><span className="min-w-0 flex-1 truncate">{current}</span><button type="button" disabled={!pathLoaded} className="cursor-pointer text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => onSelect(current)}>Select</button></div>{error && <p className="-mt-2 text-xs font-normal text-rose-600 dark:text-rose-400">{error}</p>}{data.parent && <button type="button" className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100" onClick={() => setCurrent(data.parent)}><ChevronLeft size={15} />Parent folder</button>}<div className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">{data.directories.length ? data.directories.map((item) => <button type="button" key={item.path} className="flex w-full cursor-pointer items-center gap-3 py-3 text-left text-sm text-neutral-700 hover:text-blue-600 dark:text-neutral-300 dark:hover:text-blue-400" onClick={() => setCurrent(item.path)}><Folder size={16} />{item.name}</button>) : <p className="py-5 text-sm text-neutral-500 dark:text-neutral-400">No folders here yet.</p>}</div><form className="flex gap-2" onSubmit={createFolder}><input className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:text-neutral-100" value={newFolder} onChange={(event) => setNewFolder(event.target.value)} placeholder="New folder name" disabled={!pathLoaded} /><button type="submit" disabled={!pathLoaded} className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300`}>Create folder</button></form></div></section></div>;
}

export default function WebsiteFormModal({ site, defaultRoot, phpVersions = [], databaseEngines = [], serverType = "nginx", webServerOptions = [], initialValues = emptyInitialValues, onClose, onSaved }) {
  const [form, setForm] = React.useState(empty);
  const [tab, setTab] = React.useState("site");
  const [folderOpen, setFolderOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState({});
  const [runningDirectories, setRunningDirectories] = React.useState(["."]);
  const [wordpressVersions, setWordpressVersions] = React.useState(["latest"]);
  const [laravelVersions, setLaravelVersions] = React.useState([]);
  const [showWordpressPassword, setShowWordpressPassword] = React.useState(false);
  const [copyNotice, setCopyNotice] = React.useState("");
  const [serverConfigActions, setServerConfigActions] = React.useState(null);
  const [serverConfigRestoreOpen, setServerConfigRestoreOpen] = React.useState(false);
  const autoProjectPath = React.useRef("");
  const editing = Boolean(site?.id);
  const deploymentTemplate = !editing && applicationLabels[initialValues.application_template] ? initialValues.application_template : "";
  const latestPhp = phpVersions.map((item) => item.version || item).filter(Boolean).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] || "";
  React.useEffect(() => {
    const root = normalizedRoot(defaultRoot);
    const initialPath = site?.id ? site.project_path : `${root}/`;
    autoProjectPath.current = initialPath;
    setForm(site?.id ? { ...empty, ...site, aliases: site.aliases.join(", "), tags: site.tags.join(", ") } : { ...empty, ...initialValues, database_enabled: deploymentTemplate === "wordpress" ? true : Boolean(initialValues.database_enabled), project_path: initialValues.project_path || initialPath, server_type: initialValues.server_type || serverType, php_version: initialValues.php_version ?? latestPhp });
    setTab("site"); setError(""); setFieldErrors({}); setShowWordpressPassword(false); setCopyNotice(""); setServerConfigActions(null); setServerConfigRestoreOpen(false);
  }, [site, defaultRoot, serverType, latestPhp, initialValues]);
  React.useEffect(() => {
    if (deploymentTemplate !== "wordpress") return undefined;
    let active = true;
    apiRequest("/api/v1/websites/wordpress/versions")
      .then((response) => (response.ok ? response.json() : null))
      .then((versions) => {
        if (active && Array.isArray(versions) && versions.length) setWordpressVersions(versions);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [deploymentTemplate]);
  React.useEffect(() => {
    if (deploymentTemplate !== "laravel") return undefined;
    let active = true;
    apiRequest("/api/v1/websites/laravel/versions")
      .then((response) => (response.ok ? response.json() : null))
      .then((versions) => {
        if (active && Array.isArray(versions)) setLaravelVersions(versions);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [deploymentTemplate]);
  React.useEffect(() => {
    if (!form.project_path) return undefined;
    let active = true;
    apiRequest(`/api/v1/websites/directories?path=${encodeURIComponent(form.project_path)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (!active || !value) return;
        const root = value.path.replace(/\\/g, "/").replace(/\/$/, "");
        const options = [".", ...value.directories.map((item) => {
          const path = item.path.replace(/\\/g, "/");
          return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : item.name;
        })];
        setRunningDirectories([...new Set(options)]);
        setForm((current) => options.includes(current.web_root) ? current : { ...current, web_root: "." });
      })
      .catch(() => active && setRunningDirectories(["."]));
    return () => { active = false; };
  }, [form.project_path]);
  const change = (key, value) => { setForm((current) => ({ ...current, [key]: deploymentTemplate === "wordpress" && key === "database_enabled" ? true : value })); setFieldErrors((current) => ({ ...current, [key]: "" })); };
  function changeDomain(value) {
    const domain = value.replace(/[^a-zA-Z0-9.-]/g, "").toLowerCase();
    setForm((current) => {
      const root = normalizedRoot(defaultRoot);
      const stillAutomatic = !editing && (current.project_path === autoProjectPath.current || current.project_path === `${root}/` || !current.project_path);
      const nextPath = stillAutomatic && domainPattern.test(domain) ? domainProjectPath(root, domain) : current.project_path;
      if (stillAutomatic) autoProjectPath.current = nextPath;
      return { ...current, domain, project_path: nextPath, ...(!editing && deploymentTemplate === "wordpress" && !current.database_name ? { database_name: domain.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^([^A-Za-z_])/, "wp_$1") } : {}) };
    });
    setFieldErrors((current) => ({ ...current, domain: "" }));
  }
  function validate() { const next = {}; const aliases = splitDomainList(form.aliases); const invalidAlias = aliases.find((alias) => !domainPattern.test(alias)); if (invalidAlias) next.aliases = `Invalid domain: ${invalidAlias}`; if (aliases.some((alias) => alias.toLowerCase() === form.domain.trim().toLowerCase())) next.aliases = "An additional domain cannot duplicate the primary domain."; const databaseRequired = deploymentTemplate === "wordpress" || form.database_enabled; if (!form.domain.trim()) next.domain = "Enter the primary domain."; else if (!domainPattern.test(form.domain.trim())) next.domain = "Enter a valid domain such as example.com."; if (!form.project_path.trim()) next.project_path = "Choose a project folder."; if (!form.web_root.trim()) next.web_root = "Choose a running directory."; if (deploymentTemplate === "wordpress" && !form.wordpress_admin_user.trim()) next.wordpress_admin_user = "Enter the WordPress administrator username."; if (deploymentTemplate === "wordpress" && form.wordpress_admin_password.length < 10) next.wordpress_admin_password = "Use at least 10 characters for the administrator password."; if (databaseRequired && !form.database_engine) next.database_engine = "Start MySQL and choose it before deploying WordPress."; if (databaseRequired && !form.database_name.trim()) next.database_name = "Enter the WordPress database name."; if (databaseRequired && !form.database_user.trim()) next.database_user = "Enter the database owner username."; if (deploymentTemplate === "wordpress" && !form.wordpress_database_prefix.trim()) next.wordpress_database_prefix = "Enter a table prefix."; setFieldErrors(next); if (next.domain || next.aliases || next.project_path || next.web_root) setTab("site"); else if (deploymentTemplate === "wordpress" && (next.wordpress_admin_user || next.wordpress_admin_password || next.database_engine || next.database_name || next.database_user)) setTab("application"); else if (next.database_engine || next.database_name || next.database_user) setTab("database"); return Object.keys(next).length === 0; }
  async function submit(event) { event.preventDefault(); if (!validate()) return; setBusy(true); setError(""); const payload = { ...form, database_enabled: deploymentTemplate === "wordpress" ? true : form.database_enabled, name: editing ? form.name || form.domain : form.domain, aliases: splitDomainList(form.aliases).map((item) => item.trim()).filter(Boolean), tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean) }; const deploying = !editing && initialValues.application_template; const endpoint = editing ? `/api/v1/websites/${site.id}` : deploying ? "/api/v1/websites/deploy" : "/api/v1/websites"; const requestPayload = deploying ? { ...payload, application_template: initialValues.application_template, database_engine: initialValues.database_engine || payload.database_engine || "", database_password: initialValues.database_password || "", laravel_version: form.laravel_version || initialValues.laravel_version || "" } : payload; const response = await apiRequest(endpoint, { method: editing ? "PATCH" : "POST", body: JSON.stringify(requestPayload) }); if (!response.ok) setError(await readApiError(response)); else { const result = await response.json(); onSaved(deploying ? result.website : result, result.job || null, { keepOpen: editing }); if (!editing) onClose(); } setBusy(false); }
  if (!site) return null;
  const phpOptions = phpVersions.map((item) => item.version || item).filter(Boolean);
  const activeTabs = editing ? editTabs : deploymentTemplate ? [...(deploymentTemplate === "wordpress" ? tabs.filter(([id]) => id !== "database") : tabs), ["application", "Application", Package]] : tabs;
  const generateWordpressPassword = () => change("wordpress_admin_password", generateSecurePassword());
  const copyWordpressPassword = async () => {
    if (!form.wordpress_admin_password || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(form.wordpress_admin_password);
      setCopyNotice("Administrator password copied.");
      window.setTimeout(() => setCopyNotice(""), 2200);
    } catch {
      // Clipboard access can be blocked by the browser security context.
    }
  };
  const wizardSteps = ["site", "runtime", "application"];
  const wizardNext = async () => {
    if (tab === "site") {
      const aliases = splitDomainList(form.aliases);
      const invalidAlias = aliases.find((alias) => !domainPattern.test(alias) || alias.toLowerCase() === form.domain.trim().toLowerCase());
      const next = {};
      if (!form.domain.trim()) next.domain = "Enter the primary domain.";
      else if (!domainPattern.test(form.domain.trim())) next.domain = "Enter a valid domain such as example.com.";
      if (invalidAlias) next.aliases = "Enter valid, unique domain aliases.";
      if (!form.project_path.trim()) next.project_path = "Choose a project folder.";
      setFieldErrors(next);
      if (Object.keys(next).length) {
        return;
      }
      setBusy(true);
      try {
        const response = await apiRequest(`/api/v1/websites/directories/status?path=${encodeURIComponent(form.project_path)}`);
        const status = response.ok ? await response.json() : null;
        if (!response.ok || (status?.exists && (!status.is_directory || !status.is_empty))) {
          setFieldErrors((current) => ({ ...current, project_path: status?.exists ? "Project folder is not empty. Choose a new domain or project folder." : "The project folder could not be verified." }));
          return;
        }
        setTab("runtime");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (tab === "runtime") {
      const next = {};
      if (!form.php_version) next.php_version = "Select an installed PHP runtime before continuing.";
      if (deploymentTemplate === "wordpress") {
        if (!form.database_engine) next.database_engine = "Start MySQL and choose it before deploying WordPress.";
        if (!form.database_name.trim()) next.database_name = "Enter the WordPress database name.";
        if (!form.database_user.trim()) next.database_user = "Enter the database owner username.";
        if (!form.wordpress_database_prefix.trim()) next.wordpress_database_prefix = "Enter a table prefix.";
      }
      setFieldErrors(next);
      if (Object.keys(next).length) {
        return;
      }
      setError("");
      setTab("application");
      return;
    }
    if (tab === "application" && deploymentTemplate === "wordpress") {
      const next = {};
      if (!form.wordpress_site_title.trim()) next.wordpress_site_title = "Enter a site title.";
      if (!form.notes.trim()) next.notes = "Enter a site description.";
      setFieldErrors(next);
      if (Object.keys(next).length) return;
    }
    submit({ preventDefault: () => {} });
  };
  const wizardBack = () => setTab(wizardSteps[Math.max(0, wizardSteps.indexOf(tab) - 1)]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      {copyNotice && <div className="fixed right-5 top-5 z-[70] rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{copyNotice}</div>}
      <form className={`w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-neutral-900 ${deploymentTemplate ? "[&_h3]:hidden [&_h3+p]:hidden" : ""}`} onSubmit={submit}>
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">{deploymentTemplate ? "Application deployment" : "Web hosting"}</p><h2 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{editing ? "Edit website" : deploymentTemplate ? `Deploy ${applicationLabels[deploymentTemplate]}` : "Create website"}</h2>{!editing && !deploymentTemplate && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Set the domain, folder, runtime, and TLS behavior for this website.</p>}</div>
          <button type="button" aria-label="Close website form" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-200" onClick={onClose}><X size={18} /></button>
        </div>
        <div>
          {deploymentTemplate && <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-3 dark:border-neutral-800 dark:bg-neutral-950"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Step {tab === "site" ? "1" : tab === "runtime" ? "2" : "3"} of 3</p><p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{tab === "site" ? "Domain and TLS" : tab === "runtime" ? "PHP runtime and database" : "Application setup"}</p></div>}
          {!deploymentTemplate && <div className="flex flex-nowrap gap-5 overflow-x-auto border-b border-neutral-200 px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">
            {activeTabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`inline-flex cursor-pointer shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}><Icon size={15} />{label}</button>)}
          </div>}
          <div className="max-h-[calc(100vh-15rem)] overflow-y-auto px-6 py-5">
            {tab === "site" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Domain and TLS</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Choose where this website will be served and how visitors should connect.</p></div><DomainTagsField domain={form.domain} aliases={form.aliases} error={fieldErrors.domain || fieldErrors.aliases} onChange={(domain, aliases) => { changeDomain(domain); change("aliases", aliases); }} /><Field label="Project folder" value={form.project_path} onChange={(value) => change("project_path", value)} error={fieldErrors.project_path} placeholder="/server-engine/www/example.com"><div className="mt-1.5 flex gap-2"><input readOnly className={`min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none dark:text-neutral-100 ${fieldErrors.project_path ? "border-rose-500" : "border-neutral-300 dark:border-neutral-700"}`} value={form.project_path} /><button type="button" className={`${buttonClass} border border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300`} onClick={() => setFolderOpen(true)}><Folder size={15} />Browse</button></div></Field><div className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800"><div><h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">TLS and redirects</h4><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Configure HTTPS behavior for this domain.</p></div><CheckRow checked={form.ssl_enforce_tls} onChange={(value) => { change("ssl_enforce_tls", value); if (value) change("ssl_enabled", true); }} label="Force HTTPS" description="Redirect HTTP visitors to the secure URL." /></div></div>}
            {error && <div className="mb-5 border-b border-rose-200 pb-3 text-sm text-rose-600 dark:border-rose-900 dark:text-rose-400">{error}</div>}
            {tab === "application" && deploymentTemplate === "wordpress" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">WordPress setup</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Choose the administrator account and site title.</p></div><div className="space-y-4"><Field label="Site title" value={form.wordpress_site_title} onChange={(value) => change("wordpress_site_title", value)} error={fieldErrors.wordpress_site_title} placeholder={form.domain || "My website"} /><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"><span className={fieldErrors.notes ? "text-rose-600 dark:text-rose-400" : ""}>Site description</span><textarea className={`mt-1.5 min-h-24 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-1 dark:text-neutral-100 ${fieldErrors.notes ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500" : "border-neutral-300 focus:border-blue-500 focus:ring-blue-500 dark:border-neutral-700"}`} value={form.notes} onChange={(event) => change("notes", event.target.value)} placeholder="A short description of this website" rows={4} />{fieldErrors.notes && <span className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">{fieldErrors.notes}</span>}</label></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Administrator username" value={form.wordpress_admin_user} onChange={(value) => change("wordpress_admin_user", value.replace(/[^A-Za-z0-9_-]/g, ""))} error={fieldErrors.wordpress_admin_user} placeholder="admin" /><Field label="Administrator password" value={form.wordpress_admin_password} onChange={(value) => change("wordpress_admin_password", value)} error={fieldErrors.wordpress_admin_password}><div className="relative mt-1.5"><input type={showWordpressPassword ? "text" : "password"} className={`w-full rounded-md border bg-transparent px-3 py-2 pr-28 text-sm text-neutral-900 outline-none dark:text-neutral-100 ${fieldErrors.wordpress_admin_password ? "border-rose-500" : "border-neutral-300 dark:border-neutral-700"}`} value={form.wordpress_admin_password} onChange={(event) => change("wordpress_admin_password", event.target.value)} placeholder="At least 10 characters" /><div className="absolute inset-y-0 right-1 flex items-center gap-0.5"><button type="button" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100" onClick={() => setShowWordpressPassword((value) => !value)} title={showWordpressPassword ? "Hide password" : "Show password"} aria-label={showWordpressPassword ? "Hide password" : "Show password"}>{showWordpressPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button><button type="button" disabled={!form.wordpress_admin_password} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100" onClick={copyWordpressPassword} title="Copy password" aria-label="Copy password"><Copy size={15} /></button><button type="button" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100" onClick={generateWordpressPassword} title="Generate secure password" aria-label="Generate secure password"><KeyRound size={15} /></button></div></div></Field></div></div>}
            {tab === "application" && deploymentTemplate && deploymentTemplate !== "wordpress" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{applicationLabels[deploymentTemplate]} setup</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Server Engine will create the project with Composer, configure its document root, and queue the deployment.</p></div>{deploymentTemplate === "laravel" && <Summary icon={Package} title="Laravel project">{form.laravel_version ? `Laravel ${form.laravel_version} will be installed.` : "The newest compatible Laravel release will be installed."}</Summary>}<Summary icon={FolderCog} title="Project folder">{form.project_path}</Summary><Summary icon={Database} title="Database">{form.database_enabled ? `${form.database_engine || "Selected"} will be provisioned and connected.` : deploymentTemplate === "laravel" ? "Laravel will use a local SQLite database." : "No database will be provisioned; configure the application after deployment."}</Summary></div>}
            {tab === "runtime" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">PHP runtime and database</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Choose the PHP runtime for this application. Database attachment is optional for Composer projects.</p></div><div className="grid gap-4 sm:grid-cols-2"><SelectField label="PHP-FPM version" value={form.php_version} onChange={(value) => change("php_version", value)}><option value="">Static site / no PHP</option>{phpOptions.map((version) => <option key={version} value={version}>PHP {version}</option>)}</SelectField>{deploymentTemplate === "wordpress" && <SelectField label="WordPress version" value={form.wordpress_version} onChange={(value) => change("wordpress_version", value)}>{wordpressVersions.map((version) => <option key={version} value={version}>{version === "latest" ? "Latest stable release" : version}</option>)}</SelectField>}{deploymentTemplate === "laravel" && <SelectField label="Laravel version" value={form.laravel_version} onChange={(value) => change("laravel_version", value)}><option value="">Latest compatible release</option>{laravelVersions.map((version) => <option key={version} value={version}>Laravel {version}</option>)}</SelectField>}</div>{deploymentTemplate !== "wordpress" && <div className="space-y-4 border-t border-neutral-200 pt-4 dark:border-neutral-800"><CheckRow checked={form.database_enabled} onChange={(value) => change("database_enabled", value)} label="Attach a MySQL database" description={deploymentTemplate === "laravel" ? "Optional. If disabled, Laravel is configured with its own SQLite database." : "Optional. Server Engine will create a MySQL database and owner during deployment."} />{form.database_enabled && <div className="grid gap-4 sm:grid-cols-2"><SelectField label="Database engine" value={form.database_engine} error={fieldErrors.database_engine} onChange={(value) => change("database_engine", value)}><option value="">Choose MySQL</option>{databaseEngines.filter((item) => item.id === "mysql" && item.installed && item.running).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField><Field label="Database name" value={form.database_name} onChange={(value) => change("database_name", value)} error={fieldErrors.database_name} placeholder="example_db" /><Field label="Database owner" value={form.database_user} onChange={(value) => change("database_user", value.replace(/[^A-Za-z0-9_$-]/g, ""))} error={fieldErrors.database_user} placeholder="example_user" /></div>}</div>}{deploymentTemplate === "wordpress" && <div className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800"><div><h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Required database</h4><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Start MySQL first. WordPress cannot be installed without a database connection.</p></div><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Engine" value={form.database_engine} error={fieldErrors.database_engine} onChange={(value) => change("database_engine", value)}><option value="">Choose MySQL</option>{databaseEngines.filter((item) => item.id === "mysql" && item.installed && item.running).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField><Field label="Database name" value={form.database_name} onChange={(value) => change("database_name", value)} error={fieldErrors.database_name} placeholder="wordpress_db" /><Field label="Database owner" value={form.database_user} onChange={(value) => change("database_user", value.replace(/[^A-Za-z0-9_$-]/g, ""))} error={fieldErrors.database_user} placeholder="wordpress" /><Field label="Database table prefix" error={fieldErrors.wordpress_database_prefix} value={form.wordpress_database_prefix} onChange={(value) => change("wordpress_database_prefix", value.replace(/[^A-Za-z0-9_]/g, ""))} placeholder="wp_" /></div></div>}</div>}
            {tab === "security" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">TLS and redirects</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Choose whether this website should always use HTTPS.</p></div><CheckRow checked={form.ssl_enforce_tls} onChange={(value) => { change("ssl_enforce_tls", value); if (value) change("ssl_enabled", true); }} label="Force HTTPS" description="Enable TLS and permanently redirect HTTP visitors to the secure URL." /></div>}
            {tab === "database" && <div className="space-y-5"><div><h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{deploymentTemplate === "wordpress" ? "WordPress database" : "Database attachment"}</h3><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{deploymentTemplate === "wordpress" ? "WordPress requires a running MySQL service. Server Engine will create the database and owner during deployment." : "Create the database, user, and application connection during deployment."}</p></div>{deploymentTemplate === "wordpress" ? <Summary icon={Database} title="Required for WordPress">Start MySQL before deploying. This setup cannot be completed without a database.</Summary> : <CheckRow checked={form.database_enabled} onChange={(value) => change("database_enabled", value)} label="Attach a database" description="Create the database, user, and application connection during deployment." />}{(deploymentTemplate === "wordpress" || form.database_enabled) && <div className="grid gap-4 sm:grid-cols-2"><SelectField label="Database engine" value={form.database_engine} error={fieldErrors.database_engine} onChange={(value) => change("database_engine", value)}><option value="">Choose a running engine</option>{databaseEngines.filter((item) => item.id === "mysql" && item.installed && item.running).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField><Field label="Database name" value={form.database_name} onChange={(value) => change("database_name", value)} error={fieldErrors.database_name} placeholder={deploymentTemplate === "wordpress" ? "wordpress_db" : "example_db"} /><Field label="Database user" value={form.database_user} onChange={(value) => change("database_user", value)} error={fieldErrors.database_user} placeholder={deploymentTemplate === "wordpress" ? "wordpress" : "example_user"} /></div>}</div>}
            {editing && <EditWebsiteTab tab={tab} form={form} change={change} serverType={serverType} siteId={site.id} phpVersions={phpOptions} onActions={setServerConfigActions} />}
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4 dark:border-neutral-800"><button type="button" className={`${buttonClass} border border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300`} onClick={onClose}>Cancel</button>{deploymentTemplate ? <><button type="button" disabled={tab === "site" || busy} className={`${buttonClass} border border-neutral-300 text-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300`} onClick={wizardBack}><ChevronLeft size={15} />Previous</button><button type="button" disabled={busy} className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50`} onClick={wizardNext}>{tab === "application" ? `Deploy ${applicationLabels[deploymentTemplate]}` : "Next"}<ChevronRight size={15} /></button></> : tab === "config" && editing ? <><div className="relative"><button type="button" disabled={!serverConfigActions?.ready || serverConfigActions?.saving} className={`${buttonClass} border border-neutral-300 text-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300`} onClick={() => setServerConfigRestoreOpen((value) => !value)}><RotateCcw size={15} />Restore<ChevronDown size={14} /></button>{serverConfigRestoreOpen && <div className="absolute bottom-11 right-0 z-10 min-w-44 rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"><button type="button" disabled={!serverConfigActions?.hasPrevious || serverConfigActions?.saving} className="flex w-full cursor-pointer rounded px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-800" onClick={() => { setServerConfigRestoreOpen(false); serverConfigActions?.restore("previous"); }}>Previous edit</button><button type="button" disabled={serverConfigActions?.saving} className="flex w-full cursor-pointer rounded px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-800" onClick={() => { setServerConfigRestoreOpen(false); serverConfigActions?.restore("original"); }}>Original configuration</button></div>}</div><button type="button" disabled={!serverConfigActions?.ready || serverConfigActions?.saving} className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50`} onClick={() => serverConfigActions?.save()}><Save size={15} />{serverConfigActions?.saving ? "Saving…" : "Save"}</button></> : <button type="submit" className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`} disabled={busy}><Save size={15} />{busy ? "Saving…" : editing ? "Save" : "Create website"}</button>}</div>
      </form>
      {folderOpen && <FolderPicker value={form.project_path} defaultRoot={defaultRoot} onSelect={(path) => { change("project_path", path); setFolderOpen(false); }} onClose={() => setFolderOpen(false)} />}
    </div>
  );
}
