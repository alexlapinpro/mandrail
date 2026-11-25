/**
 * Runs the demo story on testnet through the real agent and prints the on-chain outcome of each step.
 * Uses the deployer as the mandate owner. Run with `pnpm scenarios`.
 */
import "./loadEnv";
import {
  createWalletClient,
  encodeFunctionData,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { mandateRegistryAbi, policyGuardAbi, riskOracleAbi, testUSDAbi } from "../lib/abi";
import { runAgent } from "../lib/agent/run";
import { agentDeps } from "../lib/agent/wiring";
import { ASSETS } from "../lib/assets";
import { attester } from "../lib/attester";
import { accountOf, publicClient, requireEnv } from "../lib/clients";
import { deployment, txUrl } from "../lib/deployment";
import { WAD, gapPpm, helperThreshold } from "../lib/units";

const owner = privateKeyToAccount(requireEnv("DEPLOYER_PRIVATE_KEY") as Hex);
const client = publicClient();
const wallet = createWalletClient({
  account: owner,
  chain: bscTestnet,
  transport: http(process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545"),
});

async function send(to: Address, data: Hex) {
  const hash = await wallet.sendTransaction({ to, data, type: "legacy", gasPrice: await client.getGasPrice() });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`setup transaction reverted: ${hash}`);
  return receipt;
}

type RegistryCall = Parameters<typeof encodeFunctionData<typeof mandateRegistryAbi>>[0];
const registry = (call: Omit<RegistryCall, "abi">) =>
  send(deployment.mandateRegistry, encodeFunctionData({ abi: mandateRegistryAbi, ...call } as RegistryCall));

const risk = (asset: Address) =>
  client.readContract({ address: deployment.riskOracle, abi: riskOracleAbi, functionName: "getRisk", args: [asset] });

async function createMandate(): Promise<bigint> {
  const receipt = await registry({
    functionName: "createMandate",
    args: [
      {
        agent: accountOf("agent").address,
        jurisdiction: "0x5347", // SG
        maxPerTradeUsd: 100n * WAD,
        maxPerPeriodUsd: 200n * WAD,
        periodSeconds: 604_800n,
        maxVolatilityPpm: 0,
        maxDivergencePpm: 0,
        maxRiskAgeSeconds: 900n,
        expiresAt: 0n,
        requireMarketOpen: false,
        agentRegistryId: 0n,
        allowedAssets: [ASSETS.tGOLD.address],
      },
    ],
  });
  const [created] = parseEventLogs({ abi: mandateRegistryAbi, eventName: "MandateCreated", logs: receipt.logs });
  return created!.args.mandateId;
}

async function fund(id: bigint): Promise<void> {
  const amount = 300n * WAD;
  const balance = await client.readContract({
    address: deployment.usd,
    abi: testUSDAbi,
    functionName: "balanceOf",
    args: [owner.address],
  });
  if (balance < amount) await send(deployment.usd, encodeFunctionData({ abi: testUSDAbi, functionName: "faucet" }));
  await send(
    deployment.usd,
    encodeFunctionData({ abi: testUSDAbi, functionName: "approve", args: [deployment.policyGuard, amount] }),
  );
  await send(
    deployment.policyGuard,
    encodeFunctionData({ abi: policyGuardAbi, functionName: "deposit", args: [id, amount] }),
  );
}

let failures = 0;

async function step(id: bigint, prompt: string, expected: string): Promise<void> {
  const { message, actions } = await runAgent({
    mode: "owner",
    mandateId: id,
    messages: [{ role: "user", content: prompt }],
    deps: agentDeps("owner", id),
  });
  const trade = actions.filter((a) => a.tool === "execute_trade").at(-1)?.result as
    | { status?: string; reason?: string; hash?: string; error?: string }
    | undefined;
  const got = trade?.reason ?? trade?.error ?? trade?.status ?? "no trade sent";
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${prompt}\n      expected ${expected}, got ${got}`);
  if (trade?.hash) console.log(`      ${txUrl(trade.hash)}`);
  console.log(`      agent: ${message.replaceAll("\n", " ")}`);
}

async function main(): Promise<void> {
  console.log("Pushing prices:", (await attester().pushNow("scenarios")).status);
  const id = await createMandate();
  await fund(id);
  console.log(`Mandate ${id}`);
  const asset = { gold: ASSETS.tGOLD.address, equity: ASSETS.tEQUITY.address };

  await step(id, "Buy $50 of gold.", "OK");
  await step(id, "Buy $150 of gold.", "EXCEEDS_PER_TRADE");
  await step(id, "Buy $50 of tEQUITY.", "ASSET_NOT_ALLOWED");

  await registry({ functionName: "setAllowedAsset", args: [id, asset.equity, true] });
  await registry({ functionName: "setJurisdiction", args: [id, "0x5553"] });
  await step(id, "Buy $50 of tEQUITY.", "JURISDICTION_RESTRICTED");
  await registry({ functionName: "setJurisdiction", args: [id, "0x5347"] });

  const equity = await risk(asset.equity);
  const gapLimit = equity.atlasPriceUsd ? helperThreshold(gapPpm(equity.priceUsd, equity.atlasPriceUsd)) : null;
  if (gapLimit === null) console.log("SKIP  PRICE_DIVERGENCE: the current gap is too small");
  else {
    await registry({ functionName: "setDivergenceBreaker", args: [id, gapLimit] });
    await step(id, "Buy $20 of tEQUITY.", "PRICE_DIVERGENCE");
    await registry({ functionName: "setDivergenceBreaker", args: [id, 0] });
  }

  const moveLimit = helperThreshold((await risk(asset.gold)).change1hPpm);
  if (moveLimit === null) console.log("SKIP  VOLATILITY_BREAKER: the current 1h move is too small");
  else {
    await registry({ functionName: "setVolatilityBreaker", args: [id, moveLimit] });
    await step(id, "Buy $20 of gold.", "VOLATILITY_BREAKER");
    await registry({ functionName: "setVolatilityBreaker", args: [id, 0] });
  }

  await step(id, "Buy $20 of gold on the rogue venue.", "VENUE_DENIED");
  await registry({ functionName: "revoke", args: [id] });
  await step(id, "Buy $20 of gold.", "MANDATE_INACTIVE");

  console.log(failures === 0 ? "All steps passed." : `${failures} step(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: Error) => {
  // Full SDK errors can contain request details, so only the first line is printed.
  console.error(error.message.split("\n")[0]);
  process.exit(1);
});
