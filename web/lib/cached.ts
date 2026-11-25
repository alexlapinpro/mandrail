/** Remembers the last result for a short time and lets parallel callers share one load. Failures are not kept. */
export function createCached<T>(load: () => Promise<T>, ttlMs: number, now: () => number = Date.now): () => Promise<T> {
  let entry: { at: number; value: Promise<T> } | null = null;
  return () => {
    if (entry && now() - entry.at < ttlMs) return entry.value;
    const value = load();
    const current = { at: now(), value };
    entry = current;
    value.catch(() => {
      if (entry === current) entry = null;
    });
    return value;
  };
}
