import "server-only";
import { encodeFunctionData, isAddressEqual, parseEventLogs, type Address, type Hash, type Hex, type TransactionReceipt } from "viem";
import { policyGuardAbi } from "./abi";
import { attester } from "./attester";
import { accountOf, publicClient, type KeyName } from "./clients";
import { deployment } from "./deployment";
import { sendTransaction } from "./send";

export interface TradeRequest {
  mandateId: bigint;
  key: Extract<KeyName, "agent" | "challenge">;
  asset: Address;
  venue: Address;
  usd: bigint;
  minAssetOut?: bigint;
}

/** "failed" means the transaction reverted: an infrastructure problem, not a policy decision. */
export interface TradeResult {
  status: "executed" | "blocked" | "failed";
  hash: Hash;
  reason?: number;
  context?: Hex;
  assetOut?: bigint;
  priceUsd?: bigint;
}

const TRADE_GAS = 700_000n;

export async function preflight(request: TradeRequest): Promise<{ reason: number; context: Hex }> {
  const [reason, context] = await publicClient().readContract({
    address: deployment.policyGuard,
    abi: policyGuardAbi,
    functionName: "checkTrade",
    args: [request.mandateId, accountOf(request.key).address, request.asset, request.venue, request.usd],
  });
  return { reason, context };
}

export async function execute(request: TradeRequest): Promise<TradeResult> {
  await attester().ensureFresh();
  const receipt = await sendTransaction(request.key, {
    to: deployment.policyGuard,
    gas: TRADE_GAS,
    data: encodeFunctionData({
      abi: policyGuardAbi,
      functionName: "executeTrade",
      // The guard enforces 99% of the oracle amount itself; this can only ask for more.
      args: [request.mandateId, request.asset, request.venue, request.usd, request.minAssetOut ?? 0n],
    }),
  });
  return parseReceipt(receipt);
}

/** The outcome comes from the guard's own events, never from anything the model says. */
export function parseReceipt(receipt: TransactionReceipt): TradeResult {
  const hash = receipt.transactionHash;
  if (receipt.status !== "success") return { status: "failed", hash };

  const logs = receipt.logs.filter((log) => isAddressEqual(log.address, deployment.policyGuard));
  const [executed] = parseEventLogs({ abi: policyGuardAbi, eventName: "TradeExecuted", logs });
  if (executed) {
    const { assetOut, priceUsd } = executed.args;
    return { status: "executed", hash, reason: 0, context: "0x", assetOut, priceUsd };
  }
  const [blocked] = parseEventLogs({ abi: policyGuardAbi, eventName: "TradeBlocked", logs });
  if (blocked) return { status: "blocked", hash, reason: blocked.args.reason, context: blocked.args.context };
  return { status: "failed", hash };
}
