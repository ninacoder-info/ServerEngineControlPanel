import { TerminalSquare } from "lucide-react";
function Event({ title, time }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 pb-4 last:border-0 last:pb-0">
      <span className="text-sm text-slate-300">{title}</span>
      <span className="text-xs text-slate-500">{time}</span>
    </div>
  );
}
export default function ActivityPanel() {
  return (
    <div className="panel">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-violet-400/10 p-2 text-violet-300">
          <TerminalSquare size={18} />
        </div>
        <div>
          <h3 className="panel-title">Activity</h3>
          <p className="panel-subtitle">Recent control-plane events</p>
        </div>
      </div>
      <div className="mt-7 space-y-5">
        <Event title="Authenticated session started" time="Just now" />
        <Event title="Security policy loaded" time="Just now" />
        <Event title="Waiting for first server" time="Pending" />
      </div>
    </div>
  );
}
