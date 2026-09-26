import React from "react";
import { Save, X } from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";

const empty = {
  name: "",
  domain: "",
  aliases: "",
  project_path: "/server-engine/www/",
  web_root: ".",
  php_version: "",
  framework: "generic_php",
  server_type: "nginx",
  ssl_enabled: false,
  ssl_enforce_tls: false,
  ssl_allow_http: true,
  database_enabled: false,
  database_name: "",
  database_user: "",
  notes: "",
  tags: "",
};

export default function WebsiteFormModal({
  site,
  defaultRoot,
  phpVersions,
  onClose,
  onSaved,
}) {
  const [form, setForm] = React.useState(empty);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const editing = Boolean(site?.id);
  React.useEffect(() => {
    setForm(
      site?.id
        ? {
            ...empty,
            ...site,
            aliases: site.aliases.join(", "),
            tags: site.tags.join(", "),
          }
        : { ...empty, project_path: `${defaultRoot || "/server-engine/www"}/` },
    );
    setError("");
  }, [site, defaultRoot]);
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      ...form,
      aliases: form.aliases
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      tags: form.tags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
    const response = await apiRequest(
      editing ? `/api/v1/websites/${site.id}` : "/api/v1/websites",
      { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) },
    );
    if (!response.ok) setError(await readApiError(response));
    else {
      onSaved(await response.json());
      onClose();
    }
    setBusy(false);
  };
  const field = (key, label, type = "text", placeholder = "") => (
    <label className="website-field">
      <span>{label}</span>
      <input
        type={type}
        value={form[key] ?? ""}
        placeholder={placeholder}
        onChange={(event) =>
          change(
            key,
            type === "checkbox" ? event.target.checked : event.target.value,
          )
        }
      />
    </label>
  );
  if (!site) return null;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="modal-card website-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">WEBSITE CONFIGURATION</p>
            <h2>{editing ? "Edit website" : "Create website"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {error && <div className="website-error">{error}</div>}
        <div className="website-form-grid">
          {field("name", "Display name", "text", "My production site")}
          {field("domain", "Primary domain", "text", "example.test")}
          {field(
            "aliases",
            "Domain aliases",
            "text",
            "www.example.test, api.example.test",
          )}
          {field(
            "project_path",
            "Project folder",
            "text",
            `${defaultRoot || "/server-engine/www"}/example.test`,
          )}
          {field(
            "web_root",
            "Document root inside project",
            "text",
            ". or public",
          )}
          {field(
            "php_version",
            "PHP-FPM version",
            "text",
            phpVersions.length
              ? "Choose an installed version"
              : "No PHP runtime installed",
          )}
          {
            <label className="website-field">
              <span>Web server</span>
              <select
                value={form.server_type}
                onChange={(event) => change("server_type", event.target.value)}
              >
                <option value="nginx">Nginx</option>
                <option value="apache">Apache</option>
              </select>
            </label>
          }
          {
            <label className="website-field">
              <span>Framework preset</span>
              <select
                value={form.framework}
                onChange={(event) => change("framework", event.target.value)}
              >
                <option value="generic_php">Generic PHP</option>
                <option value="laravel">Laravel</option>
                <option value="wordpress">WordPress</option>
                <option value="symfony">Symfony</option>
                <option value="codeigniter">CodeIgniter</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          }
        </div>
        <div className="website-form-section">
          <h3>TLS and database</h3>
          <div className="website-checks">
            <label>
              <input
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-offset-slate-900"
                type="checkbox"
                checked={form.ssl_enabled}
                onChange={(event) =>
                  change("ssl_enabled", event.target.checked)
                }
              />{" "}
              TLS enabled
            </label>
            <label>
              <input
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-offset-slate-900"
                type="checkbox"
                checked={form.ssl_enforce_tls}
                onChange={(event) =>
                  change("ssl_enforce_tls", event.target.checked)
                }
              />{" "}
              Redirect HTTP to HTTPS
            </label>
            <label>
              <input
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-offset-slate-900"
                type="checkbox"
                checked={form.database_enabled}
                onChange={(event) =>
                  change("database_enabled", event.target.checked)
                }
              />{" "}
              Attach a database
            </label>
          </div>
          {form.database_enabled && (
            <div className="website-form-grid">
              {field("database_name", "Database name", "text", "example_db")}
              {field("database_user", "Database user", "text", "example_user")}
            </div>
          )}
        </div>
        <div className="website-form-grid">
          {field("tags", "Tags", "text", "production, wordpress")}
          {field("notes", "Notes", "text", "Optional deployment notes")}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            disabled={busy}
          >
            <Save size={15} />
            {busy ? "Saving…" : editing ? "Save website" : "Create website"}
          </button>
        </div>
      </form>
    </div>
  );
}
