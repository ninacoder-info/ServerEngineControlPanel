import React from "react";
import {
  Activity,
  Cpu,
  Film,
  FileText,
  Gauge,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import SaveButton from "../../components/SaveButton";
import Toast from "../../components/Toast";

const STORAGE_KEY = "serverengine:ffmpeg";
const tabs = [
  ["runtime", "Runtime", Activity],
  ["configuration", "Configuration", SlidersHorizontal],
  ["security", "Security", ShieldCheck],
  ["encoding", "Encoding", Film],
  ["hardware", "Hardware", Cpu],
  ["logs", "Error log", FileText],
];
const inputClass =
  "mt-1.5 block min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const buttonClass =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const defaults = {
  tempPath: "/opt/server-engine/tmp/ffmpeg",
  outputPath: "/opt/server-engine/media/processed",
  videoCodec: "H.264 (libx264)",
  audioCodec: "AAC",
  container: "MP4",
  preset: "Balanced",
  crf: "23",
  audioBitrate: "128k",
  maxDuration: "2 hours",
  maxFileSize: "2 GiB",
  threads: "Auto",
  thumbnails: true,
  stripMetadata: true,
  networkInputs: false,
  preserveOriginal: true,
  allowProtocols: "file only",
  hwaccel: "Auto",
  hwDevice: "Default",
  vaapi: false,
  videotoolbox: false,
  nvenc: false,
};

function readSettings() {
  try {
    return {
      ...defaults,
      ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"),
    };
  } catch {
    return defaults;
  }
}

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500 dark:text-neutral-400">
          {hint}
        </span>
      )}
    </label>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
      />
      <span>
        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </span>
        {description && (
          <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3 text-sm last:border-0 dark:border-neutral-800">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="max-w-[72%] break-all text-right font-medium text-neutral-900 dark:text-neutral-100">
        {value || "—"}
      </span>
    </div>
  );
}

function SaveFooter({ onSave, saving }) {
  return (
    <div className="flex justify-end border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <SaveButton onClick={onSave} saving={saving}>
        Save changes
      </SaveButton>
    </div>
  );
}

export default function FfmpegConfigModal({ service, installed, onClose }) {
  const current = Array.isArray(installed) ? installed[0] : installed;
  const [tab, setTab] = React.useState("runtime");
  const [settings, setSettings] = React.useState(readSettings);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const version = current?.version || service?.version || "—";
  const root = current?.root || current?.path || "/opt/server-engine/services/ffmpeg";
  const set = (key, value) =>
    setSettings((valueState) => ({ ...valueState, [key]: value }));

  const save = async () => {
    setSaving(true);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    setSaving(false);
    setToast({ type: "success", message: "FFmpeg settings saved." });
    return true;
  };

  const renderTab = () => {
    if (tab === "configuration") {
      return (
        <div className="space-y-6">
          <Section
            title="Media processing defaults"
            description="Choose the default locations and output profile used by hosted applications and background jobs."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Temporary directory" hint="Working files are removed after a job finishes.">
                <input className={`${inputClass} font-mono text-xs`} value={settings.tempPath} onChange={(event) => set("tempPath", event.target.value)} />
              </Field>
              <Field label="Output directory" hint="Processed media is written here unless an application overrides it.">
                <input className={`${inputClass} font-mono text-xs`} value={settings.outputPath} onChange={(event) => set("outputPath", event.target.value)} />
              </Field>
              <Field label="Maximum job duration">
                <select className={inputClass} value={settings.maxDuration} onChange={(event) => set("maxDuration", event.target.value)}>
                  {["30 minutes", "2 hours", "8 hours", "No limit"].map((value) => <option key={value}>{value}</option>)}
                </select>
              </Field>
              <Field label="Maximum input size">
                <select className={inputClass} value={settings.maxFileSize} onChange={(event) => set("maxFileSize", event.target.value)}>
                  {["512 MiB", "2 GiB", "10 GiB", "No limit"].map((value) => <option key={value}>{value}</option>)}
                </select>
              </Field>
            </div>
          </Section>
          <Section title="Output behavior">
            <div className="space-y-3">
              <Toggle label="Generate thumbnails" description="Create a poster frame for uploaded videos when the application requests one." checked={settings.thumbnails} onChange={(value) => set("thumbnails", value)} />
              <Toggle label="Strip metadata by default" description="Remove GPS, device, and source metadata from generated files." checked={settings.stripMetadata} onChange={(value) => set("stripMetadata", value)} />
              <Toggle label="Preserve original uploads" description="Never replace the source file automatically after conversion." checked={settings.preserveOriginal} onChange={(value) => set("preserveOriginal", value)} />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "security") {
      return (
        <div className="space-y-6">
          <Section title="Input and protocol policy" description="Restrict where media can come from before FFmpeg receives a job.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Allowed input protocols" hint="File-only is the safest default for websites.">
                <select className={inputClass} value={settings.allowProtocols} onChange={(event) => set("allowProtocols", event.target.value)}>
                  <option value="file only">File only</option>
                  <option value="file,http,https">File, HTTP, HTTPS</option>
                  <option value="all">All compiled protocols</option>
                </select>
              </Field>
              <Field label="Network input access" hint="Enable only for a trusted media import workflow.">
                <select className={inputClass} value={settings.networkInputs ? "enabled" : "disabled"} onChange={(event) => set("networkInputs", event.target.value === "enabled")}>
                  <option value="disabled">Disabled</option>
                  <option value="enabled">Enabled</option>
                </select>
              </Field>
            </div>
          </Section>
          <Section title="Safe processing defaults" description="These options reduce SSRF, data leakage, and runaway conversion risks.">
            <div className="space-y-3">
              <Toggle label="Reject remote URLs" description="Prevent jobs from fetching arbitrary internet resources." checked={!settings.networkInputs} onChange={(value) => set("networkInputs", !value)} />
              <Toggle label="Strip source metadata" description="Remove location and device metadata from output files." checked={settings.stripMetadata} onChange={(value) => set("stripMetadata", value)} />
              <Toggle label="Keep source files read-only" description="Protect original uploads from in-place conversion commands." checked={settings.preserveOriginal} onChange={(value) => set("preserveOriginal", value)} />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "encoding") {
      return (
        <div className="space-y-6">
          <Section title="Default output profile" description="Applications can override these values for a specific job.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Video codec">
                <select className={inputClass} value={settings.videoCodec} onChange={(event) => set("videoCodec", event.target.value)}>
                  <option>H.264 (libx264)</option><option>H.265 (libx265)</option><option>VP9 (libvpx-vp9)</option><option>AV1 (libsvtav1)</option><option>Copy source</option>
                </select>
              </Field>
              <Field label="Audio codec">
                <select className={inputClass} value={settings.audioCodec} onChange={(event) => set("audioCodec", event.target.value)}>
                  <option>AAC</option><option>Opus</option><option>MP3</option><option>Copy source</option>
                </select>
              </Field>
              <Field label="Output container">
                <select className={inputClass} value={settings.container} onChange={(event) => set("container", event.target.value)}>
                  <option>MP4</option><option>WebM</option><option>MKV</option><option>MP3 audio</option><option>WAV audio</option>
                </select>
              </Field>
              <Field label="Encoding preset" hint="Controls the speed versus compression tradeoff.">
                <select className={inputClass} value={settings.preset} onChange={(event) => set("preset", event.target.value)}>
                  <option>Fast</option><option>Balanced</option><option>Quality</option><option>Archive</option>
                </select>
              </Field>
              <Field label="Video quality (CRF)" hint="Lower values produce larger, higher-quality files.">
                <select className={inputClass} value={settings.crf} onChange={(event) => set("crf", event.target.value)}>
                  {["18", "20", "23", "26", "28"].map((value) => <option key={value}>{value}</option>)}
                </select>
              </Field>
              <Field label="Audio bitrate">
                <select className={inputClass} value={settings.audioBitrate} onChange={(event) => set("audioBitrate", event.target.value)}>
                  {["96k", "128k", "160k", "192k", "256k"].map((value) => <option key={value}>{value}</option>)}
                </select>
              </Field>
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "hardware") {
      return (
        <div className="space-y-6">
          <Section title="Hardware acceleration" description="Acceleration depends on the host CPU/GPU, drivers, and the selected codec. Auto falls back to software when unavailable.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Decode acceleration">
                <select className={inputClass} value={settings.hwaccel} onChange={(event) => set("hwaccel", event.target.value)}>
                  <option>Auto</option><option>None</option><option>VAAPI</option><option>VideoToolbox</option><option>CUDA</option><option>QSV</option>
                </select>
              </Field>
              <Field label="Hardware device" hint="Only used when the selected accelerator needs an explicit device.">
                <select className={inputClass} value={settings.hwDevice} onChange={(event) => set("hwDevice", event.target.value)}>
                  <option>Default</option><option>/dev/dri/renderD128</option><option>0</option>
                </select>
              </Field>
            </div>
          </Section>
          <Section title="Available encoder families" description="These are opt-in capabilities. They do not install drivers or make unavailable hardware appear.">
            <div className="space-y-3">
              <Toggle label="VAAPI encoders" description="Linux GPU acceleration through a VAAPI render device." checked={settings.vaapi} onChange={(value) => set("vaapi", value)} />
              <Toggle label="VideoToolbox encoders" description="Apple hardware acceleration when supported by the host." checked={settings.videotoolbox} onChange={(value) => set("videotoolbox", value)} />
              <Toggle label="NVENC encoders" description="NVIDIA hardware encoding when the driver and GPU are present." checked={settings.nvenc} onChange={(value) => set("nvenc", value)} />
            </div>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    if (tab === "runtime") {
      return (
        <div className="space-y-6">
          <Section title="Runtime status" description="FFmpeg is a command-line media runtime, not a background daemon. It runs only when an application or queued job invokes it.">
            <div className="border-y border-neutral-200 dark:border-neutral-800">
              <Row label="Status" value="Installed" />
              <Row label="Version" value={version} />
              <Row label="FFmpeg binary" value={`${root}/bin/ffmpeg`} />
              <Row label="Probe binary" value={`${root}/bin/ffprobe`} />
              <Row label="Worker threads" value={settings.threads} />
            </div>
          </Section>
          <Section title="Execution limits">
            <Field label="Worker threads" hint="Auto uses the host CPU allocation available to the job.">
              <select className={inputClass} value={settings.threads} onChange={(event) => set("threads", event.target.value)}>
                {["Auto", "1", "2", "4", "8", "16"].map((value) => <option key={value}>{value}</option>)}
              </select>
            </Field>
          </Section>
          <SaveFooter onSave={save} saving={saving} />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <Section title="FFmpeg error log" description="Codec failures, rejected protocols, missing hardware devices, and conversion errors appear here.">
          <div className="border-y border-neutral-200 dark:border-neutral-800">
            <Row label="Log file" value={`${root}/logs/error.log`} />
            <Row label="Tail" value="50 lines" />
            <Row label="Live streaming" value="Available when the host agent is connected" />
          </div>
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
            No FFmpeg errors have been reported yet.
          </div>
        </Section>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-neutral-900" role="dialog" aria-modal="true" aria-labelledby="ffmpeg-title">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <Film size={19} className="text-blue-600 dark:text-blue-400" />
              <h2 id="ffmpeg-title" className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">FFmpeg</h2>
            </div>
            <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400"><span className="h-2 w-2 rounded-full bg-emerald-500" />Installed · v{version}</p>
          </div>
          <button type="button" aria-label="Close FFmpeg configuration" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex gap-5 overflow-x-auto border-b border-neutral-200 px-6 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800">
          {tabs.map(([id, label, Icon]) => <button type="button" key={id} onClick={() => setTab(id)} className={`${buttonClass} rounded-none border-b-2 px-1 pb-3 pt-0 ${tab === id ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"}`}><Icon size={15} />{label}</button>)}
        </div>
        <div className="px-6 py-5">{renderTab()}</div>
      </section>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
