import React from "react";
import {
  Copy,
  Eraser,
  Eye,
  EyeOff,
  KeyRound,
  Maximize2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Server,
  Terminal as TerminalIcon,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import ActionDialog from "../../components/ActionDialog";

const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
const starter = {
  id: "local",
  name: "Local Server",
  kind: "local",
  host: "localhost",
  port: 22,
  username: "root",
  auth_method: "password",
  private_key: "",
  password: "",
};
const input =
  "mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const wsUrl = () => {
  const u = new URL(apiBase);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return `${u.protocol}//${u.host}/api/v1/terminal/ws`;
};

function Button({ label, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="group relative rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <span className="pointer-events-none absolute right-0 top-11 z-10 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg group-hover:opacity-100 dark:bg-white dark:text-slate-900">
        {label}
      </span>
      {children}
    </button>
  );
}
function Field({ label, error, children }) {
  return (
    <label
      className={`block text-sm font-semibold ${error ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-100"}`}
    >
      {label}
      {children}
      {error && (
        <span className="mt-1 block text-xs font-normal text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </label>
  );
}

function TerminalSession({
  profile,
  visible,
  enabled,
  restart,
  onStatus,
  onControls,
}) {
  const root = React.useRef(null),
    term = React.useRef(null),
    socket = React.useRef(null),
    fit = React.useRef(null);
  const open = React.useCallback(() => {
    if (
      !term.current ||
      !enabled ||
      socket.current?.readyState === WebSocket.OPEN
    )
      return;
    onStatus(profile.id, "connecting");
    const ws = new WebSocket(wsUrl());
    socket.current = ws;
    ws.onopen = () => {
      onStatus(profile.id, "connected");
      ws.send(
        JSON.stringify({
          type: "connect",
          kind: profile.kind,
          host: profile.host,
          port: profile.port,
          username: profile.username,
          auth_method: profile.auth_method,
          private_key: profile.private_key || "",
          password: profile.password || "",
        }),
      );
      term.current?.writeln(`\r\n\x1b[32mConnected to ${profile.name}\x1b[0m`);
      fit.current?.fit();
      term.current?.focus();
    };
    ws.onmessage = (event) => term.current?.write(event.data);
    ws.onclose = () => {
      if (socket.current === ws) socket.current = null;
      onStatus(profile.id, "disconnected");
    };
    ws.onerror = () => onStatus(profile.id, "error");
  }, [enabled, onStatus, profile]);
  const resize = React.useCallback(() => {
    const dimensions = fit.current?.proposeDimensions();
    if (dimensions && socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(
        JSON.stringify({
          type: "resize",
          cols: dimensions.cols,
          rows: dimensions.rows,
        }),
      );
  }, []);
  React.useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 14,
      scrollback: 10000,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      theme: {
        background: "#0f172a",
        foreground: "#e2e8f0",
        cursor: "#60a5fa",
      },
    });
    const addon = new FitAddon();
    terminal.loadAddon(addon);
    terminal.open(root.current);
    term.current = terminal;
    fit.current = addon;
    const observer = new ResizeObserver(() => {
      addon.fit();
      resize();
    });
    observer.observe(root.current);
    const inputDisposable = terminal.onData((data) => {
      if (socket.current?.readyState === WebSocket.OPEN)
        socket.current.send(JSON.stringify({ type: "input", data }));
    });
    onControls(profile.id, {
      clear: () => terminal.clear(),
      fullscreen: () => root.current?.requestFullscreen?.(),
      switchUser: () => {
        if (profile.kind === "local" && socket.current?.readyState === WebSocket.OPEN)
          socket.current.send("su -s /bin/bash serverengine\n");
      },
      reconnect: () => {
        socket.current?.close();
        open();
      },
    });
    if (enabled) open();
    return () => {
      observer.disconnect();
      inputDisposable.dispose();
      socket.current?.close();
      terminal.dispose();
      onControls(profile.id, null);
      term.current = null;
      fit.current = null;
    };
  }, [profile.id]);
  React.useEffect(() => {
    if (visible) {
      fit.current?.fit();
      resize();
      requestAnimationFrame(() => term.current?.focus());
    }
  }, [resize, visible]);
  React.useEffect(() => {
    if (enabled && !socket.current) open();
    if (!enabled && socket.current) {
      socket.current.close();
      socket.current = null;
      onStatus(profile.id, "disconnected");
    }
  }, [enabled, onStatus, open, profile.id, restart]);
  return (
    <div
      ref={root}
      onClick={() => term.current?.focus()}
      className={`${visible ? "" : "hidden"} h-[min(62vh,620px)] min-h-[360px] w-full bg-slate-900 p-3`}
    />
  );
}

export default function TerminalPage({ autoConnect = false }) {
  const [profiles, setProfiles] = React.useState(() => {
    try {
      return (
        (JSON.parse(localStorage.getItem("serverengine:terminal-profiles")) || [starter]).map((profile) =>
          profile.id === "local" ? { ...profile, name: "Local Server" } : profile,
        )
      );
    } catch {
      return [starter];
    }
  });
  const [activeId, setActiveId] = React.useState("local"),
    [enabled, setEnabled] = React.useState({ local: false }),
    [restart, setRestart] = React.useState({}),
    [statuses, setStatuses] = React.useState({ local: "disconnected" });
  const [modal, setModal] = React.useState(null),
    [menuId, setMenuId] = React.useState(null),
    [showPassword, setShowPassword] = React.useState(false),
    [testState, setTestState] = React.useState(""),
    [confirmDialog, setConfirmDialog] = React.useState(null),
    [errors, setErrors] = React.useState({}),
    [form, setForm] = React.useState({
      name: "",
      kind: "remote",
      host: "",
      port: 22,
      username: "",
      auth_method: "password",
      private_key: "",
      password: "",
    });
  React.useEffect(() => {
    if (autoConnect) {
      setEnabled((value) => (value.local ? value : { ...value, local: true }));
    }
  }, [autoConnect]);
  React.useEffect(() => {
    const closeMenu = (event) => {
      if (!event.target.closest("[data-terminal-actions]")) setMenuId(null);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);
  const testSocket = React.useRef(null);
  const controls = React.useRef({}),
    current = profiles.find((profile) => profile.id === activeId) || starter;
  const updateStatus = React.useCallback(
    (id, status) =>
      setStatuses((value) =>
        value[id] === status ? value : { ...value, [id]: status },
      ),
    [],
  );
  React.useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("serverengine:terminal-status", {
        detail: {
          connected: Object.values(statuses).filter(
            (item) => item === "connected",
          ).length,
        },
      }),
    );
  }, [statuses]);
  const setControls = React.useCallback((id, value) => {
    if (value) controls.current[id] = value;
    else delete controls.current[id];
  }, []);
  const choose = (id) => {
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return;
    if (profile.kind === "remote" && !enabled[id]) {
      setConfirmDialog({
        kind: "confirm",
        tone: "primary",
        title: "Connect to server?",
        message: `Open an SSH session to ${profile.username}@${profile.host}:${profile.port}.`,
        submitLabel: "Connect",
        onSubmit: () => {
          setConfirmDialog(null);
          setEnabled((value) => ({ ...value, [id]: true }));
          setActiveId(id);
        },
      });
      return;
    }
    setActiveId(id);
  };
  const persist = (list) => {
    setProfiles(list);
    localStorage.setItem(
      "serverengine:terminal-profiles",
      JSON.stringify(list),
    );
  };
  const save = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Connection name is required.";
    if (form.kind === "remote") {
      if (!form.host.trim())
        nextErrors.host = "Host or IP address is required.";
      if (!form.username.trim()) nextErrors.username = "Username is required.";
      if (!form.port || form.port < 1 || form.port > 65535)
        nextErrors.port = "Enter a valid port.";
      if (form.auth_method === "password" && !form.password.trim())
        nextErrors.password = "Password is required.";
      if (form.auth_method === "key" && !form.private_key.trim())
        nextErrors.private_key = "Upload or paste a private key.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    const profile = {
      ...form,
      id: modal === "edit" ? form.id : `profile-${Date.now()}`,
    };
    persist(
      modal === "edit"
        ? profiles.map((item) => (item.id === profile.id ? profile : item))
        : [...profiles, profile],
    );
    if (modal !== "edit") {
      setEnabled((value) => ({ ...value, [profile.id]: true }));
      setActiveId(profile.id);
    }
    setModal(null);
    setErrors({});
  };
  const openNew = () => {
    setForm({
      name: "",
      kind: "remote",
      host: "",
      port: 22,
      username: "",
      auth_method: "password",
      private_key: "",
      password: "",
    });
    setShowPassword(false);
    setTestState("");
    setErrors({});
    setModal("new");
  };
  const openEdit = () => {
    if (current.id !== "local") {
      setForm(current);
      setShowPassword(false);
      setTestState("");
      setErrors({});
      setModal("edit");
    }
  };
  const editProfile = (profile) => {
    setForm(profile);
    setShowPassword(false);
    setTestState("");
    setErrors({});
    setMenuId(null);
    setModal("edit");
  };
  const testConnection = () => {
    const nextErrors = {};
    if (!form.host.trim()) nextErrors.host = "Host or IP address is required.";
    if (!form.username.trim()) nextErrors.username = "Username is required.";
    if (!form.port || form.port < 1 || form.port > 65535)
      nextErrors.port = "Enter a valid port.";
    if (form.auth_method === "password" && !form.password.trim())
      nextErrors.password = "Password is required.";
    if (form.auth_method === "key" && !form.private_key.trim())
      nextErrors.private_key = "Upload or paste a private key.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    testSocket.current?.close();
    setTestState("Testing connection…");
    const ws = new WebSocket(wsUrl());
    testSocket.current = ws;
    let finished = false;
    const finish = (success = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      setTestState(success ? "Connected" : "Connection failed");
      ws.close();
      testSocket.current = null;
    };
    const timer = setTimeout(() => finish(), 15000);
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: "connect",
          kind: "remote",
          host: form.host,
          port: form.port,
          username: form.username,
          auth_method: form.auth_method,
          private_key: form.private_key || "",
          password: form.password || "",
        }),
      );
    ws.onmessage = (event) => {
      const output = String(event.data);
      const lower = output.toLowerCase();
      if (lower.includes("welcome to ") || /\n[^\n]*(?:[$#])\s*$/.test(output))
        finish(true);
      else if (
        lower.includes("connection refused") ||
        lower.includes("could not resolve") ||
        lower.includes("no route to host") ||
        lower.includes("authentication failed")
      )
        finish();
    };
    ws.onerror = () => finish();
  };
  const deleteProfile = (profile) => {
    persist(profiles.filter((item) => item.id !== profile.id));
    setEnabled((value) => {
      const next = { ...value };
      delete next[profile.id];
      return next;
    });
    setMenuId(null);
    if (activeId === profile.id) setActiveId("local");
  };
  const remove = () => {
    if (current.id === "local") return;
    persist(profiles.filter((profile) => profile.id !== current.id));
    setActiveId("local");
  };
  const reconnect = () => {
    setEnabled((value) => ({ ...value, [activeId]: true }));
    setRestart((value) => ({
      ...value,
      [activeId]: (value[activeId] || 0) + 1,
    }));
    controls.current[activeId]?.reconnect();
  };
  const connected = statuses[activeId] === "connected";
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-blue-500">Tools / Terminal management</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Terminal
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Save server connections once and open them whenever you need a
            shell.
          </p>
        </div>
        <span className="flex items-center gap-2 text-sm text-slate-500">
          <i
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          {statuses[activeId] || "Disconnected"}
        </span>
      </header>
      <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between px-2 pb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Saved connections
            </p>
            <button onClick={openNew} className="p-1.5 text-blue-600">
              <Plus size={17} />
            </button>
          </div>
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="group relative"
              data-terminal-actions
            >
              <button
                onClick={() => choose(profile.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 pr-10 text-left ${activeId === profile.id ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-slate-600 dark:text-slate-300"}`}
              >
                <Server size={16} />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">
                    {profile.name}
                  </strong>
                  <small className="block truncate text-xs text-slate-500">
                    {profile.kind === "local"
                      ? "Docker local"
                      : `${profile.username}@${profile.host}`}
                  </small>
                </span>
                {statuses[profile.id] === "connected" && (
                  <span
                    className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${profile.id !== "local" ? "group-hover:opacity-0" : ""}`}
                  >
                    <i
                      className="block h-2.5 w-2.5 rounded-full bg-emerald-500"
                      title="Connected"
                    />
                  </span>
                )}
              </button>
              {profile.id !== "local" && (
                <>
                  <button
                    onClick={() =>
                      setMenuId(menuId === profile.id ? null : profile.id)
                    }
                    aria-label={`More actions for ${profile.name}`}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-1.5 text-slate-400 opacity-0 hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  >
                    <MoreHorizontal size={17} />
                  </button>
                  {menuId === profile.id && (
                    <div className="absolute right-2 top-12 z-20 w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      <button
                        onClick={() => editProfile(profile)}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        onClick={() => deleteProfile(profile)}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          <button
            onClick={openNew}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
          >
            <Plus size={15} /> Add server
          </button>
        </aside>
        <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <TerminalIcon size={17} />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {current.name}
                </p>
                <p className="text-xs text-slate-500">
                  {current.kind === "local"
                    ? "Local Docker shell"
                    : `${current.username}@${current.host}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {current.id !== "local" && (
                <>
                  <Button label="Edit connection" onClick={openEdit}>
                    <Pencil size={16} />
                  </Button>
                  <Button label="Delete connection" onClick={remove}>
                    <Trash2 size={16} />
                  </Button>
                </>
              )}
              <Button label="Reconnect" onClick={reconnect}>
                <RefreshCw size={16} />
              </Button>
              {current.id === "local" && (
                <Button
                  label="Switch to serverengine"
                  onClick={() => controls.current[activeId]?.switchUser()}
                >
                  <UserRound size={16} />
                </Button>
              )}
              <Button
                label="Clear terminal"
                onClick={() => controls.current[activeId]?.clear()}
              >
                <Eraser size={16} />
              </Button>
              <Button
                label="Fullscreen"
                onClick={() => controls.current[activeId]?.fullscreen()}
              >
                <Maximize2 size={16} />
              </Button>
              <Button label="Copy selection">
                <Copy size={16} />
              </Button>
            </div>
          </div>
          {profiles.map((profile) => (
            <TerminalSession
              key={profile.id}
              profile={profile}
              visible={profile.id === activeId}
            enabled={!!enabled[profile.id]}
              restart={restart[profile.id] || 0}
              onStatus={updateStatus}
              onControls={setControls}
            />
          ))}
        </section>
      </div>
      {confirmDialog && (
        <ActionDialog
          dialog={confirmDialog}
          onClose={() => setConfirmDialog(null)}
          onSubmit={() => confirmDialog.onSubmit?.()}
        />
      )}
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  {modal === "edit"
                    ? "Edit connection"
                    : "Add server connection"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Save an SSH profile for one-click access.
                </p>
              </div>
              <button onClick={() => setModal(null)} className="text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <Field label="Connection name" error={errors.name}>
                <input
                  className={`${input} ${errors.name ? "border-rose-500" : ""}`}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Production server"
                />
              </Field>
              {form.kind === "remote" && (
                <>
                  <Field label="Host or IP address" error={errors.host}>
                    <input
                      className={`${input} ${errors.host ? "border-rose-500" : ""}`}
                      value={form.host}
                      onChange={(event) =>
                        setForm({ ...form, host: event.target.value })
                      }
                      placeholder="server.example.com"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="SSH port" error={errors.port}>
                      <input
                        className={`${input} ${errors.port ? "border-rose-500" : ""}`}
                        type="number"
                        value={form.port}
                        onChange={(event) =>
                          setForm({ ...form, port: Number(event.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Username" error={errors.username}>
                      <input
                        className={`${input} ${errors.username ? "border-rose-500" : ""}`}
                        value={form.username}
                        onChange={(event) =>
                          setForm({ ...form, username: event.target.value })
                        }
                        placeholder="Username"
                      />
                    </Field>
                  </div>
                  <fieldset>
                    <legend className="text-sm font-semibold">
                      Authentication method
                    </legend>
                    <div className="mt-2 flex gap-5">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          className="h-4 w-4 shrink-0 border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-offset-slate-900"
                          type="radio"
                          name="auth"
                          checked={form.auth_method === "password"}
                          onChange={() =>
                            setForm({ ...form, auth_method: "password" })
                          }
                        />
                        <UserRound size={15} /> Password
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          className="h-4 w-4 shrink-0 border-slate-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-offset-slate-900"
                          type="radio"
                          name="auth"
                          checked={form.auth_method === "key"}
                          onChange={() =>
                            setForm({ ...form, auth_method: "key" })
                          }
                        />
                        <KeyRound size={15} /> SSH key
                      </label>
                    </div>
                  </fieldset>
                  {form.auth_method === "password" ? (
                    <Field label="SSH password" error={errors.password}>
                      <div className="relative">
                        <input
                          className={`${input} pr-11 ${errors.password ? "border-rose-500" : ""}`}
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={(event) =>
                            setForm({ ...form, password: event.target.value })
                          }
                          placeholder="Enter SSH password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          {showPassword ? (
                            <EyeOff size={17} />
                          ) : (
                            <Eye size={17} />
                          )}
                        </button>
                      </div>
                    </Field>
                  ) : (
                    <Field label="Private key" error={errors.private_key}>
                      <textarea
                        className={`${input} min-h-28 font-mono text-xs ${errors.private_key ? "border-rose-500" : ""}`}
                        value={form.private_key}
                        onChange={(event) =>
                          setForm({ ...form, private_key: event.target.value })
                        }
                        placeholder="Paste OpenSSH private key"
                      />
                      <input
                        className="mt-3 block w-full text-sm text-slate-500"
                        type="file"
                        accept=".pem,.key"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (result) =>
                              setForm({
                                ...form,
                                private_key: String(
                                  result.target?.result || "",
                                ),
                              });
                            reader.readAsText(file);
                          }
                        }}
                      />
                    </Field>
                  )}
                </>
              )}
            </div>
            <span
              className={`mt-4 block text-left text-sm ${testState === "Connected" ? "text-emerald-600 dark:text-emerald-400" : testState === "Connection failed" ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"}`}
            >
              {testState}
            </span>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                onClick={testConnection}
                disabled={!!testState && testState.startsWith("Testing")}
                className="mr-auto rounded-md px-0 py-2 text-sm font-normal text-slate-800 hover:text-slate-950 disabled:cursor-wait disabled:opacity-60 dark:text-slate-100 dark:hover:text-white"
              >
                {testState === "Testing connection…"
                  ? "Testing…"
                  : "Test connection"}
              </button>
              <button
                onClick={save}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                <Save size={15} />
                {modal === "edit" ? "Save changes" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
