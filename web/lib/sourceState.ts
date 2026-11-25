export type SourceState = "ok" | "old" | "missing";

/** Whether a price can still be trusted. `now` is 0 until the page's clock runs. */
export function sourceState(timestamp: string | null, now: number, maxAgeSeconds: number): SourceState {
  if (timestamp === null) return "missing";
  return now > 0 && now - Number(timestamp) > maxAgeSeconds ? "old" : "ok";
}
