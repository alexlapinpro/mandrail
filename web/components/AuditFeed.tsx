"use client";

import { useState } from "react";
import { useAudit } from "@/hooks/useApi";
import { useNow } from "@/hooks/useNow";
import { symbolOf } from "@/lib/assets";
import { ageText } from "@/lib/time";
import { formatUsd } from "@/lib/units";
import { Notice, Panel, Rail, TxLink, Verdict } from "./ui";

export function AuditFeed({ mandateId }: { mandateId: bigint | null }) {
  const [onlyMine, setOnlyMine] = useState(true);
  const filter = onlyMine ? mandateId : null;
  const { data, isError } = useAudit(filter);
  const now = useNow();

  return (
    <Panel
      title="Decisions on-chain"
      aside={
        mandateId !== null && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="accent-signal" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Only mandate {mandateId.toString()}
          </label>
        )
      }
    >
      {(isError || data?.stale) && (
        <div className="mb-3">
          <Notice tone="info">The feed may miss the newest decisions. It retries by itself.</Notice>
        </div>
      )}
      {!data && !isError && <p className="text-muted">Reading the chain…</p>}
      {data?.rows.length === 0 && <p className="text-muted">No trades yet. Ask the agent to buy something.</p>}
      <ul className="max-h-[640px] space-y-5 overflow-y-auto pr-1">
        {data?.rows.map((row) => (
          <li key={row.id} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <Verdict reason={row.reason} unauthorised={row.unauthorised} />
              <span className="text-sm text-muted">{now > 0 && `${ageText(now - row.time)} ago`}</span>
            </div>
            <p>
              {formatUsd(BigInt(row.usd))} of {symbolOf(row.asset)}, mandate {row.mandateId}
            </p>
            <Rail reason={row.reason} />
            {row.kind === "blocked" && <p className="text-sm">{row.explanation}</p>}
            <TxLink hash={row.txHash} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
