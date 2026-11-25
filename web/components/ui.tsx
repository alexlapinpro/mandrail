"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { railState } from "@/lib/rail";
import { reasonName } from "@/lib/reasons";
import { txUrl } from "@/lib/deployment";

type Tone = "signal" | "plain" | "danger";

const TONES: Record<Tone, string> = {
  signal: "bg-signal text-sunken hover:bg-signal/85 border-transparent",
  plain: "border-seam text-paint hover:border-muted",
  danger: "border-stop/60 text-stop hover:bg-stop/10",
};

export function Button({ tone = "plain", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      className={`rounded-sm border px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-45 ${TONES[tone]} ${className}`}
      {...props}
    />
  );
}

export function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t-2 border-seam pt-3">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-sign text-xl font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-stop">{error}</span> : hint ? <span className="mt-1 block text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

export function Notice({ tone, children }: { tone: "error" | "done" | "info"; children: ReactNode }) {
  const color = { error: "border-stop text-stop", done: "border-pass text-pass", info: "border-caution text-caution" }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`border-l-2 pl-2.5 text-sm ${color}`}>
      {children}
    </p>
  );
}

export function SignedBy({ who }: { who: "you" | "agent" }) {
  return <span className="text-sm text-muted">Signed by {who}</span>;
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <a className="text-sm text-signal underline underline-offset-2" href={txUrl(hash)} target="_blank" rel="noreferrer">
      View on BscScan
    </a>
  );
}

export function Verdict({ reason, unauthorised = false }: { reason: number; unauthorised?: boolean }) {
  if (reason === 0) return <span className="font-sign text-lg font-semibold text-pass">Allowed</span>;
  return (
    <span className="font-sign text-lg font-semibold text-stop">
      Blocked: {unauthorised ? "unauthorised caller" : reasonName(reason).toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

/** The guard rail: 13 posts, one per check, in the order the contract runs them. */
export function Rail({ reason }: { reason: number }) {
  const gates = railState(reason);
  const stopped = gates.findIndex((g) => g.state === "stopped");
  const summary = stopped < 0 ? "Passed all 13 checks" : `Passed ${stopped} of 13 checks, stopped at ${gates[stopped]!.label}`;
  return (
    <div role="img" aria-label={summary} title={summary}>
      <div className="relative flex h-7 items-end justify-between">
        <span className="absolute inset-x-0 top-2.5 h-1 bg-seam" />
        <span
          className={`absolute left-0 top-2.5 h-1 ${stopped < 0 ? "bg-pass" : "bg-signal"}`}
          style={{ width: stopped < 0 ? "100%" : `${(stopped / 12) * 100}%` }}
        />
        {gates.map((gate, i) => (
          <span
            key={gate.label}
            title={gate.label}
            style={{ animationDelay: `${i * 35}ms` }}
            className={`post relative w-1.5 ${
              gate.state === "stopped"
                ? "h-7 bg-stop"
                : gate.state === "passed"
                  ? `h-4 ${stopped < 0 ? "bg-pass" : "bg-signal"}`
                  : "h-4 bg-seam"
            }`}
          />
        ))}
      </div>
      <p className="mt-1 text-sm text-muted">{summary}</p>
    </div>
  );
}
