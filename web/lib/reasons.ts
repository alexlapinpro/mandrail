import { decodeAbiParameters, hexToString, parseAbiParameters, type Hex } from "viem";
import { formatPpm, formatUsd } from "./units";

/** Same order as the Solidity enum in contracts/src/Types.sol. */
export const REASONS = [
  "OK",
  "NOT_AGENT",
  "MANDATE_INACTIVE",
  "MANDATE_EXPIRED",
  "ASSET_NOT_ALLOWED",
  "JURISDICTION_RESTRICTED",
  "VENUE_DENIED",
  "EXCEEDS_PER_TRADE",
  "EXCEEDS_PERIOD",
  "RISK_DATA_STALE",
  "PRICE_DIVERGENCE",
  "VOLATILITY_BREAKER",
  "INSUFFICIENT_BALANCE",
  "UNDERLYING_MARKET_CLOSED",
] as const;

export type ReasonName = (typeof REASONS)[number];
export type Decoded = Record<string, unknown>;

const LAYOUTS: Partial<Record<ReasonName, string>> = {
  NOT_AGENT: "address caller, address agent",
  MANDATE_EXPIRED: "uint64 expiresAt, uint64 now",
  ASSET_NOT_ALLOWED: "address asset",
  JURISDICTION_RESTRICTED: "address asset, bytes2 jurisdiction",
  VENUE_DENIED: "address venue, bool approved, bool denied",
  EXCEEDS_PER_TRADE: "uint256 requested, uint256 limit",
  EXCEEDS_PERIOD: "uint256 requested, uint256 spent, uint256 limit",
  RISK_DATA_STALE: "uint8 source, uint64 timestamp, uint64 now, uint64 maxAge",
  PRICE_DIVERGENCE: "uint256 cmcPrice, uint256 atlasPrice, uint256 gapPpm, uint32 maxPpm",
  VOLATILITY_BREAKER: "int256 change1hPpm, uint32 maxPpm",
  INSUFFICIENT_BALANCE: "uint256 requested, uint256 balance",
  UNDERLYING_MARKET_CLOSED: "address asset, uint64 now",
};

export function reasonName(code: number): string {
  return REASONS[code] ?? `UNKNOWN_${code}`;
}

/** Numbers behind a decision. Returns {} when the reason has no context or it cannot be read. */
export function decodeContext(code: number, context: Hex): Decoded {
  const layout = LAYOUTS[REASONS[code] as ReasonName];
  if (!layout) return {};
  try {
    const params = parseAbiParameters(layout) as readonly { name?: string }[];
    const values = decodeAbiParameters(params as never, context) as readonly unknown[];
    const out: Decoded = {};
    params.forEach((param, i) => {
      const value = values[i];
      const name = param.name as string;
      if (name === "jurisdiction") out[name] = hexToString(value as Hex);
      else if (name === "source") out[name] = value === 1 ? "Atlas" : "CoinMarketCap";
      else out[name] = typeof value === "number" ? BigInt(value) : value;
    });
    return out;
  } catch {
    return {};
  }
}

const GENERIC: Record<ReasonName, string> = {
  OK: "Trade allowed.",
  NOT_AGENT: "The caller is not the agent named in the mandate.",
  MANDATE_INACTIVE: "The owner revoked this mandate.",
  MANDATE_EXPIRED: "The mandate has expired.",
  ASSET_NOT_ALLOWED: "This asset is not in the mandate.",
  JURISDICTION_RESTRICTED: "This asset is restricted for the owner's jurisdiction.",
  VENUE_DENIED: "The venue is not approved.",
  EXCEEDS_PER_TRADE: "The amount is above the per-trade limit.",
  EXCEEDS_PERIOD: "The amount is above what is left for this period.",
  RISK_DATA_STALE: "Price data is too old.",
  PRICE_DIVERGENCE: "The two price sources disagree too much.",
  VOLATILITY_BREAKER: "The 1h price move is above the mandate's limit.",
  INSUFFICIENT_BALANCE: "The mandate does not hold enough test USD.",
  UNDERLYING_MARKET_CLOSED: "The underlying market is closed.",
};

export function explain(code: number, d: Decoded, symbolOf: (address: string) => string): string {
  const name = REASONS[code];
  if (!name) return "Unknown reason.";
  if (Object.keys(d).length === 0) return GENERIC[name];
  const n = (key: string) => d[key] as bigint;
  const symbol = () => symbolOf(d.asset as string);

  switch (name) {
    case "ASSET_NOT_ALLOWED":
      return `${symbol()} is not in the mandate.`;
    case "JURISDICTION_RESTRICTED":
      return `${symbol()} is restricted for jurisdiction ${d.jurisdiction}.`;
    case "VENUE_DENIED":
      return d.denied ? "The venue is on the denylist." : "The venue is not approved.";
    case "EXCEEDS_PER_TRADE":
      return `${formatUsd(n("requested"))} is above the per-trade limit of ${formatUsd(n("limit"))}.`;
    case "EXCEEDS_PERIOD":
      return `${formatUsd(n("requested"))} plus ${formatUsd(n("spent"))} already spent is above the period limit of ${formatUsd(n("limit"))}.`;
    case "RISK_DATA_STALE":
      return n("timestamp") === 0n
        ? `There is no ${d.source} price on-chain yet.`
        : `The ${d.source} price is ${n("now") - n("timestamp")} s old, the limit is ${n("maxAge")} s.`;
    case "PRICE_DIVERGENCE":
      return `CoinMarketCap ${formatUsd(n("cmcPrice"))} and Atlas ${formatUsd(n("atlasPrice"))} differ by ${formatPpm(n("gapPpm"))}, the limit is ${formatPpm(n("maxPpm"))}.`;
    case "VOLATILITY_BREAKER":
      return `The 1h move is ${formatPpm(n("change1hPpm"))}, the limit is ${formatPpm(n("maxPpm"))}.`;
    case "INSUFFICIENT_BALANCE":
      return `The trade needs ${formatUsd(n("requested"))}, the mandate holds ${formatUsd(n("balance"))}.`;
    case "UNDERLYING_MARKET_CLOSED":
      return `The market behind ${symbol()} is closed right now.`;
    default:
      return GENERIC[name];
  }
}
