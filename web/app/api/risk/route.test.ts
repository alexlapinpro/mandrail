import { beforeEach, describe, expect, it, vi } from "vitest";

const E = 10n ** 18n;
const mocks = vi.hoisted(() => ({ read: vi.fn(), mainnet: vi.fn(), atlas: vi.fn() }));
vi.mock("@/lib/clients", () => ({ publicClient: () => ({ readContract: mocks.read }) }));
vi.mock("@/lib/atlas", () => ({ atlas: () => ({ getAtlas: mocks.atlas }) }));
vi.mock("@/lib/mainnetCheck", () => ({ mainnetCheck: () => ({ run: mocks.mainnet }) }));
vi.mock("@/lib/attester", () => ({ attester: () => ({ last: () => null }) }));
import { GET } from "./route";

const risk = { priceUsd: 101n * E, change1hPpm: 5n, change24hPpm: -5n, updatedAt: 20n, sourceTimestamp: 10n, atlasPriceUsd: 100n * E, atlasTimestamp: 9n };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.atlas.mockResolvedValue({ price: 100n * E, timestamp: 9 });
  mocks.mainnet.mockResolvedValue({ reason: "OK", gapPpm: 10_000n });
  mocks.read.mockImplementation(async ({ functionName }: { functionName: string }) => (functionName === "isOpen" ? false : risk));
});
const assets = async () => ((await (await GET()).json()) as { assets: Record<string, never>[] }).assets;

describe("GET /api/risk", () => {
  it("shows whether the market behind each asset is open", async () => {
    expect((await assets()).map((a) => a.marketOpen)).toEqual([false, false]);
  });
  it("runs the mainnet check with the CMC price, only for assets with an Atlas feed", async () => {
    const [gold, equity] = await assets();
    expect(gold!.mainnet).toBeNull();
    expect(equity!.mainnet).toEqual({ reason: "OK", gapPpm: "10000" });
    expect(mocks.mainnet).toHaveBeenCalledTimes(1);
    expect(mocks.mainnet).toHaveBeenCalledWith(934, 101n * E);
  });
  it("marks missing sources as null, never as zero", async () => {
    mocks.read.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "isOpen" ? true : { ...risk, sourceTimestamp: 0n, priceUsd: 0n, atlasTimestamp: 0n, atlasPriceUsd: 0n },
    );
    const [, equity] = await assets();
    expect(equity).toMatchObject({ cmc: null, atlas: null, gapPpm: null, mainnet: null });
    expect(mocks.mainnet).not.toHaveBeenCalled();
  });
});
