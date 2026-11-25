import { describe, expect, it } from "vitest";
import { createAtlas, feedIdToBytes4 } from "./atlas";

const ok = async () => [142n * 10n ** 18n, 1795621490n, 1795621491n] as const;

describe("Atlas client", () => {
  it("encodes feed ids as big-endian bytes4", () => {
    expect(feedIdToBytes4(934)).toBe("0x000003a6");
    expect(feedIdToBytes4(1)).toBe("0x00000001");
  });

  it("returns the price and the on-chain timestamp", async () => {
    const atlas = createAtlas({ read: ok });
    expect(await atlas.getAtlas(934)).toEqual({ price: 142n * 10n ** 18n, timestamp: 1795621491 });
  });

  it.each([
    ["revert", async () => Promise.reject(new Error("reverted"))],
    ["zero price", async () => [0n, 1n, 1n] as const],
    ["zero timestamp", async () => [1n, 0n, 0n] as const],
  ])("%s gives null", async (_name, read) => {
    expect(await createAtlas({ read }).getAtlas(934)).toBeNull();
  });

  it("gives null when the RPC never answers", async () => {
    const atlas = createAtlas({ read: () => new Promise(() => {}), timeoutMs: 20 });
    expect(await atlas.getAtlas(934)).toBeNull();
  });
});
