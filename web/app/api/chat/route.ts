import { access } from "@/lib/access";
import { parseMessages } from "@/lib/agent/messages";
import { ModelLimitError, runAgent } from "@/lib/agent/run";
import { agentDeps } from "@/lib/agent/wiring";
import { fail, json, logError, readObject } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = await readObject(request);
  const messages = parseMessages(body?.messages);
  if (!body || !messages) return fail(400, "Send 1 to 2,000 characters of text.");
  const claim = body as unknown as { mandateId: string; expires: number; signature: string };

  try {
    const allowed = await access().verify(claim);
    if (allowed === "unknown-mandate") return fail(404, "This mandate does not exist.");
    if (allowed !== "ok") return fail(403, "Sign to chat again: only the mandate owner can use its agent.");
  } catch (error) {
    logError("chat", error);
    return fail(502, "The chain did not answer. Try again.");
  }

  const limit = rateLimit().take("chat", claim.mandateId, 10, 60_000);
  if (!limit.ok) return fail(429, "Too many messages.", { retryAfter: limit.retryAfter });

  try {
    const mandateId = BigInt(claim.mandateId);
    return json(await runAgent({ mode: "owner", mandateId, messages, deps: agentDeps("owner", mandateId) }));
  } catch (error) {
    if (error instanceof ModelLimitError) return fail(429, "The daily model limit is reached.");
    logError("chat", error);
    return fail(502, "The model is not available right now. Nothing was traded.");
  }
}
