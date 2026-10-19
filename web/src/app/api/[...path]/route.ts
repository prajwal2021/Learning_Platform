/** Forwards /api/* to FastAPI. Replaces a next.config rewrite, which looked up the API's host name and opened a new
 *  connection on every request (inside Docker the lookup alone costs ~100 ms). Here the address is cached and
 *  connections are kept open. Bodies stream both ways; redirects and every Set-Cookie pass through untouched. */
import http from "node:http";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = new URL(process.env.API_URL || "http://localhost:8000");
const TTL = 30_000;
const dns = new Map<string, { at: number; address: string; family: number }>();

const cachedLookup = ((host: string, opts: any, cb: any) => {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  const hit = dns.get(host);
  const done = (address: string, family: number) =>
    opts?.all ? cb(null, [{ address, family } as LookupAddress]) : cb(null, address, family);
  if (hit && Date.now() - hit.at < TTL) return done(hit.address, hit.family);
  dnsLookup(host, { family: 4 }, (err, address, family) => {
    if (err) return cb(err);
    dns.set(host, { at: Date.now(), address, family });
    done(address, family);
  });
}) as LookupFunction;

const agent = new http.Agent({ keepAlive: true, maxSockets: 64, keepAliveMsecs: 10_000 });
// hop-by-hop headers are never forwarded
const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer", "host", "content-length"]);

async function proxy(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { if (!HOP.has(k)) headers[k] = v; });
  headers["x-forwarded-host"] = req.headers.get("host") ?? "";
  headers["x-forwarded-proto"] = url.protocol.replace(":", "");
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.from(await req.arrayBuffer());
  if (body) headers["content-length"] = String(body.length);

  return new Promise<Response>((resolve) => {
    const up = http.request({
      host: API.hostname, port: API.port || 80, method: req.method, path: url.pathname + url.search,
      headers, agent, lookup: cachedLookup, timeout: 60_000,
    }, (res) => {
      const out = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        if (v === undefined || HOP.has(k)) continue;
        if (Array.isArray(v)) v.forEach((x) => out.append(k, x)); else out.set(k, String(v));
      }
      const status = res.statusCode ?? 502;
      const noBody = req.method === "HEAD" || status === 204 || status === 304;
      resolve(new Response(noBody ? null : (Readable.toWeb(res) as ReadableStream), { status, headers: out }));
    });
    up.on("timeout", () => up.destroy(new Error("upstream timeout")));
    up.on("error", () => resolve(Response.json({ detail: "The API is not reachable." }, { status: 502 })));
    if (body) up.write(body);
    up.end();
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD };
