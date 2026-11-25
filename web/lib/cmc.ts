import "server-only";
import { singleton } from "./singleton";

export interface Quote {
  priceUsd: number;
  change1h: number; // percent
  change24h: number; // percent
  lastUpdated: number; // unix seconds
}

export interface Cmc {
  /** Null for an asset CMC cannot price right now. Never throws. */
  getQuotes(ids: number[]): Promise<Map<number, Quote | null>>;
}

interface Deps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  apiKey: string | undefined;
  now: () => number;
}

const BASE = "https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest";
const CACHE_MS = 30_000;
const TIMEOUT_MS = 8_000;

interface RawQuote {
  price?: number | null;
  percent_change_1h?: number | null;
  percent_change_24h?: number | null;
  last_updated?: string;
}

function parseQuote(raw: RawQuote | undefined): Quote | null {
  if (!raw) return null;
  const { price, percent_change_1h: h1, percent_change_24h: h24 } = raw;
  const lastUpdated = Math.floor(Date.parse(raw.last_updated ?? "") / 1000);
  // A missing number must never turn into a 0 that the breakers would read as "calm".
  if (typeof price !== "number" || !(price > 0)) return null;
  if (typeof h1 !== "number" || typeof h24 !== "number" || !Number.isFinite(lastUpdated)) return null;
  return { priceUsd: price, change1h: h1, change24h: h24, lastUpdated };
}

export function createCmc({ fetch, apiKey, now }: Deps): Cmc {
  const cache = new Map<string, { at: number; value: Promise<Map<number, Quote | null>> }>();

  async function load(ids: number[]): Promise<Map<number, Quote | null>> {
    const response = await fetch(`${BASE}?id=${ids.join(",")}&convert=USD`, {
      headers: { "X-CMC_PRO_API_KEY": apiKey as string, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`CMC answered ${response.status}`);
    const body = (await response.json()) as { data?: { id: number; quote?: RawQuote[] }[] };
    const byId = new Map(body.data?.map((item) => [item.id, parseQuote(item.quote?.[0])]));
    return new Map(ids.map((id) => [id, byId.get(id) ?? null]));
  }

  return {
    async getQuotes(ids) {
      const unavailable = () => new Map<number, Quote | null>(ids.map((id) => [id, null]));
      if (!apiKey) return unavailable();

      const key = ids.join(",");
      const hit = cache.get(key);
      if (hit && now() - hit.at < CACHE_MS) return hit.value;

      const value = load(ids).catch((error: Error) => {
        console.warn(`[cmc] ${error.message}`);
        cache.delete(key);
        return unavailable();
      });
      cache.set(key, { at: now(), value });
      return value;
    },
  };
}

export const cmc = (): Cmc =>
  singleton("cmc", () =>
    createCmc({ fetch: (url, init) => fetch(url, init), apiKey: process.env.CMC_API_KEY, now: Date.now }),
  );
