import type { Address } from "viem";
import json from "../../contracts/deployments/bsc-testnet.json";

export interface Deployment {
  chainId: number;
  deployBlock: number;
  usd: Address;
  tGOLD: Address;
  tEQUITY: Address;
  riskOracle: Address;
  compliance: Address;
  mandateRegistry: Address;
  marketCalendar: Address;
  policyGuard: Address;
  market: Address;
  rogueVenue: Address;
  identityRegistry: Address;
  challengeMandateId: number;
  /** ERC-8004 id of the demo agent, 0 before it is registered. */
  agentIdentityId: number;
}

/** Written by contracts/script/Deploy.s.sol. Safe for the client. */
export const deployment = json as Deployment;

const EXPLORER = "https://testnet.bscscan.com";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const identityUrl = (id: number | bigint) => `${EXPLORER}/nft/${deployment.identityRegistry}/${id}`;
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`;
