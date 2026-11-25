import type { Address } from "viem";

export const MAX_ACCESS_SECONDS = 3600;

export interface AccessClaim {
  mandateId: string;
  expires: number; // unix seconds
}

/** The text the owner signs once to open the chat. Shared by the browser and the server. */
export function buildAccessMessage({ mandateId, expires, guard }: AccessClaim & { guard: Address }): string {
  return `Mandrail chat access\nMandate: ${mandateId}\nChain: 97\nGuard: ${guard}\nExpires: ${expires}`;
}
