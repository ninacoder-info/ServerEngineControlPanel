const faviconId = "server-engine-job-favicon";

const icons = {
  processing: {
    content:
      '<circle cx="16" cy="16" r="11" fill="none" stroke="#007dff" stroke-width="4" stroke-dasharray="18 52" stroke-linecap="round"/><circle cx="16" cy="16" r="4" fill="#007dff"/>',
  },
  success: {
    content:
      '<circle cx="16" cy="16" r="13" fill="#16a34a"/><path d="m9 16 4 4 8-9" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  failed: {
    content:
      '<circle cx="16" cy="16" r="13" fill="#dc2626"/><path d="m11 11 10 10m0-10L11 21" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/>',
  },
};

export function setJobFavicon(status) {
  const existing = document.getElementById(faviconId);
  if (status === "idle") {
    existing?.remove();
    return;
  }

  const icon = icons[status] || icons.processing;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${icon.content}</svg>`;
  const link = existing || document.createElement("link");
  link.id = faviconId;
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  if (!existing) document.head.appendChild(link);
}
