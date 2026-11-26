"use client";

import { useState } from "react";
import { hexToString, stringToHex } from "viem";
import { useRisk } from "@/hooks/useApi";
import type { MandateView } from "@/hooks/useMandate";
import { useTx } from "@/hooks/useTx";
import { mandateRegistryAbi } from "@/lib/abi";
import { ASSETS, type AssetSymbol } from "@/lib/assets";
import { deployment } from "@/lib/deployment";
import { JURISDICTIONS } from "@/lib/mandateForm";
import { presetValue, type Preset } from "@/lib/presets";
import { formatPpm, formatUsd, parseUsd } from "@/lib/units";
import { AssetAvatar, Button, Card, CardHead, Gauge, Notice, TxLink } from "../ui";

const registry = { address: deployment.mandateRegistry, abi: mandateRegistryAbi } as const;
const PRESETS: { id: Preset; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "0.5", label: "0.5%" },
  { id: "1", label: "1%" },
  { id: "below", label: "Below now" },
];

function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-[21px] w-9 flex-none rounded-full transition disabled:opacity-50 ${on ? "bg-signal" : "bg-line2"}`}
    >
      <span className={`absolute top-[3px] h-[15px] w-[15px] rounded-full transition-all ${on ? "left-[18px] bg-[#171204]" : "left-[3px] bg-muted"}`} />
    </button>
  );
}

export function Rules({ mandate: m }: { mandate: MandateView }) {
  const tx = useTx();
  const risk = useRisk();
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [limits, setLimits] = useState({ perTrade: "", perPeriod: "" });
  const locked = !!tx.busy;
  const id = m.id;
  const gold = risk.data?.assets.find((a) => a.symbol === "tGOLD");
  const equity = risk.data?.assets.find((a) => a.symbol === "tEQUITY");
  const move = gold?.cmc ? BigInt(gold.cmc.change1hPpm) : null;
  const gap = equity?.gapPpm ? BigInt(equity.gapPpm) : null;

  const breaker = (kind: "volatility" | "divergence", preset: Preset) => {
    setNote(null);
    const live = kind === "volatility" ? move : gap;
    const value = presetValue(preset, live);
    if (value === null) return setNote("The live value is too small to set a limit below it. Refresh the data and try again.");
    const name = kind === "volatility" ? "1h move limit" : "Source gap limit";
    void tx.run(kind, value ? `${name} set to ${formatPpm(BigInt(value))}.` : `${name} off.`, {
      ...registry,
      functionName: kind === "volatility" ? "setVolatilityBreaker" : "setDivergenceBreaker",
      args: [id, value],
    });
  };

  const saveLimits = () => {
    setNote(null);
    try {
      const perTrade = limits.perTrade ? parseUsd(limits.perTrade) : m.maxPerTradeUsd;
      const perPeriod = limits.perPeriod ? parseUsd(limits.perPeriod) : m.maxPerPeriodUsd;
      void tx.run("limits", "Limits changed.", { ...registry, functionName: "updateLimits", args: [id, perTrade, perPeriod, m.periodSeconds] });
    } catch {
      setNote("Use plain amounts above zero, for example 100.");
    }
  };

  const jurisdiction = hexToString(m.jurisdiction);

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHead title="Rules" aside={<span className="cap">each change needs 1 signature</span>} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-line px-[18px] py-3.5">
          <div className="mb-1 text-sm font-semibold">Assets</div>
          {(Object.keys(ASSETS) as AssetSymbol[]).map((symbol) => (
            <div key={symbol} className="flex items-center gap-2.5 py-2 text-sm">
              <AssetAvatar symbol={symbol} />
              <div className="flex-1">
                {symbol}
                <span className="cap block">
                  price from {ASSETS[symbol].cmcSymbol}
                  {ASSETS[symbol].atlasFeedId ? " · second source Atlas" : ""}
                </span>
              </div>
              <Switch
                on={m.allowed[symbol]}
                label={`Allow ${symbol}`}
                disabled={locked}
                onChange={(on) =>
                  void tx.run("asset", `${symbol} ${on ? "allowed" : "removed"}.`, { ...registry, functionName: "setAllowedAsset", args: [id, ASSETS[symbol].address, on] })
                }
              />
            </div>
          ))}
        </div>

        <div className="border-b border-line px-[18px] py-3.5">
          <div className="mb-2.5 flex items-center justify-between text-sm font-semibold">
            Country <span className="cap">restrictions per asset</span>
          </div>
          <div className="grid grid-flow-col gap-[3px] rounded-[10px] border border-line bg-bg p-[3px]" role="radiogroup" aria-label="Country">
            {JURISDICTIONS.map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={jurisdiction === code}
                disabled={locked || jurisdiction === code}
                onClick={() => void tx.run("country", `Country set to ${code}.`, { ...registry, functionName: "setJurisdiction", args: [id, stringToHex(code) as `0x${string}`] })}
                className={`rounded-[7px] py-1.5 text-[13px] font-semibold ${jurisdiction === code ? "bg-raised text-text shadow-[inset_0_1px_0_#ffffff12]" : "text-muted hover:text-text"}`}
              >
                {code === "SG" ? "Singapore" : "United States"}
              </button>
            ))}
          </div>
        </div>

        {(
          [
            ["volatility", "Stop if the 1h move of tGOLD is above", m.maxVolatilityPpm, move],
            ["divergence", "Stop if CoinMarketCap and Atlas differ above", m.maxDivergencePpm, gap],
          ] as const
        ).map(([kind, title, limit, live]) => (
          <div key={kind} className="border-b border-line px-[18px] py-3.5">
            <div className="flex items-start justify-between gap-3 text-sm font-semibold">
              <span>{title}</span>
              <span className="mono whitespace-nowrap text-signal">{limit ? formatPpm(BigInt(limit)) : "off"}</span>
            </div>
            <Gauge livePpm={live} limitPpm={limit} />
            <div className="flex gap-1.5">
              {PRESETS.map((preset) => {
                const current = preset.id === "off" ? limit === 0 : preset.id === "0.5" ? limit === 5000 : preset.id === "1" ? limit === 10000 : false;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={locked}
                    onClick={() => breaker(kind, preset.id)}
                    className={`rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold transition disabled:opacity-50 ${current || preset.id === "below" ? "border-signal/60 text-signal" : "border-line2 text-muted hover:text-text"} ${current ? "bg-signal/10" : ""}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="border-b border-line px-[18px] py-3.5">
          <div className="mb-2 text-sm font-semibold">Limits</div>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className="text-[12px] text-muted">
              Per trade
              <input
                className="field mono mt-1 !py-1.5"
                inputMode="decimal"
                placeholder={formatUsd(m.maxPerTradeUsd)}
                value={limits.perTrade}
                onChange={(e) => setLimits((l) => ({ ...l, perTrade: e.target.value }))}
              />
            </label>
            <label className="text-[12px] text-muted">
              Per period
              <input
                className="field mono mt-1 !py-1.5"
                inputMode="decimal"
                placeholder={formatUsd(m.maxPerPeriodUsd)}
                value={limits.perPeriod}
                onChange={(e) => setLimits((l) => ({ ...l, perPeriod: e.target.value }))}
              />
            </label>
            <Button size="sm" disabled={locked || (!limits.perTrade && !limits.perPeriod)} onClick={saveLimits}>
              Save
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-line px-[18px] py-3.5 text-sm font-semibold">
          Only in US market hours
          <Switch
            on={m.requireMarketOpen}
            label="Only in US market hours"
            disabled={locked}
            onChange={(on) => void tx.run("hours", on ? "Stock tokens trade only in US market hours." : "Market hours check off.", { ...registry, functionName: "setRequireMarketOpen", args: [id, on] })}
          />
        </div>

        <div className="space-y-2.5 px-[18px] py-3.5">
          {(note || tx.error || tx.done || tx.busy) && (
            <Notice tone={note || tx.error ? "error" : tx.busy ? "info" : "done"}>
              {note ?? tx.error ?? (tx.busy ? "Waiting for your wallet and the chain…" : tx.done)} {!note && tx.hash && <TxLink hash={tx.hash} />}
            </Notice>
          )}
          {m.active ? (
            confirming ? (
              <div className="space-y-2 rounded-xl border border-stop/40 p-3">
                <p className="text-sm">Revoke mandate {id.toString()}? The agent can no longer trade. You can still withdraw.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    tone="danger"
                    size="sm"
                    disabled={locked}
                    onClick={async () => {
                      await tx.run("revoke", "Mandate revoked.", { ...registry, functionName: "revoke", args: [id] });
                      setConfirming(false);
                    }}
                  >
                    {tx.busy === "revoke" ? "Waiting" : "Revoke now"}
                  </Button>
                  <Button size="sm" disabled={locked} onClick={() => setConfirming(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <Button tone="danger" size="sm" className="w-full" disabled={locked} onClick={() => setConfirming(true)}>
                Revoke mandate
              </Button>
            )
          ) : (
            <Button size="sm" className="w-full" disabled={locked} onClick={() => void tx.run("reactivate", "Mandate active again.", { ...registry, functionName: "reactivate", args: [id] })}>
              Reactivate mandate
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
