/** Thin fetch wrapper. Every call goes to this site's own /api/* (forwarded to FastAPI); a 401 sends the visitor to sign in. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function toLogin() {
  const next = encodeURIComponent(location.pathname + location.search + location.hash);
  location.assign(`/login?next=${next}`);
}

export async function http<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    toLogin();
    throw new HttpError(401, "not signed in");
  }
  if (!res.ok) {
    let detail = res.statusText || "Something went wrong.";
    try {
      const j = await res.json();
      if (typeof j.detail === "string") detail = j.detail;
      else if (Array.isArray(j.detail) && j.detail[0]?.msg) detail = String(j.detail[0].msg).replace(/^Value error, /, "");
    } catch {}
    throw new HttpError(res.status, detail);
  }
  return res.json();
}

export const get = <T = any>(path: string) => http<T>("GET", path);
export const post = <T = any>(path: string, body?: unknown) => http<T>("POST", path, body ?? {});
export const put = <T = any>(path: string, body: unknown) => http<T>("PUT", path, body);
export const patch = <T = any>(path: string, body: unknown) => http<T>("PATCH", path, body);
