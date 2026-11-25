import "server-only";
import { singleton } from "./singleton";
import { accountOf, publicClient, type KeyName } from "./clients";

export interface TxQueue {
  /** Runs jobs of one key one at a time. The job gets the nonce to use and resolves once it is mined. */
  enqueue<T>(key: KeyName, job: (nonce: number) => Promise<T>): Promise<T>;
  /** Jobs of a key that are waiting or running. */
  pending(key: KeyName): number;
}

/** Only errors that prove nothing was sent. "already known" is not one of them. */
const isNonceError = (error: unknown) => /nonce too (low|high)/i.test(String((error as Error)?.message));

export function createTxQueue(chainNonce: (key: KeyName) => Promise<number>): TxQueue {
  const tails = new Map<KeyName, Promise<unknown>>();
  const next = new Map<KeyName, number>();
  const waiting = new Map<KeyName, number>();

  async function run<T>(key: KeyName, job: (nonce: number) => Promise<T>): Promise<T> {
    // A load-balanced RPC can lag behind a transaction that is already mined.
    const nonce = Math.max(await chainNonce(key), next.get(key) ?? 0);
    const result = await job(nonce);
    next.set(key, nonce + 1);
    return result;
  }

  return {
    pending: (key) => waiting.get(key) ?? 0,
    enqueue(key, job) {
      waiting.set(key, (waiting.get(key) ?? 0) + 1);
      const previous = tails.get(key) ?? Promise.resolve();
      const current = previous.then(() =>
        run(key, job).catch((error) => {
          if (!isNonceError(error)) throw error;
          next.delete(key);
          return run(key, job);
        }),
      );
      const settled = current.finally(() => waiting.set(key, (waiting.get(key) ?? 1) - 1));
      tails.set(
        key,
        settled.catch(() => {}),
      );
      return settled;
    },
  };
}

export const txQueue = (): TxQueue =>
  singleton("txQueue", () =>
    createTxQueue((key) =>
      publicClient().getTransactionCount({ address: accountOf(key).address, blockTag: "pending" }),
    ),
  );
