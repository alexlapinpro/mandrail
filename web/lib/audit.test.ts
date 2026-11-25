import { describe, expect, it, vi } from "vitest";
import { createAudit, type AuditRow, type RawDecision } from "./audit";

const DEPLOY = 1_000_000;
const row = (block: number, over: Partial<RawDecision> = {}): RawDecision => ({
  blockNumber: block,
  logIndex: 0,
  txHash: `0x${block}`,
  mandateId: 1n,
  agent: "0x00000000000000000000000000000000000000a1",
  asset: "0x00000000000000000000000000000000000000b1",
  venue: "0x00000000000000000000000000000000000000c1",
  usd: 50n * 10n ** 18n,
  kind: "executed",
  reason: 0,
  context: "0x",
  ...over,
});

function setup(initial: RawDecision[] = [], head = DEPLOY + 100) {
  const chain = { head, rows: initial, failOn: -1, now: 0 };
  const ranges: [number, number][] = [];
  const deps = {
    deployBlock: DEPLOY,
    head: vi.fn(async () => chain.head),
    getDecisions: vi.fn(async (from: number, to: number) => {
      ranges.push([from, to]);
      if (ranges.length - 1 === chain.failOn) throw new Error("rpc down");
      return chain.rows.filter((r) => r.blockNumber >= from && r.blockNumber <= to);
    }),
    blockTime: vi.fn(async (n: number) => 1_795_000_000 + n),
    now: () => chain.now,
  };
  return { chain, ranges, deps, audit: createAudit(deps) };
}
const ids = (rows: AuditRow[]) => rows.map((r) => r.txHash);

describe("audit index", () => {
  it("reads from the deploy block in chunks of at most 40,000 blocks", async () => {
    const { audit, ranges } = setup([], DEPLOY + 90_000);
    await audit.getAudit();
    expect(ranges).toEqual([
      [DEPLOY, DEPLOY + 39_999],
      [DEPLOY + 40_000, DEPLOY + 79_999],
      [DEPLOY + 80_000, DEPLOY + 90_000],
    ]);
  });

  it("then reads only new blocks with a 200-block overlap and no duplicates", async () => {
    const { audit, chain, ranges } = setup([row(DEPLOY + 995)], DEPLOY + 1000);
    await audit.getAudit();
    chain.now = 3_000;
    chain.head = DEPLOY + 1020;
    chain.rows.push(row(DEPLOY + 1010));
    const { rows } = await audit.getAudit();
    expect(ranges[1]).toEqual([DEPLOY + 800, DEPLOY + 1020]);
    expect(ids(rows)).toEqual([`0x${DEPLOY + 1010}`, `0x${DEPLOY + 995}`]);
  });

  it("drops a decision that a reorg removed inside the overlap", async () => {
    const { audit, chain } = setup([row(DEPLOY + 95)]);
    await audit.getAudit();
    chain.now = 3_000;
    chain.head = DEPLOY + 101;
    chain.rows = [];
    expect((await audit.getAudit()).rows).toEqual([]);
  });

  it("never reads before the deploy block", async () => {
    const { audit, chain, ranges } = setup([], DEPLOY + 5);
    await audit.getAudit();
    chain.now = 3_000;
    await audit.getAudit();
    expect(ranges[1]![0]).toBe(DEPLOY);
  });

  it("keeps the last good rows when the RPC fails, is marked stale, then recovers cleanly", async () => {
    const { audit, chain } = setup([row(DEPLOY + 95)]);
    await audit.getAudit();

    chain.now = 3_000;
    chain.head = DEPLOY + 60_000;
    chain.rows.push(row(DEPLOY + 30_000), row(DEPLOY + 59_000));
    chain.failOn = 2; // second chunk of this refresh
    const broken = await audit.getAudit();
    expect(broken.stale).toBe(true);
    expect(ids(broken.rows)).toContain(`0x${DEPLOY + 95}`);

    chain.now = 6_000;
    const fixed = await audit.getAudit();
    expect(fixed.stale).toBe(false);
    expect(ids(fixed.rows)).toEqual([`0x${DEPLOY + 59_000}`, `0x${DEPLOY + 30_000}`, `0x${DEPLOY + 95}`]);
  });

  it("a failing first read gives an empty stale feed, not an exception", async () => {
    const { audit, chain } = setup();
    chain.failOn = 0;
    expect(await audit.getAudit()).toMatchObject({ rows: [], stale: true });
  });

  it("asks the RPC at most once per 3 s, also for parallel readers", async () => {
    const { audit, deps, chain } = setup();
    await Promise.all([audit.getAudit(), audit.getAudit(), audit.getAudit()]);
    chain.now = 2_999;
    await audit.getAudit();
    expect(deps.head).toHaveBeenCalledTimes(1);
    chain.now = 3_000;
    await audit.getAudit();
    expect(deps.head).toHaveBeenCalledTimes(2);
  });

  it("orders newest first, also inside one block, and filters and limits", async () => {
    const { audit } = setup([
      row(DEPLOY + 1, { mandateId: 2n }),
      row(DEPLOY + 2, { logIndex: 1, txHash: "0xa" }),
      row(DEPLOY + 2, { logIndex: 4, txHash: "0xb" }),
    ]);
    expect(ids((await audit.getAudit()).rows)).toEqual(["0xb", "0xa", `0x${DEPLOY + 1}`]);
    expect(ids((await audit.getAudit({ mandateId: 2n })).rows)).toEqual([`0x${DEPLOY + 1}`]);
    expect((await audit.getAudit({ limit: 1 })).rows).toHaveLength(1);
  });

  it("adds the block time and marks unauthorised callers", async () => {
    const { audit, deps } = setup([row(DEPLOY + 1), row(DEPLOY + 2, { kind: "blocked", reason: 1 })]);
    const { rows } = await audit.getAudit();
    expect(rows[0]).toMatchObject({ unauthorised: true, kind: "blocked", time: 1_795_000_000 + DEPLOY + 2 });
    expect(rows[1]).toMatchObject({ unauthorised: false });
    expect(deps.blockTime).toHaveBeenCalledTimes(2);
  });

  it("uses the time in the log when the RPC sends it", async () => {
    const { audit, deps } = setup([row(DEPLOY + 1, { time: 42 })]);
    expect((await audit.getAudit()).rows[0]!.time).toBe(42);
    expect(deps.blockTime).not.toHaveBeenCalled();
  });
});
