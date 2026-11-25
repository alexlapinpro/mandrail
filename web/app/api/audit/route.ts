import { symbolOf } from "@/lib/assets";
import { audit } from "@/lib/audit";
import { fail, json } from "@/lib/http";
import { decodeContext, explain, reasonName } from "@/lib/reasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("mandateId");
  if (id !== null && !/^[1-9]\d{0,9}$/.test(id)) return fail(400, "mandateId must be a number.");

  const { rows, stale, head } = await audit().getAudit(id === null ? {} : { mandateId: BigInt(id) });
  return json({
    stale,
    head,
    rows: rows.map((row) => {
      const context = decodeContext(row.reason, row.context);
      return { ...row, context, reasonName: reasonName(row.reason), explanation: explain(row.reason, context, symbolOf) };
    }),
  });
}
