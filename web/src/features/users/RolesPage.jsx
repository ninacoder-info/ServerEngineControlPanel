import React from "react";
import { Check, CirclePlus, LockKeyhole, Pencil, RefreshCw, Search, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import Toast from "../../components/Toast";

const permissionAreas = [
  ["websites", "Websites"], ["domains", "Domains"], ["files", "Files"],
  ["databases", "Databases"], ["backups", "Backups"], ["mail", "Mail"],
  ["services", "Services"], ["logs", "Logs"], ["firewall", "Firewall"],
  ["malware", "Malware scanner"], ["docker", "Docker"], ["jobs", "Jobs"],
  ["cron", "Cron jobs"], ["supervisor", "Supervisor"],
];

const inputClass = "mt-2 block min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const panelClass = "rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900";

function RoleModal({ role, saving, onClose, onSave }) {
  const editing = Boolean(role);
  const [form, setForm] = React.useState(role || { id: "", name: "", description: "", permissions: [] });
  const [error, setError] = React.useState("");
  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = (permission) => setValue("permissions", form.permissions.includes(permission) ? form.permissions.filter((item) => item !== permission) : [...form.permissions, permission]);
  async function submit(event) {
    event.preventDefault();
    setError("");
    try { await onSave(form, editing); } catch (requestError) { setError(requestError.message || "Could not save role."); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-neutral-950/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
    <form onSubmit={submit} className="my-4 max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-5"><div><div className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400"><ShieldCheck size={16} />Access control</div><h2 className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{editing ? "Edit role" : "Create role"}</h2><p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">Choose the areas this role can access. Permissions apply to every user assigned to this role.</p></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Close"><X size={18} /></button></div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Role name<input required className={inputClass} value={form.name} onChange={(event) => { const name = event.target.value; setValue("name", name); if (!editing && !form.id) setValue("id", name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")); }} placeholder="Content manager" /></label><label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Role ID<input required readOnly={editing} pattern="[a-z][a-z0-9_-]*" className={`${inputClass} ${editing ? "opacity-60" : ""}`} value={form.id} onChange={(event) => setValue("id", event.target.value.toLowerCase())} placeholder="content_manager" /></label></div>
      <label className="mt-4 block text-sm font-semibold text-neutral-700 dark:text-neutral-300">Description<textarea className={`${inputClass} min-h-20`} value={form.description} onChange={(event) => setValue("description", event.target.value)} placeholder="Manage website content without server controls." /></label>
      <div className="mt-6"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Permission areas</h3><p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Select only what this role needs.</p></div><span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{form.permissions.length} selected</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{permissionAreas.map(([id, label]) => <label key={id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-700 hover:border-blue-300 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-blue-700"><input type="checkbox" checked={form.permissions.includes(id)} onChange={() => toggle(id)} className="h-4 w-4 rounded accent-blue-600" />{label}</label>)}</div></div>
      {error && <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
      <div className="mt-7 flex justify-end gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800"><button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"><Check size={16} />{saving ? "Saving…" : editing ? "Save changes" : "Create role"}</button></div>
    </form>
  </div>;
}

function DeleteRoleModal({ role, roles, saving, onClose, onDelete }) {
  const [replacement, setReplacement] = React.useState(roles.find((item) => item.id !== role.id)?.id || "administrator");
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-neutral-950/60 p-4"><section className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"><Trash2 size={18} /></span><div><h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Delete {role.name}?</h2><p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">{role.assigned_count || 0} assigned user{role.assigned_count === 1 ? " is" : "s are"} will be moved to the replacement role before deletion.</p></div></div><label className="mt-5 block text-sm font-semibold text-neutral-700 dark:text-neutral-300">Move assigned users to<select className={inputClass} value={replacement} onChange={(event) => setReplacement(event.target.value)}>{roles.filter((item) => item.id !== role.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">Cancel</button><button type="button" disabled={saving} onClick={() => onDelete(role.id, replacement)} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"><Trash2 size={15} />{saving ? "Deleting…" : "Move users and delete"}</button></div></section></div>;
}

export default function RolesPage() {
  const [roles, setRoles] = React.useState([]);
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState("roles");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const [editor, setEditor] = React.useState(undefined);
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  const loadRoles = React.useCallback(async () => {
    const response = await apiRequest("/api/v1/users/roles");
    if (!response.ok) throw new Error(await readApiError(response, "Could not load roles."));
    const payload = await response.json();
    setRoles(Array.isArray(payload.roles) ? payload.roles : []);
    setError("");
  }, []);
  React.useEffect(() => { let active = true; loadRoles().catch((requestError) => active && setError(requestError.message)).finally(() => active && setLoading(false)); return () => { active = false; }; }, [loadRoles]);
  React.useEffect(() => {
    const refresh = () => loadRoles().catch((requestError) => setError(requestError.message));
    window.addEventListener("serverengine:roles", refresh);
    return () => window.removeEventListener("serverengine:roles", refresh);
  }, [loadRoles]);

  async function saveRole(form, editing) {
    setSaving(true);
    try {
      const response = await apiRequest(editing ? `/api/v1/users/roles/${encodeURIComponent(form.id)}` : "/api/v1/users/roles", { method: editing ? "PUT" : "POST", body: JSON.stringify({ id: form.id, name: form.name.trim(), description: form.description.trim(), permissions: form.permissions }) });
      if (!response.ok) throw new Error(await readApiError(response, editing ? "Could not update role." : "Could not create role."));
      const saved = await response.json();
      setRoles((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved].sort((a, b) => Number(b.system_role) - Number(a.system_role) || a.name.localeCompare(b.name)));
      setEditor(undefined);
      setToast({ type: "success", message: editing ? "Role updated." : "Role created." });
    } finally { setSaving(false); }
  }
  async function deleteRole(roleId, replacementRole) {
    setSaving(true);
    try {
      const response = await apiRequest(`/api/v1/users/roles/${encodeURIComponent(roleId)}`, { method: "DELETE", body: JSON.stringify({ replacement_role: replacementRole }) });
      if (!response.ok) throw new Error(await readApiError(response, "Could not delete role."));
      setRoles((current) => current.filter((item) => item.id !== roleId));
      setDeleteTarget(null);
      setToast({ type: "success", message: "Role deleted." });
    } catch (requestError) { setToast({ type: "error", message: requestError.message }); } finally { setSaving(false); }
  }
  const visible = roles.filter((role) => `${role.name} ${role.id} ${role.description}`.toLowerCase().includes(query.toLowerCase()));
  const customCount = roles.filter((role) => !role.system_role).length;
  const assignedCount = roles.reduce((sum, role) => sum + Number(role.assigned_count || 0), 0);

  return <div className="space-y-7"><Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} /><header className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div className="flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><ShieldCheck size={23} /></div><div><p className="text-sm font-semibold text-violet-600 dark:text-violet-400">Server administration</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Roles & permissions</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">Control which parts of Server Engine each panel user can access. Administrator is protected.</p></div></div><div className="flex gap-3"><button type="button" onClick={() => loadRoles().catch((requestError) => setError(requestError.message))} className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"><RefreshCw size={16} />Refresh</button><button type="button" onClick={() => setEditor({})} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"><CirclePlus size={17} />Create role</button></div></header>
    <section className="grid gap-4 sm:grid-cols-3"><div className={`${panelClass} p-5`}><div className="flex items-center gap-3"><ShieldCheck className="text-violet-600 dark:text-violet-400" size={19} /><strong className="text-2xl text-neutral-900 dark:text-neutral-100">{roles.length}</strong></div><p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">Total roles</p></div><div className={`${panelClass} p-5`}><div className="flex items-center gap-3"><CirclePlus className="text-blue-600 dark:text-blue-400" size={19} /><strong className="text-2xl text-neutral-900 dark:text-neutral-100">{customCount}</strong></div><p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">Custom roles</p></div><div className={`${panelClass} p-5`}><div className="flex items-center gap-3"><Users className="text-emerald-600 dark:text-emerald-400" size={19} /><strong className="text-2xl text-neutral-900 dark:text-neutral-100">{assignedCount}</strong></div><p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">Role assignments</p></div></section>
    <section className={`${panelClass} overflow-hidden`}><div className="flex flex-col justify-between gap-4 border-b border-neutral-200 p-5 dark:border-neutral-800 sm:flex-row sm:items-center"><div><h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Access roles</h2><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Built-in roles are protected; custom roles can be edited or removed.</p></div><label className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-950"><Search size={16} /><input className="w-full bg-transparent text-sm text-neutral-900 outline-none dark:text-neutral-100" placeholder="Search roles" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div><div className="flex gap-5 border-b border-neutral-200 px-5 pt-4 dark:border-neutral-800"><button type="button" onClick={() => setTab("roles")} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${tab === "roles" ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 dark:text-neutral-400"}`}>Roles ({roles.length})</button><button type="button" onClick={() => setTab("matrix")} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${tab === "matrix" ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 dark:text-neutral-400"}`}>Permission matrix</button></div>{error && <div className="m-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}{tab === "roles" ? <div className="overflow-x-auto">{loading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />)}</div> : <table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"><th className="px-5 py-3 font-semibold">Role</th><th className="px-4 py-3 font-semibold">Permissions</th><th className="px-4 py-3 font-semibold">Users</th><th className="px-4 py-3 font-semibold">Type</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody>{visible.map((role) => <tr key={role.id} className="border-b border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-950"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{role.system_role ? <LockKeyhole size={16} /> : <ShieldCheck size={16} />}</span><span><strong className="block text-sm text-neutral-900 dark:text-neutral-100">{role.name}</strong><code className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">{role.id}</code></span></div></td><td className="px-4 py-4 text-sm text-neutral-600 dark:text-neutral-400">{role.permissions?.includes("*") ? "Full access" : `${role.permissions?.length || 0} areas`}</td><td className="px-4 py-4 text-sm text-neutral-600 dark:text-neutral-400">{role.assigned_count || 0}</td><td className="px-4 py-4">{role.system_role ? <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">Built-in</span> : <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Custom</span>}</td><td className="px-5 py-4"><div className="flex justify-end gap-1">{role.system_role ? <span className="px-2 text-xs text-neutral-400">Protected</span> : <><button type="button" title="Edit role" onClick={() => setEditor(role)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-blue-600 dark:hover:bg-neutral-800 dark:hover:text-blue-400"><Pencil size={15} /></button><button type="button" title="Delete role" onClick={() => setDeleteTarget(role)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-neutral-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"><Trash2 size={15} /></button></>}</div></td></tr>)}</tbody></table>}{!loading && !visible.length && <div className="px-5 py-16 text-center"><ShieldCheck className="mx-auto text-neutral-300 dark:text-neutral-700" size={32} /><p className="mt-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">No roles found</p><p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Create a custom role or change the search.</p></div>}</div> : <div className="overflow-x-auto p-5"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"><th className="px-3 py-3 font-semibold">Permission</th>{visible.map((role) => <th key={role.id} className="px-3 py-3 text-center font-semibold"><span className="block max-w-24 truncate" title={role.name}>{role.name}</span></th>)}</tr></thead><tbody>{permissionAreas.map(([id, label]) => <tr key={id} className="border-b border-neutral-100 dark:border-neutral-800"><td className="px-3 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</td>{visible.map((role) => <td key={role.id} className="px-3 py-3 text-center">{role.permissions?.includes("*") || role.permissions?.includes(id) ? <Check className="mx-auto text-emerald-600 dark:text-emerald-400" size={16} /> : <span className="text-neutral-300 dark:text-neutral-700">—</span>}</td>)}</tr>)}</tbody></table></div>}</section>
    {editor !== undefined && <RoleModal role={editor?.id ? editor : null} saving={saving} onClose={() => setEditor(undefined)} onSave={saveRole} />}{deleteTarget && <DeleteRoleModal role={deleteTarget} roles={roles} saving={saving} onClose={() => setDeleteTarget(null)} onDelete={deleteRole} />}</div>;
}
