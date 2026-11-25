"use client";

import { hexToString } from "viem";
import type { MandateView } from "@/hooks/useMandate";
import { useNow } from "@/hooks/useNow";
import { countdownText } from "@/lib/time";
import { identityUrl } from "@/lib/deployment";
import { formatPpm, formatUsd } from "@/lib/units";

const strong = "font-semibold text-paint";

function periodText(seconds: bigint): string {
  const days = Number(seconds) / 86_400;
  return days === 1 ? "day" : Number.isInteger(days) ? `${days} days` : `${seconds} seconds`;
}

/** The mandate as a sentence, so the rules can be read without a legend. */
export function MandateSummary({ mandate: m }: { mandate: MandateView }) {
  const now = useNow();
  const assets = Object.entries(m.allowed).filter(([, on]) => on).map(([symbol]) => symbol);
  const windowEnd = Number(m.periodStart + m.periodSeconds);
  const windowOpen = m.periodStart > 0n && now > 0 && windowEnd > now;
  const used = m.maxPerPeriodUsd === 0n ? 0 : Math.min(100, Number((m.spent * 1000n) / m.maxPerPeriodUsd) / 10);

  return (
    <div className="space-y-4">
      {!m.active && <p className="bg-stop px-3 py-2 font-sign text-lg font-semibold text-sunken">Revoked. Every trade is blocked.</p>}
      <p className="text-lg leading-relaxed text-muted">
        The agent may buy <span className={strong}>{assets.length ? assets.join(" and ") : "nothing"}</span>, up to{" "}
        <span className={strong}>{formatUsd(m.maxPerTradeUsd)}</span> per trade and{" "}
        <span className={strong}>{formatUsd(m.maxPerPeriodUsd)}</span> per <span className={strong}>{periodText(m.periodSeconds)}</span>, for an owner
        in <span className={strong}>{hexToString(m.jurisdiction)}</span>. Prices may be at most{" "}
        <span className={strong}>{m.maxRiskAgeSeconds.toString()} s</span> old.
        {m.maxVolatilityPpm > 0 && (
          <>
            {" "}
            Trades stop when the 1h move is above <span className={strong}>{formatPpm(BigInt(m.maxVolatilityPpm))}</span>.
          </>
        )}
        {m.maxDivergencePpm > 0 && (
          <>
            {" "}
            They stop when CoinMarketCap and Atlas differ by more than <span className={strong}>{formatPpm(BigInt(m.maxDivergencePpm))}</span>.
          </>
        )}
        {m.requireMarketOpen && <> Stock tokens trade only while the US market is open.</>}
        {m.expiresAt > 0n && now > 0 && (
          <> The mandate {Number(m.expiresAt) <= now ? "has expired" : `expires in ${countdownText(Number(m.expiresAt) - now)}`}.</>
        )}
      </p>
      {m.agentRegistryId > 0n && (
        <p className="text-sm text-muted">
          Agent identity{" "}
          <a className="text-signal underline underline-offset-2" href={identityUrl(m.agentRegistryId)} target="_blank" rel="noreferrer">
            {m.agentRegistryId.toString()}
          </a>{" "}
          in the ERC-8004 registry, checked when the mandate was created
        </p>
      )}

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Held by the guard</span>
          <span className="font-sign text-3xl font-semibold">{formatUsd(m.balance)}</span>
        </div>
        <div className="mt-2 h-2 bg-sunken" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={100} aria-label="Spent this period">
          <div className="h-2 bg-signal" style={{ width: `${used}%` }} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {formatUsd(m.spent)} of {formatUsd(m.maxPerPeriodUsd)} spent
          {windowOpen ? `, resets in ${countdownText(windowEnd - now)}` : ", the period starts with the next trade"}
        </p>
      </div>
    </div>
  );
}
