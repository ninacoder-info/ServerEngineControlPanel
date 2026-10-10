import React from "react";
import { apiRequest, readApiError } from "../../lib/api";
import Toast from "../../components/Toast";

export default function StartupPolicyToggle({
  serviceId,
  version,
  label = "Start with operating system",
}) {
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
    const response = await apiRequest(
      `/api/v1/services/${serviceId}/startup${query}`,
      {
        method: "PUT",
        body: JSON.stringify({
          enabled: next,
          ...(version ? { version } : {}),
        }),
      },
    );
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
      <label className="mt-5 flex cursor-pointer items-start gap-3 border-t border-neutral-200 pt-4 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!loaded || busy}
          onChange={update}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-wait disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800"
        />
        <span>
          <span className="block font-medium text-neutral-900 dark:text-neutral-100">
            {label}
          </span>
          <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
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
