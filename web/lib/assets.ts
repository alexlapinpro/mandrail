import type { Address } from "viem";
import { deployment } from "./deployment";

export interface AssetInfo {
  symbol: string;
  address: Address;
  cmcId: number;
  cmcSymbol: string;
  /** Atlas MultiFeed id, null when Atlas has no feed for the reference asset. */
  atlasFeedId: number | null;
}

export type AssetSymbol = "tGOLD" | "tEQUITY";

/** Test assets. The reference only sets the price, the tokens are not the real products. */
export const ASSETS: Record<AssetSymbol, AssetInfo> = {
  tGOLD: { symbol: "tGOLD", address: deployment.tGOLD, cmcId: 4705, cmcSymbol: "PAXG", atlasFeedId: null },
  tEQUITY: { symbol: "tEQUITY", address: deployment.tEQUITY, cmcId: 40215, cmcSymbol: "NVDAB", atlasFeedId: 934 },
};

export const ASSET_LIST: AssetInfo[] = Object.values(ASSETS);

export function symbolOf(address: string): string {
  const found = ASSET_LIST.find((a) => a.address.toLowerCase() === address.toLowerCase());
  return found?.symbol ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
}
