import React from "react";
import {
  Bell,
  KeyRound,
  Monitor,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { apiRequest, readApiError } from "../../lib/api";
import { createPasskey, supportsPasskeys } from "../../lib/passkeys";
import FormField from "../../components/FormField";
import { z } from "zod";

const input =
  "mt-2 block min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const tabs = [
  ["profile", "Profile", UserRound],
  ["security", "Security", ShieldCheck],
  ["preferences", "Preferences", Monitor],
  ["recovery", "Recovery", Bell],
];
function Field({ label, description, error, children }) {
  return (
    <FormField label={label} hint={description} error={error}>
      {children}
    </FormField>
  );
}

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(120, "Display name is too long."),
  email: z.string().trim().email("Enter a valid email address."),
});
function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-5 border-b border-neutral-200 py-5 last:border-b-0 dark:border-neutral-800">
      <span>
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {label}
        </span>
        <span className="mt-1 block text-sm text-neutral-500 dark:text-neutral-400">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-800 dark:focus:ring-offset-neutral-900"
      />
    </label>
  );
}
function Block({ children }) {
  return <div>{children}</div>;
}
function SaveButton({ label, onSave }) {
  return (
    <div className="flex justify-end pt-2">
      <button
        onClick={onSave}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
      >
        <Save size={16} /> Save {label}
      </button>
    </div>
  );
}

export default function AccountSettingsPage({ user }) {
  const [tab, setTab] = React.useState("profile");
  const [name, setName] = React.useState(user?.username || "Administrator");
  const [email, setEmail] = React.useState("admin@example.com");
  const [profileErrors, setProfileErrors] = React.useState({});
  const [message, setMessage] = React.useState("");
  const [passkeyBusy, setPasskeyBusy] = React.useState(false);
  const [security, setSecurity] = React.useState({
    mfa: true,
    passkeys: false,
    loginAlerts: true,
    newDevice: true,
    sessionAlerts: true,
    ipRestriction: false,
    apiPolicy: true,
    bruteForce: true,
    sshAlerts: true,
  });
  const [securityValues, setSecurityValues] = React.useState({
    timeout: 30,
    maxAttempts: 5,
    lockout: 15,
    passwordAge: 90,
    minStrength: 70,
    trustedIps: "203.0.113.10",
    entrance: "",
    apiExpiry: 90,
  });
  const [preferences, setPreferences] = React.useState({
    updates: false,
    desktop: true,
  });
  const [save, setSave] = React.useState(
    () => (label) => setMessage(`${label} settings saved.`),
  );
  const updateSecurity = (key, value) =>
    setSecurity((values) => ({ ...values, [key]: value }));
  const updateValue = (key, value) =>
    setSecurityValues((values) => ({ ...values, [key]: value }));
  function saveProfile() {
    const validation = profileSchema.safeParse({ name, email });
    if (!validation.success) {
      setProfileErrors(
        Object.fromEntries(
          validation.error.issues.map((issue) => [
            issue.path[0],
            issue.message,
          ]),
        ),
      );
      setMessage("");
      return;
    }
    setProfileErrors({});
    save("Profile");
  }
  async function registerPasskey() {
    if (!supportsPasskeys()) {
      setMessage("This browser does not support passkeys.");
      return;
    }
    setPasskeyBusy(true);
    setMessage("");
    try {
      const optionsResponse = await apiRequest(
        "/api/v1/auth/passkey/register/options",
        { method: "POST" },
      );
      if (!optionsResponse.ok)
        throw new Error(
          await readApiError(
            optionsResponse,
            "Unable to begin passkey registration.",
          ),
        );
      const credential = await createPasskey(await optionsResponse.json());
      const response = await apiRequest(
        "/api/v1/auth/passkey/register/verify",
        {
          method: "POST",
          body: JSON.stringify({ credential }),
        },
      );
      if (!response.ok)
        throw new Error(
          await readApiError(response, "Unable to register passkey."),
        );
      setSecurity((values) => ({ ...values, passkeys: true }));
      setMessage("Passkey registered. You can use it on the next sign-in.");
    } catch (error) {
      setMessage(error.message || "Passkey registration failed.");
    } finally {
      setPasskeyBusy(false);
    }
  }
  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm text-blue-500">Account</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-950 dark:text-white">
          Account settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          Manage your administrator profile, sign-in security, and personal
          panel preferences.
        </p>
      </header>
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          {message}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <nav
          className="flex overflow-x-auto border-b border-neutral-200 bg-transparent px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800"
          aria-label="Account settings tabs"
        >
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setMessage("");
              }}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-5 py-4 text-sm font-medium ${tab === id ? "border-blue-600 text-blue-600" : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white"}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <main className="space-y-6 p-5 pt-6 md:p-8">
          {tab === "profile" && (
            <div className="space-y-6">
              <Block>
                <div className="space-y-5">
                  <Field
                    label="Display name"
                    description="Use a recognizable name for administrative actions."
                    error={profileErrors.name}
                  >
                    <input
                      className={input}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setProfileErrors((current) => ({
                          ...current,
                          name: "",
                        }));
                      }}
                    />
                  </Field>
                  <Field
                    label="Email address"
                    description="Used for account notices and recovery workflows."
                    error={profileErrors.email}
                  >
                    <input
                      className={input}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setProfileErrors((current) => ({
                          ...current,
                          email: "",
                        }));
                      }}
                    />
                  </Field>
                  <Field
                    label="Role"
                    description="Permissions are managed by the hosting account administrator."
                  >
                    <input
                      className={`${input} text-neutral-500`}
                      value="Administrator"
                      disabled
                    />
                  </Field>
                </div>
              </Block>
              <SaveButton label="profile" onSave={saveProfile} />
            </div>
          )}
          {tab === "security" && (
            <div className="space-y-6">
              <Block>
                <p className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Multi-factor authentication
                </p>
                <Toggle
                  label="Require authenticator app"
                  description="Require a time-based one-time code after the password step."
                  checked={security.mfa}
                  onChange={(v) => updateSecurity("mfa", v)}
                />
                <Toggle
                  label="Allow passkeys"
                  description="Allow hardware keys and platform biometrics for passwordless sign-in."
                  checked={security.passkeys}
                  onChange={(v) => updateSecurity("passkeys", v)}
                />
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={passkeyBusy}
                    onClick={registerPasskey}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    <KeyRound size={15} />
                    {passkeyBusy ? "Waiting for passkey…" : "Register passkey"}
                  </button>
                  <button className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">
                    Regenerate recovery codes
                  </button>
                </div>
              </Block>
              <Block>
                <p className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Password policy
                </p>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field
                    label="Minimum strength"
                    description="Required score for new passwords."
                  >
                    <input
                      className={input}
                      type="number"
                      min="1"
                      max="100"
                      value={securityValues.minStrength}
                      onChange={(e) =>
                        updateValue("minStrength", e.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Maximum password age"
                    description="Force a password change after this many days."
                  >
                    <input
                      className={input}
                      type="number"
                      min="0"
                      value={securityValues.passwordAge}
                      onChange={(e) =>
                        updateValue("passwordAge", e.target.value)
                      }
                    />
                  </Field>
                </div>
                <div className="mt-5">
                  <Field
                    label="Session timeout"
                    description="End inactive browser sessions after this many minutes."
                  >
                    <input
                      className={input}
                      type="number"
                      min="5"
                      value={securityValues.timeout}
                      onChange={(e) => updateValue("timeout", e.target.value)}
                    />
                  </Field>
                </div>
              </Block>
              <Block>
                <p className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Login protection
                </p>
                <Toggle
                  label="Brute-force protection"
                  description="Temporarily block addresses after repeated failed sign-in attempts."
                  checked={security.bruteForce}
                  onChange={(v) => updateSecurity("bruteForce", v)}
                />
                <div className="grid gap-5 py-5 md:grid-cols-2">
                  <Field
                    label="Maximum failed attempts"
                    description="Attempts allowed before a temporary block."
                  >
                    <input
                      className={input}
                      type="number"
                      min="1"
                      value={securityValues.maxAttempts}
                      onChange={(e) =>
                        updateValue("maxAttempts", e.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Lockout duration"
                    description="Minutes before a blocked address can retry."
                  >
                    <input
                      className={input}
                      type="number"
                      min="1"
                      value={securityValues.lockout}
                      onChange={(e) => updateValue("lockout", e.target.value)}
                    />
                  </Field>
                </div>
                <Toggle
                  label="Restrict logins to trusted IPs"
                  description="Require verification when signing in from an unrecognized network."
                  checked={security.ipRestriction}
                  onChange={(v) => updateSecurity("ipRestriction", v)}
                />
                <Field
                  label="Trusted IP addresses"
                  description="Comma-separated IPs or CIDR ranges that can bypass verification."
                >
                  <input
                    className={input}
                    value={securityValues.trustedIps}
                    onChange={(e) => updateValue("trustedIps", e.target.value)}
                    placeholder="203.0.113.10, 10.0.0.0/8"
                  />
                </Field>
              </Block>
              <Block>
                <p className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  API and access policy
                </p>
                <Toggle
                  label="Apply security policy to API requests"
                  description="Require the same protections for password-authenticated API calls."
                  checked={security.apiPolicy}
                  onChange={(v) => updateSecurity("apiPolicy", v)}
                />
                <Field
                  label="API token expiry"
                  description="Default lifetime for newly created integration tokens."
                >
                  <select
                    className={input}
                    value={securityValues.apiExpiry}
                    onChange={(e) => updateValue("apiExpiry", e.target.value)}
                  >
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="365">1 year</option>
                    <option value="0">Never expire</option>
                  </select>
                </Field>
                <Field
                  label="Private security entrance"
                  description="Optional path required before the sign-in screen is shown."
                >
                  <input
                    className={input}
                    value={securityValues.entrance}
                    onChange={(e) => updateValue("entrance", e.target.value)}
                    placeholder="/admin-gate"
                  />
                </Field>
              </Block>
              <Block>
                <p className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Security notifications
                </p>
                <Toggle
                  label="New sign-in alerts"
                  description="Notify when this account signs in from a new location or browser."
                  checked={security.loginAlerts}
                  onChange={(v) => updateSecurity("loginAlerts", v)}
                />
                <Toggle
                  label="New device alerts"
                  description="Report the first successful login from an unfamiliar device."
                  checked={security.newDevice}
                  onChange={(v) => updateSecurity("newDevice", v)}
                />
                <Toggle
                  label="Session and access changes"
                  description="Notify when sessions, trusted IPs, tokens, or security policy change."
                  checked={security.sessionAlerts}
                  onChange={(v) => updateSecurity("sessionAlerts", v)}
                />
                <Toggle
                  label="SSH access alerts"
                  description="Report successful and failed SSH authentication events."
                  checked={security.sshAlerts}
                  onChange={(v) => updateSecurity("sshAlerts", v)}
                />
              </Block>
              <SaveButton label="security" onSave={() => save("Security")} />
            </div>
          )}
          {tab === "preferences" && (
            <div className="space-y-6">
              <Block>
                <Field
                  label="Interface language"
                  description="Language used for your account session."
                >
                  <select className={input} defaultValue="English">
                    <option>English</option>
                    <option disabled>Vietnamese · coming soon</option>
                  </select>
                </Field>
                <Toggle
                  label="Email product updates"
                  description="Receive occasional release notes and maintenance announcements."
                  checked={preferences.updates}
                  onChange={(v) =>
                    setPreferences({ ...preferences, updates: v })
                  }
                />
                <Toggle
                  label="Desktop notifications"
                  description="Show browser notifications for important panel events."
                  checked={preferences.desktop}
                  onChange={(v) =>
                    setPreferences({ ...preferences, desktop: v })
                  }
                />
              </Block>
              <SaveButton
                label="preferences"
                onSave={() => save("Preferences")}
              />
            </div>
          )}
          {tab === "recovery" && (
            <div className="space-y-6">
              <Block>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      Recovery email verified
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">{email}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    Verified
                  </span>
                </div>
                <button className="mt-5 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">
                  Change recovery email
                </button>
              </Block>
              <Block>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Recovery codes
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  Keep a fresh offline set of one-time codes in case your
                  authenticator is unavailable.
                </p>
                <button className="mt-4 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">
                  Generate new codes
                </button>
              </Block>
              <SaveButton label="recovery" onSave={() => save("Recovery")} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
