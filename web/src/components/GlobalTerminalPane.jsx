import React from "react";
import { Minus, Plus } from "lucide-react";
import { TerminalSession } from "../features/terminal/TerminalPage";
import RawLogsPanel, { logCategories } from "./RawLogsPanel";

export default function GlobalTerminalPane({ session, sessionName = "Local Server", initialCommand = "", panel = "terminal", open = true, onResize, onClose }) {
  const [status, setStatus] = React.useState("disconnected");
  const [logCategory, setLogCategory] = React.useState("All");
  const [terminalSessions, setTerminalSessions] = React.useState(() => [session]);
  const [activeSession, setActiveSession] = React.useState(session);
  const [sessionLabels, setSessionLabels] = React.useState(() => ({ [session]: sessionName }));
  const [hasOpened, setHasOpened] = React.useState(open);
  const dragging = React.useRef(false);

  React.useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);

  React.useEffect(() => {
    setTerminalSessions((current) => current.includes(session) ? current : [session]);
    setActiveSession(session);
    setSessionLabels((current) => ({ ...current, [session]: sessionName }));
  }, [session, sessionName]);

  React.useEffect(() => {
    if (initialCommand) setActiveSession(session);
  }, [initialCommand, session]);

  React.useEffect(() => {
    const move = (event) => {
      if (!dragging.current) return;
      const layoutHeight = Math.max(1, window.innerHeight - 32);
      const next = ((layoutHeight - event.clientY) / layoutHeight) * 100;
      onResize(Math.max(24, Math.min(80, next)));
    };
    const stop = () => {
      dragging.current = false;
      document.body.style.removeProperty("user-select");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [onResize]);

  const profile = { id: `global-terminal-${session}`, name: "Local Server", kind: "local", username: "root" };
  const addSession = () => {
    const id = `${session}-${Date.now()}`;
    setTerminalSessions((current) => [...current, id]);
    setSessionLabels((current) => ({ ...current, [id]: `Terminal ${Object.keys(current).length + 1}` }));
    setActiveSession(id);
  };

  return <section className={`${open ? "flex" : "hidden"} col-span-full row-start-2 min-h-0 min-w-0 flex-col border-t border-neutral-300 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900`} style={{ height: "100%" }} aria-label="Server Engine console">
    <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 hover:cursor-row-resize dark:border-neutral-800 dark:bg-neutral-950" onPointerDown={(event) => { if (event.target.closest("button")) return; dragging.current = true; document.body.style.userSelect = "none"; }}>
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {panel === "logs" ? logCategories.map((item) => <button key={item} type="button" className={`inline-flex h-8 shrink-0 cursor-pointer items-center border-b-2 px-3 text-xs font-semibold ${logCategory === item ? "border-neutral-800 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100" : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"}`} onClick={() => setLogCategory(item)}>{item}</button>) : <>{terminalSessions.map((id) => <button key={id} type="button" className={`inline-flex h-8 shrink-0 max-w-56 cursor-pointer items-center truncate border-b-2 px-3 text-xs font-semibold ${activeSession === id ? "border-neutral-800 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100" : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"}`} onClick={() => setActiveSession(id)}>{sessionLabels[id] || "Terminal"}</button>)}<button type="button" title="New terminal session" aria-label="New terminal session" disabled={terminalSessions.length >= 4} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800" onClick={addSession}><Plus size={16} /></button></>}
      </div>
      <button type="button" aria-label="Minimize console" title="Minimize" className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={onClose}><Minus size={18} /></button>
    </div>
    <div className="min-h-0 flex-1 overflow-hidden">{panel === "logs" ? <RawLogsPanel category={logCategory} /> : terminalSessions.map((id) => <TerminalSession key={id} profile={{ ...profile, name: sessionLabels[id] || "Local Server", id: `global-terminal-${id}` }} initialCommand={id === session ? initialCommand : ""} visible={activeSession === id} enabled={hasOpened} restart={id} className="h-full max-h-full" onStatus={(_, value) => setStatus(value)} onControls={() => {}} />)}</div>
  </section>;
}
