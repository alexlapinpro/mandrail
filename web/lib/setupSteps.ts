const DEPOSIT = 300n * 10n ** 18n;

/**
 * Where the three-step setup stands, read from the chain, so a closed tab or a rejected wallet resumes correctly.
 * Step 4 means ready. `balance` is what the latest mandate holds, null while it loads.
 */
export function setupSteps({ usd, mandates, balance }: { usd: bigint; mandates: bigint[]; balance: bigint | null }): {
  step: 1 | 2 | 3 | 4;
  done: [boolean, boolean, boolean];
} {
  const created = mandates.length > 0;
  const funded = created && balance !== null && balance > 0n;
  if (funded) return { step: 4, done: [true, true, true] };
  const hasUsd = usd >= DEPOSIT;
  if (!hasUsd && (!created || balance !== null)) return { step: 1, done: [false, created, false] };
  return { step: created ? 3 : 2, done: [true, created, false] };
}
