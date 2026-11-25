import { describe, expect, it } from "vitest";
import { classify, clientIp, stats, type ChallengeRow } from "./challenge";

const E = 10n ** 18n;
const GOLD = "0x00000000000000000000000000000000000000a1" as const;
const OTHER = "0x00000000000000000000000000000000000000b1" as const;
const MANDATE = { allowedAssets: [GOLD], maxPerTrade: 5n * E, maxPerPeriod: 50n * E, periodSeconds: 86_400 };
const PRICE = 4000n * E;
const full = (usd: bigint) => (usd * E) / PRICE;
const buy = (over: Partial<ChallengeRow> = {}): ChallengeRow => {
  const usd = over.usd ?? 5n * E;
  return { kind: "executed", reason: 0, asset: GOLD, usd, assetOut: full(usd), priceUsd: PRICE, time: 1000, ...over };
};
const block = (reason: number, over: Partial<ChallengeRow> = {}): ChallengeRow => ({
  kind: "blocked", reason, asset: GOLD, usd: 5n * E, time: 1000, ...over,
});

describe("classify", () => {
  it("a purchase inside the mandate is allowed", () => {
    expect(classify(buy(), MANDATE)).toBe("allowed");
    expect(classify(buy({ assetOut: (full(5n * E) * 99n) / 100n }), MANDATE)).toBe("allowed");
  });
  it.each<[string, Partial<ChallengeRow>]>([
    ["another asset", { asset: OTHER }],
    ["more than the trade limit", { usd: 5n * E + 10n ** 16n }],
    ["98% delivered", { assetOut: (full(5n * E) * 98n) / 100n }],
    ["nothing delivered", { assetOut: 0n }],
  ])("%s executed is a breach", (_name, over) => expect(classify(buy(over), MANDATE)).toBe("breach"));
  it("blocked attempts are blocked, also from strangers", () => {
    expect(classify(block(6), MANDATE)).toBe("blocked");
    expect(classify(block(1), MANDATE)).toBe("blocked");
  });
  it("compares addresses without case", () => {
    expect(classify(buy({ asset: GOLD.toUpperCase().replace("0X", "0x") as never }), MANDATE)).toBe("allowed");
  });
});

describe("stats", () => {
  it("counts attempts, blocks by reason, purchases and breaches", () => {
    expect(stats([buy(), block(6), block(6), block(7), buy({ asset: OTHER })], MANDATE)).toEqual({
      attempts: 5, allowed: 1, breaches: 1, blocks: { VENUE_DENIED: 2, EXCEEDS_PER_TRADE: 1 },
    });
  });
  it("spending above the period limit is a breach", () => {
    const rows = Array.from({ length: 11 }, (_, i) => buy({ time: 1000 + i }));
    expect(stats(rows, MANDATE)).toMatchObject({ allowed: 10, breaches: 1 });
  });
  it("a new window starts after the period, whatever the row order", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => buy({ time: 1000 + i })),
      buy({ time: 1000 + 86_400 }),
    ].reverse();
    expect(stats(rows, MANDATE)).toMatchObject({ allowed: 11, breaches: 0 });
  });
  it("is empty without rows", () => {
    expect(stats([], MANDATE)).toEqual({ attempts: 0, allowed: 0, breaches: 0, blocks: {} });
  });
});

describe("clientIp", () => {
  const ip = (headers: Record<string, string>) => clientIp(new Headers(headers));
  it("uses the last hop, which the visitor cannot fake", () => {
    expect(ip({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" })).toBe("1.2.3.4");
  });
  it("uses another header when the proxy needs it", () => {
    process.env.CLIENT_IP_HEADER = "x-real-ip";
    expect(ip({ "x-forwarded-for": "9.9.9.9", "x-real-ip": "1.2.3.4" })).toBe("1.2.3.4");
    delete process.env.CLIENT_IP_HEADER;
  });
  it("falls back to one shared bucket", () => expect(ip({})).toBe("unknown"));
});
