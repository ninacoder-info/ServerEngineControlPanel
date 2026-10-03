import React from "react";
import { z } from "zod";
import {
  Check,
  ChevronDown,
  Copy,
  CornerUpRight,
  ExternalLink,
  Globe2,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ServiceNotInstalledState from "../../components/ServiceNotInstalledState";
import { useServiceInstallationState } from "../../hooks/useServiceInstallationState";
import FormField from "../../components/FormField";

const tabs = ["Domains", "DNS records", "Redirects", "TLS certificates", "Cloudflare edge", "BIND 9 DNS", "Unbound resolver"];
const domainSchema = z.object({
  domain: z.string().trim().min(3, "Enter a domain name.").max(253, "Domain name is too long.").regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i, "Enter a valid domain such as example.com."),
  root: z.string().trim().min(1, "Document root is required.").regex(/^\/server-engine\/www(?:\/[^\s]+)?\/?$/, "Use a path inside /server-engine/www."),
  type: z.enum(["Addon domain", "Primary domain", "Subdomain", "Alias"]),
  tls: z.boolean(),
});
function Badge({ children, tone = "slate" }) {
  const styles = {
    green:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    slate: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

function DomainsSkeleton() {
  return (
    <div className="animate-pulse space-y-8" aria-label="Loading domains and DNS">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div className="space-y-3"><div className="h-4 w-40 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-9 w-56 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-4 w-80 max-w-full rounded bg-neutral-100 dark:bg-neutral-800/70" /></div><div className="h-10 w-32 rounded-lg bg-neutral-200 dark:bg-neutral-800" /></header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"><div className="h-4 w-24 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="mt-4 h-8 w-16 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="mt-2 h-3 w-28 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div>)}</section>
      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"><div className="flex gap-6 overflow-hidden border-b border-neutral-200 px-4 pt-4 dark:border-neutral-800">{Array.from({ length: 7 }).map((_, index) => <div key={index} className="mb-3 h-4 w-24 shrink-0 rounded bg-neutral-200 dark:bg-neutral-800" />)}</div><div className="flex items-center justify-between gap-4 border-b border-neutral-200 p-5 dark:border-neutral-800"><div className="space-y-2"><div className="h-5 w-36 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-3 w-64 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div><div className="h-9 w-52 rounded bg-neutral-100 dark:bg-neutral-800/70" /></div><div className="p-5"><div className="grid grid-cols-5 gap-4 border-b border-neutral-200 px-3 py-3 dark:border-neutral-800">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-3 rounded bg-neutral-100 dark:bg-neutral-800/70" />)}</div><div className="divide-y divide-neutral-100 dark:divide-neutral-800">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="grid grid-cols-5 items-center gap-4 px-3 py-5"><div className="h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-800" /><div className="h-3 w-40 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="h-5 w-20 rounded-full bg-neutral-100 dark:bg-neutral-800/70" /><div className="h-3 w-24 rounded bg-neutral-100 dark:bg-neutral-800/70" /><div className="ml-auto h-8 w-8 rounded-full bg-neutral-100 dark:bg-neutral-800/70" /></div>)}</div></div></section>
    </div>
  );
}

export default function DomainsPage() {
  const dnsState = useServiceInstallationState("powerdns");
  const bindState = useServiceInstallationState("bind9");
  const unboundState = useServiceInstallationState("unbound");
  const [tab, setTab] = React.useState(() => window.location.hash === "#cloudflare" ? "Cloudflare edge" : window.location.hash === "#bind" ? "BIND 9 DNS" : window.location.hash === "#unbound" ? "Unbound resolver" : "Domains");
  const [domains, setDomains] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [modal, setModal] = React.useState(false);
  const [domainErrors, setDomainErrors] = React.useState({});
  const [domainFormError, setDomainFormError] = React.useState("");
  const [menuDomain, setMenuDomain] = React.useState(null);
  const [menuPosition, setMenuPosition] = React.useState(null);
  const [selectedDomain, setSelectedDomain] = React.useState("");
  const [domainRecords, setDomainRecords] = React.useState([]);
  const [recordsLoading, setRecordsLoading] = React.useState(false);
  const [recordModal, setRecordModal] = React.useState(false);
  const [editingRecord, setEditingRecord] = React.useState(null);
  const [recordError, setRecordError] = React.useState("");
  const [redirects, setRedirects] = React.useState([]);
  const [redirectsLoading, setRedirectsLoading] = React.useState(false);
  const [redirectModal, setRedirectModal] = React.useState(false);
  const [editingRedirect, setEditingRedirect] = React.useState(null);
  const [redirectError, setRedirectError] = React.useState("");
  const [redirectForm, setRedirectForm] = React.useState({ source_path: "/", target: "", code: 301, keep_path: false, enabled: true });
  const [certificates, setCertificates] = React.useState([]);
  const [certificatesLoading, setCertificatesLoading] = React.useState(false);
  const [recordForm, setRecordForm] = React.useState({ record_type: "A", name: "", value: "", ttl: 300 });
  const [cloudflare, setCloudflare] = React.useState({ connected: false, token: "", account: "", zone: "", zones: [], proxy: true, ssl: "full", waf: true, rateLimit: true, cache: "standard", trustedProxies: "" });
  const [cloudflareMessage, setCloudflareMessage] = React.useState("");
  const [cloudflareLoading, setCloudflareLoading] = React.useState(false);
  const [bind, setBind] = React.useState(() => { try { return JSON.parse(localStorage.getItem("serverengine:bind9") || "null") || { serverName: "ns1.example.com", listen: "0.0.0.0", port: 53, recursion: false, dnssec: true, transfers: "none", dynamicUpdates: false, queryLogging: false, forwarders: "1.1.1.1, 8.8.8.8", zoneRoot: "/server-engine/dns/zones" }; } catch { return { serverName: "ns1.example.com", listen: "0.0.0.0", port: 53, recursion: false, dnssec: true, transfers: "none", dynamicUpdates: false, queryLogging: false, forwarders: "1.1.1.1, 8.8.8.8", zoneRoot: "/server-engine/dns/zones" }; } });
  const [bindMessage, setBindMessage] = React.useState("");
  const [bindLoading, setBindLoading] = React.useState(false);
  const [unbound, setUnbound] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("serverengine:unbound") || "null") || { listen: "127.0.0.1", port: 5335, access: "127.0.0.0/8, ::1", dnssec: true, forwarding: true, forwarders: "1.1.1.1@853, 8.8.8.8@853", cacheSize: "64 MB", prefetch: true, privacy: true, logging: false, tlsUpstream: true };
    } catch {
      return { listen: "127.0.0.1", port: 5335, access: "127.0.0.0/8, ::1", dnssec: true, forwarding: true, forwarders: "1.1.1.1@853, 8.8.8.8@853", cacheSize: "64 MB", prefetch: true, privacy: true, logging: false, tlsUpstream: true };
    }
  });
  const [unboundMessage, setUnboundMessage] = React.useState("");
  const [unboundLoading, setUnboundLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    domain: "",
    root: "/server-engine/www/",
    type: "Addon domain",
    tls: true,
  });
  const loadDomains = React.useCallback(async () => {
    setLoading(true);
    const domainsResponse = await apiRequest("/api/v1/domains");
    if (domainsResponse.ok) setDomains(await domainsResponse.json());
    else setMessage(await readApiError(domainsResponse));
    setLoading(false);
  }, []);
  React.useEffect(() => { loadDomains(); }, [loadDomains]);
  React.useEffect(() => {
    const closeMenu = () => {
      setMenuDomain(null);
      setMenuPosition(null);
    };
    if (!menuDomain) return undefined;
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, [menuDomain]);
  const loadRecords = React.useCallback(async (domain) => {
    if (!domain) return;
    setRecordsLoading(true);
    const response = await apiRequest(`/api/v1/domains/${encodeURIComponent(domain)}/records`);
    if (response.ok) setDomainRecords((await response.json()).records || []);
    else setMessage(await readApiError(response));
    setRecordsLoading(false);
  }, []);
  const loadRedirects = React.useCallback(async (domain) => {
    if (!domain) return;
    setRedirectsLoading(true);
    const response = await apiRequest(`/api/v1/domains/${encodeURIComponent(domain)}/redirects`);
    if (response.ok) setRedirects((await response.json()).redirects || []);
    else setMessage(await readApiError(response));
    setRedirectsLoading(false);
  }, []);
  const loadCertificates = React.useCallback(async () => {
    setCertificatesLoading(true);
    const response = await apiRequest("/api/v1/domains/certificates");
    if (response.ok) setCertificates((await response.json()).certificates || []);
    else setMessage(await readApiError(response));
    setCertificatesLoading(false);
  }, []);
  const loadCloudflare = React.useCallback(async () => {
    setCloudflareLoading(true);
    const response = await apiRequest("/api/v1/domains/cloudflare/status");
    if (response.ok) {
      const status = await response.json();
      setCloudflare((current) => ({ ...current, ...status, ...(status.settings || {}), token: "", rateLimit: status.settings?.rate_limit ?? current.rateLimit, trustedProxies: status.settings?.trusted_proxies ?? current.trustedProxies }));
    } else setCloudflareMessage(await readApiError(response));
    setCloudflareLoading(false);
  }, []);
  const loadBind9 = React.useCallback(async () => {
    setBindLoading(true);
    const response = await apiRequest("/api/v1/domains/bind9/configuration");
    if (response.ok) setBind(await response.json());
    else setBindMessage(await readApiError(response));
    setBindLoading(false);
  }, []);
  const loadUnbound = React.useCallback(async () => {
    setUnboundLoading(true);
    const response = await apiRequest("/api/v1/domains/unbound/configuration");
    if (response.ok) setUnbound(await response.json());
    else setUnboundMessage(await readApiError(response));
    setUnboundLoading(false);
  }, []);
  React.useEffect(() => {
    if (!selectedDomain && domains[0]?.domain) setSelectedDomain(domains[0].domain);
  }, [domains, selectedDomain]);
  React.useEffect(() => {
    if (tab === "DNS records") loadRecords(selectedDomain).catch(() => setRecordsLoading(false));
    if (tab === "Redirects") loadRedirects(selectedDomain).catch(() => setRedirectsLoading(false));
    if (tab === "TLS certificates") loadCertificates().catch(() => setCertificatesLoading(false));
    if (tab === "Cloudflare edge") loadCloudflare().catch(() => setCloudflareLoading(false));
    if (tab === "BIND 9 DNS") loadBind9().catch(() => setBindLoading(false));
    if (tab === "Unbound resolver") loadUnbound().catch(() => setUnboundLoading(false));
  }, [tab, selectedDomain, loadRecords, loadRedirects, loadCertificates, loadCloudflare, loadBind9, loadUnbound]);
  const filtered = domains.filter((item) =>
    item.domain.toLowerCase().includes(query.toLowerCase()),
  );
  const add = async () => {
    const validation = domainSchema.safeParse(form);
    if (!validation.success) {
      setDomainErrors(Object.fromEntries(validation.error.issues.map((issue) => [issue.path[0], issue.message])));
      setDomainFormError("");
      return;
    }
    setDomainErrors({});
    setDomainFormError("");
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
      const detail = await readApiError(response);
      let message = detail;
      try {
        const entries = JSON.parse(detail);
        if (Array.isArray(entries)) message = entries.map((entry) => entry.msg).filter(Boolean).join(" ") || "Please check the domain details.";
      } catch {
        // The API returned a normal text error.
      }
      setDomainFormError(message || "Could not create the domain.");
      return;
    }
    const created = await response.json();
    setDomains((items) => [...items, created]);
    setSelectedDomain(created.domain);
    setForm({
      domain: "",
      root: "/server-engine/www/",
      type: "Addon domain",
      tls: true,
    });
    setDomainErrors({});
    setDomainFormError("");
    setModal(false);
    setMessage(`${created.domain} was added.`);
  };
  const openMenu = (event, domain) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuDomain(domain);
    setMenuPosition({ top: rect.bottom + 6, left: Math.max(12, rect.right - 192) });
  };
  const openRecords = (domain) => {
    setSelectedDomain(domain);
    setTab("DNS records");
    setMenuDomain(null);
    setMenuPosition(null);
  };
  const saveRecord = async () => {
    setRecordError("");
    const endpoint = `/api/v1/domains/${encodeURIComponent(selectedDomain)}/records${editingRecord ? `/${editingRecord.id}` : ""}`;
    const response = await apiRequest(endpoint, { method: editingRecord ? "PUT" : "POST", body: JSON.stringify(recordForm) });
    if (!response.ok) {
      setRecordError(await readApiError(response));
      return;
    }
    setRecordModal(false);
    setEditingRecord(null);
    setRecordForm({ record_type: "A", name: "", value: "", ttl: 300 });
    await loadRecords(selectedDomain);
    if (!editingRecord) setDomains((items) => items.map((item) => item.domain === selectedDomain ? { ...item, records: (item.records || 0) + 1 } : item));
  };
  const openRecordEditor = (record) => {
    setEditingRecord(record);
    setRecordError("");
    setRecordForm({ record_type: record.type, name: record.name, value: record.value, ttl: record.ttl });
    setRecordModal(true);
  };
  const deleteRecord = async (recordId) => {
    const response = await apiRequest(`/api/v1/domains/${encodeURIComponent(selectedDomain)}/records/${recordId}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage(await readApiError(response));
      return;
    }
    setDomainRecords((items) => items.filter((item) => item.id !== recordId));
    setDomains((items) => items.map((item) => item.domain === selectedDomain ? { ...item, records: Math.max(0, (item.records || 0) - 1) } : item));
  };
  const openRedirectEditor = (redirect = null) => {
    setEditingRedirect(redirect);
    setRedirectError("");
    setRedirectForm(redirect || { source_path: "/", target: "", code: 301, keep_path: false, enabled: true });
    setRedirectModal(true);
  };
  const saveRedirect = async () => {
    setRedirectError("");
    const endpoint = `/api/v1/domains/${encodeURIComponent(selectedDomain)}/redirects${editingRedirect ? `/${editingRedirect.id}` : ""}`;
    const response = await apiRequest(endpoint, { method: editingRedirect ? "PUT" : "POST", body: JSON.stringify(redirectForm) });
    if (!response.ok) {
      setRedirectError(await readApiError(response));
      return;
    }
    setRedirectModal(false);
    setEditingRedirect(null);
    await loadRedirects(selectedDomain);
    setDomains((items) => items.map((item) => item.domain === selectedDomain ? { ...item, redirects: editingRedirect ? item.redirects : (item.redirects || 0) + 1 } : item));
  };
  const deleteRedirect = async (redirectId) => {
    const response = await apiRequest(`/api/v1/domains/${encodeURIComponent(selectedDomain)}/redirects/${redirectId}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage(await readApiError(response));
      return;
    }
    setRedirects((items) => items.filter((item) => item.id !== redirectId));
    setDomains((items) => items.map((item) => item.domain === selectedDomain ? { ...item, redirects: Math.max(0, (item.redirects || 0) - 1) } : item));
  };
  const activeTls = domains.filter((item) => item.tls === "Active").length;
  const aliases = domains.filter((item) => item.type === "Alias").length;
  const selectedServiceLoading = tab === "BIND 9 DNS" ? bindState.loading : tab === "Unbound resolver" ? unboundState.loading : dnsState.loading;
  if (loading || selectedServiceLoading) {
    return <DomainsSkeleton />;
  }
  if (tab === "BIND 9 DNS" && !bindState.loading && !bindState.installed) {
    return <ServiceNotInstalledState state={bindState} icon={Globe2} eyebrow="DNS management" title="BIND 9 is not installed" description="Install BIND 9 before configuring an alternative authoritative DNS server." installLabel="Install BIND 9" />;
  }
  if (tab === "Unbound resolver" && !unboundState.loading && !unboundState.installed) {
    return <ServiceNotInstalledState state={unboundState} icon={Globe2} eyebrow="DNS management" title="Unbound is not installed" description="Install Unbound before configuring the server’s recursive DNS resolver." installLabel="Install Unbound" />;
  }
  if (!loading && !dnsState.loading && !dnsState.installed && !["#cloudflare", "#bind", "#unbound"].includes(window.location.hash)) {
    return <ServiceNotInstalledState state={dnsState} icon={Globe2} eyebrow="DNS management" title="PowerDNS is not installed" description="Install PowerDNS to manage authoritative zones, records, and DNSSEC from this panel." installLabel="Install PowerDNS" />;
  }
  const updateCloudflare = (key, value) => setCloudflare((current) => ({ ...current, [key]: value }));
  const saveCloudflare = async () => {
    setCloudflareMessage("");
    setCloudflareLoading(true);
    const response = await apiRequest("/api/v1/domains/cloudflare/settings", { method: "POST", body: JSON.stringify({ token: cloudflare.token, account: cloudflare.account, zone: cloudflare.zone, proxy: cloudflare.proxy, ssl: cloudflare.ssl, waf: cloudflare.waf, rate_limit: cloudflare.rateLimit, cache: cloudflare.cache, trusted_proxies: cloudflare.trustedProxies }) });
    if (!response.ok) {
      setCloudflareMessage(await readApiError(response));
      setCloudflareLoading(false);
      return;
    }
    const status = await response.json();
    setCloudflare((current) => ({ ...current, ...status, ...(status.settings || {}), token: "", rateLimit: status.settings?.rate_limit ?? current.rateLimit, trustedProxies: status.settings?.trusted_proxies ?? current.trustedProxies }));
    setCloudflareMessage("Cloudflare token verified and zones loaded.");
    setCloudflareLoading(false);
  };
  const updateBind = (key, value) => setBind((current) => ({ ...current, [key]: value }));
  const saveBind = async () => {
    setBindMessage("");
    setBindLoading(true);
    const response = await apiRequest("/api/v1/domains/bind9/configuration", { method: "PUT", body: JSON.stringify(bind) });
    if (response.ok) {
      setBind(await response.json());
      setBindMessage("BIND 9 configuration saved.");
    } else setBindMessage(await readApiError(response));
    setBindLoading(false);
  };
  const updateUnbound = (key, value) => setUnbound((current) => ({ ...current, [key]: value }));
  const saveUnbound = async () => {
    setUnboundMessage("");
    setUnboundLoading(true);
    const response = await apiRequest("/api/v1/domains/unbound/configuration", { method: "PUT", body: JSON.stringify(unbound) });
    if (response.ok) {
      setUnbound(await response.json());
      setUnboundMessage("Unbound configuration saved.");
    } else setUnboundMessage(await readApiError(response));
    setUnboundLoading(false);
  };
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-blue-500">Hosting / Domains & DNS</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-950 dark:text-white">
            Domains & DNS
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
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
            className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {label}
              </span>
              <Icon
                size={17}
                className={
                  tone === "green"
                    ? "text-emerald-500"
                    : tone === "blue"
                      ? "text-blue-500"
                      : "text-neutral-400"
                }
              />
            </div>
            <p className="mt-3 text-2xl font-semibold text-neutral-950 dark:text-white">
              {value}
            </p>
            <p className="mt-1 text-xs text-neutral-500">{detail}</p>
          </div>
        ))}
      </section>
      <section className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap border-b border-neutral-200 px-4 dark:border-neutral-800">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`border-b-2 px-4 py-4 text-sm font-medium ${tab === item ? "border-blue-600 text-blue-600" : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white"}`}
            >
              {item}
            </button>
          ))}
        </div>
        {tab === "Cloudflare edge" && (
          <div className="space-y-6 p-5">
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Cloudflare edge protection</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">Connect Cloudflare for DNS proxying, edge DDoS mitigation, WAF rules, rate limiting, cache policy, and origin protection. Cloudflare remains an external provider; Server Engine does not replace its edge network.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Cloudflare account or email<input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={cloudflare.account} onChange={(event) => updateCloudflare("account", event.target.value)} placeholder="admin@example.com" /></label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">API token<input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" type="password" value={cloudflare.token} onChange={(event) => updateCloudflare("token", event.target.value)} placeholder={cloudflare.connected ? "Leave blank to keep the saved token" : "Cloudflare API token"} /></label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Managed zone<select className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={cloudflare.zone} onChange={(event) => updateCloudflare("zone", event.target.value)} disabled={!cloudflare.zones.length}><option value="">{cloudflare.zones.length ? "Select a zone" : "Connect Cloudflare first"}</option>{cloudflare.zones.map((zone) => <option key={zone.id} value={zone.name}>{zone.name} · {zone.status}</option>)}</select></label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">SSL/TLS mode<select className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={cloudflare.ssl} onChange={(event) => updateCloudflare("ssl", event.target.value)}><option value="strict">Full (strict)</option><option value="full">Full</option><option value="flexible">Flexible</option></select></label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Cache policy<select className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={cloudflare.cache} onChange={(event) => updateCloudflare("cache", event.target.value)}><option value="standard">Standard</option><option value="aggressive">Aggressive static assets</option><option value="bypass">Bypass dynamic routes</option></select></label>
            </div>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={cloudflare.proxy} onChange={(event) => updateCloudflare("proxy", event.target.checked)} /><span><span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">Proxy DNS records through Cloudflare</span><span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">Hide the origin address and route HTTP traffic through Cloudflare’s edge.</span></span></label>
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={cloudflare.waf} onChange={(event) => updateCloudflare("waf", event.target.checked)} /><span><span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">Enable Cloudflare WAF and managed rules</span></span></label>
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={cloudflare.rateLimit} onChange={(event) => updateCloudflare("rateLimit", event.target.checked)} /><span><span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">Enable edge rate limiting</span></span></label>
            </div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Trusted Cloudflare proxy networks<textarea className="mt-1.5 min-h-24 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:bg-neutral-950 dark:text-neutral-100" value={cloudflare.trustedProxies} onChange={(event) => updateCloudflare("trustedProxies", event.target.value)} placeholder="One CIDR range per line" /></label>
            <div className="flex items-center justify-between gap-4"><p className={`text-sm ${cloudflareMessage && !cloudflare.connected ? "text-rose-600 dark:text-rose-400" : "text-neutral-500 dark:text-neutral-400"}`}>{cloudflareMessage || (cloudflare.connected ? `Connected · ${cloudflare.zones.length} zone${cloudflare.zones.length === 1 ? "" : "s"} available.` : "Use a scoped API token with Zone:Read permission; the token is stored by the control plane, not in the browser.")}</p><button type="button" disabled={cloudflareLoading} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60" onClick={saveCloudflare}>{cloudflareLoading && <RefreshCw size={15} className="animate-spin" />}{cloudflare.connected ? "Save settings" : "Verify and connect"}</button></div>
          </div>
        )}
        {tab === "BIND 9 DNS" && (
          <div className="space-y-6 p-5">
            <div><h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">BIND 9 authoritative DNS</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">Manage authoritative zones and DNSSEC from the panel. Recursion is disabled by default so this server does not become an open resolver.</p></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Nameserver identity<input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={bind.serverName} onChange={(event) => updateBind("serverName", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Listen address<input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={bind.listen} onChange={(event) => updateBind("listen", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">DNS port<input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" type="number" min="1" max="65535" value={bind.port} onChange={(event) => updateBind("port", Number(event.target.value))} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Zone directory<input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={bind.zoneRoot} onChange={(event) => updateBind("zoneRoot", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Zone transfer policy<select className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={bind.transfers} onChange={(event) => updateBind("transfers", event.target.value)}><option value="none">Disabled</option><option value="trusted">Trusted secondary nameservers</option><option value="any">Any host (not recommended)</option></select></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Resolver forwarders<input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={bind.forwarders} onChange={(event) => updateBind("forwarders", event.target.value)} /></label></div>
            <div className="space-y-3"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={bind.dnssec} onChange={(event) => updateBind("dnssec", event.target.checked)} /><span><span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">Enable DNSSEC workflow</span><span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">Generate signing material and publish DS records through the registrar workflow.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={bind.dynamicUpdates} onChange={(event) => updateBind("dynamicUpdates", event.target.checked)} /><span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Allow authenticated dynamic updates</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={bind.recursion} onChange={(event) => updateBind("recursion", event.target.checked)} /><span><span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">Enable recursion</span><span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">Only enable with strict client ACLs; public recursion is unsafe.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={bind.queryLogging} onChange={(event) => updateBind("queryLogging", event.target.checked)} /><span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Query logging</span></label></div>
            <div className="flex items-center justify-between gap-4"><p className="text-sm text-neutral-500 dark:text-neutral-400">{bindMessage || "BIND 9 configuration is stored in the managed service directory."}</p><button type="button" disabled={bindLoading} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60" onClick={saveBind}>{bindLoading && <RefreshCw size={15} className="animate-spin" />}Save BIND 9 settings</button></div>
          </div>
        )}
        {tab === "Unbound resolver" && (
          <div className="space-y-6 p-5">
            <div><h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Unbound recursive resolver</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">Provide a validating DNS resolver for the server and trusted applications. Unbound is not authoritative DNS for hosted zones; it resolves external names and caches answers.</p></div>
            <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Listen address<input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={unbound.listen} onChange={(event) => updateUnbound("listen", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Resolver port<input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" type="number" value={unbound.port} onChange={(event) => updateUnbound("port", Number(event.target.value))} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Allowed client networks<textarea className="mt-1.5 min-h-20 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={unbound.access} onChange={(event) => updateUnbound("access", event.target.value)} placeholder="One CIDR range per line" /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Cache size<input className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={unbound.cacheSize} onChange={(event) => updateUnbound("cacheSize", event.target.value)} /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Forwarding servers<textarea className="mt-1.5 min-h-20 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" value={unbound.forwarders} onChange={(event) => updateUnbound("forwarders", event.target.value)} placeholder="One resolver per line" /></label></div>
            <div className="space-y-3"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.dnssec} onChange={(event) => updateUnbound("dnssec", event.target.checked)} /><span><span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">Validate DNSSEC</span><span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">Reject responses that fail the DNSSEC validation chain.</span></span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.forwarding} onChange={(event) => updateUnbound("forwarding", event.target.checked)} /><span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Use configured forwarders</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.tlsUpstream} onChange={(event) => updateUnbound("tlsUpstream", event.target.checked)} /><span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Encrypt upstream DNS connections</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.prefetch} onChange={(event) => updateUnbound("prefetch", event.target.checked)} /><span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Prefetch popular records</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.privacy} onChange={(event) => updateUnbound("privacy", event.target.checked)} /><span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Privacy hardening</span></label><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={unbound.logging} onChange={(event) => updateUnbound("logging", event.target.checked)} /><span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Query logging</span></label></div>
            <div className="flex items-center justify-between gap-4"><p className="text-sm text-neutral-500 dark:text-neutral-400">{unboundMessage || "Unbound configuration is stored in the managed service directory."}</p><button type="button" disabled={unboundLoading} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60" onClick={saveUnbound}>{unboundLoading && <RefreshCw size={15} className="animate-spin" />}Save Unbound settings</button></div>
          </div>
        )}
        {tab === "Domains" && (
          <>
            <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
              <div>
                <h2 className="font-semibold text-neutral-950 dark:text-white">
                  Domain inventory
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Web roots, DNS health, and TLS state at a glance.
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
                <Search size={15} className="text-neutral-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search domains"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400 sm:w-56"
                />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-950/40">
                  <tr>
                    <th className="px-5 py-3">Domain</th>
                    <th className="px-5 py-3">Type / web root</th>
                    <th className="px-5 py-3">DNS</th>
                    <th className="px-5 py-3">TLS</th>
                    <th className="px-5 py-3">Records</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {loading ? (
                    <tr><td colSpan="6" className="px-5 py-12 text-center text-sm text-neutral-500">Loading domains…</td></tr>
                  ) : filtered.map((item) => (
                    <tr
                      key={item.domain}
                      className="text-neutral-700 dark:text-neutral-300"
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-neutral-950 dark:text-white">
                          {item.domain}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          Managed website domain
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone="blue">{item.type}</Badge>
                        <div className="mt-2 max-w-xs truncate text-xs text-neutral-500">
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
                      <td className="px-5 py-4 text-neutral-500">
                        {item.records} records
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button type="button" aria-label={`Actions for ${item.domain}`} onClick={(event) => openMenu(event, item.domain)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200">
                          <MoreHorizontal size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {message && <p className="border-t border-neutral-200 px-5 py-3 text-sm text-rose-600 dark:border-neutral-800 dark:text-rose-400">{message}</p>}
          </>
        )}
        {tab === "DNS records" && (
          <div className="p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-semibold text-neutral-950 dark:text-white">
                  Zone records
                </h2>
                <p className="mt-1 text-sm text-neutral-500">Manage records for the selected hosted domain.</p>
              </div>
              <div className="flex items-center gap-2"><select value={selectedDomain} onChange={(event) => setSelectedDomain(event.target.value)} className="min-h-10 min-w-52 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100">{domains.map((item) => <option key={item.domain} value={item.domain}>{item.domain}</option>)}</select><button type="button" onClick={() => loadRecords(selectedDomain)} disabled={recordsLoading} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 dark:hover:bg-neutral-800" aria-label="Refresh DNS records"><RefreshCw size={16} className={recordsLoading ? "animate-spin" : ""} /></button><button type="button" onClick={() => { setEditingRecord(null); setRecordError(""); setRecordForm({ record_type: "A", name: "", value: "", ttl: 300 }); setRecordModal(true); }} disabled={!selectedDomain} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                <Plus size={15} /> Add record
              </button></div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="py-3">Type</th>
                    <th className="py-3">Name</th>
                    <th className="py-3">Value</th>
                    <th className="py-3">TTL</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {recordsLoading ? <tr><td colSpan="5" className="py-12 text-center text-sm text-neutral-500">Loading DNS records…</td></tr> : domainRecords.length === 0 ? <tr><td colSpan="5" className="py-12 text-center text-sm text-neutral-500">No DNS records have been added for this domain.</td></tr> : domainRecords.map((record) => <tr key={record.id}><td className="py-3 font-semibold text-blue-600">{record.type}</td><td className="py-3 text-neutral-700 dark:text-neutral-300">{record.name}</td><td className="max-w-md truncate py-3 font-mono text-xs text-neutral-500">{record.value}</td><td className="py-3 text-neutral-500">{record.ttl}s</td><td className="py-3 text-right"><div className="flex justify-end gap-1"><button type="button" onClick={() => openRecordEditor(record)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-blue-600 dark:hover:bg-neutral-800" aria-label={`Edit ${record.type} record`}><MoreHorizontal size={15} /></button><button type="button" onClick={() => deleteRecord(record.id)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30" aria-label={`Delete ${record.type} record`}><Trash2 size={15} /></button></div></td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab === "Redirects" && (
          <div className="p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div><h2 className="font-semibold text-neutral-950 dark:text-white">Redirect rules</h2><p className="mt-1 text-sm text-neutral-500">Send old URLs to a new path or domain before the request reaches your application.</p></div>
              <div className="flex items-center gap-2"><select value={selectedDomain} onChange={(event) => setSelectedDomain(event.target.value)} className="min-h-10 min-w-52 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100">{domains.map((item) => <option key={item.domain} value={item.domain}>{item.domain}</option>)}</select><button type="button" onClick={() => loadRedirects(selectedDomain)} disabled={redirectsLoading} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 dark:hover:bg-neutral-800" aria-label="Refresh redirects"><RefreshCw size={16} className={redirectsLoading ? "animate-spin" : ""} /></button><button type="button" onClick={() => openRedirectEditor()} disabled={!selectedDomain} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={15} />Add redirect</button></div>
            </div>
            <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-neutral-500"><tr><th className="py-3">Source</th><th className="py-3">Destination</th><th className="py-3">Code</th><th className="py-3">Status</th><th className="py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">{redirectsLoading ? <tr><td colSpan="5" className="py-12 text-center text-sm text-neutral-500">Loading redirects…</td></tr> : redirects.length === 0 ? <tr><td colSpan="5" className="py-12 text-center"><CornerUpRight className="mx-auto text-neutral-300 dark:text-neutral-600" size={28} /><p className="mt-3 text-sm font-medium text-neutral-800 dark:text-neutral-200">No redirects configured</p><p className="mt-1 text-sm text-neutral-500">Create a rule for an old path, a domain migration, or a temporary campaign URL.</p></td></tr> : redirects.map((item) => <tr key={item.id}><td className="py-4 font-mono text-xs text-neutral-700 dark:text-neutral-300">{item.source_path}</td><td className="max-w-sm truncate py-4 text-neutral-600 dark:text-neutral-400">{item.target}{item.keep_path ? " · keep path" : ""}</td><td className="py-4 font-medium text-neutral-700 dark:text-neutral-300">{item.code}</td><td className="py-4"><Badge tone={item.enabled ? "green" : "slate"}>{item.enabled ? "Enabled" : "Disabled"}</Badge></td><td className="py-4 text-right"><div className="flex justify-end gap-3"><button type="button" onClick={() => openRedirectEditor(item)} className="cursor-pointer text-sm font-semibold text-blue-600 dark:text-blue-400">Edit</button><button type="button" onClick={() => deleteRedirect(item.id)} className="cursor-pointer text-sm text-rose-600 dark:text-rose-400">Delete</button></div></td></tr>)}</tbody></table></div>
          </div>
        )}
        {tab === "TLS certificates" && (
          <div className="p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-semibold text-neutral-950 dark:text-white">TLS certificates</h2><p className="mt-1 max-w-2xl text-sm text-neutral-500">See the certificates actually present in the managed Certbot store and the HTTPS settings for each website.</p></div><button type="button" onClick={loadCertificates} disabled={certificatesLoading} className="inline-flex cursor-pointer items-center justify-center gap-2 self-start rounded-md px-2 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 dark:text-blue-400 dark:hover:bg-blue-950/30"><RefreshCw size={15} className={certificatesLoading ? "animate-spin" : ""} />{certificatesLoading ? "Checking…" : "Refresh certificates"}</button></div>
            <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-neutral-500"><tr><th className="py-3">Domain</th><th className="py-3">HTTPS</th><th className="py-3">Certificate</th><th className="py-3">Expires</th><th className="py-3">Certificate file</th></tr></thead><tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">{certificatesLoading ? <tr><td colSpan="5" className="py-12 text-center text-sm text-neutral-500">Checking certificate files…</td></tr> : certificates.length === 0 ? <tr><td colSpan="5" className="py-12 text-center text-sm text-neutral-500">No hosted domains are available for certificate management.</td></tr> : certificates.map((item) => { const status = item.certificate.status; const tone = status === "issued" ? "green" : status === "expired" || status === "invalid" ? "amber" : "slate"; return <tr key={item.domain}><td className="py-4 font-semibold text-neutral-900 dark:text-neutral-100">{item.domain}</td><td className="py-4"><Badge tone={item.tls_enabled ? "green" : "slate"}>{item.tls_enabled ? "Enabled" : "Off"}</Badge></td><td className="py-4"><Badge tone={tone}>{status === "issued" ? "Issued" : status === "expired" ? "Expired" : status === "invalid" ? "Invalid" : "Not issued"}</Badge></td><td className="py-4 text-neutral-500">{item.certificate.expires_at || "—"}</td><td className="max-w-xs truncate py-4 font-mono text-xs text-neutral-500">{item.certificate.path}</td></tr>; })}</tbody></table></div>
            <div className="mt-5 rounded-lg bg-neutral-50 p-4 text-sm text-neutral-600 dark:bg-neutral-950/60 dark:text-neutral-400"><p className="font-medium text-neutral-800 dark:text-neutral-200">Certificate issuance</p><p className="mt-1">Use a website’s SSL settings to request or enable HTTPS. This tab reports certificate files that Certbot has actually issued; enabling HTTPS alone does not create a certificate.</p></div>
          </div>
        )}
        {tab !== "Domains" && tab !== "DNS records" && tab !== "Redirects" && tab !== "TLS certificates" && (
          <div className="p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
              <ShieldCheck size={22} />
            </div>
            <h2 className="mt-4 font-semibold text-neutral-950 dark:text-white">
              {tab}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
              Manage {tab.toLowerCase()} with the same domain-level controls.
              The UI is ready for the domain service API.
            </p>
          </div>
        )}
      </section>
      {menuDomain && menuPosition && <div className="fixed z-[100] w-48 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900" style={{ top: menuPosition.top, left: menuPosition.left }} onMouseDown={(event) => event.stopPropagation()}><button type="button" onClick={() => openRecords(menuDomain)} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"><Globe2 size={15} />Manage DNS records</button><button type="button" onClick={() => { navigator.clipboard?.writeText(menuDomain); setMessage(`${menuDomain} copied.`); setMenuDomain(null); setMenuPosition(null); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"><Copy size={15} />Copy domain</button><a href={`https://${menuDomain}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"><ExternalLink size={15} />Open website</a></div>}
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">
                  Add domain
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Create a hosted domain and prepare its zone.
                </p>
              </div>
              <button
                onClick={() => setModal(false)}
                className="text-neutral-400"
              >
                <X size={18} />
              </button>
            </div>
            <form className="mt-6 space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); add(); }}>
              <FormField label="Domain name" error={domainErrors.domain}>
                <input
                  value={form.domain}
                  onChange={(event) => { setForm({ ...form, domain: event.target.value.toLowerCase() }); setDomainErrors((current) => ({ ...current, domain: undefined })); }}
                  placeholder="yourdomain.com"
                  className="mt-2 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 outline-none focus:border-blue-500 dark:border-neutral-700"
                />
              </FormField>
              <FormField label="Document root" error={domainErrors.root}>
                <input
                  value={form.root}
                  onChange={(event) => { setForm({ ...form, root: event.target.value }); setDomainErrors((current) => ({ ...current, root: undefined })); }}
                  className="mt-2 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 outline-none focus:border-blue-500 dark:border-neutral-700"
                />
              </FormField>
              <FormField label="Domain type" error={domainErrors.type}>
                <select
                  value={form.type}
                  onChange={(event) => { setForm({ ...form, type: event.target.value }); setDomainErrors((current) => ({ ...current, type: undefined })); }}
                  className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option>Addon domain</option>
                  <option>Primary domain</option>
                  <option>Subdomain</option>
                  <option>Alias</option>
                </select>
              </FormField>
              <label className="flex items-center gap-3 text-sm text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={form.tls}
                  onChange={(event) => setForm({ ...form, tls: event.target.checked })}
                  className="h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-800 dark:focus:ring-offset-neutral-900"
                />
                Request a TLS certificate automatically
              </label>
              {domainFormError && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{domainFormError}</p>}
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">Cancel</button>
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Create domain</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {recordModal && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"><form className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900" onSubmit={(event) => { event.preventDefault(); saveRecord(); }}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">DNS zone</p><h2 className="mt-1 text-xl font-semibold text-neutral-950 dark:text-white">{editingRecord ? "Edit record" : "Add record"}</h2><p className="mt-1 text-sm text-neutral-500">{editingRecord ? "Update" : "Add a record to"} {selectedDomain}.</p></div><button type="button" onClick={() => setRecordModal(false)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"><X size={17} /></button></div><div className="mt-6 space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Type<select value={recordForm.record_type} onChange={(event) => setRecordForm({ ...recordForm, record_type: event.target.value })} className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"><option>A</option><option>AAAA</option><option>CNAME</option><option>MX</option><option>TXT</option><option>CAA</option><option>NS</option><option>SRV</option></select></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">TTL<input type="number" min="30" max="86400" required value={recordForm.ttl} onChange={(event) => setRecordForm({ ...recordForm, ttl: Number(event.target.value) })} className="mt-2 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 dark:border-neutral-700 dark:text-neutral-100" /></label></div><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Name<input required value={recordForm.name} onChange={(event) => setRecordForm({ ...recordForm, name: event.target.value })} placeholder="@ or www" className="mt-2 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 dark:border-neutral-700 dark:text-neutral-100" /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Value<input required value={recordForm.value} onChange={(event) => setRecordForm({ ...recordForm, value: event.target.value })} placeholder="203.0.113.24" className="mt-2 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 dark:border-neutral-700 dark:text-neutral-100" /></label>{recordError && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">{recordError}</p>}</div><div className="mt-6 flex justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800"><button type="button" onClick={() => setRecordModal(false)} className="cursor-pointer rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800">Cancel</button><button type="submit" className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Check size={15} />{editingRecord ? "Save changes" : "Save record"}</button></div></form></div>}
      {redirectModal && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8"><form className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900" onSubmit={(event) => { event.preventDefault(); saveRedirect(); }}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Redirect rule</p><h2 className="mt-1 text-xl font-semibold text-neutral-950 dark:text-white">{editingRedirect ? "Edit redirect" : "Add redirect"}</h2><p className="mt-1 text-sm text-neutral-500">Apply this rule on {selectedDomain}.</p></div><button type="button" onClick={() => setRedirectModal(false)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"><X size={17} /></button></div><div className="mt-6 space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Source path<input required value={redirectForm.source_path} onChange={(event) => setRedirectForm({ ...redirectForm, source_path: event.target.value })} placeholder="/old-page" className="mt-2 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100" /></label><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Status code<select value={redirectForm.code} onChange={(event) => setRedirectForm({ ...redirectForm, code: Number(event.target.value) })} className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"><option value="301">301 · Permanent</option><option value="302">302 · Temporary</option><option value="307">307 · Preserve method</option><option value="308">308 · Permanent method</option></select></label></div><label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Destination<input required value={redirectForm.target} onChange={(event) => setRedirectForm({ ...redirectForm, target: event.target.value })} placeholder="https://example.com/new-page or /new-page" className="mt-2 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:text-neutral-100" /></label><label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300"><input type="checkbox" checked={redirectForm.keep_path} onChange={(event) => setRedirectForm({ ...redirectForm, keep_path: event.target.checked })} className="mt-1 h-4 w-4 accent-blue-600" /><span><span className="font-medium">Keep the remaining path</span><span className="mt-1 block text-xs text-neutral-500">Append the requested path when redirecting to another domain.</span></span></label><label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300"><input type="checkbox" checked={redirectForm.enabled} onChange={(event) => setRedirectForm({ ...redirectForm, enabled: event.target.checked })} className="mt-1 h-4 w-4 accent-blue-600" /><span className="font-medium">Enable this redirect</span></label>{redirectError && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">{redirectError}</p>}</div><div className="mt-6 flex justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800"><button type="button" onClick={() => setRedirectModal(false)} className="cursor-pointer rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800">Cancel</button><button type="submit" className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Check size={15} />{editingRedirect ? "Save changes" : "Create redirect"}</button></div></form></div>}
    </div>
  );
}
