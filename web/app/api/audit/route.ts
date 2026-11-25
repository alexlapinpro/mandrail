import { symbolOf } from "@/lib/assets";
import { audit } from "@/lib/audit";
import { fail, json } from "@/lib/http";
import { decodeContext, explain, reasonName } from "@/lib/reasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOWN = { authorised: 200, unauthorised: 30 };

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("mandateId");
  if (id !== null && !/^[1-9]\d{0,9}$/.test(id)) return fail(400, "mandateId must be a number.");

  const { rows, stale, head } = await audit().getAudit({
    ...(id === null ? {} : { mandateId: BigInt(id) }),
    limit: 100_000,
  });
  // Anyone can call the guard and be recorded as NOT_AGENT, so those rows get their own small share.
  let authorised = 0;
  let unauthorised = 0;
  const shown = rows.filter((row) => (row.unauthorised ? ++unauthorised <= SHOWN.unauthorised : ++authorised <= SHOWN.authorised));
  return json({
    stale,
    head,
    hiddenUnauthorised: Math.max(0, unauthorised - SHOWN.unauthorised),
    rows: shown.map((row) => {
      const context = decodeContext(row.reason, row.context);
      return { ...row, context, reasonName: reasonName(row.reason), explanation: explain(row.reason, context, symbolOf) };
    }),
  });
}
