import { formatUnits, parseUnits } from "viem";

/** Money and prices use 18 decimals. Moves and gaps use parts per million: 1% = 10,000 ppm. */
export const WAD = 10n ** 18n;

export class InvalidAmount extends Error {
  constructor() {
    super("invalid amount");
    this.name = "InvalidAmount";
  }
}

export function percentToPpm(percent: number): bigint {
  return BigInt(Math.round(percent * 10_000));
}

export function priceToWei(price: number): bigint {
  if (!Number.isFinite(price) || price <= 0) throw new InvalidAmount();
  return parseUnits(price.toFixed(10), 18);
}

/** Accepts plain decimal strings only. Anything a model might improvise ("$50", "1e3") is refused. */
export function parseUsd(input: string): bigint {
  if (typeof input !== "string" || !/^\d{1,12}(\.\d{1,18})?$/.test(input.trim())) throw new InvalidAmount();
  const value = parseUnits(input.trim(), 18);
  if (value === 0n) throw new InvalidAmount();
  return value;
}

export function formatUsd(wei: bigint): string {
  const cents = wei / 10n ** 16n;
  if (wei > 0n && cents === 0n) return "<$0.01";
  if (cents / 100n >= 10n ** 12n) return "over $999 billion";
  const dollars = (cents / 100n).toString().replace(/\B(?=(\d{3})+$)/g, ",");
  return `$${dollars}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** Token amount with six decimals, cut off rather than rounded up. */
export function formatQuantity(wei: bigint): string {
  const micro = wei / 10n ** 12n;
  return `${micro / 1_000_000n}.${(micro % 1_000_000n).toString().padStart(6, "0")}`;
}

export function formatPpm(ppm: bigint): string {
  return `${formatUnits(ppm, 4)}%`;
}

const abs = (n: bigint) => (n < 0n ? -n : n);

/**
 * A tenth of the current move, for the "Set below current" buttons: the price may be refreshed before the trade, and
 * a limit close to the old value could then let it pass. Null when the move is too small.
 */
export function helperThreshold(ppm: bigint): number | null {
  const size = abs(ppm);
  return size <= 1n ? null : Number(size >= 10n ? size / 10n : 1n);
}

export function gapPpm(cmcPrice: bigint, atlasPrice: bigint): bigint {
  return (abs(cmcPrice - atlasPrice) * 1_000_000n) / atlasPrice;
}
