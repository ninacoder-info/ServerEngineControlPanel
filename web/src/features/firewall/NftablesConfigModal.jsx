import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Server,
  X,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { apiRequest, readApiError } from "../../lib/api";
import { showToast } from "../../components/Toast";
import SaveButton from "../../components/SaveButton";

const schema = z.object({
  enabled: z.boolean(),
  input_policy: z.enum(["accept", "drop"]),
  forward_policy: z.enum(["accept", "drop"]),
  output_policy: z.enum(["accept", "drop"]),
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

function DdosTab({ value, onChange }) {
  return (
    <div className="space-y-5">
      <label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-blue-600"
          checked={value.enabled}
          onChange={(event) => onChange("enabled", event.target.checked)}
        />
        <span>
          <span className="block font-semibold text-neutral-900 dark:text-neutral-100">
            Enable local traffic protection
          </span>
          <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
            Apply limits before requests reach the website runtime.
          </span>
        </span>
      </label>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Mitigation mode
          <select
            className={inputClass}
            value={value.mode}
            onChange={(event) => onChange("mode", event.target.value)}
          >
            <option value="rate-limit">Rate limit</option>
            <option value="challenge">Challenge suspicious clients</option>
            <option value="block">Block over-limit clients</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Requests per second
          <input
            className={inputClass}
            type="number"
            min="1"
            value={value.requestsPerSecond}
            onChange={(event) =>
              onChange("requestsPerSecond", Number(event.target.value))
            }
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Burst allowance
          <input
            className={inputClass}
            type="number"
            min="1"
            value={value.burst}
            onChange={(event) => onChange("burst", Number(event.target.value))}
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Concurrent connections
          <input
            className={inputClass}
            type="number"
            min="1"
            value={value.concurrent}
            onChange={(event) =>
              onChange("concurrent", Number(event.target.value))
            }
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Temporary ban duration
          <input
            className={inputClass}
            value={value.banDuration}
            onChange={(event) => onChange("banDuration", event.target.value)}
            placeholder="10m"
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 md:col-span-2">
          Trusted proxy networks
          <textarea
            className={`${inputClass} min-h-24`}
            value={value.trustedProxies}
            onChange={(event) => onChange("trustedProxies", event.target.value)}
            placeholder="One CIDR range per line"
          />
        </label>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-blue-600"
          checked={value.logMitigations}
          onChange={(event) =>
            onChange("logMitigations", event.target.checked)
          }
        />
        <span>
          <span className="block font-medium">Log mitigation events</span>
          <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
            Keep rate-limit and temporary-block decisions available for review.
          </span>
        </span>
      </label>
    </div>
  );
}

export default function NftablesConfigModal({
  onClose,
  onSaved,
  ddos,
  onDdosChange,
  onDdosSave,
}) {
  const [activeTab, setActiveTab] = React.useState("nftables");
  const [config, setConfig] = React.useState(null);
  const [overview, setOverview] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      enabled: true,
      input_policy: "drop",
      forward_policy: "accept",
      output_policy: "accept",
    },
  });
  const { register, handleSubmit, reset, watch } = form;
  const enabled = watch("enabled");
  const inputPolicy = watch("input_policy");
  const forwardPolicy = watch("forward_policy");
  const outputPolicy = watch("output_policy");

  React.useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest("/api/v1/firewall/config"),
      apiRequest("/api/v1/firewall"),
    ])
      .then(async ([configResponse, overviewResponse]) => {
        if (!configResponse.ok)
          throw new Error(await readApiError(configResponse));
        if (!overviewResponse.ok)
          throw new Error(await readApiError(overviewResponse));
        return Promise.all([configResponse.json(), overviewResponse.json()]);
      })
      .then(([value, currentOverview]) => {
        if (!active) return;
        setConfig(value);
        setOverview(currentOverview);
        reset({
          enabled: value.enabled,
          input_policy: value.input_policy,
          forward_policy: value.forward_policy,
          output_policy: value.output_policy,
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
      output_policy: value.output_policy,
    });
    const currentOverview = await apiRequest("/api/v1/firewall");
    if (currentOverview.ok) setOverview(await currentOverview.json());
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

        <div className="flex border-b border-neutral-200 px-6 dark:border-neutral-800">
          {["nftables", "ddos"].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === tab ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "nftables" ? "nftables" : "DDoS protection"}
            </button>
          ))}
        </div>

        <form
          onSubmit={
            activeTab === "ddos"
              ? (event) => {
                  event.preventDefault();
                  onDdosSave();
                }
              : handleSubmit(save)
          }
        >
          <div className="space-y-6 p-6">
            {activeTab === "ddos" ? (
              <DdosTab value={ddos} onChange={onDdosChange} />
            ) : loading ? (
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
                    Output chain default policy
                    <select
                      className={inputClass}
                      disabled={!enabled}
                      {...register("output_policy")}
                    >
                      <option value="accept">Accept</option>
                      <option value="drop">Drop</option>
                    </select>
                    <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">
                      Controls traffic leaving this server. Accept is the
                      recommended default unless outbound traffic is restricted.
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
                  (inputPolicy === "drop" ||
                    forwardPolicy === "drop" ||
                    outputPolicy === "drop") && (
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
                    value={
                      config?.available ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={16} />
                          Available
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400">
                          Unavailable
                        </span>
                      )
                    }
                    hint={config?.backend_message}
                  />
                  <StatusRow
                    label="Managed rules"
                    value={
                      overview?.status === "protected" ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={16} />
                          Applied
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">
                          {overview?.status === "disabled"
                            ? "Disabled"
                            : "Not applied"}
                        </span>
                      )
                    }
                    hint="Shows whether the current managed ruleset is loaded into nftables."
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
            <SaveButton
              saving={activeTab === "nftables" && saving}
              disabled={
                loading || (!config?.available && enabled)
              }
              onClick={
                activeTab === "ddos"
                  ? onDdosSave
                  : () => handleSubmit(save)()
              }
              savedLabel="Saved"
            >
              {activeTab === "ddos" ? "Save DDoS policy" : "Save"}
            </SaveButton>
          </footer>
        </form>
      </section>
    </div>
  );
}
