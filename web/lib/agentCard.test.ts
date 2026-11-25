import { describe, expect, it } from "vitest";
import { agentCard, agentCardUri } from "./agentCard";

describe("agent card", () => {
  it("follows the ERC-8004 registration format and says it is a test", () => {
    const card = agentCard("https://mandrail.example");
    expect(card).toMatchObject({
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "Mandrail demo agent",
      active: true,
      x402Support: false,
      services: [{ name: "web", endpoint: "https://mandrail.example" }],
    });
    expect(card.description).toMatch(/testnet/i);
    expect(card.description).toMatch(/test assets/i);
  });
  it("has no endpoint until the app is hosted", () => {
    expect(agentCard(undefined).services).toEqual([]);
  });
  it("fits into a data URI that decodes back", () => {
    const uri = agentCardUri(undefined);
    expect(uri).toMatch(/^data:application\/json;base64,/);
    expect(JSON.parse(Buffer.from(uri.split(",")[1]!, "base64").toString())).toEqual(agentCard(undefined));
  });
});
