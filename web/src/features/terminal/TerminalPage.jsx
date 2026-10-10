import React from "react";
import {
  Copy,
  ClipboardPaste,
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
import FormField from "../../components/FormField";
import { z } from "zod";

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
  "mt-2 block min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const wsUrl = () => {
  // Use the page origin so development goes through Vite's /api WebSocket
  // proxy and production uses the same authenticated reverse-proxy route.
  // This avoids stale VITE_API_URL values pointing at an old core port.
  const u = new URL(window.location.origin);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return `${u.protocol}//${u.host}/api/v1/terminal/ws`;
};

function Button({ label, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="group relative rounded-md p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
    >
      <span className="pointer-events-none absolute right-0 top-11 z-10 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg group-hover:opacity-100 dark:bg-white dark:text-neutral-900">
        {label}
      </span>
      {children}
    </button>
  );
}
function Field({ label, error, children }) {
  return (
    <FormField label={label} error={error}>
      {children}
    </FormField>
  );
}

const connectionSchema = z
  .object({
    name: z.string().trim().min(1, "Connection name is required."),
    kind: z.enum(["local", "remote"]),
    host: z.string().trim(),
    port: z.coerce
      .number()
      .int()
      .min(1, "Enter a valid port.")
      .max(65535, "Enter a valid port."),
    username: z.string().trim(),
    auth_method: z.enum(["password", "key"]),
    password: z.string(),
    private_key: z.string(),
  })
  .superRefine((value, context) => {
    if (value.kind !== "remote") return;
    if (!value.host)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["host"],
        message: "Host or IP address is required.",
      });
    if (!value.username)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["username"],
        message: "Username is required.",
      });
    if (value.auth_method === "password" && !value.password.trim())
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password is required.",
      });
    if (value.auth_method === "key" && !value.private_key.trim())
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["private_key"],
        message: "Upload or paste a private key.",
      });
  });

export function TerminalSession({
  profile,
  visible,
  enabled,
  restart,
  initialCommand = "",
  className = "",
  onStatus,
  onControls,
  onKill = () => {},
}) {
  const root = React.useRef(null),
    terminalHost = React.useRef(null),
    term = React.useRef(null),
    socket = React.useRef(null),
    fit = React.useRef(null);
  const [contextMenu, setContextMenu] = React.useState(null);
  const command = typeof initialCommand === "string" ? initialCommand : "";
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
          container_id: profile.container_id || "",
          php_version: profile.php_version || "",
        }),
      );
      if (command) ws.send(JSON.stringify({ type: "input", data: command }));
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
  }, [command, enabled, onStatus, profile]);
  React.useEffect(() => {
    if (!command || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({ type: "input", data: command }));
  }, [command]);
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
    const closeContextMenu = () => setContextMenu(null);
    document.addEventListener("pointerdown", closeContextMenu);
    return () => document.removeEventListener("pointerdown", closeContextMenu);
  }, []);
  React.useEffect(() => {
    const darkMode = document.documentElement.classList.contains("dark");
    const surface = darkMode ? "#171717" : "#ffffff";
    const foreground = darkMode ? "#d4d4d4" : "#1f1f1f";
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 11,
      rightClickSelectsWord: true,
      scrollback: 10000,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      theme: {
        background: surface,
        foreground,
        cursor: foreground,
      },
    });
    const addon = new FitAddon();
    terminal.loadAddon(addon);
    terminal.open(terminalHost.current);
    term.current = terminal;
    fit.current = addon;
    const applyTheme = () => {
      const darkMode = document.documentElement.classList.contains("dark");
      const foreground = darkMode ? "#d4d4d4" : "#1f1f1f";
      terminal.options.theme = {
        ...terminal.options.theme,
        background: darkMode ? "#171717" : "#ffffff",
        foreground,
        cursor: foreground,
      };
    };
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const observer = new ResizeObserver(() => {
      addon.fit();
      resize();
    });
    observer.observe(terminalHost.current);
    const inputDisposable = terminal.onData((data) => {
      if (socket.current?.readyState === WebSocket.OPEN)
        socket.current.send(JSON.stringify({ type: "input", data }));
    });
    onControls(profile.id, {
      clear: () => terminal.clear(),
      copy: async () => {
        const selection = terminal.getSelection();
        if (!selection) return;
        try {
          await navigator.clipboard.writeText(selection);
        } catch {
          // Keep browser-native xterm selection usable when clipboard
          // permissions are unavailable in an insecure context.
        }
      },
      fullscreen: () => root.current?.requestFullscreen?.(),
      switchUser: () => {
        if (
          profile.kind === "local" &&
          socket.current?.readyState === WebSocket.OPEN
        )
          socket.current.send("su -s /bin/bash serverengine\n");
      },
      reconnect: () => {
        socket.current?.close();
        open();
      },
    });
    if (enabled) open();
    return () => {
      themeObserver.disconnect();
      observer.disconnect();
      inputDisposable.dispose();
      socket.current?.close();
      terminal.dispose();
      onControls(profile.id, null);
      term.current = null;
      fit.current = null;
    };
  }, [profile.id]);
  const clearTerminal = React.useCallback(() => {
    term.current?.clear();
    setContextMenu(null);
  }, []);
  const killTerminal = React.useCallback(() => {
    setContextMenu(null);
    socket.current?.close(1000, "Terminal closed by user");
    onKill(profile.id);
  }, [onKill, profile.id]);
  const copySelection = React.useCallback(async () => {
    const selection =
      term.current?.getSelection() || contextMenu?.selection || "";
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection);
    } catch {
      // Keep xterm's native selection available when clipboard permissions are unavailable.
    }
    setContextMenu(null);
  }, [contextMenu?.selection]);
  const pasteClipboard = React.useCallback(async () => {
    if (socket.current?.readyState !== WebSocket.OPEN) return;
    try {
      const value = await navigator.clipboard.readText();
      if (value)
        socket.current.send(JSON.stringify({ type: "input", data: value }));
    } catch {
      // Clipboard access can be denied by the browser or an insecure origin.
    }
    setContextMenu(null);
  }, []);
  const selectAll = React.useCallback(() => {
    term.current?.selectAll();
    setContextMenu(null);
  }, []);
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
      onContextMenu={(event) => {
        event.preventDefault();
        const bounds = root.current?.getBoundingClientRect();
        if (!bounds) return;
        setContextMenu({
          left: Math.min(event.clientX - bounds.left, bounds.width - 180),
          top: Math.min(event.clientY - bounds.top, bounds.height - 120),
          selection: term.current?.getSelection() || "",
        });
      }}
      className={`${visible ? "" : "hidden"} relative box-border min-h-0 w-full select-text overflow-hidden rounded-lg bg-white p-3 dark:bg-neutral-900 ${className || "h-[32rem] max-h-[32rem]"}`}
    >
      <div ref={terminalHost} className="h-full w-full" />
      {contextMenu && (
        <div
          className="absolute z-50 w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white p-1 text-xs shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
          style={{
            left: Math.max(4, contextMenu.left),
            top: Math.max(4, contextMenu.top),
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={copySelection}
          >
            <span className="flex items-center gap-2">
              <Copy size={14} />
              Copy
            </span>
            <kbd className="text-[10px] text-neutral-400">⌘C</kbd>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={pasteClipboard}
          >
            <span className="flex items-center gap-2">
              <ClipboardPaste size={14} />
              Paste
            </span>
            <kbd className="text-[10px] text-neutral-400">⌘V</kbd>
          </button>
          <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={selectAll}
          >
            <span>Select All</span>
            <kbd className="text-[10px] text-neutral-400">⌘A</kbd>
          </button>
          <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={clearTerminal}
          >
            <Eraser size={14} />
            Clear terminal
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
            onClick={killTerminal}
          >
            <X size={14} />
            Kill terminal
          </button>
        </div>
      )}
    </div>
  );
}

export default function TerminalPage({ autoConnect = false }) {
  const dockerContainer = new URLSearchParams(window.location.search).get(
    "container",
  );
  const dockerProfile = dockerContainer
    ? {
        id: `docker-${dockerContainer}`,
        name: dockerContainer,
        kind: "docker",
        container_id: dockerContainer,
        username: "root",
      }
    : null;
  const [profiles, setProfiles] = React.useState(() => {
    if (dockerProfile) return [dockerProfile];
    try {
      return (
        JSON.parse(localStorage.getItem("serverengine:terminal-profiles")) || [
          starter,
        ]
      ).map((profile) =>
        profile.id === "local" ? { ...profile, name: "Local Server" } : profile,
      );
    } catch {
      return [starter];
    }
  });
  const [activeId, setActiveId] = React.useState(dockerProfile?.id || "local"),
    [enabled, setEnabled] = React.useState(
      dockerProfile ? { [dockerProfile.id]: false } : { local: false },
    ),
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
      const id = dockerProfile?.id || "local";
      setEnabled((value) => (value[id] ? value : { ...value, [id]: true }));
    }
  }, [autoConnect, dockerProfile?.id]);
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
  const dockerMode = current.kind === "docker";
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
    const validation = connectionSchema.safeParse(form);
    if (!validation.success) {
      setErrors(
        Object.fromEntries(
          validation.error.issues.map((issue) => [
            issue.path[0],
            issue.message,
          ]),
        ),
      );
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
    const validation = connectionSchema.safeParse({
      ...form,
      name: form.name || "Connection test",
    });
    if (!validation.success) {
      setErrors(
        Object.fromEntries(
          validation.error.issues.map((issue) => [
            issue.path[0],
            issue.message,
          ]),
        ),
      );
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
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-950 dark:text-white">
            Terminal
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Save server connections once and open them whenever you need a
            shell.
          </p>
        </div>
        <span className="flex items-center gap-2 text-sm text-neutral-500">
          <i
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          {statuses[activeId] || "Disconnected"}
        </span>
      </header>
      <div
        className={`grid gap-6 ${dockerMode ? "" : "xl:grid-cols-[18rem_minmax(0,1fr)]"}`}
      >
        {!dockerMode && (
          <aside className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between px-2 pb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
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
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 pr-10 text-left ${activeId === profile.id ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100" : "text-neutral-600 dark:text-neutral-300"}`}
                >
                  <Server size={16} />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">
                      {profile.name}
                    </strong>
                    <small className="block truncate text-xs text-neutral-500">
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
                      className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-1.5 text-neutral-400 opacity-0 hover:bg-neutral-200 hover:text-neutral-700 group-hover:opacity-100 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                    >
                      <MoreHorizontal size={17} />
                    </button>
                    {menuId === profile.id && (
                      <div className="absolute right-2 top-12 z-20 w-36 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                        <button
                          onClick={() => editProfile(profile)}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
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
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 text-sm font-semibold text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              <Plus size={15} /> Add server
            </button>
          </aside>
        )}
        <section className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div className="flex items-center gap-3">
              <TerminalIcon size={17} />
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {current.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {current.kind === "local"
                    ? "Local Docker shell"
                    : current.kind === "docker"
                      ? "Docker container · root shell"
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
              <Button
                label="Copy selection"
                onClick={() => controls.current[activeId]?.copy()}
              >
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/50 p-4">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">
                  {modal === "edit"
                    ? "Edit connection"
                    : "Add server connection"}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Save an SSH profile for one-click access.
                </p>
              </div>
              <button
                onClick={() => setModal(null)}
                className="text-neutral-400"
              >
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
                          className="h-4 w-4 shrink-0 border-neutral-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-800 dark:focus:ring-offset-neutral-900"
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
                          className="h-4 w-4 shrink-0 border-neutral-300 text-blue-600 accent-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-800 dark:focus:ring-offset-neutral-900"
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
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
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
                        className="mt-3 block w-full text-sm text-neutral-500"
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
              className={`mt-4 block text-left text-sm ${testState === "Connected" ? "text-emerald-600 dark:text-emerald-400" : testState === "Connection failed" ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-200"}`}
            >
              {testState}
            </span>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                onClick={testConnection}
                disabled={!!testState && testState.startsWith("Testing")}
                className="mr-auto rounded-md px-0 py-2 text-sm font-normal text-neutral-800 hover:text-neutral-950 disabled:cursor-wait disabled:opacity-60 dark:text-neutral-100 dark:hover:text-white"
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
