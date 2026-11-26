"use client";

import { useState } from "react";
import { erc20Abi } from "viem";
import type { MandateView } from "@/hooks/useMandate";
import { useNow } from "@/hooks/useNow";
import { useTx } from "@/hooks/useTx";
import { policyGuardAbi } from "@/lib/abi";
import { deployment, identityUrl } from "@/lib/deployment";
import { countdownText } from "@/lib/time";
import { formatUsd, parseUsd } from "@/lib/units";
import { Icon } from "../icons";
import { Button, Card, Notice, Pill, SignedBy, TxLink } from "../ui";

const guard = { address: deployment.policyGuard, abi: policyGuardAbi } as const;

function periodText(seconds: bigint): string {
  const days = Number(seconds) / 86_400;
  return days === 1 ? "day" : days === 7 ? "week" : Number.isInteger(days) ? `${days} days` : `${seconds} s`;
}

export function MandateCard({ mandate: m, walletBalance }: { mandate: MandateView; walletBalance: bigint | undefined }) {
  const now = useNow();
  const tx = useTx();
  const [amount, setAmount] = useState("100");
  const [input, setInput] = useState<string | null>(null);
  const used = m.maxPerPeriodUsd === 0n ? 0 : Math.min(100, Number((m.spent * 1000n) / m.maxPerPeriodUsd) / 10);
  const windowEnd = Number(m.periodStart + m.periodSeconds);
  const windowOpen = m.periodStart > 0n && now > 0 && windowEnd > now;

  const run = (kind: "deposit" | "withdraw") => {
    setInput(null);
    let value: bigint;
    try {
      value = parseUsd(amount);
    } catch {
      return setInput("Use a plain amount above zero, for example 100.");
    }
    if (kind === "deposit") {
      if (walletBalance !== undefined && value > walletBalance) return setInput("Not enough test USD in your wallet.");
      void tx.run(
        "deposit",
        "Deposited.",
        { address: deployment.usd, abi: erc20Abi, functionName: "approve", args: [deployment.policyGuard, value] },
        { ...guard, functionName: "deposit", args: [m.id, value] },
      );
    } else {
      void tx.run("withdraw", "Withdrawn to your wallet.", { ...guard, functionName: "withdraw", args: [m.id, value] });
    }
  };

  return (
    <Card className="p-[18px]">
      <div className="flex items-center justify-between">
        <Pill tone={m.active ? "ok" : "no"} live>
          Mandate {m.id.toString()} · {m.active ? "active" : "revoked"}
        </Pill>
        <SignedBy who="you" />
      </div>
      <div className="mb-1 mt-3.5 flex items-end gap-4">
        <div>
          <span className="cap">Held by the guard</span>
          <b className="mono block text-[38px] font-semibold leading-tight tracking-[-0.045em]">{formatUsd(m.balance)}</b>
        </div>
        <div
          className="ml-auto grid h-16 w-16 place-items-center rounded-full"
          style={{ background: `conic-gradient(rgb(var(--signal)) 0 ${used}%, rgb(var(--raised)) 0)` }}
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Spent this period"
        >
          <span className="mono grid h-12 w-12 place-items-center rounded-full bg-panel text-[13px] font-semibold">{Math.round(used)}%</span>
        </div>
      </div>
      <p className="cap mono">
        {formatUsd(m.spent)} of {formatUsd(m.maxPerPeriodUsd)} this {periodText(m.periodSeconds)}
        {windowOpen ? ` · resets in ${countdownText(windowEnd - now)}` : " · starts with the next trade"}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Pill className="mono">
          <Icon name="bot" size={12} />
          agent {m.agent.slice(0, 6)}…{m.agent.slice(-4)}
        </Pill>
        {m.agentRegistryId > 0n && (
          <a href={identityUrl(m.agentRegistryId)} target="_blank" rel="noreferrer">
            <Pill tone="sig" className="mono">
              ERC-8004 #{m.agentRegistryId.toString()}
            </Pill>
          </a>
        )}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
        <input aria-label="Amount in test USD" className="field mono !h-[34px] !py-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Button tone="primary" size="sm" disabled={!!tx.busy} onClick={() => run("deposit")}>
          {tx.busy === "deposit" ? "Waiting" : "Deposit"}
        </Button>
        <Button size="sm" disabled={!!tx.busy} onClick={() => run("withdraw")}>
          {tx.busy === "withdraw" ? "Waiting" : "Withdraw"}
        </Button>
      </div>
      {(input || tx.error || tx.done) && (
        <div className="mt-3">
          <Notice tone={input || tx.error ? "error" : "done"}>
            {input ?? tx.error ?? tx.done} {!input && tx.hash && <TxLink hash={tx.hash} />}
          </Notice>
        </div>
      )}
    </Card>
  );
}
