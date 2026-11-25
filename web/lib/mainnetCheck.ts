import "server-only";
import { parseAbi, zeroAddress, type Address, type Hex } from "viem";
import mainnet from "../../contracts/deployments/bsc-mainnet.json";
import { feedIdToBytes4 } from "./atlas";
import { mainnetClient } from "./clients";
import { reasonName } from "./reasons";
import { singleton } from "./singleton";

const abi = parseAbi([
  "function check(bytes4 feedId, uint256 referencePrice, uint32 maxDivergencePpm, uint64 maxAge) view returns (uint8 reason, uint256 atlasPrice, uint64 atlasTimestamp, uint256 gapPpm)",
]);

const MAX_DIVERGENCE_PPM = 10_000; // 1%
const MAX_AGE = 3600n;

type Read = (feedId: Hex, reference: bigint, maxPpm: number, maxAge: bigint) => Promise<readonly [number, bigint, bigint, bigint]>;

export interface MainnetResult {
  address: Address;
  reason: string;
  atlasPrice: bigint;
  atlasTimestamp: number;
  gapPpm: bigint;
  maxDivergencePpm: number;
}

/** Runs the read-only check on BSC mainnet, where the contract reads Atlas itself. Null when it is not available. */
export function createMainnetCheck({ address, read }: { address: Address; read: Read }) {
  return {
    async run(feedId: number, cmcPrice: bigint): Promise<MainnetResult | null> {
      if (address === zeroAddress) return null;
      try {
        const [reason, atlasPrice, timestamp, gapPpm] = await read(feedIdToBytes4(feedId), cmcPrice, MAX_DIVERGENCE_PPM, MAX_AGE);
        return { address, reason: reasonName(reason), atlasPrice, atlasTimestamp: Number(timestamp), gapPpm, maxDivergencePpm: MAX_DIVERGENCE_PPM };
      } catch {
        return null;
      }
    },
  };
}

export const mainnetCheck = () =>
  singleton("mainnetCheck", () => {
    const address = mainnet.atlasRiskCheck as Address;
    return createMainnetCheck({
      address,
      read: (...args) => mainnetClient().readContract({ address, abi, functionName: "check", args }),
    });
  });
