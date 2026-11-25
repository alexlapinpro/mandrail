/**
 * Process-wide state. Next.js bundles routes and instrumentation separately, so a module-level variable would
 * exist several times in one process.
 */
export function singleton<T>(name: string, make: () => T): T {
  const store = globalThis as unknown as Record<string, T | undefined>;
  const key = `__mandrail_${name}`;
  return (store[key] ??= make());
}
