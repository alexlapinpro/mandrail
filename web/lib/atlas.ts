import "server-only";
import { numberToHex, parseAbi, type Hex } from "viem";
import { mainnetClient } from "./clients";
import { singleton } from "./singleton";

/** Atlas MultiFeed on BSC mainnet, open read access, 18 decimals. */
export const ATLAS_MULTIFEED = "0xeace519ebb14fb8404fa6ddd23c3b34abade44aa";

const abi = parseAbi([
  "function fetch(bytes4 feedId) view returns (uint256 price, uint256 aggregatedTimestamp, uint256 onchainTimestamp)",
]);

export interface AtlasPrice {
  price: bigint;
  timestamp: number; // unix seconds
}

export interface Atlas {
  /** Null when Atlas has no usable price. Never throws. */
  getAtlas(feedId: number): Promise<AtlasPrice | null>;
}

interface Deps {
  read: (feedId: Hex) => Promise<readonly [bigint, bigint, bigint]>;
  timeoutMs?: number;
}

export function feedIdToBytes4(feedId: number): Hex {
  return numberToHex(feedId, { size: 4 });
}

export function createAtlas({ read, timeoutMs = 6_000 }: Deps): Atlas {
  return {
    async getAtlas(feedId) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      });
      try {
        const result = await Promise.race([read(feedIdToBytes4(feedId)), timeout]);
        if (!result || result[0] === 0n || result[2] === 0n) return null;
        return { price: result[0], timestamp: Number(result[2]) };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const atlas = (): Atlas =>
  singleton("atlas", () =>
    createAtlas({
      read: (feedId) =>
        mainnetClient().readContract({ address: ATLAS_MULTIFEED, abi, functionName: "fetch", args: [feedId] }),
    }),
  );
