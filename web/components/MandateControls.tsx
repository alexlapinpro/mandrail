"use client";

import { useState } from "react";
import { erc20Abi, hexToString, stringToHex } from "viem";
import { useRisk } from "@/hooks/useApi";
import type { MandateView } from "@/hooks/useMandate";
import { useTx } from "@/hooks/useTx";
import { mandateRegistryAbi, policyGuardAbi } from "@/lib/abi";
import { ASSETS, type AssetSymbol } from "@/lib/assets";
import { deployment } from "@/lib/deployment";
import { JURISDICTIONS, parsePercent } from "@/lib/mandateForm";
import { formatPpm, helperThreshold, parseUsd } from "@/lib/units";
import { Button, Field, Notice } from "./ui";

const registry = { address: deployment.mandateRegistry, abi: mandateRegistryAbi } as const;
const guard = { address: deployment.policyGuard, abi: policyGuardAbi } as const;

export function MandateControls({ mandate: m, walletBalance }: { mandate: MandateView; walletBalance: bigint | undefined }) {
  const tx = useTx();
  const risk = useRisk();
  const [amount, setAmount] = useState("300");
  const [perTrade, setPerTrade] = useState("");
  const [perPeriod, setPerPeriod] = useState("");
  const [percent, setPercent] = useState({ volatility: "", divergence: "" });
  const [input, setInput] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const id = m.id;
  const locked = !!tx.busy;

  /** Parses user input first; a wrong value never reaches the wallet. */
  const guarded = (parse: () => Promise<unknown> | null) => {
    setInput(null);
    try {
      void parse();
    } catch {
      setInput("Use plain numbers above zero, for example 100 or 0.5.");
    }
  };

  const deposit = () =>
    guarded(() => {
      const value = parseUsd(amount);
      if (walletBalance !== undefined && value > walletBalance) {
        setInput("Not enough test USD in your wallet. Use Get test USD first.");
        return null;
      }
      return tx.run(
        "deposit",
        "Deposited.",
        { address: deployment.usd, abi: erc20Abi, functionName: "approve", args: [deployment.policyGuard, value] },
        { ...guard, functionName: "deposit", args: [id, value] },
      );
    });
  const withdraw = () => guarded(() => tx.run("withdraw", "Withdrawn to your wallet.", { ...guard, functionName: "withdraw", args: [id, parseUsd(amount)] }));
  const saveLimits = () =>
    guarded(() =>
      tx.run("limits", "Limits changed.", {
        ...registry,
        functionName: "updateLimits",
        args: [id, perTrade ? parseUsd(perTrade) : m.maxPerTradeUsd, perPeriod ? parseUsd(perPeriod) : m.maxPerPeriodUsd, m.periodSeconds],
      }),
    );
  const setVolatility = (ppm: number) =>
    tx.run("volatility", ppm ? `1h limit set to ${formatPpm(BigInt(ppm))}.` : "Volatility breaker off.", { ...registry, functionName: "setVolatilityBreaker", args: [id, ppm] });
  const setDivergence = (ppm: number) =>
    tx.run("divergence", ppm ? `Gap limit set to ${formatPpm(BigInt(ppm))}.` : "Divergence breaker off.", { ...registry, functionName: "setDivergenceBreaker", args: [id, ppm] });

  const gold = risk.data?.assets.find((a) => a.symbol === "tGOLD");
  const equity = risk.data?.assets.find((a) => a.symbol === "tEQUITY");
  const below = (ppm: string | null | undefined, apply: (n: number) => void, what: string) => {
    setInput(null);
    if (ppm === null || ppm === undefined) return setInput("No price data yet. Refresh the risk data first.");
    const limit = helperThreshold(BigInt(ppm));
    if (limit === null) return setInput(`The current ${what} is too small to set a limit below it. Refresh the risk data and try again.`);
    apply(limit);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Field label="Amount, test USD">
          <input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button tone="signal" disabled={locked} onClick={deposit}>{tx.busy === "deposit" ? "Waiting" : "Deposit"}</Button>
          <Button disabled={locked} onClick={withdraw}>{tx.busy === "withdraw" ? "Waiting" : "Withdraw"}</Button>
        </div>
      </div>

      {(input || tx.error || tx.done) && (
        <Notice tone={input || tx.error ? "error" : "done"}>{input ?? tx.error ?? tx.done}</Notice>
      )}

      {m.active ? (
        confirming ? (
          <div className="space-y-2 border border-stop/60 p-3">
            <p>Revoke mandate {id.toString()}? The agent can no longer trade. You can still withdraw.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                tone="danger"
                disabled={locked}
                onClick={async () => {
                  await tx.run("revoke", "Mandate revoked.", { ...registry, functionName: "revoke", args: [id] });
                  setConfirming(false);
                }}
              >
                {tx.busy === "revoke" ? "Waiting" : "Revoke now"}
              </Button>
              <Button disabled={locked} onClick={() => setConfirming(false)}>Keep it</Button>
            </div>
          </div>
        ) : (
          <Button tone="danger" className="w-full" disabled={locked} onClick={() => setConfirming(true)}>Revoke mandate</Button>
        )
      ) : (
        <Button className="w-full" disabled={locked} onClick={() => tx.run("reactivate", "Mandate active again.", { ...registry, functionName: "reactivate", args: [id] })}>
          Reactivate mandate
        </Button>
      )}

      <details className="border-t border-seam pt-3" open>
        <summary className="cursor-pointer font-medium">Change the rules</summary>
        <div className="mt-3 space-y-4">
          <fieldset disabled={locked}>
            <legend className="mb-1 text-sm text-muted">Assets</legend>
            {(Object.keys(ASSETS) as AssetSymbol[]).map((symbol) => (
              <label key={symbol} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-signal"
                  checked={m.allowed[symbol]}
                  onChange={(e) =>
                    tx.run("asset", `${symbol} ${e.target.checked ? "allowed" : "removed"}.`, {
                      ...registry,
                      functionName: "setAllowedAsset",
                      args: [id, ASSETS[symbol].address, e.target.checked],
                    })
                  }
                />
                {symbol} <span className="text-sm text-muted">test asset</span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-signal"
              disabled={locked}
              checked={m.requireMarketOpen}
              onChange={(e) =>
                tx.run("hours", e.target.checked ? "Stock tokens trade only in US market hours." : "Market hours check off.", {
                  ...registry,
                  functionName: "setRequireMarketOpen",
                  args: [id, e.target.checked],
                })
              }
            />
            Stock tokens only while the US market is open
          </label>
          <Field label="Jurisdiction">
            <select
              className="field"
              disabled={locked}
              value={hexToString(m.jurisdiction)}
              onChange={(e) => tx.run("jurisdiction", `Jurisdiction set to ${e.target.value}.`, { ...registry, functionName: "setJurisdiction", args: [id, stringToHex(e.target.value) as `0x${string}`] })}
            >
              {JURISDICTIONS.map((code) => <option key={code}>{code}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <Field label="Per trade, USD"><input className="field" inputMode="decimal" placeholder={(m.maxPerTradeUsd / 10n ** 18n).toString()} value={perTrade} onChange={(e) => setPerTrade(e.target.value)} /></Field>
            <Field label="Per period, USD"><input className="field" inputMode="decimal" placeholder={(m.maxPerPeriodUsd / 10n ** 18n).toString()} value={perPeriod} onChange={(e) => setPerPeriod(e.target.value)} /></Field>
            <Button disabled={locked || (!perTrade && !perPeriod)} onClick={saveLimits}>Save</Button>
          </div>
          <BreakerRow
            label="Max 1h move, %"
            current={m.maxVolatilityPpm}
            value={percent.volatility}
            locked={locked}
            onChange={(volatility) => setPercent((p) => ({ ...p, volatility }))}
            onSave={() => guarded(() => setVolatility(parsePercent(percent.volatility)))}
            helper="Set below current move"
            onHelper={() => below(gold?.cmc?.change1hPpm, setVolatility, "1h move of gold")}
          />
          <BreakerRow
            label="Max CoinMarketCap and Atlas gap, %"
            current={m.maxDivergencePpm}
            value={percent.divergence}
            locked={locked}
            onChange={(divergence) => setPercent((p) => ({ ...p, divergence }))}
            onSave={() => guarded(() => setDivergence(parsePercent(percent.divergence)))}
            helper="Set below current gap"
            onHelper={() => below(equity?.gapPpm, setDivergence, "price gap of tEQUITY")}
          />
        </div>
      </details>
    </div>
  );
}

function BreakerRow(props: {
  label: string;
  current: number;
  value: string;
  locked: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  helper: string;
  onHelper: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field label={`${props.label} (now ${props.current ? formatPpm(BigInt(props.current)) : "off"})`}>
          <input className="field" inputMode="decimal" placeholder="empty turns it off" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
        </Field>
        <Button disabled={props.locked} onClick={props.onSave}>Save</Button>
      </div>
      <Button disabled={props.locked} onClick={props.onHelper}>{props.helper}</Button>
    </div>
  );
}
