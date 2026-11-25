import "server-only";
import { createPublicClient, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { bsc, bscTestnet } from "viem/chains";
import { singleton } from "./singleton";

export type KeyName = "agent" | "attester" | "challenge";

const KEY_VARS: Record<KeyName, string> = {
  agent: "AGENT_PRIVATE_KEY",
  attester: "ATTESTER_PRIVATE_KEY",
  challenge: "CHALLENGE_AGENT_PRIVATE_KEY",
};

const DEFAULT_RPC = "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
const DEFAULT_LOGS_RPC = "https://bsc-testnet-rpc.publicnode.com";
const DEFAULT_MAINNET_RPC = "https://bsc-rpc.publicnode.com";

/** Next.js stores fetch answers on disk by default. Chain state must always be read fresh. */
const NO_CACHE = { cache: "no-store" } as const;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function accountOf(key: KeyName): PrivateKeyAccount {
  return singleton(`account_${key}`, () => {
    try {
      return privateKeyToAccount(requireEnv(KEY_VARS[key]) as Hex);
    } catch {
      // The library error could echo part of the key.
      throw new Error(`Missing or invalid ${KEY_VARS[key]}`);
    }
  });
}

const testnetClient = (name: string, variable: string, fallback: string): PublicClient =>
  singleton(name, () =>
    createPublicClient({
      chain: bscTestnet,
      pollingInterval: 500,
      transport: http(process.env[variable] || fallback, { timeout: 10_000, fetchOptions: NO_CACHE }),
    }),
  ) as PublicClient;

export const publicClient = () => testnetClient("publicClient", "BSC_TESTNET_RPC_URL", DEFAULT_RPC);

/** The default transaction RPC refuses eth_getLogs, so logs have their own endpoint. */
export const logsClient = () => testnetClient("logsClient", "LOGS_RPC_URL", DEFAULT_LOGS_RPC);

/** Reads only: Atlas price feeds live on mainnet. */
export const mainnetClient = (): PublicClient =>
  singleton("mainnetClient", () =>
    createPublicClient({
      chain: bsc,
      transport: http(process.env.BSC_MAINNET_RPC_URL || DEFAULT_MAINNET_RPC, { timeout: 5_000, retryCount: 1, fetchOptions: NO_CACHE }),
    }),
  ) as PublicClient;
