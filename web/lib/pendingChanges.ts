import { useSyncExternalStore } from "react";

/** Wallet transactions that are not mined yet. The chat waits for them, so a trade is judged by the new rules. */
export function createPendingChanges() {
  let count = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    count: () => count,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Returns the function that ends this change. */
    start(): () => void {
      count++;
      notify();
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        count--;
        notify();
      };
    },
  };
}

export const pendingChanges = createPendingChanges();

export const usePendingChanges = (): number =>
  useSyncExternalStore(pendingChanges.subscribe, pendingChanges.count, () => 0);
