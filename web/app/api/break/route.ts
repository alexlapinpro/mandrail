import { parseMessages } from "@/lib/agent/messages";
import { ModelLimitError, runAgent } from "@/lib/agent/run";
import { agentDeps } from "@/lib/agent/wiring";
import { symbolOf } from "@/lib/assets";
import { audit } from "@/lib/audit";
import { classify, clientIp, stats } from "@/lib/challenge";
import { challengeMandate } from "@/lib/challengeMandate";
import { deployment } from "@/lib/deployment";
import { fail, json, logError, readObject } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { decodeContext, explain, reasonName } from "@/lib/reasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECENT = 30;
const notReady = () => fail(503, "The challenge is not set up yet.");

/** Public chat with the unguarded agent. The chain is the only thing that protects the money. */
export async function POST(request: Request): Promise<Response> {
  if (!deployment.challengeMandateId) return notReady();
  const messages = parseMessages((await readObject(request))?.messages);
  if (!messages) return fail(400, "Send 1 to 2,000 characters of text.");

  const limit = rateLimit().take("break", clientIp(request.headers), 5, 60_000);
  if (!limit.ok) return fail(429, "Too many messages.", { retryAfter: limit.retryAfter });

  try {
    const mandateId = BigInt(deployment.challengeMandateId);
    return json(await runAgent({ mode: "challenge", mandateId, messages, deps: agentDeps("challenge", mandateId) }));
  } catch (error) {
    if (error instanceof ModelLimitError) return fail(503, "Today's attempts are used up. The results stay visible.");
    logError("break", error);
    return fail(502, "The agent is not available right now.");
  }
}

/** Statistics and recent attempts, from chain events only. */
export async function GET(): Promise<Response> {
  if (!deployment.challengeMandateId) return notReady();
  try {
    const id = BigInt(deployment.challengeMandateId);
    const [mandate, feed] = await Promise.all([challengeMandate(id), audit().getAudit({ mandateId: id, limit: 100_000 })]);
    return json({
      stale: feed.stale,
      mandate,
      stats: stats(feed.rows, mandate),
      recent: feed.rows.slice(0, RECENT).map((row) => ({
        ...row,
        verdict: classify(row, mandate),
        reasonName: reasonName(row.reason),
        explanation: explain(row.reason, decodeContext(row.reason, row.context), symbolOf),
      })),
    });
  } catch (error) {
    logError("break", error);
    return fail(502, "The chain did not answer.");
  }
}
