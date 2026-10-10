import React from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Box, Copy, LoaderCircle } from "lucide-react";
import { apiRequest } from "../../lib/api";

export default function DockerImageDetailsPage() {
  const location = useLocation();
  const imageRef = decodeURIComponent(
    location.pathname.split("/").filter(Boolean).pop() || "",
  );
  const [image, setImage] = React.useState(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    let active = true;
    apiRequest(`/api/v1/services/docker/images/${encodeURIComponent(imageRef)}`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Unable to load Docker image details.");
        const value = await response.json();
        if (active) setImage(value);
      })
      .catch((reason) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, [imageRef]);
  const created = image?.created_at
    ? new Date(image.created_at).toLocaleString()
    : "—";
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3 border-b border-neutral-200 pb-5 dark:border-neutral-800">
        <Link
          to="/docker"
          aria-label="Back to Docker"
          title="Back to Docker"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <ArrowLeft size={18} />
        </Link>
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
          <Box size={22} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            Docker image
          </p>
          <h2 className="truncate text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {image?.reference || imageRef}
          </h2>
          <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
            {image?.id || "Loading image details…"}
          </p>
        </div>
      </header>
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}
      {!image && !error ? (
        <div className="flex h-64 items-center justify-center text-neutral-400">
          <LoaderCircle className="animate-spin" />
        </div>
      ) : (
        image && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Created
                </p>
                <p className="mt-2 font-semibold text-neutral-900 dark:text-neutral-100">
                  {created}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Size
                </p>
                <p className="mt-2 font-semibold text-neutral-900 dark:text-neutral-100">
                  {image.size}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Platform
                </p>
                <p className="mt-2 font-semibold text-neutral-900 dark:text-neutral-100">
                  {image.os}/{image.architecture}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Layers
                </p>
                <p className="mt-2 font-semibold text-neutral-900 dark:text-neutral-100">
                  {image.layers.length}
                </p>
              </div>
            </div>
            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Layers ({image.layers.length})
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Build history and space used by each image layer.
                </p>
              </div>
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {image.layers.map((layer) => (
                  <div
                    key={`${layer.index}-${layer.id}`}
                    className="grid gap-2 py-4 md:grid-cols-[2rem_minmax(0,1fr)_8rem] md:items-start"
                  >
                    <span className="font-mono text-sm text-neutral-400">
                      {layer.index}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words font-mono text-xs leading-5 text-neutral-700 dark:text-neutral-300">
                        {layer.command}
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {layer.created}
                      </p>
                    </div>
                    <span className="text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300 md:text-right">
                      {layer.size}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Image configuration
              </p>
              <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-100 p-4 font-mono text-xs text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
                {JSON.stringify(
                  {
                    command: image.command,
                    entrypoint: image.entrypoint,
                    environment: image.environment,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          </div>
        )
      )}
    </div>
  );
}
