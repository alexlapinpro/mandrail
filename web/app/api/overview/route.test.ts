import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAudit: vi.fn(), risk: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: () => ({ getAudit: mocks.getAudit }) }));
vi.mock("@/lib/clients", () => ({ publicClient: () => ({ readContract: mocks.risk }) }));
import { GET } from "./route";

const E = 10n ** 18n;
const row = (time: number, reason: number, mandateId = 3n) => ({
  id: `${time}`,
  time,
  reason,
  kind: reason === 0 ? "executed" : "blocked",
  unauthorised: reason === 1,
  mandateId,
  usd: 20n * E,
  asset: "0x4C9f8d8D6346a42232Dcd47Ffe9779DEA16Cc784",
  context: "0x",
  txHash: "0xabc",
  blockNumber: 5,
});

beforeEach(() => {
  vi.clearAllMocks();
  delete (globalThis as Record<string, unknown>).__mandrail_overview;
  mocks.risk.mockResolvedValue({ sourceTimestamp: BigInt(Math.floor(Date.now() / 1000) - 42) });
});

describe("GET /api/overview", () => {
  it("counts all decisions and the challenge separately, and names the latest real one", async () => {
    mocks.getAudit.mockResolvedValue({
      stale: false,
      head: 9,
      rows: [row(9_999_999_999, 1, 1n), row(9_999_999_000, 6, 1n), row(9_000, 0, 3n)],
    });
    const body = await (await GET()).json();
    expect(body.total).toBe(3);
    expect(body.blocked).toBe(2);
    expect(body.challenge).toMatchObject({ attempts: 2, breaches: 0 });
    expect(body.latest).toMatchObject({
      reason: 6,
      reasonName: "VENUE_DENIED",
      explanation: expect.any(String),
      usd: (20n * E).toString(),
    });
    expect(body.priceAge).toBeGreaterThanOrEqual(41);
  });

  it("works with an empty history", async () => {
    mocks.getAudit.mockResolvedValue({ stale: false, head: 9, rows: [] });
    expect(await (await GET()).json()).toMatchObject({ total: 0, blocked: 0, latest: null });
  });

  it("shares one read among many visitors", async () => {
    mocks.getAudit.mockResolvedValue({ stale: false, head: 9, rows: [] });
    await Promise.all(Array.from({ length: 20 }, () => GET()));
    expect(mocks.getAudit).toHaveBeenCalledTimes(1);
  });

  it("answers 502 instead of zeros when the chain is down", async () => {
    mocks.getAudit.mockRejectedValue(new Error("rpc"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET()).status).toBe(502);
  });
});
