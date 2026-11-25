import "server-only";
import type { PushResult } from "./attester";
import { json } from "./http";

const STATUS: Record<PushResult["status"], number> = {
  pushed: 200,
  cooldown: 429,
  "daily-limit": 429,
  unavailable: 503,
  failed: 502,
};

/** The raw error stays on the server: RPC errors can contain URLs with keys. */
export function pushResponse(result: PushResult): Response {
  return json(result.status === "failed" ? { status: "failed" } : result, STATUS[result.status]);
}
