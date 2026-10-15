import React from "react";
import { Minus, Plus, X } from "lucide-react";
import { TerminalSession } from "../features/terminal/TerminalPage";
import RawLogsPanel, { logCategories } from "./RawLogsPanel";
import { apiRequest } from "../lib/api";

export default function GlobalTerminalPane({
  session,
  sessionName = "Local Server",
  initialCommand = "",
  panel = "terminal",
  open = true,
  onResize,
  onClose,
}) {
  const [terminalStatuses, setTerminalStatuses] = React.useState({});
  const [logCategory, setLogCategory] = React.useState("All");
  const [terminalSessions, setTerminalSessions] = React.useState(() => [
    session,
  ]);
  const [activeSession, setActiveSession] = React.useState(session);
  const [sessionLabels, setSessionLabels] = React.useState(() => ({
    [session]: sessionName,
  }));
  const [sessionCommands, setSessionCommands] = React.useState(() => ({
    [session]: initialCommand,
  }));
  const [sessionPhpVersions, setSessionPhpVersions] = React.useState({});
  const [phpRuntimes, setPhpRuntimes] = React.useState([]);
  const [phpMenuOpen, setPhpMenuOpen] = React.useState(false);
  const [hasOpened, setHasOpened] = React.useState(open);
  const logToolbarRef = React.useRef(null);
  const phpMenuRef = React.useRef(null);
  const dragging = React.useRef(false);

  React.useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);

  React.useEffect(() => {
    if (open)
      setTerminalSessions((current) =>
        current.includes(session) ? current : [...current, session],
      );
  }, [open, session]);

  React.useEffect(() => {
    setTerminalSessions((current) =>
      current.includes(session) ? current : [...current, session],
    );
    setActiveSession(session);
    setSessionLabels((current) => ({ ...current, [session]: sessionName }));
    setSessionCommands((current) => ({
      ...current,
      [session]: initialCommand,
    }));
  }, [initialCommand, session, sessionName]);

  React.useEffect(() => {
    if (initialCommand) setActiveSession(session);
  }, [initialCommand, session]);

  React.useEffect(() => {
    const connected = Object.values(terminalStatuses).filter(
      (value) => value === "connected",
    ).length;
    window.dispatchEvent(
      new CustomEvent("serverengine:terminal-status", {
        detail: { connected },
      }),
    );
  }, [terminalStatuses]);

  React.useEffect(() => {
    if (!open || panel !== "terminal") return undefined;
    let alive = true;
    apiRequest("/api/v1/services/php/runtime-options")
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => {
        if (alive)
          setPhpRuntimes(
            (Array.isArray(items) ? items : []).filter(
              (item) => item?.installed,
            ),
          );
      })
      .catch(() => {
        if (alive) setPhpRuntimes([]);
      });
    return () => {
      alive = false;
    };
  }, [open, panel]);

  React.useEffect(() => {
    if (!phpMenuOpen) return undefined;
    const close = (event) => {
      if (!phpMenuRef.current?.contains(event.target)) setPhpMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [phpMenuOpen]);

  React.useEffect(() => {
    const move = (event) => {
      if (!dragging.current) return;
      const layoutHeight = Math.max(1, window.innerHeight - 32);
      const next = ((layoutHeight - event.clientY) / layoutHeight) * 100;
      onResize(Math.max(24, Math.min(80, next)));
    };
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [onResize]);

  const profile = {
    id: `global-terminal-${session}`,
    name: "Local Server",
    kind: "local",
    username: "root",
  };
  const openSession = ({ id, label, phpVersion = "", command = "" }) => {
    setTerminalSessions((current) =>
      current.includes(id) ? current : [...current, id],
    );
    setSessionLabels((current) => ({ ...current, [id]: label }));
    setSessionCommands((current) => ({ ...current, [id]: command }));
    setSessionPhpVersions((current) => ({ ...current, [id]: phpVersion }));
    setActiveSession(id);
    setPhpMenuOpen(false);
  };
  const addSession = () => {
    const id = `${session}-${Date.now()}`;
    openSession({ id, label: `Terminal ${terminalSessions.length + 1}` });
  };
  const addPhpSession = (version) => {
    const id = `${session}-php-${version}`;
    openSession({
      id,
      label: `PHP ${version}`,
      phpVersion: version,
    });
  };
  const closeSession = (id) => {
    const remaining = terminalSessions.filter((item) => item !== id);
    setTerminalSessions(remaining);
    setSessionLabels((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSessionCommands((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSessionPhpVersions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setTerminalStatuses((current) => {
      const next = { ...current };
      delete next[`global-terminal-${id}`];
      return next;
    });
    if (activeSession === id)
      setActiveSession(remaining[remaining.length - 1] || "");
    if (!remaining.length) onClose?.();
  };
  const addButtonDisabled = terminalSessions.length >= 4;
  const phpRuntimeOptions = phpRuntimes.slice().sort((a, b) =>
    String(b.version).localeCompare(String(a.version), undefined, {
      numeric: true,
    }),
  );

  return (
    <section
      className={`${open ? "flex" : "hidden"} col-span-full row-start-2 min-h-0 min-w-0 flex-col border-t border-neutral-300 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900`}
      style={{ height: "100%" }}
      aria-label="Server Engine console"
    >
      <div
        className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 hover:cursor-row-resize dark:border-neutral-800 dark:bg-neutral-950"
        onPointerDown={(event) => {
          if (event.target.closest("button")) return;
          dragging.current = true;
        }}
      >
        <div className="flex min-w-0 items-center gap-1 overflow-visible">
          {panel === "logs" ? (
            logCategories.map((item) => (
              <button
                key={item}
                type="button"
                className={`inline-flex h-8 shrink-0 cursor-pointer items-center border-b-2 px-3 text-xs font-semibold ${logCategory === item ? "border-neutral-800 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100" : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"}`}
                onClick={() => setLogCategory(item)}
              >
                {item}
              </button>
            ))
          ) : (
            <>
              {terminalSessions.map((id) => (
                <span
                  key={id}
                  className={`inline-flex h-8 shrink-0 max-w-56 items-center border-b-2 ${activeSession === id ? "border-neutral-800 dark:border-neutral-100" : "border-transparent"}`}
                >
                  <button
                    type="button"
                    className={`min-w-0 cursor-pointer truncate px-2 text-xs font-semibold ${activeSession === id ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"}`}
                    onClick={() => setActiveSession(id)}
                  >
                    {sessionLabels[id] || "Terminal"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${sessionLabels[id] || "terminal"}`}
                    title="Kill terminal"
                    className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                    onClick={() => closeSession(id)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <span ref={phpMenuRef} className="relative inline-flex shrink-0">
                <button
                  type="button"
                  title="New terminal session"
                  aria-label="New terminal session"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  onClick={() => setPhpMenuOpen((current) => !current)}
                >
                  <Plus size={16} />
                </button>
                {phpMenuOpen && (
                  <div className="absolute left-0 top-9 z-40 w-40 rounded-lg border border-neutral-200 bg-white p-2 text-left shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
                    <button
                      type="button"
                      disabled={addButtonDisabled}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-100 dark:hover:bg-neutral-800"
                      onClick={addSession}
                    >
                      <Plus size={14} />
                      New terminal
                    </button>
                    <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                      PHP runtime
                    </p>
                    {phpRuntimeOptions.length ? (
                      phpRuntimeOptions.map((runtime) => (
                        <button
                          key={runtime.version}
                          type="button"
                          disabled={
                            addButtonDisabled &&
                            !terminalSessions.includes(
                              `${session}-php-${runtime.version}`,
                            )
                          }
                          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-xs font-semibold text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-100 dark:hover:bg-neutral-800"
                          onClick={() => addPhpSession(runtime.version)}
                        >
                          <span className="whitespace-nowrap">
                            PHP {runtime.version}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="px-2 py-2 text-xs text-neutral-500">
                        No installed PHP runtimes.
                      </p>
                    )}
                  </div>
                )}
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span ref={logToolbarRef} className="flex items-center gap-0.5" />
          <span className="group/minimize-tooltip relative inline-flex">
            <button
              type="button"
              aria-label="Minimize console"
              className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={onClose}
            >
              <Minus size={18} />
            </button>
            <span className="pointer-events-none absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/minimize-tooltip:opacity-100 dark:bg-white dark:text-neutral-900">
              Minimize
            </span>
          </span>
        </div>
      </div>
      <div
        className={`min-h-0 flex-1 ${panel === "logs" ? "overflow-visible" : "overflow-hidden"}`}
      >
        {panel === "logs" ? (
          <RawLogsPanel category={logCategory} toolbarHostRef={logToolbarRef} />
        ) : (
          terminalSessions.map((id) => (
            <TerminalSession
              key={id}
              profile={{
                ...profile,
                name: sessionLabels[id] || "Local Server",
                id: `global-terminal-${id}`,
                php_version: sessionPhpVersions[id] || "",
              }}
              initialCommand={sessionCommands[id] || ""}
              visible={activeSession === id}
              enabled={hasOpened}
              restart={id}
              className="h-full max-h-full"
              onStatus={(profileId, value) =>
                setTerminalStatuses((current) =>
                  current[profileId] === value
                    ? current
                    : { ...current, [profileId]: value },
                )
              }
              onKill={closeSession}
              onControls={() => {}}
            />
          ))
        )}
      </div>
    </section>
  );
}
