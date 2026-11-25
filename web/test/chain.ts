/** A local anvil chain with the real contracts. Keys are random and live only in memory. */
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseEventLogs,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { mandateRegistryAbi, policyGuardAbi, testUSDAbi } from "../lib/abi";
import type { Deployment } from "../lib/deployment";

const CONTRACTS = path.resolve(__dirname, "../../contracts");
const LOCAL_FILE = path.join(CONTRACTS, "deployments/local.json");
const BIN = path.join(homedir(), ".foundry/bin");
const ENV_PATH = `${BIN}:${process.env.PATH}`;

export const readLocalDeployment = (): Deployment => JSON.parse(readFileSync(LOCAL_FILE, "utf8"));

export async function startChain(port = 8610 + Math.floor(Math.random() * 300)) {
  const url = `http://127.0.0.1:${port}`;
  const anvil = spawn("anvil", ["--port", String(port), "--chain-id", "97", "--silent"], {
    env: { ...process.env, PATH: ENV_PATH },
    stdio: "ignore",
  });
  const client = createPublicClient({ chain: bscTestnet, transport: http(url), pollingInterval: 50 });
  for (let i = 0; ; i++) {
    const up = await client.getChainId().catch(() => null);
    if (up) break;
    if (i > 100) throw new Error("anvil did not start");
    await new Promise((r) => setTimeout(r, 50));
  }

  const keys = { deployer: generatePrivateKey(), agent: generatePrivateKey(), attester: generatePrivateKey(), owner: generatePrivateKey() };
  const setBalance = (address: Address) =>
    client.request({ method: "anvil_setBalance", params: [address, toHex(10n ** 19n)] } as never);
  for (const key of Object.values(keys)) await setBalance(privateKeyToAccount(key).address);

  process.env.BSC_TESTNET_RPC_URL = url;
  process.env.LOGS_RPC_URL = url;
  process.env.AGENT_PRIVATE_KEY = keys.agent;
  process.env.ATTESTER_PRIVATE_KEY = keys.attester;
  process.env.CHALLENGE_AGENT_PRIVATE_KEY = keys.agent;
  delete process.env.CMC_API_KEY;

  const deploy = spawnSync(
    "forge",
    ["script", "script/Deploy.s.sol", "--rpc-url", url, "--broadcast", "--legacy", "--non-interactive"],
    {
      cwd: CONTRACTS,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: ENV_PATH,
        DEPLOYER_PRIVATE_KEY: keys.deployer,
        ATTESTER_PRIVATE_KEY: keys.attester,
        DEPLOYMENT_PATH: "deployments/local.json",
      },
    },
  );
  if (deploy.status !== 0) throw new Error(`deploy failed: ${deploy.stderr.slice(-600)}`);
  const deployment = readLocalDeployment();

  const send = async (key: Hex, tx: { to: Address; data: Hex }) => {
    const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: bscTestnet, transport: http(url) });
    const hash = await wallet.sendTransaction({ ...tx, type: "legacy" });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("setup transaction reverted");
    return receipt;
  };
  const owner = privateKeyToAccount(keys.owner);

  return {
    url,
    client,
    deployment,
    owner,
    agent: privateKeyToAccount(keys.agent).address,
    stop: () => anvil.kill(),
    asDeployer: (tx: { to: Address; data: Hex }) => send(keys.deployer, tx),
    asOwner: (tx: { to: Address; data: Hex }) => send(keys.owner, tx),
    async createMandate(opts: { perTrade: bigint; perPeriod: bigint; deposit: bigint }) {
      const receipt = await send(keys.owner, {
        to: deployment.mandateRegistry,
        data: encodeFunctionData({
          abi: mandateRegistryAbi,
          functionName: "createMandate",
          args: [
            {
              agent: privateKeyToAccount(keys.agent).address,
              jurisdiction: "0x5347",
              maxPerTradeUsd: opts.perTrade,
              maxPerPeriodUsd: opts.perPeriod,
              periodSeconds: 604800n,
              maxVolatilityPpm: 0,
              maxDivergencePpm: 0,
              maxRiskAgeSeconds: 900n,
              expiresAt: 0n,
              requireMarketOpen: false,
              agentRegistryId: 0n,
              allowedAssets: [deployment.tGOLD],
            },
          ],
        }),
      });
      const [created] = parseEventLogs({ abi: mandateRegistryAbi, eventName: "MandateCreated", logs: receipt.logs });
      const id = created!.args.mandateId;
      const balance = await client.readContract({
        address: deployment.usd,
        abi: testUSDAbi,
        functionName: "balanceOf",
        args: [owner.address],
      });
      if (balance < opts.deposit) {
        await send(keys.owner, { to: deployment.usd, data: encodeFunctionData({ abi: testUSDAbi, functionName: "faucet" }) });
      }
      await send(keys.owner, {
        to: deployment.usd,
        data: encodeFunctionData({ abi: testUSDAbi, functionName: "approve", args: [deployment.policyGuard, opts.deposit] }),
      });
      await send(keys.owner, {
        to: deployment.policyGuard,
        data: encodeFunctionData({ abi: policyGuardAbi, functionName: "deposit", args: [id, opts.deposit] }),
      });
      return id;
    },
  };
}

export type TestChain = Awaited<ReturnType<typeof startChain>>;
