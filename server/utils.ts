import path from "node:path";

export const now = () => new Date().toISOString();

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

export function safeSegment(value: string, fallback = "unknown"): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-\s*-/g, "-")
    .replace(/^[. -]+|[. -]+$/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

export function domainFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown-source";
  }
}

export function filenameFromUrl(value: string, fallback: string): string {
  try {
    const name = path.basename(decodeURIComponent(new URL(value).pathname));
    return safeSegment(name, fallback);
  } catch {
    return fallback;
  }
}

export function asJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
