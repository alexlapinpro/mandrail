import { clientIp } from "@/lib/challenge";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** With ?ip it shows the caller's own address headers, to check which one the hosting proxy sets. */
export async function GET(request: Request): Promise<Response> {
  // Railway sets the commit it deployed; nothing secret.
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA;
  const commit = sha ? { commit: sha.slice(0, 7) } : {};
  if (!new URL(request.url).searchParams.has("ip")) return json({ ok: true, ...commit });
  return json({
    ok: true,
    ...commit,
    forwardedFor: request.headers.get("x-forwarded-for"),
    realIp: request.headers.get("x-real-ip"),
    limitKey: clientIp(request.headers),
  });
}
