import type { ChatMessage } from "./run";

export const MAX_CHARS = 2000;
const KEEP = 20;

/** Accepts only user and assistant text. Null when anything else is sent. */
export function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) return null;
  const messages: ChatMessage[] = [];
  for (const item of value.slice(-KEEP) as { role?: unknown; content?: unknown }[]) {
    if (item?.role !== "user" && item?.role !== "assistant") return null;
    if (typeof item.content !== "string") return null;
    if (item.role === "user" && item.content.length > MAX_CHARS) return null;
    messages.push({ role: item.role, content: item.content.slice(0, 2 * MAX_CHARS) });
  }
  const last = messages.at(-1)!;
  return last.role === "user" && last.content.trim() ? messages : null;
}
