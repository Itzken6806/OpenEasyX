export function apiHeaders(options?: RequestInit): Headers {
  const headers = new Headers(options?.headers);
  if (options?.body !== undefined && options.body !== null && !headers.has("content-type")) headers.set("content-type", "application/json");
  return headers;
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: apiHeaders(options) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload as T;
}
