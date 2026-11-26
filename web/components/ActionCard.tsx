"use client";

import type { Action } from "@/lib/agent/run";
import { REASONS } from "@/lib/reasons";
import { Icon } from "./icons";
import { MiniRail, TxLink, Verdict } from "./ui";

type Result = Record<string, string | boolean | undefined>;

const short = (name: string) => name.toLowerCase().replaceAll("_", " ");

/** One step of the agent's work as a line of its timeline. Everything here comes from receipts and API answers. */
function Step({ action }: { action: Action }) {
  const r = action.result as Result;
  const tone = r.error ? "no" : action.tool === "preflight_trade" && !r.allowed ? "no" : "ok";
  let text: React.ReactNode;
  if (r.error) text = <>Could not {action.tool.replaceAll("_", " ")}: {r.error}</>;
  else if (action.tool === "get_market_data")
    text = (
      <>
        Read CoinMarketCap · {r.reference} <span className="mono">${Number(r.priceUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>, 1h{" "}
        <span className="mono">{r.change1h}</span>
        {r.atlasPrice ? (
          <>
            {" "}
            · Atlas <span className="mono">{r.atlasPrice}</span>
          </>
        ) : null}
      </>
    );
  else if (action.tool === "get_mandate")
    text = (
      <>
        Read the mandate · <span className="mono">{r.balance}</span> held, <span className="mono">{r.spentThisPeriod}</span> spent
      </>
    );
  else if (action.tool === "preflight_trade")
    text = r.allowed ? (
      "Pre-flight: the guard would allow it"
    ) : (
      <>
        Pre-flight: the guard would block it · <span className="text-faint">sent anyway, so it is on record</span>
      </>
    );
  else text = action.tool;
  return (
    <li className="relative text-[13.5px]">
      <span className={`absolute -left-[24px] top-[5px] h-2.5 w-2.5 rounded-full border-2 ${tone === "ok" ? "border-pass bg-panel" : "border-stop bg-stop"}`} />
      {text}
    </li>
  );
}

function Receipt({ action }: { action: Action }) {
  const r = action.result as Result;
  if (r.error) return null;
  if (r.status === "failed") {
    return (
      <div className="rounded-2xl border border-caution/40 bg-bg p-4">
        <p className="text-lg font-extrabold tracking-[-0.03em] text-caution">Failed, no policy decision</p>
        <p className="mt-1 text-[13.5px] text-muted">{r.explanation}</p>
        <div className="mt-3 border-t border-dashed border-line2 pt-3">
          <TxLink hash={r.hash as string} />
        </div>
      </div>
    );
  }
  const reason = REASONS.indexOf(r.reason as (typeof REASONS)[number]);
  const allowed = reason === 0;
  return (
    <div className={`rounded-2xl border bg-bg p-4 ${allowed ? "border-pass/40 bg-[linear-gradient(180deg,#2fd38a10,transparent_40%)]" : "border-stop/40 bg-[linear-gradient(180deg,#f6465d10,transparent_40%)]"}`}>
      <div className="flex items-start justify-between gap-3">
        <Verdict reason={reason} className="text-[19px]" />
        <span className="cap whitespace-nowrap">signed by agent</span>
      </div>
      <div className="my-3.5">
        <MiniRail reason={reason} />
      </div>
      <p className="text-[13.5px] text-muted">{allowed ? `Bought ${r.bought} at ${r.price}. The tokens went straight to the owner.` : r.explanation}</p>
      <div className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-line2 pt-3 text-xs text-faint">
        <TxLink hash={r.hash as string} />
        <span>{allowed ? "executed" : `stopped at ${String(reason).padStart(2, "0")} · ${short(String(r.reason))}`}</span>
        <span>{allowed ? "recorded on-chain" : "nothing spent"}</span>
      </div>
    </div>
  );
}

export function AgentReply({ actions, message }: { actions: Action[]; message: string }) {
  const steps = actions.filter((a) => a.tool !== "execute_trade" || (a.result as Result).error);
  const trades = actions.filter((a) => a.tool === "execute_trade" && !(a.result as Result).error);
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] border border-line2 bg-raised">
        <Icon name="bot" size={16} />
      </span>
      <div className="min-w-0 flex-1 space-y-3.5">
        {steps.length > 0 && <ol className="ml-[14px] space-y-2.5 border-l-2 border-line2 pl-[18px]">{steps.map((a, i) => <Step key={i} action={a} />)}</ol>}
        {trades.map((a, i) => (
          <Receipt key={i} action={a} />
        ))}
        {message && <p className="whitespace-pre-wrap">{message}</p>}
      </div>
    </div>
  );
}

/** Kept for callers that render a single action. */
export function ActionCard({ action }: { action: Action }) {
  return <AgentReply actions={[action]} message="" />;
}
