"use client";

import { useRisk, type RiskView } from "@/hooks/useApi";
import { useNow } from "@/hooks/useNow";
import { sourceState } from "@/lib/sourceState";
import { ageText } from "@/lib/time";
import { formatPpm, formatUsd } from "@/lib/units";
import { AssetAvatar, Pill } from "../ui";

const tone = (ppm: string) => (BigInt(ppm) < 0n ? "text-stop" : "text-pass");

function Fig({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`whitespace-nowrap border-r border-line px-4 py-2 text-[13.5px] ${className}`}>
      <span className="cap block">{label}</span>
      {children}
    </div>
  );
}

function Asset({ asset, now }: { asset: RiskView["assets"][number]; now: number }) {
  const cmcOld = sourceState(asset.cmc?.timestamp ?? null, now, 900) !== "ok";
  return (
    <>
      <div className="flex items-center gap-3 whitespace-nowrap border-r border-line px-4 py-2">
        <AssetAvatar symbol={asset.symbol} />
        <div>
          <span className="block text-base font-extrabold tracking-[-0.02em]">{asset.symbol}</span>
          <span className="cap">test asset · ref {asset.reference}</span>
        </div>
      </div>
      <Fig label="CoinMarketCap" className="mono">
        {asset.cmc ? <span className={cmcOld ? "text-caution" : ""}>{formatUsd(BigInt(asset.cmc.price))}</span> : <span className="text-caution">unavailable</span>}
      </Fig>
      {asset.atlasFeed && (
        <Fig label="Atlas" className="mono">
          {asset.atlas ? formatUsd(BigInt(asset.atlas.price)) : <span className="text-caution">unavailable</span>}
        </Fig>
      )}
      {asset.gapPpm !== null && (
        <Fig label="Gap" className="mono">
          <span className="text-caution">{formatPpm(BigInt(asset.gapPpm))}</span>
        </Fig>
      )}
      {asset.cmc && (
        <Fig label="1h move" className="mono">
          <span className={tone(asset.cmc.change1hPpm)}>{formatPpm(BigInt(asset.cmc.change1hPpm))}</span>
        </Fig>
      )}
      {asset.atlasFeed && (
        <Fig label="US market">
          <Pill className="!h-5">{asset.marketOpen ? "Open" : "Closed"}</Pill>
        </Fig>
      )}
    </>
  );
}

export function MarketStrip() {
  const { data, isError } = useRisk();
  const now = useNow();
  const pushed = data?.assets.map((a) => Number(a.cmc?.pushedAt ?? 0)).reduce((a, b) => Math.max(a, b), 0) ?? 0;
  return (
    <div className="flex overflow-x-auto border-b border-line bg-panel" aria-label="Live market data">
      {data?.assets.map((asset) => <Asset key={asset.symbol} asset={asset} now={now} />)}
      <Fig label="On-chain">
        {isError ? (
          <Pill tone="no">unavailable</Pill>
        ) : (
          <Pill tone="ok" live className="!h-5">
            {pushed && now ? `${ageText(now - pushed)} ago` : "…"}
          </Pill>
        )}
      </Fig>
      {!data && !isError && <div className="px-4 py-3 text-muted">Reading prices…</div>}
    </div>
  );
}
