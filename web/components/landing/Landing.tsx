"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAudit, useRisk } from "@/hooks/useApi";
import { useNow } from "@/hooks/useNow";
import { symbolOf } from "@/lib/assets";
import { ageText } from "@/lib/time";
import { formatPpm, formatUsd } from "@/lib/units";

import { txUrl } from "@/lib/deployment";
import { Icon } from "../icons";
import { AssetAvatar, Button, Card, MiniRail, Pill, Rail } from "../ui";

interface LatestView {
  time: number;
  reason: number;
  reasonName: string;
  explanation: string;
  mandateId: string;
  asset: string;
  usd: string;
  txHash: string;
  blockNumber: number;
  context: Record<string, string>;
}

interface OverviewView {
  total: number;
  blocked: number;
  lastHour: number;
  latest: LatestView | null;
  challenge: { attempts: number; allowed: number; breaches: number; blocks: Record<string, number> };
  priceAge: number | null;
}

const useOverview = () =>
  useQuery({
    queryKey: ["overview"],
    queryFn: async (): Promise<OverviewView> => {
      const response = await fetch("/api/overview");
      if (!response.ok) throw new Error("unavailable");
      return response.json();
    },
    refetchInterval: 10_000,
  });

const short = (name: string) => name.toLowerCase().replaceAll("_", " ");

export function Landing() {
  const overview = useOverview();
  const data = overview.data;
  const unavailable = overview.isError && !data;
  return (
    <main>
      <Ticker />
      <div className="relative overflow-hidden border-b border-line">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mx-auto grid max-w-[1260px] items-center gap-14 px-4 pb-16 pt-16 sm:px-8 lg:grid-cols-[1fr_1.02fr] lg:pt-20">
          <div>
            <div className="mb-6 flex flex-wrap gap-2">
              <Pill tone="sig">BNB Chain</Pill>
              <Pill>CoinMarketCap × Atlas</Pill>
              <Pill>ERC-8004</Pill>
            </div>
            <h1 className="max-w-[13ch] text-[44px] font-extrabold leading-none tracking-[-0.035em] sm:text-[68px]">
              Your agent trades. The chain holds the leash.
            </h1>
            <p className="mb-8 mt-6 max-w-[44ch] text-[19px] leading-relaxed text-muted">
              Set a mandate once. Every trade your AI agent attempts on tokenized gold and stocks is checked on-chain against
              13 rules and two live price sources, before it happens.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/app">
                <Button tone="primary">Launch app</Button>
              </Link>
              <Link href="/break">
                <Button>Try to break it</Button>
              </Link>
              <span className="text-[13px] text-faint">No wallet needed for the challenge</span>
            </div>
          </div>
          <LatestDecision latest={data?.latest ?? null} loading={overview.isLoading} unavailable={unavailable} />
        </div>
      </div>

      <div className="mx-auto max-w-[1260px] px-4 sm:px-8">
        <Stats data={data} unavailable={unavailable} />
        <HowItWorks />
        <div className="my-14 flex flex-wrap items-center gap-x-7 gap-y-3 rounded-2xl border border-line px-6 py-5 text-[15px] font-semibold text-muted">
          <span className="cap">Built on</span>
          <span>BNB Chain</span>
          <span>CoinMarketCap API</span>
          <span>Atlas oracle</span>
          <span>ERC-8004 identity</span>
          <span>Azure OpenAI</span>
        </div>
        <Challenge data={data} />
      </div>
    </main>
  );
}

function Ticker() {
  const risk = useRisk();
  const feed = useAudit(null);
  const now = useNow();
  const prices = risk.data?.assets ?? [];
  const rows = feed.data?.rows.filter((row) => !row.unauthorised).slice(0, 6) ?? [];
  if (!prices.length && !rows.length) return <div className="h-[42px] border-b border-line" />;
  const items = (
    <>
      {prices.map((asset) =>
        asset.cmc ? (
          <span key={asset.symbol} className="inline-flex items-center gap-2">
            <AssetAvatar symbol={asset.symbol} size={18} />
            {asset.symbol}
            <b className={BigInt(asset.cmc.change1hPpm) < 0n ? "text-stop" : "text-pass"}>{formatPpm(BigInt(asset.cmc.change1hPpm))}</b>
            {formatUsd(BigInt(asset.cmc.price))}
          </span>
        ) : null,
      )}
      {rows.map((row) => (
        <span key={row.id} className="inline-flex items-center gap-2">
          mandate {row.mandateId} ·{" "}
          <b className={row.reason === 0 ? "text-pass" : "text-stop"}>
            {row.reason === 0 ? `allowed ${formatUsd(BigInt(row.usd))} ${symbolOf(row.asset)}` : `blocked · ${short(row.reasonName)}`}
          </b>
          {now > 0 && <span className="text-faint">{ageText(now - row.time)}</span>}
        </span>
      ))}
    </>
  );
  return (
    <div className="mono overflow-hidden whitespace-nowrap border-b border-line bg-[#08121499] py-3 text-[13px] text-muted" aria-label="Latest prices and decisions">
      <div className="ticker-track inline-flex gap-9 pl-8">
        {items}
        <span aria-hidden className="inline-flex gap-9">
          {items}
        </span>
      </div>
    </div>
  );
}

function LatestDecision({ latest, loading, unavailable }: { latest: LatestView | null; loading: boolean; unavailable: boolean }) {
  const now = useNow();
  if (!latest) {
    return (
      <Card className="grid min-h-[360px] place-items-center p-8 text-center text-muted">
        {loading ? "Reading the chain…" : unavailable ? "The chain did not answer. The latest decision appears here once it does." : "No decisions yet. The first trade attempt will appear here."}
      </Card>
    );
  }
  const divergence = latest.reasonName === "PRICE_DIVERGENCE";
  const c = latest.context;
  return (
    <Card className="overflow-hidden">
      <div className="card-head">
        <Pill tone={latest.reason === 0 ? "ok" : "no"} live>
          Latest decision on-chain
        </Pill>
        <a href={txUrl(latest.txHash)} target="_blank" rel="noreferrer" className="mono inline-flex items-center gap-1.5 text-xs text-faint hover:text-text">
          block {latest.blockNumber.toLocaleString("en-US")} · {now > 0 ? ageText(now - latest.time) : ""} <Icon name="external" size={13} />
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-dashed border-line2 px-5 py-4">
        <span className="rounded-[13px_13px_3px_13px] bg-signal px-3 py-2 text-[14.5px] font-semibold text-[#171204]">
          Buy {formatUsd(BigInt(latest.usd))} of {symbolOf(latest.asset)}
        </span>
        <span className="text-[13px] text-faint">owner of mandate {latest.mandateId} → agent</span>
      </div>
      <div className="px-5 pb-6 pt-5">
        <div className={`text-[24px] font-extrabold tracking-[-0.035em] sm:text-[26px] ${latest.reason === 0 ? "text-pass" : "text-stop"}`}>
          {latest.reason === 0 ? "Allowed: all 13 checks passed" : `Blocked: ${short(latest.reasonName)}`}
        </div>
        <div className="mt-5">
          <Rail reason={latest.reason} />
        </div>
        {divergence ? (
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-line bg-bg p-3.5">
            <div>
              <span className="cap block">CoinMarketCap</span>
              <b className="mono text-xl">{formatUsd(BigInt(c.cmcPrice!))}</b>
            </div>
            <div className="text-center">
              <b className="mono block text-[15px] text-stop">{formatPpm(BigInt(c.gapPpm!))}</b>
              <span className="text-[11px] text-faint">gap · limit {formatPpm(BigInt(c.maxPpm!))}</span>
            </div>
            <div className="text-right">
              <span className="cap block">Atlas</span>
              <b className="mono text-xl">{formatUsd(BigInt(c.atlasPrice!))}</b>
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded-xl border border-line bg-bg p-3.5 text-[14px]">{latest.explanation}</p>
        )}
        <div className="mono mt-3.5 flex justify-between text-xs text-faint">
          <span>
            tx {latest.txHash.slice(0, 6)}…{latest.txHash.slice(-4)}
          </span>
          <span>{latest.reason === 0 ? "tokens went to the owner" : "nothing bought · recorded on-chain"}</span>
        </div>
      </div>
    </Card>
  );
}

function Stats({ data, unavailable }: { data: OverviewView | undefined; unavailable: boolean }) {
  const value = (v: number | string | undefined) => (unavailable ? "–" : (v ?? "…"));
  const share = data && data.total > 0 ? Math.round((data.blocked / data.total) * 100) : null;
  const items = [
    { label: "Decisions on-chain", value: value(data?.total), note: data ? `+${data.lastHour} in the last hour` : "", tone: "" },
    { label: "Attempts blocked", value: value(data?.blocked), note: share !== null ? `${share}% of all attempts` : "", tone: "text-stop" },
    {
      label: "Breaches in the challenge",
      value: value(data?.challenge.breaches),
      note: data ? `of ${data.challenge.attempts} public attempts` : "",
      tone: "text-signal",
    },
    { label: "Prices on-chain", value: unavailable ? "–" : data?.priceAge != null ? ageText(data.priceAge) : "…", note: "pushed every 5 min", tone: "" },
  ];
  return (
    <div className="my-11 grid overflow-hidden rounded-2xl border border-line sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="border-b border-line bg-panel px-6 py-5 sm:border-r lg:border-b-0">
          <span className="cap">{item.label}</span>
          <b className={`mono my-1 block text-[40px] font-semibold leading-tight tracking-[-0.04em] ${item.tone}`}>{item.value}</b>
          <span className="text-xs text-faint">{item.note}</span>
        </div>
      ))}
    </div>
  );
}

function HowItWorks() {
  return (
    <>
      <h2 className="mb-7 mt-16 max-w-[18ch] text-[34px] font-extrabold leading-none tracking-[-0.045em] sm:text-[40px]">
        Three steps from a prompt to a verified decision
      </h2>
      <div className="grid gap-3.5 md:grid-cols-3">
        <Card className="p-6">
          <span className="mono text-xs font-semibold text-signal">01 · Owner</span>
          <h3 className="mb-2 mt-2.5 text-[21px] font-bold tracking-[-0.03em]">Sign the mandate</h3>
          <p className="text-muted">Assets, limits, country, venue, market hours and risk breakers, stored in a contract only you can change.</p>
          <div className="mt-5 grid gap-2 rounded-xl border border-line bg-bg p-3.5 text-[13px]">
            {[
              ["Per trade", "$100"],
              ["Per week", "$200"],
              ["Country", "SG"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted">{k}</span>
                <span className="mono">{v}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <span className="mono text-xs font-semibold text-signal">02 · Agent</span>
          <h3 className="mb-2 mt-2.5 text-[21px] font-bold tracking-[-0.03em]">The agent asks the guard</h3>
          <p className="text-muted">It holds its own key and can only trade through PolicyGuard. 13 checks run in order; the first failure wins.</p>
          <div className="mt-5 grid gap-3 rounded-xl border border-line bg-bg p-3.5 text-[13px]">
            <MiniRail reason={7} />
            <div className="flex justify-between">
              <span className="text-muted">Stopped at</span>
              <span className="mono text-stop">07 · per trade</span>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <span className="mono text-xs font-semibold text-signal">03 · Everyone</span>
          <h3 className="mb-2 mt-2.5 text-[21px] font-bold tracking-[-0.03em]">Every attempt is public</h3>
          <p className="text-muted">Allowed or blocked, each decision stays on BscScan with the numbers behind it. Nothing reverts quietly.</p>
          <div className="mt-5 grid gap-2 rounded-xl border border-line bg-bg p-3.5 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="mono">TradeBlocked</span>
              <Pill tone="no">reason 7</Pill>
            </div>
            <div className="mono flex justify-between">
              <span className="text-muted">requested</span>
              <span>$150.00</span>
            </div>
            <div className="mono flex justify-between">
              <span className="text-muted">limit</span>
              <span>$100.00</span>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function Challenge({ data }: { data: OverviewView | undefined }) {
  const blocked = data ? Object.values(data.challenge.blocks).reduce((a, b) => a + b, 0) : undefined;
  return (
    <Card className="mb-20 grid items-center gap-7 bg-[radial-gradient(ellipse_at_90%_50%,#f0b90b1a,transparent_60%)] p-7 lg:grid-cols-[1.3fr_1fr_auto]">
      <div>
        <Pill tone="sig">Public challenge</Pill>
        <h2 className="mb-2.5 mt-3 text-[34px] font-extrabold leading-none tracking-[-0.045em] sm:text-[40px]">Make our agent steal.</h2>
        <p className="text-muted">This agent has no safety rules and does whatever you type. Only the contract stands in the way.</p>
        <Link href="/break" className="mt-5 inline-block">
          <Button tone="primary">
            Try to break it <Icon name="arrow" size={16} />
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {[
          ["Attempts", data?.challenge.attempts, ""],
          ["Blocked", blocked, "text-stop"],
          ["Breaches", data?.challenge.breaches, "text-signal"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="rounded-xl border border-line bg-bg p-3.5">
            <span className="cap">{label}</span>
            <b className={`mono block text-[26px] tracking-[-0.03em] ${tone}`}>{value ?? "…"}</b>
          </div>
        ))}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/break-qr.svg" alt="QR code to the Break my agent page" width={120} height={120} className="hidden rounded-xl lg:block" />
    </Card>
  );
}

