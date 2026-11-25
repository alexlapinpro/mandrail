/** ERC-8004 registration file of the demo agent. Public, so it holds nothing personal. */
export function agentCard(appUrl: string | undefined) {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Mandrail demo agent",
    description:
      "Hackathon demo on BSC testnet. Buys test assets only through the Mandrail policy guard, which checks every trade against the owner's mandate.",
    services: appUrl ? [{ name: "web", endpoint: appUrl }] : [],
    x402Support: false,
    active: true,
  };
}

/** The card itself as a URI, so the identity does not depend on a server. */
export function agentCardUri(appUrl: string | undefined): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(agentCard(appUrl))).toString("base64")}`;
}
