import React from "react";
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";
import {
  Activity,
  Braces,
  BriefcaseBusiness,
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
  ScanSearch,
  ShieldCheck,
  ShieldAlert,
  Users,
  Shield,
} from "lucide-react";
import Brand from "./Brand";
import FloatingTooltip from "./FloatingTooltip";

const sections = [
  ["Workspace", [["Overview", "/", LayoutDashboard]]],
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
      ["PHP runtimes", "/services/php", Braces],
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
      ["Hosting accounts", "/hosting-accounts", BriefcaseBusiness],
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

export default function Sidebar({
  open,
  onClose,
  active,
  onSelect,
  collapsed,
}) {
  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 -translate-x-full flex-col overflow-hidden border-r border-neutral-200 bg-white transition-[width,transform] duration-200 dark:border-dark-border dark:bg-dark md:relative md:col-start-1 md:row-start-1 md:translate-x-0 ${collapsed ? "md:w-16" : "md:w-64"} ${open ? "translate-x-0" : ""}`}
      >
        <div
          className={`flex items-center ${collapsed ? "justify-center px-2" : "justify-between px-5"} py-6`}
        >
          <Brand iconOnly={collapsed} />
          <button className="text-neutral-400 md:hidden" onClick={onClose}>
            ×
          </button>
        </div>
        <SimpleBar className="min-h-0 flex-1">
          <nav className={`space-y-5 pb-4 ${collapsed ? "px-2" : "px-3"}`}>
            {sections.map(([title, items]) => (
              <div key={title}>
                {!collapsed && (
                  <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                    {title}
                  </p>
                )}
                <div className="space-y-1">
                  {items.map(([label, path, Icon]) => (
                    <FloatingTooltip
                      key={path}
                      content={collapsed ? label : ""}
                      placement="right"
                      className="block w-full"
                    >
                      <a
                        href={path}
                        aria-label={label}
                        className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium no-underline transition-colors ${collapsed ? "justify-center px-0" : "gap-3 px-3"} ${active === label ? "bg-neutral-100 text-neutral-700 dark:bg-dark-hover dark:text-neutral-100" : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-300 dark:hover:bg-dark-hover dark:hover:text-white"}`}
                        onClick={(event) => {
                          event.preventDefault();
                          onSelect(path);
                          onClose();
                        }}
                      >
                        <Icon size={collapsed ? 20 : 16} className="shrink-0" />
                        {!collapsed && label}
                      </a>
                    </FloatingTooltip>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </SimpleBar>
      </aside>
    </>
  );
}
