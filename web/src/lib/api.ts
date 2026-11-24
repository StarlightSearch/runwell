/** JSON calls to Workflows' own server (same origin, the session cookie). */
export class ApiError extends Error {
  constructor(public status: number, public error: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  const r = await fetch(path, { ...init, headers, credentials: "same-origin" });
  const text = await r.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!r.ok) {
    const b = (body ?? {}) as { error?: string; message?: string };
    throw new ApiError(r.status, b.error ?? String(r.status), b.message ?? b.error ?? (text || r.statusText));
  }
  return body as T;
}

export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
