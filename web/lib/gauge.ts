const MIN_SCALE = 10_000; // 1%

/** Positions in percent on one scale for the live value and the limit. The limit is null when the breaker is off. */
export function gaugePositions(livePpm: bigint | null, limitPpm: number): { live: number | null; limit: number | null } {
  const live = livePpm === null ? null : Math.abs(Number(livePpm));
  const scale = Math.max(MIN_SCALE, 2 * Math.max(live ?? 0, limitPpm));
  const at = (value: number) => Math.min(100, Math.max(0, Math.round((value / scale) * 1000) / 10));
  return { live: live === null ? null : at(live), limit: limitPpm > 0 ? at(limitPpm) : null };
}
