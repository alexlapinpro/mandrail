"use client";

import { useState } from "react";
import { useAgentAddress } from "@/hooks/useApi";
import { useTx } from "@/hooks/useTx";
import { mandateRegistryAbi } from "@/lib/abi";
import { ASSETS, type AssetSymbol } from "@/lib/assets";
import { deployment } from "@/lib/deployment";
import { DEFAULT_FORM, JURISDICTIONS, toParams, type FormErrors, type Jurisdiction, type MandateForm } from "@/lib/mandateForm";
import { Button, Field, Notice } from "./ui";

export function MandateCreate({ onCreated }: { onCreated: () => void }) {
  const agent = useAgentAddress();
  const tx = useTx();
  const [form, setForm] = useState<MandateForm>(DEFAULT_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const full = { ...form, agent: form.agent || agent.data?.agent || "" };
  const set = <K extends keyof MandateForm>(key: K, value: MandateForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const input = (key: "perTrade" | "perPeriod" | "periodDays" | "volatility" | "divergence" | "riskAge" | "identityId", placeholder = "") => (
    <input className="field" inputMode="decimal" placeholder={placeholder} value={form[key]} onChange={(e) => set(key, e.target.value)} />
  );

  const submit = async () => {
    const result = toParams(full, Math.floor(Date.now() / 1000));
    if (!result.ok) return setErrors(result.errors);
    const created = await tx.run("create", "Mandate created.", {
      address: deployment.mandateRegistry,
      abi: mandateRegistryAbi,
      functionName: "createMandate",
      args: [result.params],
    });
    if (created) onCreated();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field
        label="Agent address"
        error={errors.agent}
        hint={agent.isError ? "The server's agent address is not available. Enter it yourself." : "The agent on this server. It can only trade through the guard."}
      >
        <span className="flex gap-2">
          <input className="field" value={full.agent} onChange={(e) => set("agent", e.target.value)} spellCheck={false} />
          <Button className="shrink-0" onClick={() => void navigator.clipboard?.writeText(full.agent)}>
            Copy
          </Button>
        </span>
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm text-muted">Assets the agent may buy</legend>
        {(Object.keys(ASSETS) as AssetSymbol[]).map((symbol) => (
          <label key={symbol} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-signal"
              checked={form.assets.includes(symbol)}
              onChange={(e) => set("assets", e.target.checked ? [...form.assets, symbol] : form.assets.filter((s) => s !== symbol))}
            />
            {symbol} <span className="text-sm text-muted">test asset, reference price: {ASSETS[symbol].cmcSymbol}</span>
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Per trade, USD" error={errors.perTrade}>{input("perTrade")}</Field>
        <Field label="Jurisdiction" error={errors.jurisdiction}>
          <select className="field" value={form.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value as Jurisdiction)}>
            {JURISDICTIONS.map((code) => <option key={code}>{code}</option>)}
          </select>
        </Field>
        <Field label="Per period, USD" error={errors.perPeriod}>{input("perPeriod")}</Field>
        <Field label="Period, days" error={errors.periodDays}>{input("periodDays")}</Field>
        <Field label="Max 1h move, %" error={errors.volatility}>{input("volatility", "off")}</Field>
        <Field label="Max price gap, %" error={errors.divergence}>{input("divergence", "off")}</Field>
        <Field label="Max price age, seconds" error={errors.riskAge}>{input("riskAge")}</Field>
        <Field label="Expires, UTC" error={errors.expires}>
          <input type="datetime-local" className="field" value={form.expires} onChange={(e) => set("expires", e.target.value)} />
        </Field>
      </div>
      <Button tone="signal" type="submit" disabled={!!tx.busy} className="w-full">
        {tx.busy ? "Waiting for wallet" : "Create mandate"}
      </Button>
      {tx.error && <Notice tone="error">{tx.error}</Notice>}
    </form>
  );
}
