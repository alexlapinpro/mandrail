"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { gaugePositions } from "@/lib/gauge";
import { railState } from "@/lib/rail";
import { reasonName } from "@/lib/reasons";
import { txUrl } from "@/lib/deployment";
import { formatPpm } from "@/lib/units";
import { Icon } from "./icons";

type Tone = "primary" | "ghost" | "danger";

const TONES: Record<Tone, string> = {
  primary: "bg-signal text-[#171204] shadow-[inset_0_-2px_0_#0000002e,0_8px_24px_-10px_#f0b90b88] hover:brightness-105",
  ghost: "border-line2 bg-panel text-text hover:border-muted",
  danger: "border-stop/40 text-stop hover:bg-stop/10",
};

export function Button({
  tone = "ghost",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "md" | "sm" }) {
  const sizing = size === "sm" ? "h-[34px] rounded-lg px-3 text-[13.5px]" : "h-[42px] rounded-[10px] px-[18px] text-[14.5px]";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 border border-transparent font-semibold tracking-[-0.01em] transition disabled:cursor-not-allowed disabled:opacity-45 ${sizing} ${TONES[tone]} ${className}`}
      {...props}
    />
  );
}

type PillTone = "plain" | "ok" | "no" | "sig";
const PILLS: Record<PillTone, string> = {
  plain: "bg-raised text-muted border-line",
  ok: "bg-pass/10 text-pass border-pass/25",
  no: "bg-stop/10 text-stop border-stop/25",
  sig: "bg-signal/10 text-signal border-signal/25",
};

export function Pill({ tone = "plain", live = false, className = "", children }: { tone?: PillTone; live?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${PILLS[tone]} ${className}`}>
      {live && <span className="live-dot" />}
      {children}
    </span>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardHead({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="card-head">
      <h2 className="flex items-center gap-2">{title}</h2>
      {aside}
    </div>
  );
}

/** Kept for older screens: a card with a header. */
export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[13px] text-stop">{error}</span> : hint ? <span className="mt-1 block text-[13px] text-faint">{hint}</span> : null}
    </label>
  );
}

export function Notice({ tone, children }: { tone: "error" | "done" | "info"; children: ReactNode }) {
  const color = { error: "border-stop/40 bg-stop/10 text-stop", done: "border-pass/30 bg-pass/10 text-pass", info: "border-caution/30 bg-caution/10 text-caution" }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-[10px] border px-3 py-2 text-[13.5px] ${color}`}>
      {children}
    </p>
  );
}

export function SignedBy({ who }: { who: "you" | "agent" }) {
  return <span className="cap">Signed by {who}</span>;
}

export function TxLink({ hash, label = "tx" }: { hash: string; label?: string }) {
  return (
    <a className="mono inline-flex items-center gap-1 text-[12px] text-signal hover:underline" href={txUrl(hash)} target="_blank" rel="noreferrer">
      {label} {hash.slice(0, 6)}…{hash.slice(-4)} <Icon name="external" size={12} />
    </a>
  );
}

const AVATARS: Record<string, { label: string; style: string }> = {
  tGOLD: { label: "Au", style: "bg-[radial-gradient(circle_at_30%_30%,#ffe9a3,#d9a520_55%,#8a6410)] text-[#3b2a05]" },
  tEQUITY: { label: "Eq", style: "bg-[radial-gradient(circle_at_30%_30%,#b6ffe0,#2fd38a_55%,#0f6b45)] text-[#05301f]" },
};

export function AssetAvatar({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const avatar = AVATARS[symbol] ?? { label: "?", style: "bg-raised text-muted" };
  return (
    <span
      aria-hidden
      className={`grid flex-none place-items-center rounded-full font-bold ${avatar.style}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {avatar.label}
    </span>
  );
}

export function Verdict({ reason, unauthorised = false, className = "text-lg" }: { reason: number; unauthorised?: boolean; className?: string }) {
  if (reason === 0) return <span className={`font-extrabold tracking-[-0.03em] text-pass ${className}`}>Allowed</span>;
  return (
    <span className={`font-extrabold tracking-[-0.03em] text-stop ${className}`}>
      Blocked: {unauthorised ? "unauthorised caller" : reasonName(reason).toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

const GATE_LABELS = ["Agent", "Active", "Expiry", "Asset", "Country", "Venue", "Trade", "Period", "Fresh", "Sources", "Move", "Funds", "Hours"];

/** The guard rail: a beam and 13 posts, one per check, in the order the contract runs them. */
export function Rail({ reason, labels = true }: { reason: number; labels?: boolean }) {
  const gates = railState(reason);
  const stopped = gates.findIndex((g) => g.state === "stopped");
  const allowed = stopped < 0;
  const summary = allowed ? "Passed all 13 checks" : `Passed ${stopped} of 13 checks, stopped at ${gates[stopped]!.label}`;
  const fill = allowed ? 100 : ((stopped + 0.5) / 13) * 100;
  return (
    <div role="img" aria-label={summary} title={summary}>
      <div className="relative px-1 pt-1.5">
        <div className="absolute inset-x-0 top-[22px] h-2 rounded-[3px] bg-[linear-gradient(#2b4851,#1b3036)] shadow-[inset_0_1px_0_#ffffff14]">
          <div
            className={`absolute inset-y-0 left-0 rounded-[3px] ${allowed ? "bg-[linear-gradient(#6af2b0,#1fae6d)] shadow-[0_0_14px_#2fd38a55]" : "bg-[linear-gradient(#ffd34d,#c99400)] shadow-[0_0_14px_#f0b90b55]"}`}
            style={{ width: `${fill}%` }}
          />
        </div>
        <div className="relative grid grid-cols-13" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
          {gates.map((gate, i) => {
            const stop = gate.state === "stopped";
            const lit = gate.state === "passed";
            const cap = stop ? "h-4 w-[26px] bg-stop shadow-[0_0_20px_#f6465dcc]" : lit ? (allowed ? "bg-pass" : "bg-signal") : "bg-line2";
            const pole = stop
              ? "h-10 w-2 bg-[linear-gradient(90deg,#a72a3c,#ff7f90_50%,#a72a3c)]"
              : lit
                ? allowed
                  ? "bg-[linear-gradient(90deg,#1a8a57,#6af2b0_50%,#1a8a57)]"
                  : "bg-[linear-gradient(90deg,#b88a00,#ffd34d_50%,#b88a00)]"
                : "bg-[linear-gradient(90deg,#2b4851,#3a5c66_50%,#2b4851)]";
            return (
              <div key={gate.label} className="post flex flex-col items-center" style={{ animationDelay: `${i * 35}ms` }}>
                <span className={`h-2.5 w-[18px] rounded-t-[3px] rounded-b-[1px] ${cap}`} />
                <span className={`${stop ? "" : "h-[34px] w-1.5"} ${pole}`} />
                <span className="h-1 w-4 rounded-sm bg-line2" />
              </div>
            );
          })}
        </div>
      </div>
      {labels && (
        <div className="mt-2 grid" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
          {gates.map((gate, i) => {
            const stop = gate.state === "stopped";
            const lit = gate.state === "passed";
            return (
              <div key={gate.label} className={`flex flex-col items-center gap-1 text-center text-[10px] leading-tight ${stop ? "font-semibold text-stop" : "text-faint"}`}>
                <i
                  className={`mono grid h-[18px] w-[18px] place-items-center rounded-[5px] text-[9.5px] not-italic ${stop ? "bg-stop text-white" : lit ? (allowed ? "bg-pass/15 text-pass" : "bg-signal/15 text-signal") : "bg-raised text-muted"}`}
                >
                  {String(i + 1).padStart(2, "0")}
                </i>
                <span className="hidden sm:block">{GATE_LABELS[i]}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="sr-only">{summary}</p>
    </div>
  );
}

/** Thirteen small bars for lists. */
export function MiniRail({ reason }: { reason: number }) {
  const gates = railState(reason);
  const allowed = reason === 0;
  return (
    <div className="grid h-5 items-end gap-[3px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }} aria-hidden>
      {gates.map((gate) => (
        <b
          key={gate.label}
          className={`rounded-sm ${gate.state === "stopped" ? "h-5 bg-stop shadow-[0_0_10px_#f6465d99]" : gate.state === "passed" ? `h-2 ${allowed ? "bg-pass" : "bg-signal"}` : "h-2 bg-line2"}`}
        />
      ))}
    </div>
  );
}

/** Where the market is now and where the owner's limit is, on one scale. */
export function Gauge({ livePpm, limitPpm }: { livePpm: bigint | null; limitPpm: number }) {
  const { live, limit } = gaugePositions(livePpm, limitPpm);
  return (
    <div className="relative my-1 h-[46px]">
      <div className="absolute inset-x-0 top-[20px] h-1.5 rounded-full bg-[linear-gradient(90deg,#2fd38a33,#ff8a3d33_60%,#f6465d44)]" />
      {live !== null && livePpm !== null && (
        <div className="absolute top-[14px] h-[18px] w-[3px] rounded-sm bg-text" style={{ left: `${live}%` }}>
          <span className="mono absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10.5px]">now {formatPpm(livePpm < 0n ? -livePpm : livePpm)}</span>
        </div>
      )}
      {limit !== null && (
        <div className="absolute top-[12px] h-[22px] border-l-2 border-dashed border-stop" style={{ left: `${limit}%` }}>
          <span className="mono absolute top-[24px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[10.5px] text-stop">limit</span>
        </div>
      )}
    </div>
  );
}
