import "server-only";
import { mandateRegistryAbi, policyGuardAbi } from "./abi";
import { ASSET_LIST } from "./assets";
import type { ChallengeMandate } from "./challenge";
import { publicClient } from "./clients";
import { deployment } from "./deployment";

/** Reads the challenge mandate from the chain, so the page judges by the real limits. */
export async function challengeMandate(id: bigint): Promise<ChallengeMandate & { balance: bigint }> {
  const client = publicClient();
  const registry = { address: deployment.mandateRegistry, abi: mandateRegistryAbi } as const;
  const [mandate, balance, allowed] = await Promise.all([
    client.readContract({ ...registry, functionName: "getMandate", args: [id] }),
    client.readContract({ address: deployment.policyGuard, abi: policyGuardAbi, functionName: "balanceOf", args: [id] }),
    Promise.all(
      ASSET_LIST.map((a) => client.readContract({ ...registry, functionName: "isAssetAllowed", args: [id, a.address] })),
    ),
  ]);
  return {
    allowedAssets: ASSET_LIST.filter((_a, i) => allowed[i]).map((a) => a.address),
    maxPerTrade: mandate.maxPerTradeUsd,
    maxPerPeriod: mandate.maxPerPeriodUsd,
    periodSeconds: Number(mandate.periodSeconds),
    balance,
  };
}
