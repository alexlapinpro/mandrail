import "server-only";
import { mandateRegistryAbi, policyGuardAbi } from "../abi";
import { ASSETS, ASSET_LIST, type AssetSymbol } from "../assets";
import { atlas } from "../atlas";
import { publicClient } from "../clients";
import { cmc } from "../cmc";
import { deployment } from "../deployment";
import { rateLimit } from "../rateLimit";
import { execute, preflight } from "../trade";
import { txQueue } from "../txQueue";
import { formatPpm, formatUsd, percentToPpm } from "../units";
import { azureModel } from "./client";
import type { AgentDeps } from "./run";
import type { AgentMode } from "./tools";

const DAY_MS = 86_400_000;
const DAILY = {
  /** Strangers with their own mandates, all together and each owner address. Mandates are free, so they do not count. */
  owners: { models: 500, transactions: 200 },
  oneOwner: { models: 200, transactions: 80 },
  /** Reserve of each address in DEMO_OWNERS: strangers cannot use it up before a presentation. */
  demoOwner: { models: 500, transactions: 200 },
  challenge: { models: 1000, transactions: 300 },
  oneVisitor: { models: 60, transactions: 60 },
} as const;
const MAX_WAITING_TRADES = 6;

const isDemoOwner = (owner: string): boolean =>
  (process.env.DEMO_OWNERS ?? "").toLowerCase().split(",").some((entry) => entry.trim() === owner.toLowerCase());

async function marketData(symbol: string): Promise<Record<string, unknown>> {
  const asset = ASSETS[symbol as AssetSymbol];
  const [quotes, second] = await Promise.all([
    cmc().getQuotes(ASSET_LIST.map((a) => a.cmcId)),
    asset.atlasFeedId === null ? null : atlas().getAtlas(asset.atlasFeedId),
  ]);
  const quote = quotes.get(asset.cmcId);
  if (!quote) return { asset: symbol, error: "CoinMarketCap is not available right now" };
  return {
    asset: symbol,
    reference: asset.cmcSymbol,
    source: "CoinMarketCap",
    priceUsd: String(quote.priceUsd),
    change1h: formatPpm(percentToPpm(quote.change1h)),
    change24h: formatPpm(percentToPpm(quote.change24h)),
    lastUpdated: new Date(quote.lastUpdated * 1000).toISOString(),
    ...(asset.atlasFeedId === null ? {} : { atlasPrice: second ? formatUsd(second.price) : "unavailable" }),
  };
}

async function mandateInfo(id: bigint): Promise<Record<string, unknown>> {
  const client = publicClient();
  const registry = { address: deployment.mandateRegistry, abi: mandateRegistryAbi } as const;
  const guard = { address: deployment.policyGuard, abi: policyGuardAbi } as const;
  const [m, balance, spent, allowed] = await Promise.all([
    client.readContract({ ...registry, functionName: "getMandate", args: [id] }),
    client.readContract({ ...guard, functionName: "balanceOf", args: [id] }),
    client.readContract({ ...guard, functionName: "spentInPeriod", args: [id] }),
    Promise.all(
      ASSET_LIST.map((a) => client.readContract({ ...registry, functionName: "isAssetAllowed", args: [id, a.address] })),
    ),
  ]);
  return {
    active: m.active,
    allowedAssets: ASSET_LIST.filter((_a, i) => allowed[i]).map((a) => a.symbol),
    maxPerTrade: formatUsd(m.maxPerTradeUsd),
    maxPerPeriod: formatUsd(m.maxPerPeriodUsd),
    periodSeconds: m.periodSeconds.toString(),
    spentThisPeriod: formatUsd(spent),
    balance: formatUsd(balance),
    jurisdiction: Buffer.from(m.jurisdiction.slice(2), "hex").toString("ascii"),
    volatilityLimit: m.maxVolatilityPpm ? formatPpm(BigInt(m.maxVolatilityPpm)) : "off",
    divergenceLimit: m.maxDivergencePpm ? formatPpm(BigInt(m.maxDivergencePpm)) : "off",
    maxPriceAgeSeconds: m.maxRiskAgeSeconds.toString(),
    marketHoursRequired: m.requireMarketOpen,
  };
}

/**
 * The real dependencies of an agent run. The mandate and the signing key are fixed here, on the server.
 * `who` is the owner's address, or the visitor's network address in the challenge.
 */
export function agentDeps(mode: AgentMode, mandateId: bigint, who: string): AgentDeps {
  const key = mode === "owner" ? "agent" : "challenge";
  const person = who.toLowerCase();
  const demo = mode === "owner" && isDemoOwner(person);

  const take = (kind: "models" | "transactions"): boolean => {
    const limit = rateLimit();
    if (demo) return limit.take(`${kind}-demo`, person, DAILY.demoOwner[kind], DAY_MS).ok;
    const one = mode === "owner" ? DAILY.oneOwner : DAILY.oneVisitor;
    const all = mode === "owner" ? DAILY.owners : DAILY.challenge;
    return (
      limit.take(`${kind}-one-${mode}`, person, one[kind], DAY_MS).ok && limit.take(`${kind}-all-${mode}`, "all", all[kind], DAY_MS).ok
    );
  };

  return {
    model: azureModel(),
    marketData,
    mandate: () => mandateInfo(mandateId),
    preflight: (trade) => preflight({ ...trade, key }),
    execute: (trade) => execute({ ...trade, key }),
    takeModelCall: () => take("models"),
    takeTransaction: () => take("transactions"),
    busy: () => !demo && txQueue().pending(key) >= MAX_WAITING_TRADES,
  };
}
