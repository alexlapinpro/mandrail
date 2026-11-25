import "server-only";
import { isAddressEqual, recoverMessageAddress, type Address, type Hex } from "viem";
import { mandateRegistryAbi } from "./abi";
import { MAX_ACCESS_SECONDS, buildAccessMessage, type AccessClaim } from "./accessMessage";
import { publicClient } from "./clients";
import { deployment } from "./deployment";
import { singleton } from "./singleton";

export { buildAccessMessage } from "./accessMessage";

export type AccessResult = { status: "ok"; owner: Address } | { status: "denied" } | { status: "unknown-mandate" };

const DENIED: AccessResult = { status: "denied" };

interface Deps {
  guard: Address;
  now: () => number;
  /** Null when the mandate does not exist. */
  ownerOf: (mandateId: bigint) => Promise<Address | null>;
}

export function createAccess({ guard, now, ownerOf }: Deps) {
  // Owners never change on-chain, so one read per mandate is enough.
  const owners = new Map<string, Address>();

  return {
    /** Only the on-chain owner of a mandate may talk to its agent. */
    async verify({ mandateId, expires, signature }: AccessClaim & { signature: string }): Promise<AccessResult> {
      if (typeof mandateId !== "string" || !/^[1-9]\d{0,9}$/.test(mandateId)) return DENIED;
      if (!Number.isSafeInteger(expires)) return DENIED;
      if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return DENIED;

      const seconds = Math.floor(now() / 1000);
      if (expires <= seconds || expires > seconds + MAX_ACCESS_SECONDS) return DENIED;

      // The signature first: a broken one must not cost a chain read.
      let signer: Address;
      try {
        signer = await recoverMessageAddress({
          message: buildAccessMessage({ mandateId, expires, guard }),
          signature: signature as Hex,
        });
      } catch {
        return DENIED;
      }

      const owner = owners.get(mandateId) ?? (await ownerOf(BigInt(mandateId)));
      if (!owner) return { status: "unknown-mandate" };
      owners.set(mandateId, owner);
      return isAddressEqual(signer, owner) ? { status: "ok", owner } : DENIED;
    },
  };
}

async function chainOwner(mandateId: bigint): Promise<Address | null> {
  const count = await publicClient().readContract({
    address: deployment.mandateRegistry,
    abi: mandateRegistryAbi,
    functionName: "mandateCount",
  });
  if (mandateId > count) return null;
  const mandate = await publicClient().readContract({
    address: deployment.mandateRegistry,
    abi: mandateRegistryAbi,
    functionName: "getMandate",
    args: [mandateId],
  });
  return mandate.owner;
}

export const access = () =>
  singleton("access", () => createAccess({ guard: deployment.policyGuard, now: Date.now, ownerOf: chainOwner }));
