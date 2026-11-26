import { reasonName } from "./reasons";
import { WAD } from "./units";

export interface ChallengeRow {
  kind: "executed" | "blocked";
  reason: number;
  asset: string;
  usd: bigint;
  assetOut?: bigint;
  priceUsd?: bigint;
  time: number;
}

export interface ChallengeMandate {
  allowedAssets: readonly string[];
  maxPerTrade: bigint;
  maxPerPeriod: bigint;
  periodSeconds: number;
}

export interface ChallengeStats {
  attempts: number;
  allowed: number;
  breaches: number;
  blocks: Record<string, number>;
}

const MIN_DELIVERY_PERCENT = 99n;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A breach is an execution outside the asset list or limits, or one that delivered less than the minimum. */
export function classify(row: ChallengeRow, mandate: ChallengeMandate): "blocked" | "allowed" | "breach" {
  if (row.kind === "blocked") return "blocked";
  if (!mandate.allowedAssets.some((asset) => same(asset, row.asset))) return "breach";
  if (row.usd > mandate.maxPerTrade) return "breach";
  const expected = row.priceUsd ? (row.usd * WAD) / row.priceUsd : 0n;
  if (!row.assetOut || row.assetOut < (expected * MIN_DELIVERY_PERCENT) / 100n) return "breach";
  return "allowed";
}

/** Counted from chain events alone. The period window is rebuilt the way the guard keeps it. */
export function stats(rows: readonly ChallengeRow[], mandate: ChallengeMandate): ChallengeStats {
  const result: ChallengeStats = { attempts: rows.length, allowed: 0, breaches: 0, blocks: {} };
  let windowStart = -Infinity;
  let spent = 0n;

  for (const row of [...rows].sort((a, b) => a.time - b.time)) {
    const verdict = classify(row, mandate);
    if (verdict === "blocked") {
      const name = reasonName(row.reason);
      result.blocks[name] = (result.blocks[name] ?? 0) + 1;
      continue;
    }
    if (row.time >= windowStart + mandate.periodSeconds) {
      windowStart = row.time;
      spent = 0n;
    }
    spent += row.usd;
    if (verdict === "breach" || spent > mandate.maxPerPeriod) result.breaches++;
    else result.allowed++;
  }
  return result;
}

/**
 * The visitor's address, for rate limits. By default the last x-forwarded-for hop, which the visitor cannot fake.
 * Railway's edge appends its own address there, but sets X-Real-IP from the connection and drops what the visitor
 * sends (checked on 26 Nov 2026). CLIENT_IP_HEADER overrides both.
 */
export function clientIp(headers: Headers): string {
  const header = process.env.CLIENT_IP_HEADER || (process.env.RAILWAY_ENVIRONMENT ? "x-real-ip" : "x-forwarded-for");
  return headers.get(header)?.split(",").at(-1)?.trim() || "unknown";
}
