import "server-only";
import { keccak256, type Address, type Hex, type TransactionReceipt } from "viem";
import { bscTestnet } from "viem/chains";
import { accountOf, publicClient, type KeyName } from "./clients";
import { txQueue } from "./txQueue";

export interface TxRequest {
  to: Address;
  data: Hex;
  /** Fixed, not estimated: a transaction that reverts must still land and be shown. */
  gas: bigint;
}

/** Signs, sends and waits. Resolves with the receipt, also for a reverted transaction. */
export function sendTransaction(key: KeyName, request: TxRequest): Promise<TransactionReceipt> {
  return txQueue().enqueue(key, async (nonce) => {
    const client = publicClient();
    // Legacy pricing: the base fee on BSC testnet is 0, so EIP-1559 estimates are too low to be mined.
    const gasPrice = await client.getGasPrice();
    const serialized = await accountOf(key).signTransaction({
      type: "legacy",
      chainId: bscTestnet.id,
      nonce,
      gasPrice,
      ...request,
    });
    const hash = keccak256(serialized);
    try {
      await client.sendRawTransaction({ serializedTransaction: serialized });
    } catch (error) {
      // The first answer may have been lost while the transaction got through.
      const known = await client.getTransaction({ hash }).catch(() => null);
      if (!known) throw error;
    }
    return client.waitForTransactionReceipt({ hash, timeout: 45_000, checkReplacement: false });
  });
}
