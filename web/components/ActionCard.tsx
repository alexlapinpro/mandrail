"use client";

import type { Action } from "@/lib/agent/run";
import { REASONS } from "@/lib/reasons";
import { Rail, TxLink, Verdict } from "./ui";

/** One tool call. Everything shown here comes from receipts and API answers, not from the model's text. */
export function ActionCard({ action }: { action: Action }) {
  const r = action.result as Record<string, string | boolean | undefined>;
  if (r.error) return <Card>{`${LABELS[action.tool] ?? action.tool}: ${r.error}`}</Card>;

  switch (action.tool) {
    case "get_market_data":
      return (
        <Card>
          Checked CoinMarketCap: {r.reference} ${Number(r.priceUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })}, 1h {r.change1h}
          {r.atlasPrice ? `. Atlas: ${r.atlasPrice}` : ""}
        </Card>
      );
    case "get_mandate":
      return <Card>Read the mandate: {r.balance} held, {r.spentThisPeriod} spent this period</Card>;
    case "preflight_trade":
      return <Card>Pre-flight: {r.allowed ? "the guard would allow it" : `the guard would block it. ${r.explanation}`}</Card>;
    case "execute_trade": {
      if (r.status === "failed") {
        return (
          <Card>
            <p className="font-sign text-lg font-semibold text-caution">Failed, no policy decision</p>
            <p>{r.explanation}</p>
            <TxLink hash={r.hash as string} />
          </Card>
        );
      }
      const reason = REASONS.indexOf(r.reason as (typeof REASONS)[number]);
      return (
        <Card>
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Verdict reason={reason} />
              <span className="text-sm text-muted">Signed by agent</span>
            </div>
            <Rail reason={reason} />
            {reason !== 0 && <p>{r.explanation}</p>}
            {reason === 0 && <p>Bought {r.bought} at {r.price}. The tokens went straight to the owner.</p>}
            <TxLink hash={r.hash as string} />
          </div>
        </Card>
      );
    }
    default:
      return <Card>{action.tool}</Card>;
  }
}

const LABELS: Record<string, string> = {
  get_market_data: "Market data",
  get_mandate: "Mandate",
  preflight_trade: "Pre-flight",
  execute_trade: "Trade",
};

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-plate px-3 py-2 text-[15px]">{children}</div>;
}
