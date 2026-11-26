import { riskOracleAbi } from "@/lib/abi";
import { ASSETS, symbolOf } from "@/lib/assets";
import { audit } from "@/lib/audit";
import { createCached } from "@/lib/cached";
import { stats } from "@/lib/challenge";
import { publicClient } from "@/lib/clients";
import { deployment } from "@/lib/deployment";
import { fail, json, logError } from "@/lib/http";
import { overview } from "@/lib/overview";
import { decodeContext, explain, reasonName } from "@/lib/reasons";
import { singleton } from "@/lib/singleton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WAD = 10n ** 18n;
/** The challenge mandate's limits, as SetupChallenge created them. */
const CHALLENGE = { allowedAssets: [ASSETS.tGOLD.address], maxPerTrade: 5n * WAD, maxPerPeriod: 50n * WAD, periodSeconds: 86_400 };

async function readOverview() {
  const now = Math.floor(Date.now() / 1000);
  const [{ rows }, risk] = await Promise.all([
    audit().getAudit({ limit: 100_000 }),
    publicClient().readContract({
      address: deployment.riskOracle,
      abi: riskOracleAbi,
      functionName: "getRisk",
      args: [ASSETS.tGOLD.address],
    }),
  ]);
  const challengeId = BigInt(deployment.challengeMandateId || 0);
  const summary = overview(rows, now);
  const latest = summary.latest;
  return {
    ...summary,
    latest: latest && {
      ...latest,
      reasonName: reasonName(latest.reason),
      explanation: explain(latest.reason, decodeContext(latest.reason, latest.context), symbolOf),
      context: decodeContext(latest.reason, latest.context),
    },
    challenge: stats(
      rows.filter((row) => row.mandateId === challengeId),
      CHALLENGE,
    ),
    priceAge: risk.sourceTimestamp > 0n ? now - Number(risk.sourceTimestamp) : null,
  };
}

/** Numbers for the landing page, shared among all visitors for a few seconds. */
const shared = () => singleton("overview", () => createCached(readOverview, 4_000));

export async function GET(): Promise<Response> {
  try {
    return json(await shared()());
  } catch (error) {
    logError("overview", error);
    return fail(502, "The chain did not answer.");
  }
}
