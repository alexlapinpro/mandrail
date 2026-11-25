import "server-only";
import { encodeFunctionData, type Address, type Hash } from "viem";
import { riskOracleAbi } from "./abi";
import { ASSET_LIST, type AssetInfo } from "./assets";
import { atlas, type AtlasPrice } from "./atlas";
import { publicClient } from "./clients";
import { cmc, type Quote } from "./cmc";
import { deployment } from "./deployment";
import { sendTransaction } from "./send";
import { singleton } from "./singleton";
import { formatUsd, percentToPpm, priceToWei } from "./units";

export interface RiskInput {
  priceUsd: bigint;
  change1hPpm: bigint;
  change24hPpm: bigint;
  sourceTimestamp: bigint;
  atlasPriceUsd: bigint;
  atlasTimestamp: bigint;
}

export type PushResult =
  | { status: "pushed"; hash: Hash }
  | { status: "cooldown"; retryAfter: number }
  | { status: "daily-limit" }
  | { status: "unavailable" }
  | { status: "failed"; error: string };

interface Deps {
  assets: AssetInfo[];
  getQuotes: (ids: number[]) => Promise<Map<number, Quote | null>>;
  getAtlas: (feedId: number) => Promise<AtlasPrice | null>;
  send: (assets: readonly Address[], inputs: readonly RiskInput[]) => Promise<Hash>;
  /** Age in seconds of the oldest CMC quote on-chain. */
  sourceAge: () => Promise<number>;
  now: () => number;
  log: (line: string) => void;
}

export interface Attester {
  pushNow(trigger: string): Promise<PushResult>;
  /** Pushes when the on-chain quote is getting old. Never throws: a trade may go on without it. */
  ensureFresh(trigger?: string): Promise<void>;
  /** Outcome of the latest attempt, for the UI. */
  last(): { status: PushResult["status"]; at: number } | null;
}

const COOLDOWN_MS = 30_000;
/** Separate daily budgets, so visitors and trades can never stop the loop. It runs 288 times a day and has no cap. */
type Budget = "loop" | "public" | "trade";
const DAILY: Record<Budget, number> = { loop: Infinity, public: 150, trade: 200 };
const budgetOf = (trigger: string): Budget =>
  trigger === "loop" ? "loop" : trigger === "button" || trigger === "load" ? "public" : "trade";
const MAX_FUTURE_SECONDS = 240; // the oracle refuses more than 300
const FRESH_SECONDS = 120;
const DAY_MS = 86_400_000;

export function createAttester(deps: Deps): Attester {
  let lastAttempt = -Infinity;
  let day = -1;
  let used: Record<Budget, number> = { loop: 0, public: 0, trade: 0 };
  let inFlight: Promise<PushResult> | null = null;
  let last: { status: PushResult["status"]; at: number } | null = null;

  async function push(trigger: string): Promise<PushResult> {
    const quotes = await deps.getQuotes(deps.assets.map((a) => a.cmcId));
    const latest = deps.now() / 1000 + MAX_FUTURE_SECONDS;
    const priced = deps.assets.filter((a) => {
      const quote = quotes.get(a.cmcId);
      return quote && quote.lastUpdated <= latest;
    });
    if (priced.length === 0) {
      deps.log(`[attester] trigger=${trigger} CoinMarketCap unavailable, nothing pushed`);
      return { status: "unavailable" };
    }

    const lines: string[] = [];
    const inputs = await Promise.all(
      priced.map(async (asset): Promise<RiskInput> => {
        const quote = quotes.get(asset.cmcId) as Quote;
        const second = asset.atlasFeedId === null ? null : await deps.getAtlas(asset.atlasFeedId);
        lines.push(
          `[attester] trigger=${trigger} CMC ${asset.cmcSymbol} $${quote.priceUsd} 1h=${quote.change1h}% ` +
            `last_updated=${new Date(quote.lastUpdated * 1000).toISOString()}` +
            (asset.atlasFeedId === null ? "" : ` Atlas=${second ? formatUsd(second.price) : "unavailable"}`),
        );
        return {
          priceUsd: priceToWei(quote.priceUsd),
          change1hPpm: percentToPpm(quote.change1h),
          change24hPpm: percentToPpm(quote.change24h),
          sourceTimestamp: BigInt(quote.lastUpdated),
          atlasPriceUsd: second?.price ?? 0n,
          atlasTimestamp: BigInt(second?.timestamp ?? 0),
        };
      }),
    );

    const hash = await deps.send(
      priced.map((a) => a.address),
      inputs,
    );
    lines.forEach(deps.log);
    deps.log(`[attester] trigger=${trigger} pushed ${priced.length} assets tx=${hash}`);
    return { status: "pushed", hash };
  }

  async function pushNow(trigger: string): Promise<PushResult> {
    if (inFlight) return inFlight;
    const now = deps.now();
    const wait = lastAttempt + COOLDOWN_MS - now;
    if (wait > 0) return { status: "cooldown", retryAfter: Math.ceil(wait / 1000) };

    const today = Math.floor(now / DAY_MS);
    if (today !== day) {
      day = today;
      used = { loop: 0, public: 0, trade: 0 };
    }
    const budget = budgetOf(trigger);
    if (used[budget] >= DAILY[budget]) return { status: "daily-limit" };

    lastAttempt = now;
    used[budget]++;
    inFlight = push(trigger)
      .catch((error: Error): PushResult => {
        // RPC errors can carry URLs and request bodies, so only their kind is logged.
        deps.log(`[attester] trigger=${trigger} failed: ${error.name}`);
        return { status: "failed", error: error.message };
      })
      .then((result) => {
        last = { status: result.status, at: Math.floor(deps.now() / 1000) };
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return {
    pushNow,
    last: () => last,
    async ensureFresh(trigger = "trade") {
      try {
        if (inFlight || (await deps.sourceAge()) > FRESH_SECONDS) await pushNow(trigger);
      } catch (error) {
        deps.log(`[attester] freshness check failed: ${(error as Error).name}`);
      }
    },
  };
}

async function onChainSourceAge(): Promise<number> {
  const client = publicClient();
  const timestamps = await Promise.all(
    ASSET_LIST.map(async (asset) => {
      const risk = await client.readContract({
        address: deployment.riskOracle,
        abi: riskOracleAbi,
        functionName: "getRisk",
        args: [asset.address],
      });
      return Number(risk.sourceTimestamp);
    }),
  );
  return Math.floor(Date.now() / 1000) - Math.min(...timestamps);
}

export const attester = (): Attester =>
  singleton("attester", () =>
    createAttester({
      assets: ASSET_LIST,
      getQuotes: (ids) => cmc().getQuotes(ids),
      getAtlas: (feedId) => atlas().getAtlas(feedId),
      send: async (assets, inputs) => {
        const receipt = await sendTransaction("attester", {
          to: deployment.riskOracle,
          data: encodeFunctionData({ abi: riskOracleAbi, functionName: "updateBatch", args: [assets, inputs] }),
          gas: 500_000n,
        });
        if (receipt.status !== "success") throw new Error(`oracle update reverted: ${receipt.transactionHash}`);
        return receipt.transactionHash;
      },
      sourceAge: onChainSourceAge,
      now: Date.now,
      log: (line) => console.log(line),
    }),
  );

const LOOP_MS = 5 * 60_000;

/** In-app loop, started once per process. Trades refresh on their own if it ever stops. */
export function startLoop(): void {
  singleton("attesterLoop", () => {
    const tick = () => void attester().pushNow("loop");
    tick();
    return setInterval(tick, LOOP_MS);
  });
}
