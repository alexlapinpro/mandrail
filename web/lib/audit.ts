import "server-only";
import type { Address, Hash, Hex } from "viem";
import { policyGuardAbi } from "./abi";
import { logsClient } from "./clients";
import { deployment } from "./deployment";
import { singleton } from "./singleton";

export interface RawDecision {
  blockNumber: number;
  logIndex: number;
  txHash: Hash;
  mandateId: bigint;
  agent: Address;
  asset: Address;
  venue: Address;
  usd: bigint;
  kind: "executed" | "blocked";
  reason: number;
  context: Hex;
  assetOut?: bigint;
  priceUsd?: bigint;
  time?: number;
}

export interface AuditRow extends RawDecision {
  id: string;
  time: number;
  unauthorised: boolean;
}

export interface AuditResult {
  rows: AuditRow[];
  /** True when the last refresh failed: rows may be missing the newest decisions. */
  stale: boolean;
  head: number;
}

export interface Audit {
  getAudit(filter?: { mandateId?: bigint; limit?: number }): Promise<AuditResult>;
}

interface Deps {
  deployBlock: number;
  head: () => Promise<number>;
  getDecisions: (from: number, to: number) => Promise<RawDecision[]>;
  blockTime: (block: number) => Promise<number>;
  now: () => number;
}

const CHUNK = 40_000; // the log RPC refuses 60,000
const OVERLAP = 15;
const REFRESH_MS = 3_000;
const NOT_AGENT = 1;

export function createAudit(deps: Deps): Audit {
  const rows = new Map<string, AuditRow>();
  let cursor = deps.deployBlock;
  let head = 0;
  let stale = false;
  let refreshedAt = -Infinity;
  let inFlight: Promise<void> | null = null;

  async function readChunk(from: number, to: number): Promise<void> {
    const decisions = await deps.getDecisions(from, to);
    const complete = await Promise.all(
      decisions.map(async (d): Promise<AuditRow> => ({
        ...d,
        id: `${d.txHash}-${d.logIndex}`,
        time: d.time ?? (await deps.blockTime(d.blockNumber)),
        unauthorised: d.reason === NOT_AGENT,
      })),
    );
    // Replace the range, so a decision removed by a reorg does not stay.
    for (const row of rows.values()) {
      if (row.blockNumber >= from && row.blockNumber <= to) rows.delete(row.id);
    }
    complete.forEach((row) => rows.set(row.id, row));
  }

  async function refresh(): Promise<void> {
    try {
      const target = await deps.head();
      for (let from = cursor; from <= target; from += CHUNK) {
        const to = Math.min(from + CHUNK - 1, target);
        await readChunk(from, to);
        cursor = Math.max(deps.deployBlock, to - OVERLAP);
      }
      head = target;
      stale = false;
    } catch (error) {
      stale = true;
      console.warn(`[audit] refresh failed: ${(error as Error).message.split("\n")[0]}`);
    }
  }

  return {
    async getAudit({ mandateId, limit = 200 } = {}) {
      if (!inFlight && deps.now() - refreshedAt >= REFRESH_MS) {
        refreshedAt = deps.now();
        inFlight = refresh().finally(() => {
          inFlight = null;
        });
      }
      await inFlight;
      const selected = [...rows.values()]
        .filter((row) => mandateId === undefined || row.mandateId === mandateId)
        .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
        .slice(0, limit);
      return { rows: selected, stale, head };
    },
  };
}

const tradeEvents = policyGuardAbi.filter(
  (item): item is Extract<(typeof policyGuardAbi)[number], { type: "event"; name: "TradeExecuted" | "TradeBlocked" }> =>
    item.type === "event" && (item.name === "TradeExecuted" || item.name === "TradeBlocked"),
);

async function chainDecisions(from: number, to: number): Promise<RawDecision[]> {
  const logs = await logsClient().getLogs({
    address: deployment.policyGuard,
    events: tradeEvents,
    fromBlock: BigInt(from),
    toBlock: BigInt(to),
    strict: true,
  });
  return logs.map((log): RawDecision => {
    const timestamp = (log as { blockTimestamp?: bigint | Hex | null }).blockTimestamp;
    const base = {
      blockNumber: Number(log.blockNumber),
      logIndex: log.logIndex,
      txHash: log.transactionHash,
      mandateId: log.args.mandateId,
      agent: log.args.agent,
      asset: log.args.asset,
      venue: log.args.venue,
      usd: log.args.usdAmount,
      ...(timestamp ? { time: Number(timestamp) } : {}),
    };
    return log.eventName === "TradeExecuted"
      ? { ...base, kind: "executed", reason: 0, context: "0x", assetOut: log.args.assetOut, priceUsd: log.args.priceUsd }
      : { ...base, kind: "blocked", reason: log.args.reason, context: log.args.context };
  });
}

export const audit = (): Audit =>
  singleton("audit", () =>
    createAudit({
      deployBlock: deployment.deployBlock,
      head: async () => Number(await logsClient().getBlockNumber({ cacheTime: 0 })),
      getDecisions: chainDecisions,
      blockTime: async (block) => Number((await logsClient().getBlock({ blockNumber: BigInt(block) })).timestamp),
      now: Date.now,
    }),
  );
