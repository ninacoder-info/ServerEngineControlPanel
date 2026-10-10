import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Info, Server, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { apiRequest, readApiError } from "../../lib/api";
import { showToast } from "../../components/Toast";

const schema = z.object({
  enabled: z.boolean(),
  input_policy: z.enum(["accept", "drop"]),
  forward_policy: z.enum(["accept", "drop"]),
});

const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold";

function StatusRow({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-200 py-3 last:border-b-0 dark:border-neutral-800">
      <div>
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </p>
        {hint && (
          <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            {hint}
          </p>
        )}
      </div>
      <strong className="text-right text-sm text-neutral-700 dark:text-neutral-300">
        {value}
      </strong>
    </div>
  );
}

export default function NftablesConfigModal({ onClose, onSaved }) {
  const [config, setConfig] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      enabled: true,
      input_policy: "accept",
      forward_policy: "accept",
    },
  });
  const { register, handleSubmit, reset, watch } = form;
  const enabled = watch("enabled");
  const inputPolicy = watch("input_policy");
  const forwardPolicy = watch("forward_policy");

  React.useEffect(() => {
    let active = true;
    apiRequest("/api/v1/firewall/config")
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response));
        return response.json();
      })
      .then((value) => {
        if (!active) return;
        setConfig(value);
        reset({
          enabled: value.enabled,
          input_policy: value.input_policy,
          forward_policy: value.forward_policy,
        });
      })
      .catch((error) => {
        if (active)
          showToast(
            error.message || "Unable to load nftables configuration",
            "error",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reset]);

  const save = async (values) => {
    setSaving(true);
    const response = await apiRequest("/api/v1/firewall/config", {
      method: "PUT",
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      showToast(
        await readApiError(response, "Unable to save nftables configuration"),
        "error",
      );
      setSaving(false);
      return;
    }
    const value = await response.json();
    setConfig(value);
    reset({
      enabled: value.enabled,
      input_policy: value.input_policy,
      forward_policy: value.forward_policy,
    });
    showToast("nftables configuration saved", "success");
    onSaved(value);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="w-full max-w-3xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div className="flex min-w-0 items-start gap-3">
            <Server className="mt-0.5 shrink-0 text-blue-600" size={20} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                Firewall service
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                Configure nftables
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                Configure the Server Engine managed firewall tables without
                changing unrelated nftables rules.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close nftables configuration"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit(save)}>
          <div className="space-y-6 p-6">
            {loading ? (
              <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                Loading nftables configuration…
              </div>
            ) : (
              <>
                <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-800">
                  <span>
                    <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      Enable managed nftables rules
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                      When disabled, Server Engine removes only its managed
                      tables and leaves other nftables tables untouched.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
                    {...register("enabled")}
                  />
                </label>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Input chain default policy
                    <select
                      className={inputClass}
                      disabled={!enabled}
                      {...register("input_policy")}
                    >
                      <option value="accept">Accept</option>
                      <option value="drop">Drop</option>
                    </select>
                    <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">
                      Applies when an incoming packet does not match an allow
                      rule.
                    </span>
                  </label>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Forward chain default policy
                    <select
                      className={inputClass}
                      disabled={!enabled}
                      {...register("forward_policy")}
                    >
                      <option value="accept">Accept</option>
                      <option value="drop">Drop</option>
                    </select>
                    <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">
                      Controls routed traffic and port-forwarding behavior.
                    </span>
                  </label>
                </div>

                {enabled &&
                  (inputPolicy === "drop" || forwardPolicy === "drop") && (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 shrink-0" size={17} />
                      <p>
                        Drop policies can lock out SSH, the panel, websites, or
                        forwarded services unless matching allow rules are
                        enabled first. Test from a second session before
                        applying them.
                      </p>
                    </div>
                  )}

                <div className="border-t border-neutral-200 pt-2 dark:border-neutral-800">
                  <StatusRow
                    label="Backend"
                    value={config?.available ? "Available" : "Unavailable"}
                    hint={config?.backend_message}
                  />
                  <StatusRow
                    label="Managed filter table"
                    value={`inet ${config?.table_name || "server_engine_firewall"}`}
                  />
                  <StatusRow
                    label="Managed NAT table"
                    value={`ip ${config?.nat_table_name || "server_engine_firewall_nat"}`}
                  />
                  <StatusRow
                    label="IP forwarding"
                    value={config?.forwarding_enabled ? "Enabled" : "Disabled"}
                    hint="Required for port forwarding to route packets."
                  />
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-200">
                  {config?.available ? (
                    <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
                  ) : (
                    <Info className="mt-0.5 shrink-0" size={17} />
                  )}
                  <p>
                    Server Engine validates the generated ruleset before
                    applying it. Existing rules, aliases, blocked addresses, and
                    forwarding entries remain managed from this Firewall page.
                  </p>
                </div>
              </>
            )}
          </div>
          <footer className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4 dark:border-neutral-800">
            <button
              type="button"
              className={`${buttonClass} border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300`}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={loading || saving || (!config?.available && enabled)}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
