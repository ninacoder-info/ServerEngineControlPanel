import {
  Activity,
  CalendarClock,
  Container,
  Database,
  FileCog,
  FolderOpen,
  Gauge,
  Globe2,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Logs,
  Mail,
  Network,
  Package,
  Server,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Users,
} from "lucide-react";
import Brand from "./Brand";

const sections = [
  [
    "Workspace",
    [
      ["Overview", "/", LayoutDashboard],
      ["Activity", "/activity", Activity],
    ],
  ],
  [
    "Hosting",
    [
      ["Websites", "/websites", Globe2],
      ["Domains & DNS", "/domains", Network],
      ["Email", "/email", Mail],
      ["FTP Accounts", "/ftp", KeyRound],
    ],
  ],
  [
    "Data & recovery",
    [
      ["File Manager", "/file-manager", FolderOpen],
      ["Databases", "/databases", Database],
      ["Backups", "/backups", HardDrive],
    ],
  ],
  [
    "Services",
    [
      ["Services", "/services", Package],
      ["PHP runtimes", "/services/php", FileCog],
      ["Node.js runtimes", "/services/nodejs", FileCog],
      ["Containers", "/docker", Container],
      ["Server health", "/health", Gauge],
    ],
  ],
  [
    "Automation",
    [
      ["Cron jobs", "/cronjobs", CalendarClock],
      ["Supervisor", "/supervisor", Activity],
    ],
  ],
  [
    "Accounts & plans",
    [
      ["Accounts", "/users", Users],
      ["Hosting plans", "/plans", Package],
    ],
  ],
  [
    "Security & access",
    [
      ["Firewall", "/firewall", ShieldCheck],
      ["Application Shield", "/application-shield", ShieldAlert],
      ["Logs", "/logs", Logs],
    ],
  ],
];

export default function Sidebar({ open, onClose, active, onSelect }) {
  return (
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <div className="flex items-center justify-between px-5 py-6">
        <Brand />
        <button className="text-slate-400 md:hidden" onClick={onClose}>
          ×
        </button>
      </div>
      <nav className="sidebar-nav max-h-[calc(100vh-14rem)] space-y-5 overflow-y-auto px-3 pb-4">
        {sections.map(([title, items]) => (
          <div key={title}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {title}
            </p>
            <div className="space-y-1">
              {items.map(([label, path, Icon]) => (
                <a
                  key={path}
                  href={path}
                  title={`${label} · ${path}`}
                  aria-label={label}
                  className={`nav-item no-underline ${active === label ? "nav-active" : ""}`}
                  onClick={(event) => {
                    event.preventDefault();
                    onSelect(path);
                    onClose();
                  }}
                >
                  <Icon size={16} />
                  {label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="absolute bottom-4 left-3 right-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700/80 dark:bg-slate-950/60">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <HardDrive size={14} className="text-blue-400" />
              Storage
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">68%</span>
              <a
                href="/settings"
                className="grid h-6 w-6 place-items-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                title="Open settings"
                aria-label="Open settings"
                onClick={(event) => {
                  event.preventDefault();
                  onSelect("/settings");
                  onClose();
                }}
              >
                <Settings size={14} />
              </a>
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <span className="block h-full w-[68%] rounded-full bg-blue-500" />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-500">
            <span>68 GB used</span>
            <span>100 GB</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <span className="text-[10px] text-slate-500">
              Websites
              <strong className="mt-0.5 block text-xs text-slate-700 dark:text-slate-300">
                0 / 50
              </strong>
            </span>
            <span className="text-[10px] text-slate-500">
              Backups
              <strong className="mt-0.5 block text-xs text-slate-700 dark:text-slate-300">
                Healthy
              </strong>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
