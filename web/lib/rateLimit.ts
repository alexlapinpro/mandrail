import "server-only";
import { singleton } from "./singleton";

export type TakeResult = { ok: true } | { ok: false; retryAfter: number };

const SWEEP_EVERY = 1000;

/** Sliding window in memory. One process, so one counter. */
export function createRateLimit(now: () => number) {
  const hits = new Map<string, { times: number[]; windowMs: number }>();
  let lastSweep = now();

  function sweep(time: number): void {
    if (time - lastSweep < SWEEP_EVERY) return;
    lastSweep = time;
    for (const [id, entry] of hits) {
      const newest = entry.times[entry.times.length - 1] ?? 0;
      if (time - newest >= entry.windowMs) hits.delete(id);
    }
  }

  return {
    take(bucket: string, key: string, max: number, windowMs: number): TakeResult {
      const time = now();
      sweep(time);
      const id = `${bucket}:${key}`;
      const times = (hits.get(id)?.times ?? []).filter((t) => time - t < windowMs);
      if (times.length >= max) {
        hits.set(id, { times, windowMs });
        return { ok: false, retryAfter: Math.ceil((times[0]! + windowMs - time) / 1000) };
      }
      times.push(time);
      hits.set(id, { times, windowMs });
      return { ok: true };
    },
    size: () => hits.size,
  };
}

export type RateLimit = ReturnType<typeof createRateLimit>;

export const rateLimit = (): RateLimit => singleton("rateLimit", () => createRateLimit(Date.now));
