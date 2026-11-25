import { riskOracleAbi } from "@/lib/abi";
import { ASSET_LIST } from "@/lib/assets";
import { atlas } from "@/lib/atlas";
import { attester } from "@/lib/attester";
import { publicClient } from "@/lib/clients";
import { deployment } from "@/lib/deployment";
import { fail, json, logError } from "@/lib/http";
import { gapPpm } from "@/lib/units";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the guard sees on-chain, plus the live Atlas price. It does not call CMC, so open pages cost no quota:
 * the CMC numbers are the ones the attester pushed. Null means "source unavailable".
 */
export async function GET(): Promise<Response> {
  try {
    const assets = await Promise.all(
      ASSET_LIST.map(async (asset) => {
        const [risk, live] = await Promise.all([
          publicClient().readContract({
            address: deployment.riskOracle,
            abi: riskOracleAbi,
            functionName: "getRisk",
            args: [asset.address],
          }),
          asset.atlasFeedId === null ? null : atlas().getAtlas(asset.atlasFeedId),
        ]);
        const hasCmc = risk.sourceTimestamp > 0n;
        const hasAtlas = risk.atlasTimestamp > 0n;
        return {
          symbol: asset.symbol,
          reference: asset.cmcSymbol,
          cmc: hasCmc
            ? {
                price: risk.priceUsd,
                change1hPpm: risk.change1hPpm,
                change24hPpm: risk.change24hPpm,
                timestamp: risk.sourceTimestamp,
                pushedAt: risk.updatedAt,
              }
            : null,
          atlasFeed: asset.atlasFeedId !== null,
          atlas: hasAtlas ? { price: risk.atlasPriceUsd, timestamp: risk.atlasTimestamp } : null,
          atlasLive: live,
          gapPpm: hasCmc && hasAtlas ? gapPpm(risk.priceUsd, risk.atlasPriceUsd) : null,
        };
      }),
    );
    return json({ now: Math.floor(Date.now() / 1000), assets, lastPush: attester().last() });
  } catch (error) {
    logError("risk", error);
    return fail(502, "The chain did not answer.");
  }
}
