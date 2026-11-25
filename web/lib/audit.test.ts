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
  const chain = { head, rows: initial, failFrom: Infinity, maxSpan: Infinity, now: 0 };
  const ranges: [number, number][] = [];
  const deps = {
    deployBlock: DEPLOY,
    head: vi.fn(async () => chain.head),
    getDecisions: vi.fn(async (from: number, to: number) => {
      ranges.push([from, to]);
      if (from >= chain.failFrom || to - from > chain.maxSpan) throw new Error("rpc down");
      return chain.rows.filter((r) => r.blockNumber >= from && r.blockNumber <= to);
    }),
    blockTime: vi.fn(async (n: number) => 1_795_000_000 + n),
    now: () => chain.now,
    patienceMs: 30,
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

  it("drops a decision only after three reads without it, so a lagging node cannot hide the newest", async () => {
    const { audit, chain } = setup([row(DEPLOY + 95)]);
    const read = async (at: number) => {
      chain.now = at;
      chain.head++;
      return ids((await audit.getAudit()).rows).length;
    };
    expect(await read(0)).toBe(1);
    const all = chain.rows;
    chain.rows = [];
    expect([await read(3_000), await read(6_000)]).toEqual([1, 1]);
    chain.rows = all;
    expect(await read(9_000)).toBe(1); // seen again, so the count starts over
    chain.rows = [];
    expect([await read(12_000), await read(15_000), await read(18_000)]).toEqual([1, 1, 0]);
  });

  it("splits a range the RPC refuses for its size", async () => {
    const { audit, chain, ranges } = setup([row(DEPLOY + 5), row(DEPLOY + 39_000)], DEPLOY + 39_999);
    chain.maxSpan = 10_000;
    const { rows, stale } = await audit.getAudit();
    expect(stale).toBe(false);
    expect(rows).toHaveLength(2);
    expect(Math.min(...ranges.map(([a, b]) => b - a))).toBeLessThan(10_000);
  });

  it("gives up quickly when the RPC is down", async () => {
    const { audit, chain, ranges } = setup([], DEPLOY + 39_999);
    chain.maxSpan = 0;
    expect((await audit.getAudit()).stale).toBe(true);
    expect(ranges.length).toBeLessThanOrEqual(6);
  });

  it("answers with the rows it has, marked stale, when the RPC hangs", async () => {
    const { audit, chain, deps } = setup([row(DEPLOY + 95)]);
    await audit.getAudit();
    chain.now = 3_000;
    deps.head.mockImplementationOnce(() => new Promise(() => {}));
    const { rows, stale } = await audit.getAudit();
    expect(rows).toHaveLength(1);
    expect(stale).toBe(true);
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
    chain.failFrom = DEPLOY + 30_500; // the second part of this refresh
    const broken = await audit.getAudit();
    expect(broken.stale).toBe(true);
    expect(ids(broken.rows)).toContain(`0x${DEPLOY + 95}`);

    chain.now = 6_000;
    chain.failFrom = Infinity;
    const fixed = await audit.getAudit();
    expect(fixed.stale).toBe(false);
    expect(ids(fixed.rows)).toEqual([`0x${DEPLOY + 59_000}`, `0x${DEPLOY + 30_000}`, `0x${DEPLOY + 95}`]);
  });

  it("a failing first read gives an empty stale feed, not an exception", async () => {
    const { audit, chain } = setup();
    chain.failFrom = 0;
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
