import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encodeFunctionData, parseAbi } from "viem";
import { startChain, type TestChain } from "../test/chain";

const E = 10n ** 18n;
let chain: TestChain;

vi.mock("./deployment", async () => {
  const { readLocalDeployment } = await import("../test/chain");
  return {
    get deployment() {
      return readLocalDeployment();
    },
    txUrl: (h: string) => h,
    addressUrl: (a: string) => a,
  };
});

beforeAll(async () => {
  chain = await startChain();
}, 90_000);
afterAll(() => chain?.stop());

async function trade() {
  return import("./trade");
}

async function pushGold() {
  const { sendTransaction } = await import("./send");
  const { riskOracleAbi } = await import("./abi");
  const now = BigInt(Math.floor(Date.now() / 1000));
  const receipt = await sendTransaction("attester", {
    to: chain.deployment.riskOracle,
    gas: 500_000n,
    data: encodeFunctionData({
      abi: riskOracleAbi,
      functionName: "updateBatch",
      args: [
        [chain.deployment.tGOLD],
        [
          {
            priceUsd: 4000n * E,
            change1hPpm: 100n,
            change24hPpm: 0n,
            sourceTimestamp: now,
            atlasPriceUsd: 0n,
            atlasTimestamp: 0n,
          },
        ],
      ],
    }),
  });
  expect(receipt.status).toBe("success");
}

describe("trading core on a local chain", () => {
  it("executes, and reads the result from the receipt", async () => {
    await pushGold();
    const id = await chain.createMandate({ perTrade: 100n * E, perPeriod: 200n * E, deposit: 200n * E });
    const { execute, preflight } = await trade();
    const request = {
      mandateId: id,
      key: "agent" as const,
      asset: chain.deployment.tGOLD,
      venue: chain.deployment.market,
      usd: 50n * E,
    };
    expect(await preflight(request)).toEqual({ reason: 0, context: "0x" });
    const result = await execute(request);
    expect(result).toMatchObject({ status: "executed", reason: 0, assetOut: (50n * E * E) / (4000n * E), priceUsd: 4000n * E });
    expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("two trades at once land in order and the second sees the first one's spend", async () => {
    const id = await chain.createMandate({ perTrade: 100n * E, perPeriod: 100n * E, deposit: 200n * E });
    const { execute } = await trade();
    const request = {
      mandateId: id,
      key: "agent" as const,
      asset: chain.deployment.tGOLD,
      venue: chain.deployment.market,
      usd: 60n * E,
    };
    const [first, second] = await Promise.all([execute(request), execute(request)]);
    expect(first.status).toBe("executed");
    expect(second).toMatchObject({ status: "blocked", reason: 8 });
    expect(second.hash).not.toBe(first.hash);
    const { decodeContext } = await import("./reasons");
    expect(decodeContext(8, second.context!)).toEqual({ requested: 60n * E, spent: 60n * E, limit: 100n * E });
  });

  it("a blocked attempt is mined and carries its reason", async () => {
    const id = await chain.createMandate({ perTrade: 100n * E, perPeriod: 200n * E, deposit: 200n * E });
    const { execute } = await trade();
    const result = await execute({
      mandateId: id,
      key: "agent",
      asset: chain.deployment.tGOLD,
      venue: chain.deployment.rogueVenue,
      usd: 50n * E,
    });
    expect(result).toMatchObject({ status: "blocked", reason: 6 });
    const receipt = await chain.client.getTransactionReceipt({ hash: result.hash });
    expect(receipt.status).toBe("success");
  });

  it("a reverting transaction is failed, with no policy decision", async () => {
    const id = await chain.createMandate({ perTrade: 100n * E, perPeriod: 200n * E, deposit: 200n * E });
    await chain.asDeployer({
      to: chain.deployment.market,
      data: encodeFunctionData({
        abi: parseAbi(["function setSupported(address,bool)"]),
        functionName: "setSupported",
        args: [chain.deployment.tGOLD, false],
      }),
    });
    const { execute } = await trade();
    const result = await execute({
      mandateId: id,
      key: "agent",
      asset: chain.deployment.tGOLD,
      venue: chain.deployment.market,
      usd: 50n * E,
    });
    expect(result.status).toBe("failed");
    expect(result.reason).toBeUndefined();
    expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("ignores look-alike events from other contracts", async () => {
    const { parseReceipt } = await trade();
    const { policyGuardAbi } = await import("./abi");
    const { encodeEventTopics, encodeAbiParameters, parseAbiParameters } = await import("viem");
    const fake = {
      address: chain.deployment.rogueVenue,
      topics: encodeEventTopics({
        abi: policyGuardAbi,
        eventName: "TradeExecuted",
        args: { mandateId: 1n, agent: chain.deployment.market, asset: chain.deployment.tGOLD },
      }),
      data: encodeAbiParameters(parseAbiParameters("address,uint256,uint256,uint256"), [
        chain.deployment.market,
        1n,
        1n,
        1n,
      ]),
    };
    const receipt = { status: "success", transactionHash: "0xabc", logs: [fake] };
    expect(parseReceipt(receipt as never).status).toBe("failed");
  });
});
