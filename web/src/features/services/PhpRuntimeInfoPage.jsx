import React from "react";
import { ArrowLeft, ExternalLink, Server } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

export default function PhpRuntimeInfoPage() {
  const { version: routeVersion = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  // DashboardPage renders this screen from its pathname switch, so there is
  // no React Router `:version` param in that path. Read the same URL segment
  // as a fallback for production and development builds.
  const version = routeVersion || decodeURIComponent(
    location.pathname.match(/^\/services\/php\/([^/]+)\/info$/)?.[1] || "",
  );
  const encodedVersion = encodeURIComponent(version);
  const infoUrl = `/api/v1/services/php/versions/info?version=${encodedVersion}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
            onClick={() => navigate("/services/php")}
          >
            <ArrowLeft size={15} />
            PHP runtimes
          </button>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Application runtimes
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-100">
            <Server size={25} />
            PHP {version} information
          </h2>
          <p className="mt-2 text-neutral-500 dark:text-neutral-400">
            Runtime details from the isolated Server Engine PHP installation.
          </p>
        </div>
        <a
          href={infoUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <ExternalLink size={15} />
          Open raw info
        </a>
      </header>
      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <iframe
          title={`PHP ${version} information`}
          src={infoUrl}
          className="h-[calc(100vh-15rem)] min-h-[560px] w-full border-0 bg-white dark:bg-neutral-900"
        />
      </section>
    </div>
  );
}
