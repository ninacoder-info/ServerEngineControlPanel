import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpCircle, X } from "lucide-react";
import { apiRequest, readApiError } from "../lib/api";

function renderMarkdownInline(value) {
  const tokens = String(value || "").split(/(\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, index) => {
    if (!token) return null;
    const link = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      if (/^(https?:|mailto:)/i.test(href)) {
        return <a key={index} href={href} target="_blank" rel="noreferrer" className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">{label}</a>;
      }
      return <span key={index}>{label}</span>;
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={index} className="rounded bg-neutral-200 px-1 py-0.5 font-mono text-[0.9em] dark:bg-neutral-800">{token.slice(1, -1)}</code>;
    }
    return <span key={index}>{token}</span>;
  });
}

function MarkdownContent({ content }) {
  const lines = String(content || "").split(/\r?\n/);
  const blocks = [];
  let code = [];
  let inCode = false;
  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        blocks.push(<pre key={`code-${index}`} className="overflow-x-auto rounded-md bg-neutral-100 p-3 font-mono text-xs leading-5 text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200"><code>{code.join("\n")}</code></pre>);
        code = [];
      }
      inCode = !inCode;
      return;
    }
    if (inCode) {
      code.push(line);
      return;
    }
    if (!line.trim()) return;
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const Heading = level === 1 ? "h3" : level === 2 ? "h4" : "h5";
      blocks.push(<Heading key={`heading-${index}`} className="font-semibold text-neutral-900 dark:text-neutral-100">{renderMarkdownInline(heading[2])}</Heading>);
      return;
    }
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      blocks.push(<div key={`item-${index}`} className="flex gap-2 leading-5"><span aria-hidden="true">•</span><span>{renderMarkdownInline(bullet[1])}</span></div>);
      return;
    }
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      blocks.push(<div key={`ordered-${index}`} className="flex gap-2 leading-5"><span aria-hidden="true">{line.match(/^\s*(\d+)[.)]/)?.[1]}.</span><span>{renderMarkdownInline(ordered[1])}</span></div>);
      return;
    }
    blocks.push(<p key={`paragraph-${index}`}>{renderMarkdownInline(line)}</p>);
  });
  if (inCode && code.length) {
    blocks.push(<pre key="code-final" className="overflow-x-auto rounded-md bg-neutral-100 p-3 font-mono text-xs leading-5 text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200"><code>{code.join("\n")}</code></pre>);
  }
  return <div className="space-y-1">{blocks}</div>;
}

export default function Brand() {
  const [version, setVersion] = useState(null);
  const [update, setUpdate] = useState(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [name, setName] = useState(
    () => localStorage.getItem("server-engine-panel-name") || "Server Engine",
  );

  useEffect(() => {
    let active = true;
    fetch("/api/v1/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.version) setVersion(data.version);
      })
      .catch(() => {});
    apiRequest("/api/v1/system/update")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data) setUpdate(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const startUpdate = async () => {
    setUpdateBusy(true);
    setUpdateError("");
    try {
      const response = await apiRequest("/api/v1/system/update", { method: "POST" });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to start the panel update."));
      const result = await response.json();
      setUpdate((current) => ({ ...current, available: false, started: true }));
      setUpdateOpen(false);
      window.dispatchEvent(new CustomEvent("serverengine:panel-update-started", {
        detail: { job_id: result?.job_id || null },
      }));
    } catch (error) {
      setUpdateError(error.message);
    } finally {
      setUpdateBusy(false);
    }
  };
  useEffect(() => {
    const updateName = (event) => {
      if (event.detail?.panel_name) {
        setName(event.detail.panel_name);
        localStorage.setItem("server-engine-panel-name", event.detail.panel_name);
      }
    };
    window.addEventListener("serverengine:panel-settings-change", updateName);
    return () => window.removeEventListener("serverengine:panel-settings-change", updateName);
  }, []);

  return (
    <div className="flex items-center gap-3">
      <img
        src="/assets/server-engine-icon.png"
        alt="Server Engine"
        className="h-10 w-10 rounded-xl object-cover"
      />
      <div>
        <p className="font-semibold">{name}</p>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>{version ? `v${version}` : "—"}</span>
          {update?.available && (
            <button
              type="button"
              title={`Update to v${update.latest_version}`}
              onClick={() => setUpdateOpen(true)}
              className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <ArrowUpCircle size={13} />
              Update
            </button>
          )}
        </div>
      </div>
      {updateOpen && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <section className="w-full max-w-2xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Server Engine update</p>
                <h2 className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Version {update.current_version} → v{update.latest_version}</h2>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Review the release notes before replacing the panel release.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setUpdateOpen(false)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"><X size={17} /></button>
            </header>
            <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-5 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300"><MarkdownContent content={update.notes} /></div>
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">Websites, services, logs, backups, and Server Engine state are preserved. The panel briefly restarts after the update.</p>
              {updateError && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{updateError}</p>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
              <button type="button" onClick={() => setUpdateOpen(false)} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">Later</button>
              <button type="button" disabled={updateBusy} onClick={startUpdate} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"><ArrowUpCircle size={15} />{updateBusy ? "Starting…" : `Update to v${update.latest_version}`}</button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
