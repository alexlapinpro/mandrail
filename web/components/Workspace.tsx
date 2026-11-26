"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { useMandate, useMandates, useTestUsd } from "@/hooks/useMandate";
import { needsWizard, setupSteps } from "@/lib/setupSteps";
import { Feed } from "./app/Feed";
import { MandateCard } from "./app/MandateCard";
import { MarketStrip } from "./app/MarketStrip";
import { Rules } from "./app/Rules";
import { SetupWizard } from "./app/SetupWizard";
import { ChatPanel } from "./ChatPanel";
import { MandateCreate } from "./MandateCreate";
import { Button, Card, Notice } from "./ui";

export function Workspace() {
  const { address, chainId } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const owner = mounted && chainId === bscTestnet.id ? address : undefined;

  const mandates = useMandates(owner);
  const usd = useTestUsd(owner);
  const [picked, setPicked] = useState<bigint | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => setCreating(false), [owner]);
  const ids = mandates.data ?? [];
  const selected = picked !== null && ids.includes(picked) ? picked : (ids.at(-1) ?? null);
  const { mandate } = useMandate(selected);

  const latest = ids.at(-1) ?? null;
  const latestMandate = latest !== null && mandate && mandate.id === latest ? mandate : undefined;
  const latestBalance = latestMandate ? latestMandate.balance : null;
  const ready = owner && usd.data !== undefined && !mandates.isLoading;
  const setup = ready ? setupSteps({ usd: usd.data!, mandates: ids, balance: latest === null ? null : latestBalance }) : null;
  // Keep the wizard on screen while a mandate it just created is still loading, so its flow is not cut off.
  const [inWizard, setInWizard] = useState(false);
  const wanted = needsWizard(ids, latestMandate) || (inWizard && latestMandate === undefined);
  const showWizard = !!setup && setup.step !== 4 && (ids.length === 0 || selected === latest) && wanted;
  useEffect(() => setInWizard(showWizard), [showWizard]);

  const picker = ids.length > 1 && (
    <select aria-label="Mandate" className="field" value={selected?.toString() ?? ""} onChange={(e) => setPicked(BigInt(e.target.value))}>
      {ids.map((id) => (
        <option key={id.toString()} value={id.toString()}>
          Mandate {id.toString()}
        </option>
      ))}
    </select>
  );

  return (
    <main>
      <MarketStrip />
      <div className="grid gap-3 p-3 lg:grid-cols-[350px_minmax(0,1fr)] xl:h-[calc(100vh-150px)] xl:min-h-[680px] xl:grid-cols-[350px_minmax(0,1fr)_390px]">
        <div className="flex min-h-0 flex-col gap-3 xl:overflow-y-auto" key={`left-${owner ?? "none"}`}>
          {!owner ? (
            <Card className="p-6">
              <h2 className="text-[22px] font-extrabold tracking-[-0.03em]">{mounted && address ? "Switch to BSC testnet" : "Connect a wallet"}</h2>
              <p className="mt-2 text-muted">
                {mounted && address
                  ? "Your wallet is on another network. Use the button at the top to switch."
                  : "Set the rules for your agent with one signature per change. You can watch live prices and decisions without a wallet."}
              </p>
            </Card>
          ) : mandates.isError ? (
            <Notice tone="error">The chain did not answer. Retrying.</Notice>
          ) : showWizard ? (
            <>
              {picker}
              <SetupWizard owner={owner} state={{ usd: usd.data!, mandates: ids, balance: latest === null ? null : latestBalance }} />
            </>
          ) : creating ? (
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-lg font-bold tracking-[-0.02em]">New mandate</span>
                <button type="button" className="text-[13px] text-muted hover:text-text" onClick={() => setCreating(false)}>
                  Cancel
                </button>
              </div>
              <MandateCreate
                onCreated={() => {
                  setCreating(false);
                  setPicked(null);
                }}
              />
            </Card>
          ) : mandate ? (
            <>
              <div className="flex gap-2">
                {picker}
                <Button size="sm" className={ids.length > 1 ? "!h-auto" : "ml-auto"} onClick={() => setCreating(true)}>
                  New mandate
                </Button>
              </div>
              <MandateCard key={`card-${mandate.id}`} mandate={mandate} walletBalance={usd.data} />
              <Rules key={`rules-${mandate.id}`} mandate={mandate} />
            </>
          ) : (
            <Card className="p-6 text-muted">Reading your mandate…</Card>
          )}
        </div>
        <div className="flex min-h-0 flex-col">
          <ChatPanel key={`chat-${selected?.toString() ?? "none"}`} owner={owner} mandateId={setup?.step === 4 || !showWizard ? selected : null} />
        </div>
        <div className="flex min-h-0 flex-col lg:col-span-2 xl:col-span-1">
          <Feed mandateId={selected} />
        </div>
      </div>
    </main>
  );
}
