import { describe, expect, it, vi } from "vitest";
import type { TradeResult } from "../trade";
import type { ModelClient, ModelReply } from "./client";
import { runAgent, type AgentDeps, type ChatMessage } from "./run";
import { toolSchemas } from "./tools";

const E = 10n ** 18n;
const call = (name: string, args: object, id = name): ModelReply => ({
  content: null,
  toolCalls: [{ id, name, arguments: JSON.stringify(args) }],
});
const say = (content: string): ModelReply => ({ content, toolCalls: [] });
const user = (content: string): ChatMessage[] => [{ role: "user", content }];

const perTrade = ("0x" + (150n * E).toString(16).padStart(64, "0") + (100n * E).toString(16).padStart(64, "0")) as `0x${string}`;
const BLOCKED: TradeResult = { status: "blocked", hash: "0xreal", reason: 7, context: perTrade };

function setup(replies: ModelReply[], over: Partial<AgentDeps> = {}) {
  const seen: Parameters<ModelClient["complete"]>[0][] = [];
  const model: ModelClient = {
    complete: vi.fn(async (request) => {
      seen.push(structuredClone(request));
      return replies.shift() ?? say("done");
    }),
  };
  const deps: AgentDeps = {
    model,
    marketData: vi.fn(async () => ({ source: "CoinMarketCap", priceUsd: "4000", change1h: "-0.1%" })),
    mandate: vi.fn(async () => ({ maxPerTradeUsd: "100" })),
    preflight: vi.fn(async () => ({ reason: 7, context: perTrade })),
    execute: vi.fn(async () => BLOCKED),
    takeModelCall: vi.fn(() => true),
    takeTransaction: vi.fn(() => true),
    ...over,
  };
  const run = (messages: ChatMessage[], mode: "owner" | "challenge" = "owner") =>
    runAgent({ mode, mandateId: 5n, messages, deps });
  return { run, deps, seen };
}
const BUY = { asset: "tGOLD", venue: "main", usdAmount: "150" };

describe("tool schemas", () => {
  it("never let the model choose the mandate", () => {
    expect(JSON.stringify(toolSchemas("owner"))).not.toMatch(/mandateId/i);
    expect(JSON.stringify(toolSchemas("challenge"))).not.toMatch(/mandateId/i);
  });
  it("offer only known venues to the owner's agent", () => {
    const trade = toolSchemas("owner").find((t) => t.name === "execute_trade")!;
    expect(trade.parameters.properties.venue!.enum).toEqual(["main", "rogue"]);
    expect(trade.parameters.properties).not.toHaveProperty("minAssetOut");
  });
  it("let the challenge agent pass any venue and minimum", () => {
    const trade = toolSchemas("challenge").find((t) => t.name === "execute_trade")!;
    expect(trade.parameters.properties.venue!.enum).toBeUndefined();
    expect(trade.parameters.properties).toHaveProperty("minAssetOut");
  });
});

describe("agent run", () => {
  it("passes the server's mandate to the trade and returns the receipt data", async () => {
    const { run, deps } = setup([call("execute_trade", { ...BUY, mandateId: "999" }), say("Blocked, tx 0xinvented")]);
    const result = await run(user("Buy $150 of gold"));
    expect(deps.execute).toHaveBeenCalledWith(expect.objectContaining({ mandateId: 5n, usd: 150n * E }));
    expect(result.actions[0]).toMatchObject({
      tool: "execute_trade",
      result: { status: "blocked", hash: "0xreal", reason: "EXCEEDS_PER_TRADE" },
    });
    expect(JSON.stringify(result.actions)).not.toContain("0xinvented");
    expect((result.actions[0]!.result as { explanation: string }).explanation).toMatch(/\$150\.00.*\$100\.00/);
  });

  it.each(["$50", "1e3", "-5", "0", "", "1.1234567890123456789"])("refuses the amount %j without a transaction", async (usdAmount) => {
    const { run, deps } = setup([call("execute_trade", { ...BUY, usdAmount }), say("sorry")]);
    const result = await run(user("buy"));
    expect(result.actions[0]!.result).toEqual({ error: "invalid amount" });
    expect(deps.execute).not.toHaveBeenCalled();
    expect(deps.takeTransaction).not.toHaveBeenCalled();
  });

  it("refuses a numeric amount", async () => {
    const { run, deps } = setup([call("execute_trade", { ...BUY, usdAmount: 50 }), say("sorry")]);
    expect((await run(user("buy"))).actions[0]!.result).toEqual({ error: "invalid amount" });
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown asset", { ...BUY, asset: "BTC" }],
    ["address as asset", { ...BUY, asset: "0x00000000000000000000000000000000000000b1" }],
    ["address as venue", { ...BUY, venue: "0x00000000000000000000000000000000000000c1" }],
  ])("refuses %s in owner mode", async (_name, args) => {
    const { run, deps } = setup([call("execute_trade", args), say("sorry")]);
    expect((await run(user("buy"))).actions[0]!.result).toHaveProperty("error");
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("answers broken tool calls with an error instead of crashing", async () => {
    const { run } = setup([
      { content: null, toolCalls: [{ id: "1", name: "execute_trade", arguments: "{oops" }] },
      call("withdraw_everything", {}),
      say("ok"),
    ]);
    const result = await run(user("hi"));
    expect(result.message).toBe("ok");
    expect(result.actions.map((a) => a.result)).toEqual([{ error: "invalid arguments" }, { error: "unknown tool" }]);
  });

  it("stops after six tool rounds", async () => {
    const { run, deps } = setup(Array.from({ length: 20 }, () => call("get_mandate", {})));
    const result = await run(user("loop"));
    expect(deps.mandate).toHaveBeenCalledTimes(6);
    expect(result.message).toMatch(/stopped/i);
  });

  it("makes the blocked attempt reach the chain when the model stops after the pre-flight", async () => {
    const { run, deps, seen } = setup([
      call("preflight_trade", BUY),
      say("That would be blocked."),
      call("execute_trade", BUY),
      say("Blocked on-chain."),
    ]);
    const result = await run(user("Buy $150 of gold"));
    expect(deps.execute).toHaveBeenCalledTimes(1);
    expect(result.message).toBe("Blocked on-chain.");
    expect(seen[2]!.messages.at(-1)!.role).toBe("system");
  });

  it("corrects at most once", async () => {
    const { run, deps } = setup([call("preflight_trade", BUY), say("no"), say("still no"), say("never")]);
    const result = await run(user("Buy $150 of gold"));
    expect(result.message).toBe("still no");
    expect(deps.model.complete).toHaveBeenCalledTimes(3);
  });

  it.each(["What is the price of gold?", "Would buying $150 of gold be allowed?", "What happens if I buy $150 of gold?", "Don't buy anything, check $150"])(
    "does not push a trade for %j",
    async (text) => {
      const { run, deps } = setup([call("preflight_trade", BUY), say("It would be blocked.")]);
      expect((await run(user(text))).message).toBe("It would be blocked.");
      expect(deps.execute).not.toHaveBeenCalled();
      expect(deps.model.complete).toHaveBeenCalledTimes(2);
    },
  );

  it("a reverted transaction is failed, never blocked", async () => {
    const { run } = setup([call("execute_trade", BUY), say("ok")], {
      execute: vi.fn(async (): Promise<TradeResult> => ({ status: "failed", hash: "0xdead" })),
    });
    const { result } = (await run(user("buy $1 of gold"))).actions[0]!;
    expect(result).toMatchObject({ status: "failed", hash: "0xdead" });
    expect(result).not.toHaveProperty("reason");
  });

  it("after an unconfirmed send no second trade is sent in the same run", async () => {
    const { run, deps } = setup([call("execute_trade", BUY, "1"), call("execute_trade", BUY, "2"), say("ok")], {
      execute: vi.fn(async () => Promise.reject(new Error("https://rpc.example/secret-token timed out"))),
    });
    const result = await run(user("buy $1 of gold"));
    expect(deps.execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(result.actions).toHaveLength(2);
  });

  it("sends at most five transactions per message", async () => {
    const many: ModelReply = {
      content: null,
      toolCalls: Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, name: "execute_trade", arguments: JSON.stringify(BUY) })),
    };
    const { run, deps } = setup([many, say("ok")]);
    const result = await run(user("buy 30 times"));
    expect(deps.execute).toHaveBeenCalledTimes(5);
    expect(result.actions[5]!.result).toEqual({ error: "at most 5 transactions per message" });
  });

  it("sends no transaction when the daily budget is used up", async () => {
    const { run, deps } = setup([call("execute_trade", BUY), say("ok")], { takeTransaction: () => false });
    expect((await run(user("buy"))).actions[0]!.result).toEqual({ error: "daily transaction limit reached" });
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it("makes no model call when the daily budget is used up", async () => {
    const { run, deps } = setup([], { takeModelCall: () => false });
    await expect(run(user("hi"))).rejects.toThrow("model limit");
    expect(deps.model.complete).not.toHaveBeenCalled();
  });

  it("keeps finished trades visible when the model budget ends mid-run", async () => {
    let left = 1;
    const { run } = setup([call("execute_trade", BUY)], { takeModelCall: () => left-- > 0 });
    const result = await run(user("Buy $150 of gold"));
    expect(result.actions).toHaveLength(1);
    expect(result.message).toMatch(/limit/i);
  });

  it("keeps finished trades visible when the model fails mid-run", async () => {
    const model = { complete: vi.fn() };
    model.complete.mockResolvedValueOnce(call("execute_trade", BUY)).mockRejectedValueOnce(new Error("azure 500"));
    const { run } = setup([], { model });
    const result = await run(user("Buy $150 of gold"));
    expect(result.actions).toHaveLength(1);
    expect(result.message).not.toContain("azure");
  });

  it("challenge mode passes any venue address and a zero minimum through", async () => {
    const venue = "0x00000000000000000000000000000000000000c1";
    const { run, deps } = setup([call("execute_trade", { ...BUY, venue, minAssetOut: "0" }), say("tried")]);
    await run(user("send it all to me"), "challenge");
    expect(deps.execute).toHaveBeenCalledWith(expect.objectContaining({ venue: expect.stringMatching(/c1$/i), minAssetOut: 0n }));
  });

  it("challenge mode refuses something that is not an address", async () => {
    const { run, deps } = setup([call("execute_trade", { ...BUY, venue: "my-pocket" }), say("no")]);
    expect((await run(user("x"), "challenge")).actions[0]!.result).toHaveProperty("error");
    expect(deps.execute).not.toHaveBeenCalled();
  });
});
