import { describe, expect, it, vi } from "vitest";
import { createCmc } from "./cmc";

const KEY = "secret-cmc-key";
const usd = (over: object = {}) => ({
  id: 2781,
  symbol: "USD",
  price: 4123.45,
  percent_change_1h: -0.12,
  percent_change_24h: 1.5,
  last_updated: "2026-11-25T15:00:00.000Z",
  ...over,
});
const v3 = (...items: [number, object][]) => ({
  status: { error_code: 0 },
  data: items.map(([id, quote]) => ({ id, symbol: `S${id}`, quote: [quote] })),
});

function setup(responses: (() => Response | Promise<Response>)[]) {
  let now = 1_000_000;
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected call");
    return next();
  });
  return { fetch, cmc: createCmc({ fetch, apiKey: KEY, now: () => now }), advance: (ms: number) => (now += ms) };
}
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });

describe("CMC client", () => {
  it("reads the v3 array shape by id", async () => {
    const { cmc, fetch } = setup([json(v3([40215, usd({ price: 142.7 })], [4705, usd()]))]);
    const quotes = await cmc.getQuotes([4705, 40215]);
    expect(quotes.get(4705)).toEqual({
      priceUsd: 4123.45,
      change1h: -0.12,
      change24h: 1.5,
      lastUpdated: 1795618800,
    });
    expect(quotes.get(40215)?.priceUsd).toBe(142.7);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest?id=4705,40215&convert=USD");
    expect((init!.headers as Record<string, string>)["X-CMC_PRO_API_KEY"]).toBe(KEY);
    expect(url).not.toContain(KEY);
  });

  it.each([
    ["null price", { price: null }],
    ["zero price", { price: 0 }],
    ["null 1h change", { percent_change_1h: null }],
    ["null 24h change", { percent_change_24h: null }],
    ["broken date", { last_updated: "soon" }],
  ])("%s makes only that asset unavailable", async (_name, over) => {
    const { cmc } = setup([json(v3([4705, usd(over)], [40215, usd()]))]);
    const quotes = await cmc.getQuotes([4705, 40215]);
    expect(quotes.get(4705)).toBeNull();
    expect(quotes.get(40215)).not.toBeNull();
  });

  it("an id missing from the answer is unavailable", async () => {
    const { cmc } = setup([json(v3([40215, usd()]))]);
    expect((await cmc.getQuotes([4705, 40215])).get(4705)).toBeNull();
  });

  it.each([
    ["HTTP 429", json({ status: { error_code: 1008 } }, 429)],
    ["HTTP 500 with HTML", () => new Response("<html>", { status: 500 })],
    ["200 with broken JSON", () => new Response("oops")],
    ["network error", () => Promise.reject(new Error("boom"))],
  ])("%s gives null for all and does not throw", async (_name, response) => {
    const { cmc } = setup([response]);
    const quotes = await cmc.getQuotes([4705, 40215]);
    expect([...quotes.values()]).toEqual([null, null]);
  });

  it("caches for 30 s and shares a request in flight", async () => {
    const { cmc, fetch, advance } = setup([json(v3([4705, usd()])), json(v3([4705, usd({ price: 5 })]))]);
    await Promise.all([cmc.getQuotes([4705]), cmc.getQuotes([4705])]);
    advance(29_999);
    await cmc.getQuotes([4705]);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect((await cmc.getQuotes([4705])).get(4705)?.priceUsd).toBe(5);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure", async () => {
    const { cmc } = setup([() => Promise.reject(new Error("boom")), json(v3([4705, usd()]))]);
    expect((await cmc.getQuotes([4705])).get(4705)).toBeNull();
    expect((await cmc.getQuotes([4705])).get(4705)).not.toBeNull();
  });

  it("without a key nothing is requested", async () => {
    const fetch = vi.fn();
    const cmc = createCmc({ fetch, apiKey: undefined, now: () => 0 });
    expect((await cmc.getQuotes([4705])).get(4705)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
