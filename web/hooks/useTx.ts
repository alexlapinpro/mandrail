import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { pendingChanges } from "@/lib/pendingChanges";
import { txFailure } from "@/lib/txFailure";

type Call = Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0];

export interface TxState {
  busy: string | null;
  error: string | null;
  done: string | null;
  /** Transaction to look at when something went wrong after it was sent. */
  hash: string | null;
}

/** Runs wallet transactions one after another: simulate, ask the wallet, wait until mined, refresh the page data. */
export function useTx() {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ busy: null, error: null, done: null, hash: null });

  async function run(label: string, done: string, ...calls: Call[]): Promise<boolean> {
    if (!client || state.busy) return false;
    setState({ busy: label, error: null, done: null, hash: null });
    const end = pendingChanges.start();
    let hash: string | undefined;
    let reverted = false;
    let stepsDone = 0;
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
        const sent = await writeContractAsync({ ...call, chainId: bscTestnet.id } as Call);
        hash = sent;
        const receipt = await client.waitForTransactionReceipt({ hash: sent, timeout: 60_000 });
        if (receipt.status !== "success") {
          reverted = true;
          throw new Error("reverted");
        }
        hash = undefined;
        stepsDone++;
      }
      await queryClient.invalidateQueries();
      end();
      setState({ busy: null, error: null, done, hash: null });
      return true;
    } catch (error) {
      await queryClient.invalidateQueries();
      end();
      const failure = txFailure({ error, hash, reverted, stepsDone, now: Math.floor(Date.now() / 1000) });
      setState({ busy: null, error: failure.text, done: null, hash: failure.hash ?? null });
      return false;
    }
  }

  return { ...state, run };
}
