import { marketCalendarAbi, riskOracleAbi } from "@/lib/abi";
import { ASSET_LIST } from "@/lib/assets";
import { attester } from "@/lib/attester";
import { createCached } from "@/lib/cached";
import { publicClient } from "@/lib/clients";
import { deployment } from "@/lib/deployment";
import { fail, json, logError } from "@/lib/http";
import { mainnetCheck } from "@/lib/mainnetCheck";
import { singleton } from "@/lib/singleton";
import { gapPpm } from "@/lib/units";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the guard sees on-chain. It does not call CMC: the CMC numbers are the ones the attester pushed.
 * A source is null when there never was a price; the page judges old prices by their age.
 */
async function readRisk() {
  const now = Math.floor(Date.now() / 1000);
  const assets = await Promise.all(
    ASSET_LIST.map(async (asset) => {
      const [risk, marketOpen] = await Promise.all([
        publicClient().readContract({
          address: deployment.riskOracle,
          abi: riskOracleAbi,
          functionName: "getRisk",
          args: [asset.address],
        }),
        publicClient().readContract({
          address: deployment.marketCalendar,
          abi: marketCalendarAbi,
          functionName: "isOpen",
          args: [asset.address, BigInt(now)],
        }),
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
        marketOpen,
        mainnet: hasCmc && asset.atlasFeedId !== null ? await mainnetCheck().run(asset.atlasFeedId, risk.priceUsd) : null,
        gapPpm: hasCmc && hasAtlas ? gapPpm(risk.priceUsd, risk.atlasPriceUsd) : null,
      };
    }),
  );
  return { now, assets, lastPush: attester().last() };
}

/** One round of reads serves every open page for a few seconds, so a crowd cannot use up the RPC that trades need. */
const sharedRisk = () => singleton("risk", () => createCached(readRisk, 4_000));

export async function GET(): Promise<Response> {
  try {
    return json(await sharedRisk()());
  } catch (error) {
    logError("risk", error);
    return fail(502, "The chain did not answer.");
  }
}
