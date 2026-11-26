/**
 * Owner rehearsal without any private key: forks BSC testnet with anvil, starts the app against the fork,
 * and plays the owner with an unlocked anvil dev account. Every step goes through the real HTTP API,
 * the real agent and the deployed contracts, so it checks what a person in the app would see.
 * Needs anvil (Foundry) and the Azure settings in .env. Run with `pnpm rehearsal`.
 */
import "./loadEnv";
import { spawn, type ChildProcess } from "node:child_process";
import { openSync } from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { bscTestnet } from "viem/chains";
import { mandateRegistryAbi, policyGuardAbi, riskOracleAbi, testUSDAbi } from "../lib/abi";
import { buildAccessMessage, MAX_ACCESS_SECONDS } from "../lib/accessMessage";
import { ASSETS } from "../lib/assets";
import { deployment } from "../lib/deployment";
import { WAD, gapPpm, helperThreshold } from "../lib/units";

const FORK_PORT = 8597;
const APP_PORT = 3977;
const RPC = `http://127.0.0.1:${FORK_PORT}`;
const APP = `http://127.0.0.1:${APP_PORT}`;
// The fork pulls state on demand, so it needs a fast upstream. Override with REHEARSAL_FORK_URL.
const UPSTREAM = process.env.REHEARSAL_FORK_URL || "https://bsc-testnet-rpc.publicnode.com";
// Set REHEARSAL_LOGS to a folder to keep the output of anvil and the app.
const LOGS = process.env.REHEARSAL_LOGS;
// Anvil's last default dev account: unlocked on the fork, so no key is needed.
const OWNER: Address = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";

const children: ChildProcess[] = [];
function start(name: string, command: string, args: string[], env: Record<string, string> = {}): void {
  const out = LOGS ? openSync(path.join(LOGS, `${name}.log`), "w") : "ignore";
  const child = spawn(command, args, {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ...env },
    stdio: ["ignore", out, out],
    detached: true,
  });
  children.push(child);
}
function stopAll(): void {
  for (const child of children) {
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

async function waitFor(label: string, check: () => Promise<boolean>, seconds: number): Promise<void> {
  for (let i = 0; i < seconds; i++) {
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} did not start in ${seconds} s`);
}

const client = createPublicClient({ chain: bscTestnet, transport: http(RPC) });
const wallet = createWalletClient({ account: OWNER, chain: bscTestnet, transport: http(RPC) });

async function send(to: Address, data: Hex) {
  const hash = await wallet.sendTransaction({ to, data });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`setup transaction reverted: ${hash}`);
  return receipt;
}
type RegistryCall = Parameters<typeof encodeFunctionData<typeof mandateRegistryAbi>>[0];
const registry = (call: Omit<RegistryCall, "abi">) =>
  send(deployment.mandateRegistry, encodeFunctionData({ abi: mandateRegistryAbi, ...call } as RegistryCall));
const risk = (asset: Address) =>
  client.readContract({ address: deployment.riskOracle, abi: riskOracleAbi, functionName: "getRisk", args: [asset] });

async function createMandate(agent: Address): Promise<bigint> {
  const receipt = await registry({
    functionName: "createMandate",
    args: [
      {
        agent,
        jurisdiction: "0x5347", // SG
        maxPerTradeUsd: 100n * WAD,
        maxPerPeriodUsd: 200n * WAD,
        periodSeconds: 604_800n,
        maxVolatilityPpm: 0,
        maxDivergencePpm: 0,
        maxRiskAgeSeconds: 900n,
        expiresAt: 0n,
        requireMarketOpen: false,
        agentRegistryId: BigInt(deployment.agentIdentityId || 0),
        allowedAssets: [ASSETS.tGOLD.address],
      },
    ],
  });
  const [created] = parseEventLogs({ abi: mandateRegistryAbi, eventName: "MandateCreated", logs: receipt.logs });
  const id = created!.args.mandateId;
  const amount = 300n * WAD;
  await send(deployment.usd, encodeFunctionData({ abi: testUSDAbi, functionName: "faucet" }));
  await send(deployment.usd, encodeFunctionData({ abi: testUSDAbi, functionName: "approve", args: [deployment.policyGuard, amount] }));
  await send(deployment.policyGuard, encodeFunctionData({ abi: policyGuardAbi, functionName: "deposit", args: [id, amount] }));
  return id;
}

let failures = 0;
let pass: { mandateId: string; expires: number; signature: Hex };

async function step(prompt: string, expected: string): Promise<void> {
  const response = await fetch(`${APP}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...pass, messages: [{ role: "user", content: prompt }] }),
  });
  const body = (await response.json()) as { actions?: { tool: string; result: Record<string, string> }[]; error?: string };
  const trade = body.actions?.filter((a) => a.tool === "execute_trade").at(-1)?.result;
  const got = trade?.reason ?? trade?.error ?? trade?.status ?? body.error ?? `HTTP ${response.status}, no trade sent`;
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${prompt}\n      expected ${expected}, got ${got}${trade?.hash ? `, tx ${trade.hash}` : ""}`);
}

async function main(): Promise<void> {
  console.log(`Forking BSC testnet on :${FORK_PORT} and starting the app on :${APP_PORT}…`);
  start("anvil", "anvil", ["--port", String(FORK_PORT), "--chain-id", "97", "--fork-url", UPSTREAM]);
  await waitFor("anvil", async () => (await client.getChainId()) === 97, 60);
  start("app", "npx", ["next", "dev", "-p", String(APP_PORT)], {
    BSC_TESTNET_RPC_URL: RPC,
    LOGS_RPC_URL: RPC,
    NEXT_PUBLIC_RPC_URL: RPC,
    ATTESTER_LOOP: "",
  });
  await waitFor("the app", async () => (await fetch(`${APP}/api/health`)).ok, 180);

  const { agent } = (await (await fetch(`${APP}/api/config`)).json()) as { agent: Address };
  const id = await createMandate(agent);
  const expires = Math.floor(Date.now() / 1000) + MAX_ACCESS_SECONDS - 60;
  const signature = await wallet.signMessage({ message: buildAccessMessage({ mandateId: id.toString(), expires, guard: deployment.policyGuard }) });
  pass = { mandateId: id.toString(), expires, signature };
  console.log(`Mandate ${id}, owner ${OWNER}`);
  const asset = { gold: ASSETS.tGOLD.address, equity: ASSETS.tEQUITY.address };

  await step("Buy $50 of tGOLD on the main venue.", "OK");
  await step("Buy $150 of tGOLD on the main venue.", "EXCEEDS_PER_TRADE");
  await step("Buy $20 of tEQUITY on the main venue.", "ASSET_NOT_ALLOWED");
  await step("Buy $20 of tGOLD on the rogue venue.", "VENUE_DENIED");

  const moveLimit = helperThreshold((await risk(asset.gold)).change1hPpm);
  if (moveLimit === null) console.log("SKIP  VOLATILITY_BREAKER: the current 1h move is too small");
  else {
    await registry({ functionName: "setVolatilityBreaker", args: [id, moveLimit] });
    await step("Buy $20 of tGOLD on the main venue.", "VOLATILITY_BREAKER");
    await registry({ functionName: "setVolatilityBreaker", args: [id, 0] });
  }

  await registry({ functionName: "setAllowedAsset", args: [id, asset.equity, true] });
  const equity = await risk(asset.equity);
  const gapLimit = equity.atlasPriceUsd ? helperThreshold(gapPpm(equity.priceUsd, equity.atlasPriceUsd)) : null;
  if (gapLimit === null) console.log("SKIP  PRICE_DIVERGENCE: the current gap is too small");
  else {
    await registry({ functionName: "setDivergenceBreaker", args: [id, gapLimit] });
    await step("Buy $20 of tEQUITY on the main venue.", "PRICE_DIVERGENCE");
    await registry({ functionName: "setDivergenceBreaker", args: [id, 0] });
  }

  await registry({ functionName: "setJurisdiction", args: [id, "0x5553"] }); // US
  await step("Buy $20 of tEQUITY on the main venue.", "JURISDICTION_RESTRICTED");

  await registry({ functionName: "revoke", args: [id] });
  await step("Buy $20 of tGOLD on the main venue.", "MANDATE_INACTIVE");

  console.log(failures === 0 ? "All steps passed." : `${failures} step(s) failed.`);
}

main()
  .catch((error: Error) => {
    // Full SDK errors can contain request details, so only the first line is printed.
    console.error(error.message.split("\n")[0]);
    failures++;
  })
  .finally(() => {
    stopAll();
    process.exit(failures === 0 ? 0 : 1);
  });
