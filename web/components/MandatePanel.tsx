"use client";

import { useState } from "react";
import type { Address } from "viem";
import { testUSDAbi } from "@/lib/abi";
import { deployment } from "@/lib/deployment";
import { formatUsd } from "@/lib/units";
import { useMandate, useTestUsd } from "@/hooks/useMandate";
import { useTx } from "@/hooks/useTx";
import { MandateControls } from "./MandateControls";
import { MandateCreate } from "./MandateCreate";
import { MandateSummary } from "./MandateSummary";
import { Button, Notice, Panel, SignedBy } from "./ui";

interface Props {
  owner: Address | undefined;
  connectedElsewhere: boolean;
  ids: bigint[];
  selected: bigint | null;
  onSelect: (id: bigint) => void;
  onCreated: () => void;
  loading: boolean;
  failed: boolean;
}

export function MandatePanel({ owner, connectedElsewhere, ids, selected, onSelect, onCreated, loading, failed }: Props) {
  const [creating, setCreating] = useState(false);
  const { mandate, isError } = useMandate(selected);
  const balance = useTestUsd(owner);
  const faucet = useTx();

  if (!owner) {
    return (
      <Panel title="Your mandate">
        <p className="text-muted">
          {connectedElsewhere
            ? "Your wallet is on another network. Switch to BSC testnet to continue."
            : "Connect a wallet to set the rules for your agent. You can read the live data and the decisions without one."}
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Your mandate" aside={<SignedBy who="you" />}>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span>
              Wallet: <strong className="font-semibold">{balance.data === undefined ? "…" : formatUsd(balance.data)}</strong> test USD
            </span>
            <Button
              disabled={!!faucet.busy}
              onClick={() => faucet.run("faucet", "1,000 test USD added.", { address: deployment.usd, abi: testUSDAbi, functionName: "faucet" })}
            >
              {faucet.busy ? "Waiting" : "Get test USD"}
            </Button>
          </div>
          {faucet.error && <Notice tone="error">{faucet.error}</Notice>}
          {faucet.done && <Notice tone="done">{faucet.done}</Notice>}
        </div>

        {loading && <p className="text-muted">Looking for your mandates…</p>}
        {(failed || isError) && <Notice tone="error">The chain did not answer. Retrying.</Notice>}

        {ids.length > 0 && (
          <div className="flex items-center gap-3">
            <select
              aria-label="Mandate"
              className="field"
              value={selected?.toString() ?? ""}
              onChange={(e) => onSelect(BigInt(e.target.value))}
            >
              {ids.map((id) => (
                <option key={id.toString()} value={id.toString()}>
                  Mandate {id.toString()}
                </option>
              ))}
            </select>
            <Button className="shrink-0" onClick={() => setCreating((v) => !v)}>
              {creating ? "Close" : "New mandate"}
            </Button>
          </div>
        )}

        {!loading && !failed && (creating || ids.length === 0) && (
          <MandateCreate
            onCreated={() => {
              setCreating(false);
              onCreated();
            }}
          />
        )}

        {!creating && mandate && (
          <>
            <MandateSummary mandate={mandate} />
            <MandateControls key={mandate.id.toString()} mandate={mandate} walletBalance={balance.data} />
          </>
        )}
      </div>
    </Panel>
  );
}
