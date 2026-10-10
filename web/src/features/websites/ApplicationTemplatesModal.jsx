import React from "react";
import {
  Blocks,
  Code2,
  FileCode2,
  Globe2,
  Layers3,
  Package,
  Search,
  Server,
  Waypoints,
  Sparkles,
  X,
} from "lucide-react";

export const applicationTemplates = [
  {
    id: "wordpress",
    name: "WordPress",
    description:
      "A ready PHP content platform for blogs, stores, and business sites.",
    framework: "wordpress",
    documentRoot: ".",
    runtime: "PHP-FPM",
    database: "MySQL · one-click setup",
    icon: Globe2,
    color: "blue",
  },
  {
    id: "laravel",
    name: "Laravel",
    description:
      "A production-ready PHP application with a protected public directory.",
    framework: "laravel",
    documentRoot: "public",
    runtime: "PHP-FPM + Composer",
    database: "Optional MySQL or local SQLite",
    icon: Sparkles,
    color: "rose",
  },
  {
    id: "symfony",
    name: "Symfony",
    description:
      "A structured PHP application foundation for custom products and APIs.",
    framework: "symfony",
    documentRoot: "public",
    runtime: "PHP-FPM + Composer",
    database: "Manual setup",
    icon: Blocks,
    color: "slate",
  },
  {
    id: "drupal",
    name: "Drupal",
    description:
      "A flexible CMS for content-heavy websites and publishing workflows.",
    framework: "custom",
    documentRoot: "web",
    runtime: "PHP-FPM + Composer",
    database: "MySQL · one-click setup",
    icon: Layers3,
    color: "cyan",
  },
  {
    id: "cakephp",
    name: "CakePHP",
    description:
      "A convention-first PHP framework with a webroot document directory.",
    framework: "custom",
    documentRoot: "webroot",
    runtime: "PHP-FPM + Composer",
    database: "MySQL or PostgreSQL",
    icon: Blocks,
    color: "orange",
  },
  {
    id: "codeigniter4",
    name: "CodeIgniter 4",
    description:
      "A lightweight PHP application starter with a protected public folder.",
    framework: "custom",
    documentRoot: "public",
    runtime: "PHP-FPM + Composer",
    database: "MySQL or PostgreSQL",
    icon: Code2,
    color: "orange",
  },
  {
    id: "yii",
    name: "Yii",
    description: "A structured PHP application skeleton for rapid development.",
    framework: "custom",
    documentRoot: "web",
    runtime: "PHP-FPM + Composer",
    database: "MySQL or PostgreSQL",
    icon: Layers3,
    color: "green",
  },
  {
    id: "slim",
    name: "Slim",
    description: "A small PHP framework starter for APIs and focused services.",
    framework: "custom",
    documentRoot: "public",
    runtime: "PHP-FPM + Composer",
    database: "Optional",
    icon: Package,
    color: "slate",
  },
  {
    id: "laminas",
    name: "Laminas MVC",
    description: "An enterprise-ready PHP MVC application skeleton.",
    framework: "custom",
    documentRoot: "public",
    runtime: "PHP-FPM + Composer",
    database: "MySQL or PostgreSQL",
    icon: Server,
    color: "violet",
  },
  {
    id: "node",
    name: "Node.js application",
    description:
      "Deploy a Node.js application with a managed process and reverse proxy.",
    mode: "node",
    framework: "custom",
    documentRoot: ".",
    runtime: "Node.js + PM2 or Supervisor",
    database: "Choose a running database",
    icon: Server,
    color: "emerald",
  },
  {
    id: "react",
    name: "React + Vite",
    description:
      "Create a modern React frontend with Vite and a production build.",
    mode: "node",
    framework: "custom",
    documentRoot: "dist",
    runtime: "Node.js 18+",
    database: "Optional",
    icon: Code2,
    color: "cyan",
  },
  {
    id: "nextjs",
    name: "Next.js",
    description:
      "Create a server-rendered or statically generated Next.js application.",
    mode: "node",
    framework: "custom",
    documentRoot: ".next",
    runtime: "Node.js 18.18+",
    database: "Optional",
    icon: Server,
    color: "slate",
  },
  {
    id: "vue",
    name: "Vue + Vite",
    description:
      "Create a Vue frontend with a fast Vite development and build workflow.",
    mode: "node",
    framework: "custom",
    documentRoot: "dist",
    runtime: "Node.js 18+",
    database: "Optional",
    icon: Layers3,
    color: "green",
  },
  {
    id: "svelte",
    name: "Svelte + Vite",
    description:
      "Create a lightweight Svelte frontend with a production-ready build.",
    mode: "node",
    framework: "custom",
    documentRoot: "dist",
    runtime: "Node.js 18+",
    database: "Optional",
    icon: Sparkles,
    color: "orange",
  },
  {
    id: "express",
    name: "Express API",
    description:
      "Create a small Node.js HTTP API with Express and a managed process.",
    mode: "node",
    framework: "custom",
    documentRoot: ".",
    runtime: "Node.js 16+",
    database: "Choose separately",
    icon: Server,
    color: "emerald",
  },
  {
    id: "nestjs",
    name: "NestJS API",
    description: "Create a structured TypeScript API with NestJS conventions.",
    mode: "node",
    framework: "custom",
    documentRoot: ".",
    runtime: "Node.js 18+",
    database: "Choose separately",
    icon: Blocks,
    color: "rose",
  },
  {
    id: "proxy",
    name: "Reverse proxy",
    description:
      "Publish an existing application, socket, API, or container through a managed domain.",
    mode: "proxy",
    framework: "custom",
    documentRoot: "—",
    runtime: "Existing service",
    database: "Not required",
    icon: Waypoints,
    color: "indigo",
  },
  {
    id: "static",
    name: "Static website",
    description:
      "A fast site for HTML, CSS, JavaScript, React, or prebuilt frontend files.",
    framework: "custom",
    documentRoot: ".",
    runtime: "Web server only",
    database: "Not required",
    icon: FileCode2,
    color: "amber",
  },
  {
    id: "custom",
    name: "Custom application",
    description:
      "Start with a clean website profile and configure the application yourself.",
    framework: "custom",
    documentRoot: ".",
    runtime: "Choose a runtime",
    database: "Optional",
    icon: Code2,
    color: "indigo",
  },
];

const colorClasses = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300",
  slate:
    "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  cyan: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300",
  violet:
    "bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300",
  emerald:
    "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300",
  indigo:
    "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300",
  orange:
    "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300",
  green: "bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-300",
};

export default function ApplicationTemplatesModal({ onClose, onSelect }) {
  const [category, setCategory] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const categories = [
    ["all", "All templates"],
    ["php", "PHP websites"],
    ["node", "Node.js"],
    ["proxy", "Reverse proxy"],
  ];
  const visibleTemplates = applicationTemplates.filter((template) => {
    const templateCategory =
      template.mode === "node"
        ? "node"
        : template.mode === "proxy"
          ? "proxy"
          : "php";
    return (
      (category === "all" || category === templateCategory) &&
      `${template.name} ${template.description} ${template.runtime} ${template.database}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/60 p-4 sm:p-8">
      <section
        className="w-full max-w-5xl rounded-xl bg-white shadow-xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-templates-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5 dark:border-neutral-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Application deployment
            </p>
            <h2
              id="application-templates-title"
              className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100"
            >
              Create from template
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
              Choose a PHP website, Node.js project, or reverse-proxy route.
              Each mode uses its own runtime, deployment commands, and provider
              settings.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close application templates"
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800 sm:flex-row sm:items-center">
          <div
            className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto"
            role="tablist"
            aria-label="Template categories"
          >
            {categories.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={category === id}
                onClick={() => setCategory(id)}
                className={`shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition ${category === id ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex min-w-0 items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400 sm:w-64">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
              placeholder="Filter templates"
            />
          </label>
        </div>
        <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTemplates.map((template) => {
            const Icon = template.icon;
            return (
              <button
                key={template.id}
                type="button"
                className="group rounded-lg border border-neutral-200 p-3 text-left transition hover:border-blue-400 hover:shadow-md dark:border-neutral-800 dark:hover:border-blue-500"
                onClick={() => onSelect(template)}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-md ${colorClasses[template.color]}`}
                  >
                    <Icon size={17} />
                  </span>
                  <span className="text-xs font-semibold text-neutral-400 transition group-hover:text-blue-600 dark:text-neutral-500 dark:group-hover:text-blue-400">
                    Choose
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {template.name}
                </h3>
                <p className="mt-1 min-h-8 text-xs leading-4 text-neutral-500 dark:text-neutral-400">
                  {template.description}
                </p>
                <dl className="mt-3 space-y-1.5 border-t border-neutral-100 pt-2.5 text-[11px] dark:border-neutral-800">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-neutral-400 dark:text-neutral-500">
                      Runtime
                    </dt>
                    <dd className="text-right font-medium text-neutral-700 dark:text-neutral-300">
                      {template.runtime}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-neutral-400 dark:text-neutral-500">
                      Database
                    </dt>
                    <dd className="max-w-[65%] text-right font-medium text-neutral-700 dark:text-neutral-300">
                      {template.database}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-neutral-400 dark:text-neutral-500">
                      Document root
                    </dt>
                    <dd className="font-mono font-medium text-neutral-700 dark:text-neutral-300">
                      {template.documentRoot === "."
                        ? "/"
                        : `/${template.documentRoot}`}
                    </dd>
                  </div>
                </dl>
              </button>
            );
          })}
          {!visibleTemplates.length && (
            <div className="col-span-full rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              No templates match this filter.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-neutral-200 px-6 py-4 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          <Sparkles size={14} className="text-blue-600 dark:text-blue-400" />
          The selected profile can still be customized before the website is
          created.
        </div>
      </section>
    </div>
  );
}
