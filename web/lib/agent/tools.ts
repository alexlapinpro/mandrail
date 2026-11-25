import { getAddress, isAddress, type Address } from "viem";
import { ASSETS, type AssetSymbol } from "../assets";
import { deployment } from "../deployment";
import { InvalidAmount, parseUsd } from "../units";

/** "owner" is the guarded assistant, "challenge" is the deliberately unguarded one behind /break. */
export type AgentMode = "owner" | "challenge";

interface Property {
  type: "string";
  description: string;
  enum?: string[];
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, Property>;
    required: string[];
    additionalProperties: false;
  };
}

/** The mandate is bound on the server and never appears in a schema. */
export function toolSchemas(mode: AgentMode): ToolSchema[] {
  const challenge = mode === "challenge";
  const asset: Property = challenge
    ? { type: "string", description: 'Asset to buy: "tGOLD", "tEQUITY" or any token address' }
    : { type: "string", description: "Asset to buy", enum: Object.keys(ASSETS) };
  const venue: Property = challenge
    ? { type: "string", description: 'Venue: "main", "rogue" or any contract address' }
    : { type: "string", description: "main is the approved market, rogue is not approved", enum: ["main", "rogue"] };
  const usdAmount: Property = {
    type: "string",
    description: 'Plain decimal amount in test USD, for example "50" or "12.5". No currency sign.',
  };
  const trade: Record<string, Property> = { asset, venue, usdAmount };
  const tradeFull: Record<string, Property> = challenge
    ? { ...trade, minAssetOut: { type: "string", description: 'Least tokens to accept, in wei. "0" accepts anything.' } }
    : trade;

  const tool = (name: string, description: string, properties: Record<string, Property>, required: string[]): ToolSchema => ({
    name,
    description,
    parameters: { type: "object", properties, required, additionalProperties: false },
  });

  return [
    tool("get_market_data", "Live CoinMarketCap price, 1h and 24h change of an asset's reference, plus Atlas if available.",
      { asset: { type: "string", description: "Asset", enum: Object.keys(ASSETS) } }, ["asset"]),
    tool("get_mandate", "The on-chain mandate of this chat: limits, balance, spent this period, allowed assets.", {}, []),
    tool("preflight_trade", "Asks the guard whether a trade would be allowed. Sends nothing.", trade,
      ["asset", "venue", "usdAmount"]),
    tool("execute_trade", "Sends the trade to the guard. A blocked attempt is recorded on-chain too.", tradeFull,
      ["asset", "venue", "usdAmount"]),
  ];
}

export class ToolInputError extends Error {}

export interface TradeInput {
  asset: Address;
  venue: Address;
  usd: bigint;
  minAssetOut?: bigint;
}

function pick(value: unknown, known: Record<string, Address>, label: string, mode: AgentMode): Address {
  if (typeof value === "string") {
    const match = Object.hasOwn(known, value) ? known[value] : undefined;
    if (match) return match;
    if (mode === "challenge" && isAddress(value, { strict: false })) return getAddress(value);
  }
  throw new ToolInputError(`unknown ${label}`);
}

export function parseAsset(value: unknown): AssetSymbol {
  if (typeof value === "string" && Object.hasOwn(ASSETS, value)) return value as AssetSymbol;
  throw new ToolInputError("unknown asset");
}

export function parseTrade(args: Record<string, unknown>, mode: AgentMode): TradeInput {
  const assets = Object.fromEntries(Object.values(ASSETS).map((a) => [a.symbol, a.address]));
  const asset = pick(args.asset, assets, "asset", mode);
  const venue = pick(args.venue, { main: deployment.market, rogue: deployment.rogueVenue }, "venue", mode);

  let usd: bigint;
  try {
    usd = parseUsd(args.usdAmount as string);
  } catch (error) {
    if (error instanceof InvalidAmount) throw new ToolInputError("invalid amount");
    throw error;
  }

  if (mode !== "challenge" || args.minAssetOut === undefined) return { asset, venue, usd };
  if (typeof args.minAssetOut !== "string" || !/^\d{1,30}$/.test(args.minAssetOut)) {
    throw new ToolInputError("invalid minAssetOut");
  }
  return { asset, venue, usd, minAssetOut: BigInt(args.minAssetOut) };
}
