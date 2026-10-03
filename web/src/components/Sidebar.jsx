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
  ScanSearch,
  ShieldCheck,
  ShieldAlert,
  Users,
  Shield,
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
      ["Docker", "/docker", Container],
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
    "Hosting management",
    [
      ["Panel users", "/users", Users],
      ["Roles & permissions", "/roles", Shield],
      ["Hosting accounts", "/hosting-accounts", Users],
      ["Hosting plans", "/plans", Package],
    ],
  ],
  [
    "Security & access",
    [
      ["Firewall", "/firewall", ShieldCheck],
      ["Malware Scanner", "/malware-scanner", ScanSearch],
      ["Application Shield", "/application-shield", ShieldAlert],
      ["Logs", "/logs", Logs],
    ],
  ],
];

export default function Sidebar({ open, onClose, active, onSelect }) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 w-64 -translate-x-full overflow-hidden border-r border-neutral-200 bg-white transition-transform duration-200 dark:border-dark-border dark:bg-dark md:translate-x-0 ${open ? "translate-x-0" : ""}`}
    >
      <div className="flex items-center justify-between px-5 py-6">
        <Brand />
        <button className="text-neutral-400 md:hidden" onClick={onClose}>
          ×
        </button>
      </div>
      <nav className="h-[calc(100vh-14rem)] space-y-5 overflow-y-auto px-3 pb-4">
        {sections.map(([title, items]) => (
          <div key={title}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              {title}
            </p>
            <div className="space-y-1">
              {items.map(([label, path, Icon]) => (
                <a
                  key={path}
                  href={path}
                  title={`${label} · ${path}`}
                  aria-label={label}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors ${active === label ? "bg-neutral-100 text-neutral-700 dark:bg-dark-hover dark:text-neutral-100" : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-300 dark:hover:bg-dark-hover dark:hover:text-white"}`}
                  onClick={(event) => {
                    event.preventDefault();
                    onSelect(path);
                    onClose();
                  }}
                >
                  <Icon size={16} className="shrink-0" />
                  {label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="absolute bottom-4 left-3 right-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-dark-border dark:bg-dark-editor">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              <HardDrive size={14} className="text-neutral-500 dark:text-neutral-400" />
              Storage
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-400">68%</span>
              <a
                href="/settings"
                className="grid h-6 w-6 place-items-center rounded-md text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800 dark:hover:bg-dark-hover dark:hover:text-neutral-200"
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
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-dark-border">
            <span className="block h-full w-[68%] rounded-full bg-neutral-500" />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-neutral-500">
            <span>68 GB used</span>
            <span>100 GB</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <span className="text-[10px] text-neutral-500">
              Websites
              <strong className="mt-0.5 block text-xs text-neutral-700 dark:text-neutral-300">
                0 / 50
              </strong>
            </span>
            <span className="text-[10px] text-neutral-500">
              Backups
              <strong className="mt-0.5 block text-xs text-neutral-700 dark:text-neutral-300">
                Healthy
              </strong>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
