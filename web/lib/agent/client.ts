import "server-only";
import { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { requireEnv } from "../clients";
import { singleton } from "../singleton";
import { ContentFilterError } from "./errors";
import type { ToolSchema } from "./tools";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ModelReply {
  content: string | null;
  toolCalls: ToolCall[];
}

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; callId: string; content: string };

export interface ModelClient {
  complete(request: { messages: ModelMessage[]; tools: ToolSchema[] }): Promise<ModelReply>;
}

function toOpenAi(message: ModelMessage): ChatCompletionMessageParam {
  if (message.role === "tool") return { role: "tool", tool_call_id: message.callId, content: message.content };
  if (message.role !== "assistant") return { role: message.role, content: message.content };
  if (!message.toolCalls?.length) return { role: "assistant", content: message.content ?? "" };
  return {
    role: "assistant",
    content: message.content,
    tool_calls: message.toolCalls.map((call) => ({
      id: call.id,
      type: "function" as const,
      function: { name: call.name, arguments: call.arguments },
    })),
  };
}

export const azureModel = (): ModelClient =>
  singleton("azureModel", () => {
    const deployment = requireEnv("AZURE_OPENAI_DEPLOYMENT");
    const client = new AzureOpenAI({
      endpoint: requireEnv("AZURE_OPENAI_ENDPOINT"),
      apiKey: requireEnv("AZURE_OPENAI_API_KEY"),
      apiVersion: requireEnv("AZURE_OPENAI_API_VERSION"),
      deployment,
      timeout: 30_000,
      maxRetries: 1,
      // Without this Next.js may answer a repeated prompt from its disk cache.
      fetchOptions: { cache: "no-store" },
    });
    return {
      async complete({ messages, tools }) {
        const response = await client.chat.completions
          .create({
          model: deployment,
          messages: messages.map(toOpenAi),
          tools: tools.map((tool) => ({
            type: "function" as const,
            function: { name: tool.name, description: tool.description, parameters: { ...tool.parameters } },
          })),
        })
          .catch((error: { code?: string }) => {
            throw error.code === "content_filter" ? new ContentFilterError() : error;
          });
        const choice = response.choices[0];
        if (choice?.finish_reason === "content_filter") throw new ContentFilterError();
        const message = choice?.message;
        return {
          content: message?.content ?? null,
          toolCalls: (message?.tool_calls ?? []).flatMap((call) =>
            call.type === "function"
              ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }]
              : [],
          ),
        };
      },
    };
  });
