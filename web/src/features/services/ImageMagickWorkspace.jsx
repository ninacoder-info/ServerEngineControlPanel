import React from "react";
import { CheckCircle2, Image, Save, ShieldCheck } from "lucide-react";

const defaults = {
  tempPath: "/server-engine/tmp/imagemagick",
  maxWidth: "10000 px",
  maxHeight: "10000 px",
  memory: "512 MB",
  disk: "2 GB",
  threads: "Auto",
  quality: "85",
  thumbnail: "1600 px",
  jpeg: true,
  png: true,
  webp: true,
  svg: true,
  pdf: false,
  stripMetadata: true,
  blockRemote: true,
};

const input = "mt-1.5 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export default function ImageMagickWorkspace() {
  const [settings, setSettings] = React.useState(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem("serverengine:imagemagick") || "{}") }; } catch { return defaults; }
  });
  const [saved, setSaved] = React.useState(false);
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const save = () => { localStorage.setItem("serverengine:imagemagick", JSON.stringify(settings)); setSaved(true); window.setTimeout(() => setSaved(false), 3000); };
  const formats = [["jpeg", "JPEG", "Common photographic uploads"], ["png", "PNG", "Transparent graphics and screenshots"], ["webp", "WebP", "Modern web delivery"], ["svg", "SVG", "Vector input and output"], ["pdf", "PDF", "Document conversion; disabled by default"]];
  return (
    <section className="mb-7 space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex items-center gap-2"><Image size={19} className="text-blue-600 dark:text-blue-400" /><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">ImageMagick</h2><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 size={13} />Ready</span></div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Configure safe image conversion, thumbnail generation, format delegates, and resource limits for hosted applications.</p></div><button type="button" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><ShieldCheck size={15} />Security policy</button></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500">Conversions</span><strong className="mt-1 block text-2xl text-slate-900 dark:text-slate-100">0</strong><span className="text-xs text-slate-500">Runtime data unavailable</span></div><div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500">Enabled formats</span><strong className="mt-1 block text-2xl text-slate-900 dark:text-slate-100">{formats.filter(([key]) => settings[key]).length}</strong><span className="text-xs text-slate-500">Delegates configured below</span></div><div className="rounded-md border border-slate-200 p-4 dark:border-slate-800"><span className="text-xs text-slate-500">Default quality</span><strong className="mt-1 block text-2xl text-slate-900 dark:text-slate-100">{settings.quality}</strong><span className="text-xs text-slate-500">Out of 100</span></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Temporary directory<input className={`${input} font-mono text-xs`} value={settings.tempPath} onChange={(event) => set("tempPath", event.target.value)} /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Maximum width<select className={input} value={settings.maxWidth} onChange={(event) => set("maxWidth", event.target.value)}><option>4000 px</option><option>10000 px</option><option>20000 px</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Maximum height<select className={input} value={settings.maxHeight} onChange={(event) => set("maxHeight", event.target.value)}><option>4000 px</option><option>10000 px</option><option>20000 px</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Default quality<select className={input} value={settings.quality} onChange={(event) => set("quality", event.target.value)}><option>75</option><option>85</option><option>90</option><option>100</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Memory limit<select className={input} value={settings.memory} onChange={(event) => set("memory", event.target.value)}><option>256 MB</option><option>512 MB</option><option>1 GB</option><option>2 GB</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Disk limit<select className={input} value={settings.disk} onChange={(event) => set("disk", event.target.value)}><option>1 GB</option><option>2 GB</option><option>5 GB</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Worker threads<select className={input} value={settings.threads} onChange={(event) => set("threads", event.target.value)}><option>Auto</option><option>1</option><option>2</option><option>4</option></select></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Thumbnail width<select className={input} value={settings.thumbnail} onChange={(event) => set("thumbnail", event.target.value)}><option>800 px</option><option>1600 px</option><option>2400 px</option></select></label></div>
      <div><h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Format delegates</h4><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{formats.map(([key, label, description]) => <label key={key} className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-4 dark:border-slate-800"><input type="checkbox" className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600" checked={settings[key]} onChange={(event) => set(key, event.target.checked)} /><span><strong className="block text-sm text-slate-800 dark:text-slate-200">{label}</strong><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{description}</span></span></label>)}</div></div>
      <div className="grid gap-3 md:grid-cols-3"><label className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.stripMetadata} onChange={(event) => set("stripMetadata", event.target.checked)} /><span><strong className="block text-slate-800 dark:text-slate-200">Strip metadata</strong><span className="mt-1 block text-xs text-slate-500">Remove EXIF and location data from generated images.</span></span></label><label className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-800"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={settings.blockRemote} onChange={(event) => set("blockRemote", event.target.checked)} /><span><strong className="block text-slate-800 dark:text-slate-200">Block remote reads</strong><span className="mt-1 block text-xs text-slate-500">Prevent image operations from fetching arbitrary URLs.</span></span></label></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">Image processing actions will connect to the host agent later.</p><button type="button" onClick={save} className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{saved ? <CheckCircle2 size={15} /> : <Save size={15} />}{saved ? "Saved" : "Save ImageMagick settings"}</button></div>
    </section>
  );
}
