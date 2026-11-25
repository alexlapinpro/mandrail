import { clientIp } from "@/lib/challenge";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** With ?ip it shows the caller's own address headers, to check which one the hosting proxy sets. */
export async function GET(request: Request): Promise<Response> {
  if (!new URL(request.url).searchParams.has("ip")) return json({ ok: true });
  return json({
    ok: true,
    forwardedFor: request.headers.get("x-forwarded-for"),
    realIp: request.headers.get("x-real-ip"),
    limitKey: clientIp(request.headers),
  });
}
