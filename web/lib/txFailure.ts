import { explainWalletError } from "./walletErrors";

interface Attempt {
  error: unknown;
  /** Set once the wallet has sent the step that failed. */
  hash: string | undefined;
  reverted: boolean;
  /** Earlier steps that were mined, for example the approval before a deposit. */
  stepsDone: number;
  now: number;
}

/** What to tell the user after a wallet action failed. Never says "nothing changed" when something may have. */
export function txFailure({ error, hash, reverted, stepsDone, now }: Attempt): { text: string; hash: string | undefined } {
  const before = stepsDone > 0 ? " The step before it went through." : "";
  if (hash && reverted) return { text: `The contract refused the transaction. Nothing changed.${before}`, hash };
  if (hash) return { text: `Sent, but not confirmed yet. Check it on BscScan before you repeat it.${before}`, hash };
  const text = explainWalletError(error, now);
  return { text: before ? `${text.replace(" Nothing changed.", "")}${before}` : text, hash };
}
