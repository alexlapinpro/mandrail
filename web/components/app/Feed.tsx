"use client";

import { useState } from "react";
import { useAudit } from "@/hooks/useApi";
import { useNow } from "@/hooks/useNow";
import { symbolOf } from "@/lib/assets";
import { ageText } from "@/lib/time";
import { formatUsd } from "@/lib/units";
import { AssetAvatar, Card, CardHead, MiniRail, Notice, TxLink } from "../ui";

const short = (name: string) => name.toLowerCase().replaceAll("_", " ");

export function Feed({ mandateId }: { mandateId: bigint | null }) {
  const [mine, setMine] = useState(true);
  const [strangers, setStrangers] = useState(false);
  const filter = mine ? mandateId : null;
  const { data, isError } = useAudit(filter);
  const now = useNow();
  const rows = data?.rows.filter((row) => strangers || !row.unauthorised);
  const hidden = data ? data.rows.filter((row) => row.unauthorised).length + data.hiddenUnauthorised : 0;

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHead
        title="Decisions on-chain"
        aside={
          mandateId !== null && (
            <div className="grid grid-flow-col gap-[3px] rounded-[10px] border border-line bg-bg p-[3px] text-[12.5px] font-semibold" role="radiogroup" aria-label="Show">
              {[
                [true, "Mine"],
                [false, "All"],
              ].map(([value, label]) => (
                <button
                  key={label as string}
                  type="button"
                  role="radio"
                  aria-checked={mine === value}
                  onClick={() => setMine(value as boolean)}
                  className={`rounded-[7px] px-3 py-1 ${mine === value ? "bg-raised text-text" : "text-muted"}`}
                >
                  {label as string}
                </button>
              ))}
            </div>
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {(isError || data?.stale) && (
          <div className="p-3">
            <Notice tone="info">The feed may miss the newest decisions. It retries by itself.</Notice>
          </div>
        )}
        {!data && !isError && <p className="p-5 text-muted">Reading the chain…</p>}
        {rows?.length === 0 && <p className="p-5 text-muted">No trades yet. Ask the agent to buy something.</p>}
        {hidden > 0 && (
          <p className="border-b border-line px-[18px] py-2.5 text-[12.5px] text-faint">
            {hidden} {hidden === 1 ? "attempt" : "attempts"} by unauthorised callers, all blocked.{" "}
            <button type="button" className="text-signal hover:underline" onClick={() => setStrangers((v) => !v)}>
              {strangers ? "Hide" : "Show"}
            </button>
          </p>
        )}
        <ul>
          {rows?.map((row) => (
            <li key={row.id} className="grid grid-cols-[auto_1fr_auto] gap-x-3 border-b border-line px-[18px] py-3.5">
              <AssetAvatar symbol={symbolOf(row.asset)} />
              <div className="min-w-0">
                <div className={`text-sm font-semibold ${row.reason === 0 ? "text-pass" : "text-stop"}`}>
                  {row.reason === 0 ? "Allowed" : row.unauthorised ? "Blocked · unauthorised caller" : `Blocked · ${short(row.reasonName)}`}
                </div>
                <div className="mono mt-0.5 truncate text-xs text-faint">
                  {formatUsd(BigInt(row.usd))} {symbolOf(row.asset)} · mandate {row.mandateId}
                </div>
              </div>
              <div className="mono text-right text-xs text-faint">{now > 0 && ageText(now - row.time)}</div>
              <div className="col-span-2 col-start-2 mt-2.5">
                <MiniRail reason={row.reason} />
                {row.reason !== 0 && <p className="mt-2 text-[12.5px] text-muted">{row.explanation}</p>}
                <div className="mt-1.5">
                  <TxLink hash={row.txHash} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
