import React from "react";
import { Fingerprint, Server } from "lucide-react";
import { passkeyAvailability } from "../../lib/passkeys";

const baseInput =
  "mt-2 block min-h-11 w-full rounded-md border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 dark:bg-slate-950 dark:text-slate-100";

export default function LoginPage({ onLogin, onPasskeyLogin, error: authError }) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [passkeyBusy, setPasskeyBusy] = React.useState(false);
  const [touched, setTouched] = React.useState({});
  const passwordRef = React.useRef(null);
  const passkey = passkeyAvailability();

  const errors = {
    username: !username.trim() ? "Username is required." : "",
    password: !password ? "Password is required." : "",
  };

  async function submit(event) {
    event.preventDefault();
    setTouched({ username: true, password: true });
    setError("");
    if (errors.username || errors.password) return;
    setBusy(true);
    const ok = await onLogin({ username: username.trim(), password });
    setBusy(false);
    if (!ok) {
      setTouched({ username: true, password: true });
      setError(authError || "Invalid username or password.");
      passwordRef.current?.focus();
    }
  }

  async function signInWithPasskey() {
    setPasskeyBusy(true);
    setError("");
    await onPasskeyLogin();
    setPasskeyBusy(false);
  }

  const passwordError =
    error || authError || (touched.password ? errors.password : "");
  const fieldClass = (field) =>
    `${baseInput} ${
      (field === "password" && passwordError) || (touched[field] && errors[field])
        ? "border-rose-600 focus:border-rose-600 focus:ring-rose-600/20 dark:border-rose-500 dark:focus:border-rose-500"
        : "border-slate-300 focus:border-blue-600 focus:ring-blue-600/20 dark:border-slate-700 dark:focus:border-blue-500"
    }`;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
          <Server size={22} />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
          Server Engine Control Panel
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Sign in to your control panel
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Manage your infrastructure from one secure place.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
          <label className="block text-sm font-medium">
            <span className={touched.username && errors.username ? "text-rose-700 dark:text-rose-400" : "text-slate-700 dark:text-slate-300"}>
              Username
            </span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onBlur={() => setTouched((value) => ({ ...value, username: true }))}
              autoComplete="username"
              aria-invalid={Boolean(touched.username && errors.username)}
              className={fieldClass("username")}
            />
            {touched.username && errors.username && (
              <span className="mt-1.5 block text-xs text-rose-700 dark:text-rose-400">
                {errors.username}
              </span>
            )}
          </label>

          <label className="block text-sm font-medium">
            <span className={passwordError ? "text-rose-700 dark:text-rose-400" : "text-slate-700 dark:text-slate-300"}>
              Password
            </span>
            <input
              type="password"
              ref={passwordRef}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => setTouched((value) => ({ ...value, password: true }))}
              autoComplete="current-password"
              autoFocus
              aria-invalid={Boolean(passwordError)}
              className={fieldClass("password")}
            />
            {passwordError && (
              <span className="mt-1.5 block text-xs text-rose-700 dark:text-rose-400">
                {passwordError}
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={busy || passkeyBusy}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          {passkey.available && (
            <button
              type="button"
              disabled={busy || passkeyBusy}
              onClick={signInWithPasskey}
              className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Fingerprint size={17} />
              {passkeyBusy ? "Waiting for passkey…" : "Use passkey"}
            </button>
          )}
          {!passkey.available && passkey.reason && window.location.hostname !== "localhost" && (
            <p className="text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
              {passkey.reason}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
