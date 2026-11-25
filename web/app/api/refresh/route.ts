import { attester } from "@/lib/attester";
import { json, readObject } from "@/lib/http";
import { pushResponse } from "@/lib/pushResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public. The attester's own limits (30 s, 500 per day) protect the CMC quota. */
export async function POST(request: Request): Promise<Response> {
  const body = await readObject(request);
  if (body?.trigger === "load") {
    await attester().ensureFresh("load");
    return json({ status: "checked" });
  }
  return pushResponse(await attester().pushNow("button"));
}
