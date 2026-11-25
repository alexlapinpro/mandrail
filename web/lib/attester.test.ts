import { describe, expect, it, vi } from "vitest";
import { createAttester, type RiskInput } from "./attester";
import type { Quote } from "./cmc";

const GOLD = "0x0000000000000000000000000000000000000001" as const;
const EQUITY = "0x0000000000000000000000000000000000000002" as const;
const E = 10n ** 18n;
const quote = (over: Partial<Quote> = {}): Quote => ({
  priceUsd: 4000,
  change1h: -2.35,
  change24h: 0.004,
  lastUpdated: 1795618800,
  ...over,
});

function setup(opts: { gold?: Quote | null; equity?: Quote | null; atlas?: { price: bigint; timestamp: number } | null } = {}) {
  let now = 1_795_618_800_000;
  const sent: { assets: readonly string[]; inputs: readonly RiskInput[] }[] = [];
  const logs: string[] = [];
  const age = { value: 0 };
  const deps = {
    assets: [
      { symbol: "tGOLD", address: GOLD, cmcId: 4705, cmcSymbol: "PAXG", atlasFeedId: null },
      { symbol: "tEQUITY", address: EQUITY, cmcId: 40215, cmcSymbol: "NVDAB", atlasFeedId: 934 },
    ],
    getQuotes: vi.fn(
      async () =>
        new Map([
          [4705, opts.gold === undefined ? quote() : opts.gold],
          [40215, opts.equity === undefined ? quote({ priceUsd: 140 }) : opts.equity],
        ]),
    ),
    getAtlas: vi.fn(async () => (opts.atlas === undefined ? { price: 141n * E, timestamp: 1795618790 } : opts.atlas)),
    send: vi.fn(async (assets: readonly string[], inputs: readonly RiskInput[]) => {
      sent.push({ assets, inputs });
      return "0xhash" as `0x${string}`;
    }),
    sourceAge: vi.fn(async () => age.value),
    now: () => now,
    log: (line: string) => logs.push(line),
  };
  return { attester: createAttester(deps), deps, sent, logs, age, advance: (s: number) => (now += s * 1000) };
}

describe("attester", () => {
  it("converts units and sends both assets in one batch", async () => {
    const { attester, sent } = setup();
    const result = await attester.pushNow("loop");
    expect(result).toMatchObject({ status: "pushed", hash: "0xhash" });
    expect(sent[0]!.assets).toEqual([GOLD, EQUITY]);
    expect(sent[0]!.inputs[0]).toEqual({
      priceUsd: 4000n * E,
      change1hPpm: -23500n,
      change24hPpm: 40n,
      sourceTimestamp: 1795618800n,
      atlasPriceUsd: 0n,
      atlasTimestamp: 0n,
    });
    expect(sent[0]!.inputs[1]).toMatchObject({
      priceUsd: 140n * E,
      atlasPriceUsd: 141n * E,
      atlasTimestamp: 1795618790n,
    });
  });

  it("leaves out an asset CMC cannot price", async () => {
    const { attester, sent } = setup({ gold: null });
    await attester.pushNow("loop");
    expect(sent[0]!.assets).toEqual([EQUITY]);
  });

  it("sends nothing when CMC has no data", async () => {
    const { attester, sent } = setup({ gold: null, equity: null });
    expect((await attester.pushNow("loop")).status).toBe("unavailable");
    expect(sent).toEqual([]);
  });

  it("sends zero Atlas fields when Atlas is down", async () => {
    const { attester, sent } = setup({ atlas: null });
    await attester.pushNow("loop");
    expect(sent[0]!.inputs[1]).toMatchObject({ atlasPriceUsd: 0n, atlasTimestamp: 0n });
  });

  it("pushes at most once per 30 s", async () => {
    const { attester, deps, advance } = setup();
    await attester.pushNow("loop");
    advance(29);
    expect(await attester.pushNow("button")).toEqual({ status: "cooldown", retryAfter: 1 });
    expect(deps.send).toHaveBeenCalledTimes(1);
    advance(1);
    expect((await attester.pushNow("button")).status).toBe("pushed");
  });

  it("joins a push in flight instead of sending twice", async () => {
    const { attester, deps } = setup();
    await Promise.all([attester.pushNow("loop"), attester.pushNow("button"), attester.ensureFresh()]);
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it("refuses push 501 of the day and allows it the next day", async () => {
    const { attester, deps, advance } = setup();
    for (let i = 0; i < 500; i++) {
      await attester.pushNow("loop");
      advance(30);
    }
    expect(await attester.pushNow("loop")).toEqual({ status: "daily-limit" });
    expect(deps.send).toHaveBeenCalledTimes(500);
    advance(24 * 3600);
    expect((await attester.pushNow("loop")).status).toBe("pushed");
  });

  it("ensureFresh pushes only above 120 s of source age", async () => {
    const { attester, deps, age } = setup();
    age.value = 120;
    await attester.ensureFresh();
    expect(deps.send).not.toHaveBeenCalled();
    age.value = 121;
    await attester.ensureFresh();
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it("ensureFresh never throws", async () => {
    const { attester, deps, age } = setup();
    age.value = 999;
    deps.send.mockRejectedValueOnce(new Error("rpc down"));
    await expect(attester.ensureFresh()).resolves.toBeUndefined();
    deps.sourceAge.mockRejectedValueOnce(new Error("rpc down"));
    await expect(attester.ensureFresh()).resolves.toBeUndefined();
  });

  it("reports a failed transaction without hiding it", async () => {
    const { attester, deps } = setup();
    deps.send.mockRejectedValueOnce(new Error("rpc down"));
    expect(await attester.pushNow("loop")).toEqual({ status: "failed", error: "rpc down" });
  });

  it("remembers the last outcome without error details", async () => {
    const { attester, deps, logs, advance } = setup();
    expect(attester.last()).toBeNull();
    await attester.pushNow("loop");
    expect(attester.last()).toEqual({ status: "pushed", at: 1_795_618_800 });
    advance(30);
    deps.send.mockRejectedValueOnce(new Error("secret url"));
    await attester.pushNow("loop");
    expect(attester.last()).toEqual({ status: "failed", at: 1_795_618_830 });
    expect(logs.join("\n")).toMatch(/failed/);
    expect(logs.join("\n")).not.toContain("secret url");
  });

  it("logs the CMC last_updated of each asset and the tx", async () => {
    const { attester, logs } = setup();
    await attester.pushNow("loop");
    expect(logs.join("\n")).toMatch(/trigger=loop.*PAXG.*last_updated=2026-11-25T15:00:00.000Z.*0xhash/s);
    expect(logs.join("\n")).toMatch(/NVDAB.*Atlas/s);
  });
});
