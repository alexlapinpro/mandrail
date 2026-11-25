import { describe, expect, it, vi } from "vitest";
import { createMainnetCheck } from "./mainnetCheck";

const E = 10n ** 18n;
const ADDRESS = "0x00000000000000000000000000000000000000aa" as const;

describe("mainnet check", () => {
  it("asks the contract with the CMC price and the shared limits", async () => {
    const read = vi.fn(async () => [10, 148n * E, 1795637990n, 15_000n] as const);
    const check = createMainnetCheck({ address: ADDRESS, read });
    expect(await check.run(934, 150n * E)).toEqual({
      address: ADDRESS, reason: "PRICE_DIVERGENCE", atlasPrice: 148n * E, atlasTimestamp: 1795637990, gapPpm: 15_000n, maxDivergencePpm: 10_000,
    });
    expect(read).toHaveBeenCalledWith("0x000003a6", 150n * E, 10_000, 3600n);
  });

  it("is absent until the contract is deployed", async () => {
    const read = vi.fn();
    const check = createMainnetCheck({ address: "0x0000000000000000000000000000000000000000", read });
    expect(await check.run(934, E)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("is absent when mainnet does not answer, and never throws", async () => {
    const check = createMainnetCheck({ address: ADDRESS, read: async () => Promise.reject(new Error("rpc")) });
    expect(await check.run(934, E)).toBeNull();
  });
});
