import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { mandateRegistryAbi, policyGuardAbi, testUSDAbi } from "@/lib/abi";
import { ASSETS, type AssetSymbol } from "@/lib/assets";
import { deployment } from "@/lib/deployment";

const registry = { address: deployment.mandateRegistry, abi: mandateRegistryAbi } as const;
const guard = { address: deployment.policyGuard, abi: policyGuardAbi } as const;

export function useMandates(owner: Address | undefined) {
  return useReadContract({
    ...registry,
    functionName: "mandatesByOwner",
    args: [owner!],
    query: { enabled: !!owner, refetchInterval: 10_000, select: (ids) => [...ids] },
  });
}

export function useTestUsd(owner: Address | undefined) {
  return useReadContract({
    address: deployment.usd,
    abi: testUSDAbi,
    functionName: "balanceOf",
    args: [owner!],
    query: { enabled: !!owner, refetchInterval: 10_000 },
  });
}

export function useMandate(id: bigint | null) {
  const args = [id ?? 0n] as const;
  const { data, isError, isLoading } = useReadContracts({
    contracts: [
      { ...registry, functionName: "getMandate", args },
      { ...guard, functionName: "balanceOf", args },
      { ...guard, functionName: "spentInPeriod", args },
      { ...guard, functionName: "periodStart", args },
      { ...registry, functionName: "isAssetAllowed", args: [id ?? 0n, ASSETS.tGOLD.address] },
      { ...registry, functionName: "isAssetAllowed", args: [id ?? 0n, ASSETS.tEQUITY.address] },
    ],
    allowFailure: false,
    query: { enabled: id !== null, refetchInterval: 5_000 },
  });
  if (id === null || !data) return { mandate: null, isError, isLoading };
  const [m, balance, spent, periodStart, gold, equity] = data;
  const allowed: Record<AssetSymbol, boolean> = { tGOLD: gold, tEQUITY: equity };
  return { mandate: { ...m, id, balance, spent, periodStart, allowed }, isError, isLoading };
}

export type MandateView = NonNullable<ReturnType<typeof useMandate>["mandate"]>;
