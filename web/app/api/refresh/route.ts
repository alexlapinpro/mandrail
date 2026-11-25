import { attester } from "@/lib/attester";
import { clientIp } from "@/lib/challenge";
import { fail, json, readObject } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { pushResponse } from "@/lib/pushResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public. The attester's own limits (one push per 30 s, 150 public pushes per day) protect the CMC quota. */
export async function POST(request: Request): Promise<Response> {
  const body = await readObject(request);
  const limit = rateLimit().take("refresh", clientIp(request.headers), 12, 60_000);
  if (body?.trigger === "load") {
    if (limit.ok) await attester().ensureFresh("load");
    return json({ status: "checked" });
  }
  if (!limit.ok) return fail(429, "Too many refreshes.", { retryAfter: limit.retryAfter });
  return pushResponse(await attester().pushNow("button"));
}
