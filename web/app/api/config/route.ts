import { accountOf } from "@/lib/clients";
import { fail, json, logError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public addresses the browser needs. Never keys. */
export async function GET(): Promise<Response> {
  try {
    return json({ agent: accountOf("agent").address });
  } catch (error) {
    logError("config", error);
    return fail(503, "The agent is not configured.");
  }
}
