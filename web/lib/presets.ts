import { helperThreshold } from "./units";

export type Preset = "off" | "0.5" | "1" | "below";

/** Breaker limit in ppm for a preset button. Null when "below" cannot be set because the live value is too small. */
export function presetValue(preset: Preset, livePpm: bigint | null): number | null {
  if (preset === "off") return 0;
  if (preset === "0.5") return 5_000;
  if (preset === "1") return 10_000;
  return livePpm === null ? null : helperThreshold(livePpm);
}
