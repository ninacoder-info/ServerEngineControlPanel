import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Fingerprint, Server } from "lucide-react";
import Form, { FormControl, FormField, FormItem, FormLabel, FormMessage } from "../../components/ui/form";
import { passkeyAvailability } from "../../lib/passkeys";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
});

export default function LoginPage({ onLogin, onPasskeyLogin, error: authError }) {
  const [busy, setBusy] = React.useState(false);
  const [passkeyBusy, setPasskeyBusy] = React.useState(false);
  const passwordRef = React.useRef(null);
  const passkey = passkeyAvailability();
  const methods = useForm({ resolver: zodResolver(loginSchema), defaultValues: { username: "", password: "" }, mode: "onBlur" });
  const { control, handleSubmit, setError, setFocus } = methods;

  async function submit(values) {
    setBusy(true);
    const ok = await onLogin({ username: values.username.trim(), password: values.password });
    setBusy(false);
    if (!ok) {
      setError("password", { type: "server", message: authError || "Invalid username or password." });
      setFocus("password");
      passwordRef.current?.focus();
    }
  }

  async function signInWithPasskey() {
    setPasskeyBusy(true);
    await onPasskeyLogin();
    setPasskeyBusy(false);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 px-4 py-8 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <section className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"><Server size={22} /></div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Server Engine Control Panel</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in to your control panel</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">Manage your infrastructure from one secure place.</p>
        <Form {...methods}>
          <form onSubmit={handleSubmit(submit)} className="mt-8 space-y-5" noValidate>
            <FormField control={control} name="username" render={({ field }) => <FormItem><FormLabel>Username</FormLabel><FormControl><input {...field} className="mt-2 block min-h-11 w-full rounded-md border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:ring-2 focus:ring-blue-500/20 dark:bg-neutral-950 dark:text-neutral-100" autoComplete="username" autoFocus /></FormControl><FormMessage /></FormItem>} />
            <FormField control={control} name="password" render={({ field }) => <FormItem><FormLabel>Password</FormLabel><FormControl><input {...field} className="mt-2 block min-h-11 w-full rounded-md border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:ring-2 focus:ring-blue-500/20 dark:bg-neutral-950 dark:text-neutral-100" ref={(node) => { field.ref(node); passwordRef.current = node; }} type="password" autoComplete="current-password" /></FormControl><FormMessage /></FormItem>} />
            <button type="submit" disabled={busy || passkeyBusy} className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
            {passkey.available && <button type="button" disabled={busy || passkeyBusy} onClick={signInWithPasskey} className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"><Fingerprint size={17} />{passkeyBusy ? "Waiting for passkey…" : "Use passkey"}</button>}
            {!passkey.available && passkey.reason && window.location.hostname !== "localhost" && <p className="text-center text-xs leading-5 text-neutral-500 dark:text-neutral-400">{passkey.reason}</p>}
          </form>
        </Form>
      </section>
    </main>
  );
}
