import React from "react";
import {
  Check,
  ChevronDown,
  Globe2,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Search,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiRequest, readApiError } from "../../lib/api";

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
const tabs = ["Domains", "DNS records", "Redirects", "TLS certificates", "Cloudflare edge", "BIND 9 DNS", "Unbound resolver"];
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
  const navigate = useNavigate();
  const [tab, setTab] = React.useState(() => window.location.hash === "#cloudflare" ? "Cloudflare edge" : window.location.hash === "#bind" ? "BIND 9 DNS" : window.location.hash === "#unbound" ? "Unbound resolver" : "Domains");
  const [domains, setDomains] = React.useState([]);
  const [dnsInstalled, setDnsInstalled] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(false);
  const [cloudflare, setCloudflare] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("serverengine:cloudflare") || "null") || { connected: false, token: "", account: "", zone: "", proxy: true, ssl: "full", waf: true, rateLimit: true, cache: "standard", trustedProxies: "" };
    } catch {
      return { connected: false, token: "", account: "", zone: "", proxy: true, ssl: "full", waf: true, rateLimit: true, cache: "standard", trustedProxies: "" };
    }
  });
  const [cloudflareMessage, setCloudflareMessage] = React.useState("");
  const [bind, setBind] = React.useState(() => { try { return JSON.parse(localStorage.getItem("serverengine:bind9") || "null") || { serverName: "ns1.example.com", listen: "0.0.0.0", port: 53, recursion: false, dnssec: true, transfers: "none", dynamicUpdates: false, queryLogging: false, forwarders: "1.1.1.1, 8.8.8.8", zoneRoot: "/server-engine/dns/zones" }; } catch { return { serverName: "ns1.example.com", listen: "0.0.0.0", port: 53, recursion: false, dnssec: true, transfers: "none", dynamicUpdates: false, queryLogging: false, forwarders: "1.1.1.1, 8.8.8.8", zoneRoot: "/server-engine/dns/zones" }; } });
  const [bindMessage, setBindMessage] = React.useState("");
  const [unbound, setUnbound] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("serverengine:unbound") || "null") || { listen: "127.0.0.1", port: 5335, access: "127.0.0.0/8, ::1", dnssec: true, forwarding: true, forwarders: "1.1.1.1@853, 8.8.8.8@853", cacheSize: "64 MB", prefetch: true, privacy: true, logging: false, tlsUpstream: true };
    } catch {
      return { listen: "127.0.0.1", port: 5335, access: "127.0.0.0/8, ::1", dnssec: true, forwarding: true, forwarders: "1.1.1.1@853, 8.8.8.8@853", cacheSize: "64 MB", prefetch: true, privacy: true, logging: false, tlsUpstream: true };
    }
  });
  const [unboundMessage, setUnboundMessage] = React.useState("");
  const [form, setForm] = React.useState({
    domain: "",
    root: "/server-engine/www/",
    type: "Addon domain",
    tls: true,
  });
  const loadDomains = React.useCallback(async () => {
    setLoading(true);
    const [domainsResponse, servicesResponse] = await Promise.all([
      apiRequest("/api/v1/domains"),
      apiRequest("/api/v1/services/installed"),
    ]);
    if (domainsResponse.ok) setDomains(await domainsResponse.json());
    else setMessage(await readApiError(domainsResponse));
    if (servicesResponse.ok) {
      const services = await servicesResponse.json();
      setDnsInstalled(services.some((item) => item.id === "powerdns" || item.id.startsWith("powerdns@")));
    }
    setLoading(false);
  }, []);
  React.useEffect(() => { loadDomains(); }, [loadDomains]);
  const filtered = domains.filter((item) =>
    item.domain.toLowerCase().includes(query.toLowerCase()),
  );
  const add = async () => {
    setMessage("");
    const response = await apiRequest("/api/v1/domains", {
      method: "POST",
      body: JSON.stringify({
        domain: form.domain,
        root: form.root,
        domain_type: form.type,
        tls: form.tls,
      }),
    });
    if (!response.ok) {
      setMessage(await readApiError(response));
      return;
    }
    const created = await response.json();
    setDomains((items) => [...items, created]);
    setForm({
      domain: "",
      root: "/server-engine/www/",
      type: "Addon domain",
      tls: true,
    });
    setModal(false);
    setMessage(`${created.domain} was added.`);
  };
  const activeTls = domains.filter((item) => item.tls === "Active").length;
  const aliases = domains.filter((item) => item.type === "Alias").length;
  if (!loading && !dnsInstalled && !["#cloudflare", "#bind", "#unbound"].includes(window.location.hash)) {
    return (
      <div className="grid min-h-[55vh] place-items-center px-5 text-center">
        <div className="max-w-md">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <Server size={22} />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            DNS management
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            PowerDNS is not installed
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Install PowerDNS to manage authoritative zones, records, and DNSSEC from this panel.
          </p>
          <button
            type="button"
            onClick={() => navigate("/services")}
            className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Install PowerDNS in Services
          </button>
        </div>
      </div>
    );
  }
  const updateCloudflare = (key, value) => setCloudflare((current) => ({ ...current, [key]: value }));
  const saveCloudflare = () => {
    localStorage.setItem("serverengine:cloudflare", JSON.stringify({ ...cloudflare, connected: Boolean(cloudflare.token && cloudflare.account) }));
    setCloudflareMessage(cloudflare.token && cloudflare.account ? "Cloudflare connection saved for this panel profile." : "Enter an account identifier and API token to connect Cloudflare.");
  };
  const updateBind = (key, value) => setBind((current) => ({ ...current, [key]: value }));
  const saveBind = () => { localStorage.setItem("serverengine:bind9", JSON.stringify(bind)); setBindMessage("BIND 9 settings saved for this panel profile."); };
  const updateUnbound = (key, value) => setUnbound((current) => ({ ...current, [key]: value }));
  const saveUnbound = () => { localStorage.setItem("serverengine:unbound", JSON.stringify(unbound)); setUnboundMessage("Unbound resolver settings saved for this panel profile."); };
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
          ["DNS health", domains.filter((item) => item.dns === "Healthy").length, "Zones resolving", ShieldCheck, "green"],
          ["TLS ready", `${activeTls} / ${domains.length}`, "Certificates active", LockKeyhole, "green"],
          ["Aliases", aliases, "Redirect destinations", ChevronDown, "slate"],
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
        {tab === "Cloudflare edge" && (
          <div className="space-y-6 p-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cloudflare edge protection</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Connect Cloudflare for DNS proxying, edge DDoS mitigation, WAF rules, rate limiting, cache policy, and origin protection. Cloudflare remains an external provider; Server Engine does not replace its edge network.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cloudflare account or email<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={cloudflare.account} onChange={(event) => updateCloudflare("account", event.target.value)} placeholder="admin@example.com" /></label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">API token<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" type="password" value={cloudflare.token} onChange={(event) => updateCloudflare("token", event.target.value)} placeholder="Cloudflare API token" /></label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Managed zone<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={cloudflare.zone} onChange={(event) => updateCloudflare("zone", event.target.value)} placeholder="example.com" /></label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">SSL/TLS mode<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={cloudflare.ssl} onChange={(event) => updateCloudflare("ssl", event.target.value)}><option value="strict">Full (strict)</option><option value="full">Full</option><option value="flexible">Flexible</option></select></label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cache policy<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={cloudflare.cache} onChange={(event) => updateCloudflare("cache", event.target.value)}><option value="standard">Standard</option><option value="aggressive">Aggressive static assets</option><option value="bypass">Bypass dynamic routes</option></select></label>
            </div>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={cloudflare.proxy} onChange={(event) => updateCloudflare("proxy", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Proxy DNS records through Cloudflare</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Hide the origin address and route HTTP traffic through Cloudflare’s edge.</span></span></label>
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={cloudflare.waf} onChange={(event) => updateCloudflare("waf", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Enable Cloudflare WAF and managed rules</span></span></label>
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={cloudflare.rateLimit} onChange={(event) => updateCloudflare("rateLimit", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Enable edge rate limiting</span></span></label>
            </div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Trusted Cloudflare proxy networks<textarea className="mt-1.5 min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-950 dark:text-slate-100" value={cloudflare.trustedProxies} onChange={(event) => updateCloudflare("trustedProxies", event.target.value)} placeholder="One CIDR range per line" /></label>
            <div className="flex items-center justify-between gap-4"><p className="text-sm text-slate-500 dark:text-slate-400">{cloudflareMessage || (cloudflare.connected ? "Cloudflare connection configured." : "Use a scoped API token; never use the global account key here.")}</p><button type="button" className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={saveCloudflare}>Save Cloudflare settings</button></div>
          </div>
        )}
        {tab === "BIND 9 DNS" && (
          <div className="space-y-6 p-5">
            <div><h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">BIND 9 authoritative DNS</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Manage authoritative zones and DNSSEC from the panel. Recursion is disabled by default so this server does not become an open resolver.</p></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nameserver identity<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={bind.serverName} onChange={(event) => updateBind("serverName", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Listen address<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={bind.listen} onChange={(event) => updateBind("listen", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">DNS port<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" type="number" min="1" max="65535" value={bind.port} onChange={(event) => updateBind("port", Number(event.target.value))} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Zone directory<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={bind.zoneRoot} onChange={(event) => updateBind("zoneRoot", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Zone transfer policy<select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={bind.transfers} onChange={(event) => updateBind("transfers", event.target.value)}><option value="none">Disabled</option><option value="trusted">Trusted secondary nameservers</option><option value="any">Any host (not recommended)</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Resolver forwarders<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={bind.forwarders} onChange={(event) => updateBind("forwarders", event.target.value)} /></label></div>
            <div className="space-y-3"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={bind.dnssec} onChange={(event) => updateBind("dnssec", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Enable DNSSEC workflow</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Generate signing material and publish DS records through the registrar workflow.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={bind.dynamicUpdates} onChange={(event) => updateBind("dynamicUpdates", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">Allow authenticated dynamic updates</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={bind.recursion} onChange={(event) => updateBind("recursion", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Enable recursion</span><span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">Only enable with strict client ACLs; public recursion is unsafe.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={bind.queryLogging} onChange={(event) => updateBind("queryLogging", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">Query logging</span></label></div>
            <div className="flex items-center justify-between gap-4"><p className="text-sm text-slate-500 dark:text-slate-400">{bindMessage || "BIND 9 configuration will be validated before the DNS service reloads."}</p><button type="button" className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={saveBind}>Save BIND 9 settings</button></div>
          </div>
        )}
        {tab === "Unbound resolver" && (
          <div className="space-y-6 p-5">
            <div><h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Unbound recursive resolver</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Provide a validating DNS resolver for the server and trusted applications. Unbound is not authoritative DNS for hosted zones; it resolves external names and caches answers.</p></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Listen address<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={unbound.listen} onChange={(event) => updateUnbound("listen", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Resolver port<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" type="number" value={unbound.port} onChange={(event) => updateUnbound("port", Number(event.target.value))} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Allowed client networks<textarea className="mt-1.5 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={unbound.access} onChange={(event) => updateUnbound("access", event.target.value)} placeholder="One CIDR range per line" /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cache size<input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={unbound.cacheSize} onChange={(event) => updateUnbound("cacheSize", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Forwarding servers<textarea className="mt-1.5 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" value={unbound.forwarders} onChange={(event) => updateUnbound("forwarders", event.target.value)} placeholder="One resolver per line" /></label></div>
            <div className="space-y-3"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.dnssec} onChange={(event) => updateUnbound("dnssec", event.target.checked)} /><span><span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Validate DNSSEC</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Reject responses that fail the DNSSEC validation chain.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.forwarding} onChange={(event) => updateUnbound("forwarding", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">Use configured forwarders</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.tlsUpstream} onChange={(event) => updateUnbound("tlsUpstream", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">Encrypt upstream DNS connections</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.prefetch} onChange={(event) => updateUnbound("prefetch", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">Prefetch popular records</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.privacy} onChange={(event) => updateUnbound("privacy", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">Privacy hardening</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.logging} onChange={(event) => updateUnbound("logging", event.target.checked)} /><span className="text-sm font-medium text-slate-900 dark:text-slate-100">Query logging</span></label></div>
            <div className="flex items-center justify-between gap-4"><p className="text-sm text-slate-500 dark:text-slate-400">{unboundMessage || "Unbound configuration will be validated before the resolver reloads."}</p><button type="button" className="inline-flex cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={saveUnbound}>Save Unbound settings</button></div>
          </div>
        )}
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
                  {loading ? (
                    <tr><td colSpan="6" className="px-5 py-12 text-center text-sm text-slate-500">Loading domains…</td></tr>
                  ) : filtered.map((item) => (
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
            {message && <p className="border-t border-slate-200 px-5 py-3 text-sm text-rose-600 dark:border-slate-800 dark:text-rose-400">{message}</p>}
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
