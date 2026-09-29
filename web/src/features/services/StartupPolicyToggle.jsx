import React from "react";
import { apiRequest, readApiError } from "../../lib/api";
import Toast from "../../components/Toast";

export default function StartupPolicyToggle({ serviceId, version, label = "Start with operating system" }) {
  const [enabled, setEnabled] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  const query = version ? `?version=${encodeURIComponent(version)}` : "";
  React.useEffect(() => {
    setLoaded(false);
    apiRequest(`/api/v1/services/${serviceId}/startup${query}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (value) setEnabled(Boolean(value.enabled));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [serviceId, query]);

  async function update(event) {
    const next = event.target.checked;
    setEnabled(next);
    setBusy(true);
    const response = await apiRequest(`/api/v1/services/${serviceId}/startup${query}`, {
      method: "PUT",
      body: JSON.stringify({ enabled: next, ...(version ? { version } : {}) }),
    });
    if (!response.ok) {
      setEnabled(!next);
      setToast({ type: "error", message: await readApiError(response) });
    } else {
      const body = await response.json();
      setToast({
        type: body.warning ? "warning" : "success",
        message: body.warning || `${label} ${next ? "enabled" : "disabled"}.`,
      });
    }
    setBusy(false);
  }

  return (
    <>
      <label className="mt-5 flex cursor-pointer items-start gap-3 border-t border-slate-200 pt-4 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!loaded || busy}
          onChange={update}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800"
        />
        <span>
          <span className="block font-medium text-slate-900 dark:text-slate-100">{label}</span>
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
            Starts this service automatically when Server Engine starts.
          </span>
        </span>
      </label>
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </>
  );
}
