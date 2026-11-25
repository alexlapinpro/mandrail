import { createHash, timingSafeEqual } from "node:crypto";
import { attester } from "@/lib/attester";
import { fail } from "@/lib/http";
import { pushResponse } from "@/lib/pushResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const digest = (text: string) => createHash("sha256").update(text).digest();

/** For scripts. The browser uses /api/refresh and never sees the secret. */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.ATTEST_SECRET;
  const given = request.headers.get("x-attest-secret") ?? "";
  if (!secret || !timingSafeEqual(digest(given), digest(secret))) return fail(401, "Wrong secret.");
  return pushResponse(await attester().pushNow("api"));
}
