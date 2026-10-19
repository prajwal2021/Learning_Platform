import { get, put } from "@/lib/http";

/** What the old single-file page kept in the browser (ticks, last tab, paste setting) now lives in PostgreSQL.
 *  Reads come from a cache filled at page load; writes go through to the API a moment later. */
const NS = "stackmap";
let cache: Record<string, unknown> = {};
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const api = {
  get,
  state: {
    async load() {
      cache = await get(`/api/state/${NS}`);
    },
    get_or_set(key: string, value?: unknown) {
      if (value === undefined) return key in cache ? cache[key] : null;
      cache[key] = value;
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          put(`/api/state/${NS}/${encodeURIComponent(key)}`, { value: cache[key] }).catch(() => {});
        }, 400)
      );
      return null;
    },
  },
};
