import React from "react";
import { LoaderCircle, Wifi, WifiOff } from "lucide-react";

export default function PanelUpdateOverlay() {
  const [updating, setUpdating] = React.useState(false);
  const [disconnected, setDisconnected] = React.useState(false);
  const disconnectedRef = React.useRef(false);

  React.useEffect(() => {
    const start = () => {
      disconnectedRef.current = false;
      setDisconnected(false);
      setUpdating(true);
    };
    const socketStatus = (event) => {
      if (!updating) return;
      if (event.detail?.status === "disconnected") {
        disconnectedRef.current = true;
        setDisconnected(true);
        return;
      }
      if (event.detail?.status === "connected" && disconnectedRef.current) {
        // The panel has restarted and the shared socket is live again. Give
        // the new web process a moment to finish serving the replacement.
        window.setTimeout(() => window.location.reload(), 500);
      }
    };
    window.addEventListener("serverengine:panel-update-started", start);
    window.addEventListener("serverengine:socket-status", socketStatus);
    return () => {
      window.removeEventListener("serverengine:panel-update-started", start);
      window.removeEventListener("serverengine:socket-status", socketStatus);
    };
  }, [updating]);

  if (!updating) return null;

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-neutral-950/80 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 text-neutral-100 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-neutral-800 text-blue-400">
            {disconnected ? <WifiOff size={22} /> : <LoaderCircle className="animate-spin" size={22} />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Updating Server Engine</h2>
            <p className="mt-2 text-sm leading-5 text-neutral-300">
              {disconnected
                ? "The panel is restarting. Waiting for the new version to come back online…"
                : "The update is running. Please keep this window open while the new release is installed…"}
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 border-t border-neutral-800 pt-4 text-xs text-neutral-400">
          {disconnected ? <WifiOff size={14} /> : <Wifi size={14} />}
          {disconnected ? "Reconnecting to Server Engine" : "Waiting for the update process"}
        </div>
      </div>
    </div>
  );
}
