"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, postJson, useRisk, type RiskView } from "@/hooks/useApi";
import { useMandate, type MandateView } from "@/hooks/useMandate";
import { useNow } from "@/hooks/useNow";
import { ageText } from "@/lib/time";
import { formatPpm, formatUsd } from "@/lib/units";
import { Button, Notice, Panel } from "./ui";

export function RiskPanel({ mandateId }: { mandateId: bigint | null }) {
  const { data, isError } = useRisk();
  const { mandate } = useMandate(mandateId);
  const now = useNow();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const wait = cooldownUntil - now;

  useEffect(() => {
    void postJson("/api/refresh", { trigger: "load" })
      .then(() => queryClient.invalidateQueries({ queryKey: ["risk"] }))
      .catch(() => {});
  }, [queryClient]);

  const refresh = async () => {
    setBusy(true);
    setNote(null);
    try {
      await postJson("/api/refresh", { trigger: "button" });
      setCooldownUntil(now + 30);
      await queryClient.invalidateQueries({ queryKey: ["risk"] });
    } catch (error) {
      const e = error as ApiError;
      if (e.retryAfter) setCooldownUntil(now + e.retryAfter);
      else if (e.status === 429) setNote("Today's refreshes are used up. Prices still update every few minutes.");
      else if (e.status === 503) setNote("CoinMarketCap is unavailable. The last prices stay.");
      else setNote("The update did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Live risk data"
      aside={
        <Button disabled={busy || wait > 0} onClick={refresh}>
          {busy ? "Refreshing" : wait > 0 ? `Refresh in ${wait} s` : "Refresh risk data"}
        </Button>
      }
    >
      {note && <Notice tone="info">{note}</Notice>}
      {isError && <Notice tone="error">Price data could not be read. Retrying.</Notice>}
      {!data && !isError && <p className="text-muted">Reading prices…</p>}
      <div className="space-y-5">
        {data?.assets.map((asset) => <AssetRisk key={asset.symbol} asset={asset} mandate={mandate} now={now} />)}
      </div>
    </Panel>
  );
}

function AssetRisk({ asset, mandate, now }: { asset: RiskView["assets"][number]; mandate: MandateView | null; now: number }) {
  const { cmc, atlas } = asset;
  const age = (timestamp: string) => (now ? ageText(now - Number(timestamp)) : "");
  const move = cmc ? BigInt(cmc.change1hPpm) : null;
  const gap = asset.gapPpm === null ? null : BigInt(asset.gapPpm);
  return (
    <div>
      <p className="mb-1.5">
        <span className="font-sign text-lg font-semibold">{asset.symbol}</span>{" "}
        <span className="text-sm text-muted">Test asset, reference price: {asset.reference}</span>
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        <Source name="CoinMarketCap" price={cmc?.price ?? null} age={cmc ? age(cmc.timestamp) : ""} />
        {asset.atlasFeed ? (
          <Source name="Atlas" price={atlas?.price ?? null} age={atlas ? age(atlas.timestamp) : ""} />
        ) : (
          <div>
            <dt className="text-sm text-muted">Atlas</dt>
            <dd className="text-muted">No Atlas feed</dd>
          </div>
        )}
      </dl>
      {cmc && move !== null && (
        <ul className="mt-2 space-y-0.5 text-sm">
          <Breaker label="1h move" value={move} limit={mandate?.maxVolatilityPpm} />
          <li className="flex justify-between text-muted">
            <span>24h move</span>
            <span>{formatPpm(BigInt(cmc.change24hPpm))}</span>
          </li>
          {gap !== null && <Breaker label="CMC and Atlas gap" value={gap} limit={mandate?.maxDivergencePpm} />}
        </ul>
      )}
    </div>
  );
}

function Source({ name, price, age }: { name: string; price: string | null; age: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{name}</dt>
      {price === null ? (
        <dd className="text-caution">Source unavailable</dd>
      ) : (
        <dd>
          <span className="font-sign text-2xl font-semibold">{formatUsd(BigInt(price))}</span>{" "}
          <span className="text-sm text-muted">{age && `${age} old`}</span>
        </dd>
      )}
    </div>
  );
}

function Breaker({ label, value, limit }: { label: string; value: bigint; limit: number | undefined }) {
  const size = value < 0n ? -value : value;
  const trips = !!limit && size > BigInt(limit);
  return (
    <li className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={trips ? "text-stop" : ""}>
        {formatPpm(value)}
        {limit ? `, limit ${formatPpm(BigInt(limit))}${trips ? ", trades stop" : ""}` : limit === 0 ? ", breaker off" : ""}
      </span>
    </li>
  );
}
