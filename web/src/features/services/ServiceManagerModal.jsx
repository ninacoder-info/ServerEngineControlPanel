import React from "react";
import {
  Activity,
  CheckCircle2,
  Download,
  FileCog,
  Gauge,
  Globe2,
  History,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  Settings2,
  TerminalSquare,
  X,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import ConfigEditor from "./ConfigEditor";
import ApacheConfigModal from "./ApacheConfigModal";
import MariaDbConfigModal from "./MariaDbConfigModal";
import PostgreSqlConfigModal from "./PostgreSqlConfigModal";
import RedisConfigModal from "./RedisConfigModal";
import MemcachedConfigModal from "./MemcachedConfigModal";
import CertbotConfigModal from "./CertbotConfigModal";
import OpenLiteSpeedConfigModal from "./OpenLiteSpeedConfigModal";
import CaddyConfigModal from "./CaddyConfigModal";
import HaProxyConfigModal from "./HaProxyConfigModal";
import ValkeyConfigModal from "./ValkeyConfigModal";
import Fail2banConfigModal from "./Fail2banConfigModal";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";

const tabs = [
  ["configuration", "Configuration", FileCog],
  ["mysql-file", "my.cnf", FileCog],
  ["nginx-file", "nginx.conf", FileCog],
  ["extensions", "Extensions", Download],
  ["terminal", "Terminal access", TerminalSquare],
  ["versions", "Versions", History],
  ["runtime", "Runtime", Activity],
  ["tuning", "Performance", Gauge],
  ["logs", "Error log", RefreshCw],
];
const inputClass =
  "mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700";
function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
      {label}
      {children}
    </label>
  );
}

const mysqlDefaults = {
  bindAddress: "127.0.0.1",
  port: 3306,
  maxConnections: 151,
  sqlMode: "strict",
  dataDirectory: "/opt/server-engine/services/mysql/data",
  slowQueryLog: "on",
};

function MySQLGeneral({ service, configText, busy, message, onSave }) {
  const [values, setValues] = React.useState(mysqlDefaults);
  React.useEffect(() => {
    if (!configText) return;
    const value = (key, fallback) =>
      configText
        .match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "mi"))?.[1]
        ?.trim() || fallback;
    const mode = value("sql_mode", "").toUpperCase().includes("STRICT")
      ? "strict"
      : "compatibility";
    setValues({
      bindAddress: value("bind-address", mysqlDefaults.bindAddress),
      port: Number(value("port", service.default_port || mysqlDefaults.port)),
      maxConnections: Number(
        value("max_connections", mysqlDefaults.maxConnections),
      ),
      sqlMode: mode,
      dataDirectory: value("datadir", mysqlDefaults.dataDirectory),
      slowQueryLog:
        value("slow_query_log", "ON").toLowerCase() === "on" ? "on" : "off",
    });
  }, [configText, service.default_port]);
  const set = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }));
  const reset = () =>
    setValues({
      ...mysqlDefaults,
      port: service.default_port || mysqlDefaults.port,
    });
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          MySQL server configuration
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage the database service. The editable my.cnf file has its own tab.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bind address">
          <input
            className={inputClass}
            value={values.bindAddress}
            onChange={(event) => set("bindAddress", event.target.value)}
          />
        </Field>
        <Field label="MySQL port">
          <input
            className={inputClass}
            type="number"
            value={values.port}
            onChange={(event) => set("port", Number(event.target.value))}
          />
        </Field>
        <Field label="Maximum connections">
          <input
            className={inputClass}
            type="number"
            value={values.maxConnections}
            onChange={(event) =>
              set("maxConnections", Number(event.target.value))
            }
          />
        </Field>
        <Field label="SQL mode">
          <select
            className={`${inputClass} bg-white dark:bg-slate-900`}
            value={values.sqlMode}
            onChange={(event) => set("sqlMode", event.target.value)}
          >
            <option value="strict">Strict mode</option>
            <option value="compatibility">Compatibility mode</option>
          </select>
        </Field>
        <Field label="Data directory">
          <input
            className={inputClass}
            value={values.dataDirectory}
            onChange={(event) => set("dataDirectory", event.target.value)}
          />
        </Field>
        <Field label="Slow query log">
          <select
            className={`${inputClass} bg-white dark:bg-slate-900`}
            value={values.slowQueryLog}
            onChange={(event) => set("slowQueryLog", event.target.value)}
          >
            <option value="on">Enabled</option>
            <option value="off">Disabled</option>
          </select>
        </Field>
      </div>
      {message && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      )}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          disabled={busy}
          onClick={reset}
        >
          Reset to defaults
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          disabled={busy}
          onClick={() => onSave(values)}
        >
          {busy ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </div>
  );
}

function MySQLFile({ config, text, setText, message, busy, save, restore }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          my.cnf
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          The active MySQL configuration file.
        </p>
        <code className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
          {config?.config_path ||
            "/opt/server-engine/services/mysql/conf/my.cnf"}
        </code>
      </div>
      <ConfigEditor path="my.cnf" value={text} onChange={setText} />
      {message && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      )}
      <div className="flex justify-end gap-3">
        <button
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          disabled={busy}
          onClick={restore}
        >
          Restore original
        </button>
        <button
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          disabled={busy}
          onClick={save}
        >
          {busy ? "Saving…" : "Save my.cnf"}
        </button>
      </div>
    </div>
  );
}

function PHPConfig({ config, text, setText, message, busy, save, restore }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          PHP configuration
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage the PHP runtime settings used by websites and command-line
          tools.
        </p>
      </div>
      <ConfigEditor path="php.ini" value={text} onChange={setText} />
      {message && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      )}
      <div className="flex justify-end gap-3">
        <button
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          disabled={busy}
          onClick={restore}
        >
          Restore original
        </button>
        <button
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          disabled={busy}
          onClick={save}
        >
          {busy ? "Saving…" : "Save php.ini"}
        </button>
      </div>
    </div>
  );
}

function NginxOverview({ config, text }) {
  const workerProcesses =
    text.match(/^worker_processes\s+(.+);$/im)?.[1] || "auto";
  const workerConnections =
    text.match(/^\s*worker_connections\s+(.+);$/im)?.[1] || "4096";
  const keepalive = text.match(/^\s*keepalive_timeout\s+(.+);$/im)?.[1] || "65";
  const uploadLimit =
    text.match(/^\s*client_max_body_size\s+(.+);$/im)?.[1] || "64m";
  const gzip = /^\s*gzip\s+on;/im.test(text);
  const serverTokens = !/^\s*server_tokens\s+off;/im.test(text);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Nginx web server configuration
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Configure request handling, connection capacity, uploads, compression,
          and web-server security.
        </p>
        <code className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
          {config?.config_path ||
            "/opt/server-engine/services/nginx/conf/nginx.conf"}
        </code>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [Network, "Worker model", workerProcesses, "Process scheduling"],
          [Globe2, "Connections", workerConnections, "Per-worker capacity"],
          [
            ShieldCheck,
            "Security headers",
            serverTokens ? "Visible" : "Hidden",
            "Server signature",
          ],
          [
            Settings2,
            "Compression",
            gzip ? "Enabled" : "Disabled",
            "Response compression",
          ],
        ].map(([Icon, label, value, description]) => (
          <div
            key={label}
            className="rounded-md border border-slate-200 p-4 dark:border-slate-700"
          >
            <Icon size={16} className="text-blue-600 dark:text-blue-400" />
            <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {value}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {description}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Keepalive timeout
          </p>
          <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
            {keepalive}s
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Maximum upload
          </p>
          <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
            {uploadLimit}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Virtual hosts
          </p>
          <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
            conf/sites/*.conf
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Validation
          </p>
          <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">
            Checked before save
          </p>
        </div>
      </div>
    </div>
  );
}

function NginxFile({ config, text, setText, message, busy, save, restore }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          nginx.conf
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Edit the main Nginx configuration. Virtual-host files remain under the
          sites directory and are loaded by this file.
        </p>
        <code className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
          {config?.config_path ||
            "/opt/server-engine/services/nginx/conf/nginx.conf"}
        </code>
      </div>
      <ConfigEditor path="nginx.conf" value={text} onChange={setText} />
      {message && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      )}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          disabled={busy}
          onClick={restore}
        >
          Restore original
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          disabled={busy}
          onClick={save}
        >
          {busy ? "Saving…" : "Save nginx.conf"}
        </button>
      </div>
    </div>
  );
}

function NginxPerformance() {
  const [profile, setProfile] = React.useState("balanced");
  const [workers, setWorkers] = React.useState("auto");
  const [connections, setConnections] = React.useState("4096");
  const [keepalive, setKeepalive] = React.useState("65");
  const [bodySize, setBodySize] = React.useState("64m");
  const [proxyTimeout, setProxyTimeout] = React.useState("60");
  const [gzip, setGzip] = React.useState(true);
  const [openFileCache, setOpenFileCache] = React.useState(true);
  const [http2, setHttp2] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const applyProfile = (value) => {
    setProfile(value);
    if (value === "small") {
      setWorkers("auto");
      setConnections("1024");
      setKeepalive("30");
      setProxyTimeout("30");
    }
    if (value === "balanced") {
      setWorkers("auto");
      setConnections("4096");
      setKeepalive("65");
      setProxyTimeout("60");
    }
    if (value === "high-traffic") {
      setWorkers("auto");
      setConnections("16384");
      setKeepalive("75");
      setProxyTimeout("120");
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Nginx performance
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Tune connection capacity, proxy behavior, static-file delivery,
          compression, and TLS for live websites.
        </p>
      </div>
      <section className="space-y-4">
        <div>
          <h4 className="font-semibold text-slate-900 dark:text-slate-100">
            Server profile
          </h4>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Use a starting point, then adjust each limit for this server.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["small", "Small site"],
            ["balanced", "Balanced"],
            ["high-traffic", "High traffic"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => applyProfile(value)}
              className={`rounded-md border px-3 py-2 text-sm font-medium ${profile === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Worker processes">
          <select
            className={`${inputClass} bg-white dark:bg-slate-900`}
            value={workers}
            onChange={(event) => setWorkers(event.target.value)}
          >
            <option value="auto">Auto</option>
            <option value="1">1 worker</option>
            <option value="2">2 workers</option>
            <option value="4">4 workers</option>
            <option value="8">8 workers</option>
          </select>
        </Field>
        <Field label="Worker connections">
          <input
            className={inputClass}
            type="number"
            min="128"
            value={connections}
            onChange={(event) => setConnections(event.target.value)}
          />
        </Field>
        <Field label="Keepalive timeout (seconds)">
          <input
            className={inputClass}
            type="number"
            min="1"
            value={keepalive}
            onChange={(event) => setKeepalive(event.target.value)}
          />
        </Field>
        <Field label="Maximum request body">
          <input
            className={inputClass}
            value={bodySize}
            onChange={(event) => setBodySize(event.target.value)}
            placeholder="64m"
          />
        </Field>
        <Field label="Proxy read timeout (seconds)">
          <input
            className={inputClass}
            type="number"
            min="1"
            value={proxyTimeout}
            onChange={(event) => setProxyTimeout(event.target.value)}
          />
        </Field>
      </section>
      <section className="space-y-1">
        <ToggleRow
          label="Enable gzip compression"
          description="Compress text responses when the client supports it."
          checked={gzip}
          onChange={setGzip}
        />
        <ToggleRow
          label="Cache open file descriptors"
          description="Reduce filesystem overhead for frequently served static assets."
          checked={openFileCache}
          onChange={setOpenFileCache}
        />
        <ToggleRow
          label="Enable HTTP/2 defaults"
          description="Use multiplexed HTTPS connections for modern browsers."
          checked={http2}
          onChange={setHttp2}
        />
      </section>
      {message && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            setMessage(
              "Performance profile is ready. Save through nginx.conf after reviewing the generated directives.",
            )
          }
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Save performance profile
        </button>
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-5 border-b border-slate-200 py-4 last:border-b-0 dark:border-slate-800">
      <span>
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
          {label}
        </span>
        <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
      />
    </label>
  );
}

function MySQLPerformance() {
  const [profile, setProfile] = React.useState("balanced");
  const [bufferPool, setBufferPool] = React.useState("65");
  const [connections, setConnections] = React.useState("151");
  const [slowQueries, setSlowQueries] = React.useState(true);
  const [slowTime, setSlowTime] = React.useState("1");
  const [tableCache, setTableCache] = React.useState("4000");
  const [tempTable, setTempTable] = React.useState("64");
  const [ioCapacity, setIoCapacity] = React.useState("200");
  const [message, setMessage] = React.useState("");
  function applyProfile(value) {
    setProfile(value);
    if (value === "small") {
      setBufferPool("50");
      setConnections("75");
      setTableCache("2000");
      setTempTable("32");
      setIoCapacity("100");
    }
    if (value === "balanced") {
      setBufferPool("65");
      setConnections("151");
      setTableCache("4000");
      setTempTable("64");
      setIoCapacity("200");
    }
    if (value === "high-traffic") {
      setBufferPool("75");
      setConnections("300");
      setTableCache("8000");
      setTempTable("128");
      setIoCapacity("500");
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Production performance
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Tune this MySQL instance for live websites. These controls apply to
          this service and should be validated against real traffic before
          applying.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500">Memory strategy</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {bufferPool}% buffer pool
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Keeps hot table and index pages in memory.
          </p>
        </div>
        <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500">
            Connection ceiling
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {connections} clients
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Protects RAM from connection spikes.
          </p>
        </div>
        <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500">Query visibility</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {slowQueries ? `${slowTime}s slow log` : "Disabled"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Finds slow production queries for review.
          </p>
        </div>
      </div>
      <section className="space-y-4">
        <div>
          <h4 className="font-semibold text-slate-900 dark:text-slate-100">
            Server profile
          </h4>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Start with a profile, then adjust individual limits for this host.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["small", "Small server"],
            ["balanced", "Balanced website"],
            ["high-traffic", "High traffic"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`rounded-md border px-3 py-2 text-sm font-medium ${profile === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              onClick={() => applyProfile(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="InnoDB buffer pool (% of service memory)">
          <input
            className={inputClass}
            type="number"
            min="25"
            max="80"
            value={bufferPool}
            onChange={(event) => setBufferPool(event.target.value)}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            MySQL commonly benefits from keeping most working data and indexes
            in the buffer pool, while leaving headroom for the OS and
            connections.
          </span>
        </Field>
        <Field label="Maximum connections">
          <input
            className={inputClass}
            type="number"
            min="10"
            max="10000"
            value={connections}
            onChange={(event) => setConnections(event.target.value)}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Each connection can consume additional per-session memory.
          </span>
        </Field>
        <Field label="Table open cache">
          <input
            className={inputClass}
            type="number"
            min="400"
            value={tableCache}
            onChange={(event) => setTableCache(event.target.value)}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Increase when the server repeatedly opens tables under a broad
            workload.
          </span>
        </Field>
        <Field label="Temporary table limit (MB)">
          <input
            className={inputClass}
            type="number"
            min="16"
            max="2048"
            value={tempTable}
            onChange={(event) => setTempTable(event.target.value)}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Keep this bounded because it can multiply across active sessions.
          </span>
        </Field>
        <Field label="InnoDB I/O capacity">
          <input
            className={inputClass}
            type="number"
            min="100"
            max="100000"
            value={ioCapacity}
            onChange={(event) => setIoCapacity(event.target.value)}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Match this to available disk I/O; higher is not always faster.
          </span>
        </Field>
      </section>
      <section className="space-y-4">
        <div>
          <h4 className="font-semibold text-slate-900 dark:text-slate-100">
            Slow query monitoring
          </h4>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Use this to find production queries that need indexes or query
            changes.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
          <input
            className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-offset-slate-900"
            type="checkbox"
            checked={slowQueries}
            onChange={(event) => setSlowQueries(event.target.checked)}
          />
          Enable the slow query log
        </label>
        {slowQueries && (
          <Field label="Log queries slower than (seconds)">
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.1"
              value={slowTime}
              onChange={(event) => setSlowTime(event.target.value)}
            />
          </Field>
        )}
      </section>
      <div className="flex items-start gap-3 border-t border-slate-200 pt-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          Apply behavior
        </span>
        <span>
          Performance changes will be staged in my.cnf and validated before the
          service is restarted. Buffer pool size and InnoDB thread settings may
          require a restart.
        </span>
      </div>
      {message && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      )}
      <div className="flex justify-end">
        <button
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={() =>
            setMessage(
              "Performance profile is ready. Runtime save and validation will be connected next.",
            )
          }
        >
          Save performance profile
        </button>
      </div>
    </div>
  );
}

function PHPPerformance({ version }) {
  const [profile, setProfile] = React.useState("balanced");
  const [pm, setPm] = React.useState("dynamic");
  const [maxChildren, setMaxChildren] = React.useState("20");
  const [startServers, setStartServers] = React.useState("2");
  const [minSpare, setMinSpare] = React.useState("1");
  const [maxSpare, setMaxSpare] = React.useState("5");
  const [maxRequests, setMaxRequests] = React.useState("500");
  const [memory, setMemory] = React.useState("256M");
  const [execution, setExecution] = React.useState("120");
  const [inputTime, setInputTime] = React.useState("120");
  const [upload, setUpload] = React.useState("64M");
  const [opcacheMemory, setOpcacheMemory] = React.useState("128");
  const [opcacheFiles, setOpcacheFiles] = React.useState("20000");
  const [revalidate, setRevalidate] = React.useState("2");
  const [timestamps, setTimestamps] = React.useState(true);
  const [slowLog, setSlowLog] = React.useState(false);
  const [slowTimeout, setSlowTimeout] = React.useState("5");
  const [message, setMessage] = React.useState("");

  function applyProfile(value) {
    setProfile(value);
    if (value === "small") {
      setMaxChildren("8");
      setStartServers("1");
      setMinSpare("1");
      setMaxSpare("3");
      setMemory("128M");
      setOpcacheMemory("64");
    }
    if (value === "balanced") {
      setMaxChildren("20");
      setStartServers("2");
      setMinSpare("1");
      setMaxSpare("5");
      setMemory("256M");
      setOpcacheMemory("128");
    }
    if (value === "high-traffic") {
      setMaxChildren("50");
      setStartServers("4");
      setMinSpare("4");
      setMaxSpare("12");
      setMemory("512M");
      setOpcacheMemory("256");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          PHP-FPM performance · PHP {version}
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Tune worker capacity, request safety, OPcache, uploads, and
          slow-request diagnostics for this PHP runtime.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["FPM workers", `${maxChildren} max`, "Concurrent PHP requests"],
          ["Memory limit", memory, "Per-script ceiling"],
          ["OPcache", `${opcacheMemory} MB`, "Compiled script cache"],
          [
            "Slow log",
            slowLog ? `${slowTimeout}s` : "Off",
            "Slow request threshold",
          ],
        ].map(([label, value, description]) => (
          <div
            key={label}
            className="rounded-md border border-slate-200 p-4 dark:border-slate-700"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {value}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {description}
            </p>
          </div>
        ))}
      </div>
      <section className="space-y-4">
        <div>
          <h4 className="font-semibold text-slate-900 dark:text-slate-100">
            FPM process pool
          </h4>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Choose a starting profile, then control how PHP workers are created
            and recycled.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["small", "Small site"],
            ["balanced", "Balanced"],
            ["high-traffic", "High traffic"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => applyProfile(value)}
              className={`rounded-md border px-3 py-2 text-sm font-medium ${profile === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Process manager">
            <select
              className={`${inputClass} bg-white dark:bg-slate-900`}
              value={pm}
              onChange={(event) => setPm(event.target.value)}
            >
              <option value="dynamic">Dynamic</option>
              <option value="ondemand">On demand</option>
              <option value="static">Static</option>
            </select>
          </Field>
          <Field label="Maximum children">
            <input
              className={inputClass}
              type="number"
              min="1"
              value={maxChildren}
              onChange={(event) => setMaxChildren(event.target.value)}
            />
          </Field>
          <Field label="Start servers">
            <input
              className={inputClass}
              type="number"
              min="1"
              value={startServers}
              onChange={(event) => setStartServers(event.target.value)}
            />
          </Field>
          <Field label="Minimum spare servers">
            <input
              className={inputClass}
              type="number"
              min="0"
              value={minSpare}
              onChange={(event) => setMinSpare(event.target.value)}
            />
          </Field>
          <Field label="Maximum spare servers">
            <input
              className={inputClass}
              type="number"
              min="1"
              value={maxSpare}
              onChange={(event) => setMaxSpare(event.target.value)}
            />
          </Field>
          <Field label="Requests per worker">
            <input
              className={inputClass}
              type="number"
              min="0"
              value={maxRequests}
              onChange={(event) => setMaxRequests(event.target.value)}
            />
          </Field>
        </div>
      </section>
      <section className="space-y-4">
        <div>
          <h4 className="font-semibold text-slate-900 dark:text-slate-100">
            Request limits
          </h4>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Protect the server from runaway scripts while supporting normal CMS
            and framework deployments.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Memory limit">
            <input
              className={inputClass}
              value={memory}
              onChange={(event) => setMemory(event.target.value)}
            />
          </Field>
          <Field label="Maximum execution time (s)">
            <input
              className={inputClass}
              type="number"
              min="1"
              value={execution}
              onChange={(event) => setExecution(event.target.value)}
            />
          </Field>
          <Field label="Maximum input time (s)">
            <input
              className={inputClass}
              type="number"
              min="1"
              value={inputTime}
              onChange={(event) => setInputTime(event.target.value)}
            />
          </Field>
          <Field label="Upload limit">
            <input
              className={inputClass}
              value={upload}
              onChange={(event) => setUpload(event.target.value)}
            />
          </Field>
        </div>
      </section>
      <section className="space-y-1">
        <div className="mb-3">
          <h4 className="font-semibold text-slate-900 dark:text-slate-100">
            OPcache and diagnostics
          </h4>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Keep framework code cached in production while allowing safe
            development refreshes.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="OPcache memory (MB)">
            <input
              className={inputClass}
              type="number"
              min="32"
              value={opcacheMemory}
              onChange={(event) => setOpcacheMemory(event.target.value)}
            />
          </Field>
          <Field label="Maximum cached scripts">
            <input
              className={inputClass}
              type="number"
              min="200"
              value={opcacheFiles}
              onChange={(event) => setOpcacheFiles(event.target.value)}
            />
          </Field>
          <Field label="Timestamp revalidation (seconds)">
            <input
              className={inputClass}
              type="number"
              min="0"
              value={revalidate}
              onChange={(event) => setRevalidate(event.target.value)}
            />
          </Field>
        </div>
        <ToggleRow
          label="Validate script timestamps"
          description="Keep enabled while deploying or developing; disable only with an explicit cache reset workflow."
          checked={timestamps}
          onChange={setTimestamps}
        />
        <ToggleRow
          label="Enable slow-request log"
          description="Write a trace when a PHP request exceeds the configured threshold."
          checked={slowLog}
          onChange={setSlowLog}
        />
        {slowLog && (
          <Field label="Slow request threshold (seconds)">
            <input
              className={inputClass}
              type="number"
              min="1"
              value={slowTimeout}
              onChange={(event) => setSlowTimeout(event.target.value)}
            />
          </Field>
        )}
      </section>
      {message && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            setMessage(
              "Performance profile is ready. Save php.ini to apply PHP settings and restart this runtime to reload OPcache/FPM changes.",
            )
          }
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Save performance profile
        </button>
      </div>
    </div>
  );
}

export default function ServiceManagerModal({
  service,
  installed: installedProp,
  onClose,
}) {
  if (service.id === "apache") {
    return (
      <ApacheConfigModal
        service={service}
        installed={installedProp}
        onClose={onClose}
      />
    );
  }
  if (service.id === "mariadb") {
    return (
      <MariaDbConfigModal
        service={service}
        installed={installedProp}
        onClose={onClose}
      />
    );
  }
  if (service.id === "postgresql") {
    return (
      <PostgreSqlConfigModal
        installed={installedProp}
        onClose={onClose}
      />
    );
  }
  if (service.id === "redis") {
    return (
      <RedisConfigModal
        installed={installedProp}
        onClose={onClose}
      />
    );
  }
  if (service.id === "memcached") {
    return (
      <MemcachedConfigModal
        installed={installedProp}
        onClose={onClose}
      />
    );
  }
  if (service.id === "certbot") {
    return <CertbotConfigModal installed={installedProp} onClose={onClose} />;
  }
  if (service.id === "openlitespeed") {
    return <OpenLiteSpeedConfigModal installed={installedProp} onClose={onClose} />;
  }
  if (service.id === "caddy") {
    return <CaddyConfigModal installed={installedProp} onClose={onClose} />;
  }
  if (service.id === "haproxy") {
    return <HaProxyConfigModal installed={installedProp} onClose={onClose} />;
  }
  if (service.id === "valkey") {
    return <ValkeyConfigModal installed={installedProp} onClose={onClose} />;
  }
  if (service.id === "fail2ban") {
    return <Fail2banConfigModal installed={installedProp} onClose={onClose} />;
  }
  const initialInstalledItems = Array.isArray(installedProp)
    ? installedProp
    : installedProp
      ? [installedProp]
      : [];
  const [installedItems, setInstalledItems] = React.useState(
    initialInstalledItems,
  );
  React.useEffect(() => {
    setInstalledItems(initialInstalledItems);
  }, [installedProp]);
  const installed =
    installedItems.find((item) => item.status === "running") ||
    installedItems[0];
  const isPhp = service.id === "php";
  const isMysql = service.id === "mysql";
  const isNginx = service.id === "nginx";
  const serviceLabel = isPhp
    ? `PHP-FPM ${installed?.version || service.versions[0]?.version || ""}`
    : service.name;
  const [tab, setTab] = React.useState("configuration");
  const [version, setVersion] = React.useState(
    installed?.version || service.versions[0]?.version || "",
  );
  const [availableVersions, setAvailableVersions] = React.useState(service.versions);
  const [versionsRefreshing, setVersionsRefreshing] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const [config, setConfig] = React.useState(null);
  const [text, setText] = React.useState("");
  const [logs, setLogs] = React.useState(null);
  const [extensions, setExtensions] = React.useState([]);
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState("");
  const [phpTerminalEnabled, setPhpTerminalEnabled] = React.useState(false);
  const [phpTerminalPath, setPhpTerminalPath] = React.useState("");
  const [terminalToast, setTerminalToast] = React.useState(null);
  React.useEffect(() => {
    setAvailableVersions(service.versions);
  }, [service.id, service.versions]);
  const refreshVersions = async (manual = true) => {
    setVersionsRefreshing(true);
    const response = await apiRequest(
      `/api/v1/services/${service.id}/versions/refresh`,
      { method: "POST" },
    );
    const body = response.ok
      ? await response.json()
      : { message: await readApiError(response) };
    if (response.ok && body.versions?.length) {
      setAvailableVersions(body.versions);
      window.sessionStorage.setItem(
        `server-engine:service-versions:${service.id}`,
        JSON.stringify(body.versions),
      );
      if (!body.versions.some((item) => item.version === version)) {
        setVersion(body.versions[0].version);
      }
      if (manual) {
        setTerminalToast({
          type: "success",
          message: body.message || "Versions refreshed successfully.",
        });
      }
    } else if (manual) {
      setTerminalToast({
        type: "error",
        message: body.message || "Unable to refresh versions.",
      });
    }
    setVersionsRefreshing(false);
  };
  React.useEffect(() => {
    const cacheKey = `server-engine:service-versions:${service.id}`;
    try {
      const cached = JSON.parse(window.sessionStorage.getItem(cacheKey) || "null");
      if (Array.isArray(cached) && cached.length) {
        setAvailableVersions(cached);
        if (!cached.some((item) => item.version === version)) {
          setVersion(cached[0].version);
        }
        return;
      }
    } catch {
      window.sessionStorage.removeItem(cacheKey);
    }
    refreshVersions(false);
  }, [service.id]);
  const query =
    isPhp && version ? `?version=${encodeURIComponent(version)}&file=ini` : "";
  React.useEffect(() => {
    apiRequest(`/api/v1/services/${service.id}/configuration${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((value) => {
        setConfig(value);
        setText(value?.content || "");
      })
      .catch(() => {});
  }, [service.id, query]);
  React.useEffect(() => {
    if (!isPhp || !version) return undefined;
    apiRequest(`/api/v1/services/php/${encodeURIComponent(version)}/terminal`)
      .then((r) => (r.ok ? r.json() : null))
      .then((value) => {
        if (!value) return;
        setPhpTerminalEnabled(Boolean(value.enabled));
        setPhpTerminalPath(value.path || "");
      })
      .catch(() => {});
    return undefined;
  }, [isPhp, version]);
  const loadLogs = React.useCallback(
    () =>
      apiRequest(
        `/api/v1/services/${service.id}/logs?lines=100${isPhp && version ? `&version=${encodeURIComponent(version)}` : ""}`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then(setLogs)
        .catch(() => {}),
    [service.id, isPhp, version],
  );
  React.useEffect(() => {
    if (tab !== "logs") return undefined;
    loadLogs();
    const timer = setInterval(loadLogs, 2000);
    return () => clearInterval(timer);
  }, [tab, loadLogs]);
  React.useEffect(() => {
    if (!isPhp || tab !== "extensions" || !version) return undefined;
    const load = () =>
      apiRequest(
        `/api/v1/services/php/${encodeURIComponent(version)}/extensions`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((value) => setExtensions(value?.extensions || []))
        .catch(() => {});
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [isPhp, tab, version]);
  function buildMySQLConfig(values) {
    const sqlMode =
      values.sqlMode === "strict"
        ? "STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION"
        : "";
    const replacements = {
      "bind-address": values.bindAddress,
      port: values.port,
      max_connections: values.maxConnections,
      sql_mode: sqlMode,
      datadir: values.dataDirectory,
      slow_query_log: values.slowQueryLog === "on" ? "ON" : "OFF",
    };
    let next = text || "[mysqld]\n";
    Object.entries(replacements).forEach(([key, value]) => {
      const line = `${key}=${value}`;
      const pattern = new RegExp(`^${key}\\s*=.*$`, "mi");
      next = pattern.test(next)
        ? next.replace(pattern, line)
        : `${next.trimEnd()}\n${line}\n`;
    });
    return next;
  }
  async function save(content = text) {
    setBusy(true);
    const r = await apiRequest(
      `/api/v1/services/${service.id}/configuration${query}`,
      { method: "PUT", body: JSON.stringify({ content }) },
    );
    const body = r.ok ? await r.json() : { message: await readApiError(r) };
    if (r.ok) setText(content);
    setMessage(
      body.saved ? `Saved. Backup created at ${body.backup}` : body.message,
    );
    setBusy(false);
  }
  async function saveMySQLGeneral(values) {
    await save(buildMySQLConfig(values));
  }
  async function restore() {
    setBusy(true);
    const r = await apiRequest(
      `/api/v1/services/${service.id}/configuration/restore${query}`,
      { method: "POST" },
    );
    const body = r.ok ? await r.json() : { message: await readApiError(r) };
    if (body.content !== undefined) setText(body.content);
    setMessage(body.restored ? `Restored backup ${body.backup}` : body.message);
    setBusy(false);
  }
  async function switchVersion(event) {
    event.preventDefault();
    setBusy(true);
    const r = await apiRequest(
      `/api/v1/services/${service.id}/switch-version`,
      { method: "POST", body: JSON.stringify({ version, confirmed }) },
    );
    const body = r.ok ? await r.json() : { message: await readApiError(r) };
    setMessage(body.message || "Version switch request rejected.");
    setBusy(false);
  }
  async function installExtension(extension) {
    setBusy(true);
    const r = await apiRequest(
      `/api/v1/services/php/${encodeURIComponent(version)}/extensions/install`,
      { method: "POST", body: JSON.stringify({ extension, confirmed: true }) },
    );
    const body = r.ok ? await r.json() : { message: await readApiError(r) };
    setMessage(body.message || "Extension installation failed.");
    setBusy(false);
  }
  async function savePhpTerminalAccess() {
    setBusy(true);
    const r = await apiRequest(
      `/api/v1/services/php/${encodeURIComponent(version)}/terminal`,
      {
        method: "PUT",
        body: JSON.stringify({ enabled: phpTerminalEnabled }),
      },
    );
    const body = r.ok ? await r.json() : { message: await readApiError(r) };
    if (r.ok) {
      setTerminalToast({
        type: "success",
        message: phpTerminalEnabled
          ? `PHP ${version} is now available as php in new local terminal sessions.`
          : `PHP ${version} was removed from new local terminal sessions.`,
      });
    } else {
      setTerminalToast({ type: "error", message: body.message });
    }
    setBusy(false);
    return r.ok;
  }
  async function serviceAction(actionName) {
    setAction(actionName);
    const actionProgress =
      actionName === "stop"
        ? "Stopping"
        : actionName === "start"
          ? "Starting"
          : actionName === "restart"
            ? "Restarting"
            : `${actionName[0].toUpperCase()}${actionName.slice(1)}`;
    setMessage(`${actionProgress} ${serviceLabel}…`);
    const r = await apiRequest(`/api/v1/services/${service.id}/action`, {
      method: "POST",
      body: JSON.stringify({
        action: actionName,
        ...(isPhp ? { version } : {}),
      }),
    });
    const body = r.ok ? await r.json() : { message: await readApiError(r) };
    if (!r.ok || !body.job_id) {
      setMessage(body.message || "Service action failed.");
      setAction("");
      return;
    }
    let finalJob;
    for (let i = 0; i < 30; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const jobs = await apiRequest("/api/v1/jobs").then((x) =>
        x.ok ? x.json() : [],
      );
      finalJob = jobs.find((job) => job.id === body.job_id);
      if (
        finalJob &&
        ["succeeded", "failed", "cancelled"].includes(finalJob.status)
      )
        break;
    }
    setMessage("");
    setAction("");
    const refreshed = await apiRequest("/api/v1/services/installed");
    if (refreshed.ok) {
      const detected = await refreshed.json();
      setInstalledItems(
        detected.filter(
          (item) =>
            item.id === service.id || item.id.startsWith(`${service.id}@`),
        ),
      );
    }
  }
  const running = installed?.status === "running";
  const primary = running ? "stop" : "start";
  const actionLabel = action
    ? `${action === "stop" ? "Stopping" : action === "start" ? "Starting" : action === "restart" ? "Restarting" : action}…`
    : primary === "stop"
      ? "Stop"
      : "Start";
  const visibleTabs = tabs.filter(([id]) => {
    if (id === "extensions") return isPhp;
    if (id === "terminal") return isPhp;
    if (id === "mysql-file") return isMysql;
    if (id === "nginx-file") return isNginx;
    if (id === "versions") return !isPhp;
    return true;
  });
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {serviceLabel}
            </h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span
                className={`h-2 w-2 rounded-full ${running ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {installed?.status || "not installed"}
              {installed?.version && ` · v${installed.version}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close service configuration"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 flex gap-5 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800">
          {visibleTabs.map(([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
            >
              <Icon size={15} />
              {isNginx && id === "configuration"
                ? "Overview"
                : isMysql && id === "tuning"
                  ? "Performance"
                  : label}
            </button>
          ))}
        </div>
        {tab === "configuration" && (
          <div className="manager-pane">
            {isMysql ? (
              <MySQLGeneral
                service={service}
                configText={text}
                busy={busy}
                message={message}
                onSave={saveMySQLGeneral}
              />
            ) : isNginx ? (
              <NginxOverview config={config} text={text} />
            ) : (
              <PHPConfig
                config={config}
                text={text}
                setText={setText}
                message={message}
                busy={busy}
                save={save}
                restore={restore}
              />
            )}
          </div>
        )}
        {tab === "mysql-file" && isMysql && (
          <div className="manager-pane">
            <MySQLFile
              config={config}
              text={text}
              setText={setText}
              message={message}
              busy={busy}
              save={save}
              restore={restore}
            />
          </div>
        )}
        {tab === "nginx-file" && isNginx && (
          <div className="manager-pane">
            <NginxFile
              config={config}
              text={text}
              setText={setText}
              message={message}
              busy={busy}
              save={save}
              restore={restore}
            />
          </div>
        )}
        {tab === "extensions" && isPhp && (
          <div className="manager-pane space-y-1">
            {extensions.map((extension) => (
              <div
                className="flex items-center justify-between gap-4 border-b border-slate-200 py-2.5 last:border-b-0 dark:border-slate-700"
                key={extension.id}
              >
                <div>
                  <strong className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {extension.name}
                  </strong>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {extension.description}
                  </p>
                </div>
                {extension.installed ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={15} />
                    Installed
                  </span>
                ) : (
                  <button
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    disabled={busy}
                    onClick={() => installExtension(extension.id)}
                  >
                    {busy ? "Installing…" : "Install"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {tab === "terminal" && isPhp && (
          <div className="manager-pane space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                PHP {version} in Terminal
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Enable this version to use the isolated PHP runtime by typing <code>php</code> in new local terminal sessions. The server’s existing PHP command is not changed.
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-3 border-y border-slate-200 py-4 dark:border-slate-800">
              <input
                type="checkbox"
                checked={phpTerminalEnabled}
                onChange={(event) => setPhpTerminalEnabled(event.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                  Make PHP {version} available as php
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                  PHP CLI tools from this isolated version will be placed first in PATH. Reconnect the terminal after saving.
                </span>
              </span>
            </label>
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p>Mapped command</p>
              <code className="block break-all text-xs text-slate-500 dark:text-slate-400">
                php → {phpTerminalPath || "Loading…"}
              </code>
            </div>
            <div className="flex justify-end">
              <SaveButton saving={busy} onClick={savePhpTerminalAccess}>
                Save terminal access
              </SaveButton>
            </div>
          </div>
        )}
        {tab === "versions" && (
          <form className="manager-pane space-y-4" onSubmit={switchVersion}>
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {service.name} version
              </label>
              {isMysql && (
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-blue-400 dark:hover:text-blue-300"
                  onClick={refreshVersions}
                  disabled={versionsRefreshing || busy}
                >
                  <RefreshCw size={13} className={versionsRefreshing ? "animate-spin" : ""} />
                  {versionsRefreshing ? "Fetching…" : "Fetch compatible versions"}
                </button>
              )}
            </div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              <select
                className={`${inputClass} bg-white dark:bg-slate-900`}
                value={version}
                onChange={(event) => setVersion(event.target.value)}
              >
                {availableVersions.map((item) => (
                  <option key={item.version} value={item.version}>
                    {item.version} · {item.channel}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-offset-slate-900"
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Queue this version installation or switch.
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                disabled={!confirmed || busy}
              >
                <Settings2 size={14} />
                {busy ? "Queueing…" : "Install / switch version"}
              </button>
            </div>
            {message && (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {message}
              </p>
            )}
          </form>
        )}
        {tab === "runtime" && (
          <div className="manager-pane">
            <div className="flex items-start gap-3">
              <Server size={18} />
              <div>
                <strong>
                  {running
                    ? `${serviceLabel} is running`
                    : `${serviceLabel} is installed but stopped`}
                </strong>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {isPhp
                    ? `Version ${version} uses its own pool and socket.`
                    : isMysql
                      ? "MySQL uses its own data directory, port, process, and error log."
                      : `${service.name} runs from the Server Engine service root.`}
                </p>
                <div className="service-control-actions">
                  <button
                    className={
                      primary === "stop"
                        ? "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
                        : "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    }
                    disabled={Boolean(action)}
                    onClick={() => serviceAction(primary)}
                  >
                    {actionLabel}
                  </button>
                  {running && (
                    <button
                      className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      disabled={Boolean(action)}
                      onClick={() => serviceAction("restart")}
                    >
                      {action === "restart" ? "Restarting…" : "Restart"}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {message && (
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                {message}
              </p>
            )}
          </div>
        )}
        {tab === "tuning" &&
          (isMysql ? (
            <div className="manager-pane">
              <MySQLPerformance />
            </div>
          ) : isNginx ? (
            <div className="manager-pane">
              <NginxPerformance />
            </div>
          ) : isPhp ? (
            <div className="manager-pane">
              <PHPPerformance version={version} />
            </div>
          ) : (
            <div className="manager-pane">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{`${service.name} performance`}</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Resource and runtime settings apply to {service.name}.
              </p>
            </div>
          ))}
        {tab === "logs" && (
          <div className="manager-pane">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Tail 100 lines · {logs?.path || "Loading…"}
              </span>
              <button
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                onClick={loadLogs}
              >
                <RefreshCw size={14} />
                Reload
              </button>
            </div>
            <pre className="service-log">
              {logs?.available
                ? logs.lines.join("\n") || "No error log lines recorded."
                : "No error log exists yet."}
            </pre>
          </div>
        )}
      </section>
      <Toast
        message={terminalToast?.message}
        type={terminalToast?.type}
        onClose={() => setTerminalToast(null)}
      />
    </div>
  );
}
