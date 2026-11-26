"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { erc20Abi, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { useAgentAddress } from "@/hooks/useApi";
import { useTx } from "@/hooks/useTx";
import { mandateRegistryAbi, policyGuardAbi, testUSDAbi } from "@/lib/abi";
import { deployment } from "@/lib/deployment";
import { DEFAULT_FORM, toParams } from "@/lib/mandateForm";
import { setupSteps } from "@/lib/setupSteps";
import { Icon } from "../icons";
import { Button, Card, Notice, Pill, TxLink } from "../ui";
import { MandateCreate } from "../MandateCreate";

const DEPOSIT = 300n * 10n ** 18n;
const STEPS = [
  { title: "Get 1,000 test USD", note: "faucet, 1 confirmation" },
  { title: "Create the mandate", note: "default rules, 1 confirmation" },
  { title: "Deposit $300 to the guard", note: "approval and deposit, 2 confirmations" },
];

type State = Parameters<typeof setupSteps>[0];

/** Three steps in one flow. The state comes from the chain, so a closed tab or a rejected wallet resumes at the right step. */
export function SetupWizard({ owner, state }: { owner: Address; state: State }) {
  const client = usePublicClient();
  const agent = useAgentAddress();
  const queryClient = useQueryClient();
  const tx = useTx();
  const [running, setRunning] = useState(false);
  const [custom, setCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { step, done } = setupSteps(state);

  async function readState(): Promise<State> {
    const [usd, mandates] = await Promise.all([
      client!.readContract({ address: deployment.usd, abi: testUSDAbi, functionName: "balanceOf", args: [owner] }),
      client!.readContract({ address: deployment.mandateRegistry, abi: mandateRegistryAbi, functionName: "mandatesByOwner", args: [owner] }),
    ]);
    const last = mandates.at(-1);
    const balance =
      last === undefined
        ? null
        : await client!.readContract({ address: deployment.policyGuard, abi: policyGuardAbi, functionName: "balanceOf", args: [last] });
    return { usd, mandates: [...mandates], balance };
  }

  /** The public RPC can lag a block behind the wallet, so wait until the chain shows the step as done. */
  async function settled(previous: number): Promise<State> {
    for (let i = 0; i < 20; i++) {
      const next = await readState();
      if (setupSteps(next).step !== previous) return next;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    return readState();
  }

  async function runStep(current: State): Promise<boolean> {
    const at = setupSteps(current).step;
    if (at === 1) return tx.run("faucet", "1,000 test USD added.", { address: deployment.usd, abi: testUSDAbi, functionName: "faucet" });
    if (at === 2) {
      // The agent address may still be loading when the owner clicks Start, so wait for it.
      const agentAddress = agent.data?.agent ?? (await agent.refetch()).data?.agent ?? "";
      const result = toParams(
        { ...DEFAULT_FORM, agent: agentAddress, identityId: deployment.agentIdentityId ? String(deployment.agentIdentityId) : "" },
        Math.floor(Date.now() / 1000),
      );
      if (!result.ok) {
        setError("The agent address is not available. Use Customise rules first and enter it.");
        return false;
      }
      return tx.run("create", "Mandate created.", { address: deployment.mandateRegistry, abi: mandateRegistryAbi, functionName: "createMandate", args: [result.params] });
    }
    const id = current.mandates.at(-1)!;
    return tx.run(
      "deposit",
      "Deposited.",
      { address: deployment.usd, abi: erc20Abi, functionName: "approve", args: [deployment.policyGuard, DEPOSIT] },
      { address: deployment.policyGuard, abi: policyGuardAbi, functionName: "deposit", args: [id, DEPOSIT] },
    );
  }

  async function go() {
    if (!client || running) return;
    setRunning(true);
    setError(null);
    try {
      let current = await readState();
      while (setupSteps(current).step !== 4) {
        const at = setupSteps(current).step;
        if (!(await runStep(current))) break;
        current = await settled(at);
      }
    } catch {
      setError("The chain did not answer. Your progress is saved on-chain; continue when it is back.");
    } finally {
      await queryClient.invalidateQueries();
      setRunning(false);
    }
  }

  if (custom && step === 2) {
    return (
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-lg font-bold tracking-[-0.02em]">Your rules</span>
          <button type="button" className="text-[13px] text-muted hover:text-text" onClick={() => setCustom(false)}>
            Back to defaults
          </button>
        </div>
        <MandateCreate onCreated={() => setCustom(false)} />
      </Card>
    );
  }

  const progress = (done.filter(Boolean).length / 3) * 100;
  return (
    <Card className="p-6">
      <Pill tone="sig">New here · about a minute</Pill>
      <h2 className="mt-3 text-[28px] font-extrabold leading-[1.05] tracking-[-0.04em]">Give your agent a mandate</h2>
      <div className="mb-5 mt-4 h-1 rounded-full bg-raised">
        <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${progress}%` }} />
      </div>
      <ol className="space-y-2.5">
        {STEPS.map((s, i) => {
          const isDone = done[i];
          const isNow = !isDone && step === i + 1;
          return (
            <li
              key={s.title}
              className={`flex items-center gap-3.5 rounded-xl border p-3.5 ${isNow ? "border-signal bg-signal/10" : "border-line"}`}
              aria-current={isNow ? "step" : undefined}
            >
              <b className={`mono grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] text-[13px] ${isDone ? "bg-pass text-[#03190d]" : isNow ? "bg-signal text-[#171204]" : "bg-raised"}`}>
                {isDone ? <Icon name="check" size={15} /> : i + 1}
              </b>
              <div className="flex-1">
                {s.title}
                <span className="cap block">{s.note}</span>
              </div>
              {isNow && running && <Pill tone="sig">waiting</Pill>}
            </li>
          );
        })}
      </ol>
      <div className="mb-5 mt-4 grid grid-cols-2 gap-2">
        {[
          ["Assets", "tGOLD"],
          ["Per trade", "$100"],
          ["Per week", "$200"],
          ["Country", "SG"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[13px]">
            <span className="cap">{k}</span>
            <b className="mono block text-[15px]">{v}</b>
          </div>
        ))}
      </div>
      {(error || tx.error) && (
        <div className="mb-3">
          <Notice tone="error">
            {error ?? tx.error} {tx.hash && <TxLink hash={tx.hash} />}
          </Notice>
        </div>
      )}
      <Button tone="primary" className="w-full" disabled={running} onClick={go}>
        {running ? "Confirm in your wallet…" : step === 1 ? "Start" : "Continue"}
      </Button>
      {step <= 2 && (
        <button type="button" className="mt-3 block w-full text-center text-[13.5px] text-muted hover:text-text" onClick={() => setCustom(true)} disabled={running}>
          Customise rules first
        </button>
      )}
    </Card>
  );
}
