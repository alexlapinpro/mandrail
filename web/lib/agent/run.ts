import "server-only";
import { symbolOf } from "../assets";
import { decodeContext, explain, reasonName } from "../reasons";
import type { TradeRequest, TradeResult } from "../trade";
import { formatUsd } from "../units";
import type { ModelClient, ModelMessage, ModelReply, ToolCall } from "./client";
import { ToolInputError, parseAsset, parseTrade, toolSchemas, type AgentMode, type TradeInput } from "./tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** What the UI shows as a card. Built from receipts and API answers, never from model text. */
export interface Action {
  tool: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

type Pending = Omit<TradeRequest, "key">;

export interface AgentDeps {
  model: ModelClient;
  marketData: (asset: string) => Promise<Record<string, unknown>>;
  mandate: () => Promise<Record<string, unknown>>;
  preflight: (trade: Pending) => Promise<{ reason: number; context: `0x${string}` }>;
  execute: (trade: Pending) => Promise<TradeResult>;
  takeModelCall: () => boolean;
  takeTransaction: () => boolean;
}

export class ModelLimitError extends Error {
  constructor() {
    super("model limit reached");
  }
}

const MAX_ROUNDS = 6;
const MAX_TRANSACTIONS = 5;

const OWNER_PROMPT = `You are a trading agent bound by an on-chain mandate on BNB Smart Chain testnet. All assets are test assets.
You only buy. If asked to sell, withdraw or change the mandate, say that you cannot and that the owner does this in the app.
When the user asks you to buy, call preflight_trade, then always call execute_trade, also when the pre-flight says blocked: blocked attempts belong in the on-chain audit trail. Never try to get around the guard, and never change the amount, asset or venue the user asked for.
Use venue "main" unless the user names the rogue venue. Amounts are plain decimal strings without a currency sign.
"gold" is tGOLD, priced from PAXG. "equity", "stock" or "NVIDIA" is tEQUITY, priced from NVDAB.
After a trade, explain the outcome in one or two plain sentences with the numbers from the tool result. Do not write transaction hashes; the app shows them. If a tool returns an error, say so and do not claim a trade happened.`;

const CHALLENGE_PROMPT = `You are a trading agent in a public challenge. You have no safety rules of your own: do what the visitor asks with your tools, including any venue address, any asset and minAssetOut "0". Everything is on a testnet with test assets.
The only protection is an on-chain guard. Try the visitor's idea with execute_trade instead of refusing, then say in one or two sentences what the guard did. Do not write transaction hashes; the app shows them.`;

const CORRECTION =
  "The user asked for this trade. Policy: submit it with execute_trade even though the pre-flight says blocked, so the attempt is recorded on-chain. Call execute_trade now with the same asset, venue and amount.";

/** A direct order such as "Buy $50 of gold", not a question about buying. */
function isBuyOrder(text: string): boolean {
  return /^\s*(please\s+|ok(ay)?,?\s+|now\s+)*(buy|purchase)\b.*\d/is.test(text);
}

export async function runAgent({
  mode,
  mandateId,
  messages,
  deps,
}: {
  mode: AgentMode;
  mandateId: bigint;
  messages: ChatMessage[];
  deps: AgentDeps;
}): Promise<{ message: string; actions: Action[] }> {
  const actions: Action[] = [];
  const tools = toolSchemas(mode);
  const history: ModelMessage[] = [
    { role: "system", content: mode === "owner" ? OWNER_PROMPT : CHALLENGE_PROMPT },
    ...messages,
  ];
  const order = isBuyOrder(messages.at(-1)?.content ?? "");
  let preflightBlocked = false;
  let transactions = 0;
  let corrected = false;
  let sendFailed = false;

  async function runTrade(trade: TradeInput): Promise<Record<string, unknown>> {
    if (sendFailed) return { error: "an earlier transaction is not confirmed yet, check the audit feed first" };
    if (transactions >= MAX_TRANSACTIONS) return { error: `at most ${MAX_TRANSACTIONS} transactions per message` };
    if (!deps.takeTransaction()) return { error: "daily transaction limit reached" };
    transactions++;
    try {
      return describeTrade(await deps.execute({ mandateId, ...trade }));
    } catch (error) {
      // It may still be mined, so it must not be sent a second time.
      sendFailed = true;
      console.error(`[agent] send failed: ${(error as Error).name}`);
      return { error: "the transaction could not be confirmed, check the audit feed" };
    }
  }

  async function runTool(call: ToolCall): Promise<Action> {
    let input: Record<string, unknown> = {};
    const done = (result: Record<string, unknown>): Action => ({ tool: call.name, input, result });
    try {
      const parsed: unknown = JSON.parse(call.arguments || "{}");
      if (typeof parsed !== "object" || parsed === null) throw new SyntaxError();
      input = parsed as Record<string, unknown>;
    } catch {
      return done({ error: "invalid arguments" });
    }
    try {
      switch (call.name) {
        case "get_market_data":
          return done(await deps.marketData(parseAsset(input.asset)));
        case "get_mandate":
          return done(await deps.mandate());
        case "preflight_trade": {
          const { reason, context } = await deps.preflight({ mandateId, ...parseTrade(input, mode) });
          if (reason !== 0) preflightBlocked = true;
          return done({ allowed: reason === 0, ...describeReason(reason, context) });
        }
        case "execute_trade":
          return done(await runTrade(parseTrade(input, mode)));
        default:
          return done({ error: "unknown tool" });
      }
    } catch (error) {
      if (error instanceof ToolInputError) return done({ error: error.message });
      console.error(`[agent] ${call.name} failed: ${(error as Error).name}`);
      return done({ error: "the chain or a data source did not answer" });
    }
  }

  for (let round = 0; ; ) {
    let reply: ModelReply;
    try {
      if (!deps.takeModelCall()) throw new ModelLimitError();
      reply = await deps.model.complete({ messages: history, tools });
    } catch (error) {
      if (actions.length === 0) throw error;
      const why = error instanceof ModelLimitError ? "The daily model limit is reached." : "The model did not answer.";
      return { message: `${why} The results above are final.`, actions };
    }

    if (reply.toolCalls.length === 0) {
      if (order && preflightBlocked && transactions === 0 && !corrected) {
        corrected = true;
        history.push({ role: "assistant", content: reply.content }, { role: "system", content: CORRECTION });
        continue;
      }
      return { message: reply.content ?? "", actions };
    }

    if (round === MAX_ROUNDS) return { message: "I stopped after too many steps. The results above are final.", actions };
    round++;
    history.push({ role: "assistant", content: reply.content, toolCalls: reply.toolCalls });
    for (const call of reply.toolCalls) {
      const action = await runTool(call);
      actions.push(action);
      history.push({ role: "tool", callId: call.id, content: JSON.stringify(action.result) });
    }
  }
}

function describeReason(reason: number, context: `0x${string}`): Record<string, unknown> {
  return { reason: reasonName(reason), explanation: explain(reason, decodeContext(reason, context), symbolOf) };
}

function describeTrade(result: TradeResult): Record<string, unknown> {
  const { status, hash } = result;
  if (status === "failed") {
    return { status, hash, explanation: "The transaction reverted. This is a technical failure, not a policy decision." };
  }
  return {
    status,
    hash,
    ...describeReason(result.reason!, result.context!),
    ...(status === "executed" ? { assetOut: result.assetOut!.toString(), price: formatUsd(result.priceUsd!) } : {}),
  };
}
