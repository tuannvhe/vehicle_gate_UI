/**
 * Resolve a raw photo path/filename returned by the API into an absolute URL
 * that the browser can load directly.
 *
 * This is the ONE source of truth for this logic. Do not duplicate this
 * function in components again — import it instead. Having three slightly
 * different copies (LaneCard / ScanStation / ResolvableImage) was the root
 * cause of the "/api/photos/..." double-prefix bug.
 */
export const resolvePhotoUrl = (p?: string | null): string => {
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;

  const configured = (
    (typeof window !== "undefined" && (window as any).__API_URL__) ||
    (import.meta.env.VITE_API_URL as string) ||
    "https://localhost:7069/api"
  ).replace(/\/$/, "");

  // Origin without the trailing /api, since static files (e.g. /photos/...)
  // are served from the web server root, not under the API prefix.
  const origin = configured.replace(/\/api\/?$/i, "");

  if (p.startsWith("/")) {
    if (p.startsWith("/photos")) return `${origin}${p}`;
    return `${configured}${p}`;
  }

  // Bare filename, no leading slash — assume it lives under /photos on origin.
  return `${origin}/photos/${p}`;
};

/**
 * Append a cache-busting query param. Needed when retrying a load of the
 * exact same URL after a failure — some browsers cache a failed/404 request
 * and won't re-issue the network request without this.
 */
export const withCacheBust = (url: string, attempt: number): string => {
  if (!url) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_retry=${attempt}`;
};