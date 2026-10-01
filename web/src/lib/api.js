const pendingGetRequests = new Map();

export async function apiRequest(url, options = {}) {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const request = {
    ...options,
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "content-type": "application/json" }),
      ...(options.headers || {}),
    },
  };
  const method = (request.method || "GET").toUpperCase();
  // Keep API requests same-origin so authentication and the Vite/reverse
  // proxy work in both development and production. The proxy owns the
  // container-only core-dev hostname; the browser must never resolve it.
  if (method !== "GET") return fetch(url, request);

  const key = `${method}:${url}`;
  let pending = pendingGetRequests.get(key);
  if (!pending) {
    pending = fetch(url, request);
    pendingGetRequests.set(key, pending);
    pending.then(
      () => pendingGetRequests.delete(key),
      () => pendingGetRequests.delete(key),
    );
  }
  // Each caller receives its own readable response body while concurrent
  // effects share the same network request.
  return pending.then((response) => response.clone());
}
export async function readApiError(response, fallback = "Request failed") {
  try {
    const body = await response.json();
    const detail = body.detail;
    return typeof detail === "string"
      ? detail
      : detail?.message || JSON.stringify(detail) || fallback;
  } catch {
    return fallback;
  }
}
