import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { explainWalletError } from "@/lib/walletErrors";

type Call = Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0];

export interface TxState {
  busy: string | null;
  error: string | null;
  done: string | null;
}

/** Runs wallet transactions one after another: simulate, ask the wallet, wait until mined, refresh the page data. */
export function useTx() {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ busy: null, error: null, done: null });

  async function run(label: string, done: string, ...calls: Call[]): Promise<boolean> {
    if (!client || state.busy) return false;
    setState({ busy: label, error: null, done: null });
    try {
      for (const [i, call] of calls.entries()) {
        const simulate = () =>
          client.simulateContract({ ...call, account: address } as Parameters<typeof client.simulateContract>[0]);
        // A load-balanced RPC can lag behind the step that was just mined, so later steps get a few tries.
        for (let left = i === 0 ? 0 : 4; ; left--) {
          try {
            await simulate();
            break;
          } catch (error) {
            if (left === 0) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1_500));
          }
        }
        const hash = await writeContractAsync(call);
        const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
        if (receipt.status !== "success") throw new Error("reverted");
      }
      await queryClient.invalidateQueries();
      setState({ busy: null, error: null, done });
      return true;
    } catch (error) {
      await queryClient.invalidateQueries();
      setState({ busy: null, error: explainWalletError(error, Math.floor(Date.now() / 1000)), done: null });
      return false;
    }
  }

  return { ...state, run };
}
