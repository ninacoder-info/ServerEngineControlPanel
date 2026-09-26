import { Server } from "lucide-react";
export default function ServerPanel() {
  return (
    <div className="panel">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="panel-title">Connected servers</h3>
          <p className="panel-subtitle">
            Manage hosts through the secure agent.
          </p>
        </div>
        <button className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Add server
        </button>
      </div>
      <div className="mt-7 rounded-xl border border-dashed border-slate-700 p-8 text-center">
        <Server className="mx-auto text-slate-600" size={28} />
        <p className="mt-3 text-sm text-slate-300">
          No host agent connected yet
        </p>
        <p className="mt-1 text-xs text-slate-500">
          The first milestone uses a mock agent while the API is built.
        </p>
      </div>
    </div>
  );
}
