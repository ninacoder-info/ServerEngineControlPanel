import { useEffect, useState } from "react";
import { Server } from "lucide-react";

export default function Brand() {
  const [version, setVersion] = useState(null);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.version) setVersion(data.version);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl bg-cyan-400/15 p-2 text-cyan-300">
        <Server size={21} />
      </div>
      <div>
        <p className="font-semibold">Server Engine</p>
        <p className="text-xs text-slate-500">Version {version ? `v${version}` : "—"}</p>
      </div>
    </div>
  );
}
