/** Registers the agent in the official ERC-8004 identity registry on BSC testnet, once. Run with `pnpm register-agent`. */
import "./loadEnv";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { encodeFunctionData, isAddressEqual, parseAbi, parseEventLogs } from "viem";
import { agentCardUri } from "../lib/agentCard";
import { accountOf, publicClient } from "../lib/clients";
import { deployment, txUrl } from "../lib/deployment";
import { sendTransaction } from "../lib/send";

const abi = parseAbi([
  "function register(string agentURI) returns (uint256)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);
const file = path.resolve(__dirname, "../../contracts/deployments/bsc-testnet.json");

async function main(): Promise<void> {
  if (deployment.agentIdentityId) throw new Error(`Already registered as ${deployment.agentIdentityId}`);
  const receipt = await sendTransaction("agent", {
    to: deployment.identityRegistry,
    data: encodeFunctionData({ abi, functionName: "register", args: [agentCardUri(process.env.APP_URL || undefined)] }),
    gas: 1_500_000n,
  });
  if (receipt.status !== "success") throw new Error(`reverted: ${receipt.transactionHash}`);
  const [minted] = parseEventLogs({ abi, eventName: "Transfer", logs: receipt.logs });
  const id = minted!.args.tokenId;
  const wallet = await publicClient().readContract({
    address: deployment.identityRegistry,
    abi,
    functionName: "getAgentWallet",
    args: [id],
  });
  if (!isAddressEqual(wallet, accountOf("agent").address)) throw new Error(`agent wallet mismatch for id ${id}`);
  const json = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, `${JSON.stringify({ ...json, agentIdentityId: Number(id) }, null, 2)}\n`);
  console.log(`Registered as ${id}: ${txUrl(receipt.transactionHash)}`);
}

main().catch((error: Error) => {
  console.error(error.message.split("\n")[0]);
  process.exit(1);
});
