import { useQuery } from "@tanstack/react-query";
import type { Action } from "@/lib/agent/run";

/** The API sends big numbers as decimal strings. */
export interface AuditRowView {
  id: string;
  time: number;
  mandateId: string;
  agent: string;
  asset: string;
  usd: string;
  kind: "executed" | "blocked";
  reason: number;
  reasonName: string;
  explanation: string;
  txHash: string;
  assetOut?: string;
  unauthorised: boolean;
}

export interface RiskView {
  now: number;
  lastPush: { status: string; at: number } | null;
  assets: {
    symbol: string;
    reference: string;
    cmc: { price: string; change1hPpm: string; change24hPpm: string; timestamp: string; pushedAt: string } | null;
    atlasFeed: boolean;
    atlas: { price: string; timestamp: string } | null;
    gapPpm: string | null;
    marketOpen: boolean;
    mainnet: { address: string; reason: string; gapPpm: string; maxDivergencePpm: number } | null;
  }[];
}

export interface ChallengeView {
  stale: boolean;
  mandate: { maxPerTrade: string; maxPerPeriod: string; balance: string };
  stats: { attempts: number; allowed: number; breaches: number; blocks: Record<string, number> };
  recent: (AuditRowView & { verdict: "blocked" | "allowed" | "breach" })[];
}

export interface ChatReply {
  message: string;
  actions: Action[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

async function read<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { error?: string; status?: string; retryAfter?: number };
  if (!response.ok) throw new ApiError(body.error ?? body.status ?? "The server did not answer.", response.status, body.retryAfter);
  return body as T;
}

const getJson = <T>(url: string) => fetch(url).then((r) => read<T>(r));

export const postJson = <T>(url: string, body: object) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) =>
    read<T>(r),
  );

const POLL = 5_000;

export const useAudit = (mandateId: bigint | null) =>
  useQuery({
    queryKey: ["audit", mandateId?.toString() ?? "all"],
    queryFn: () => getJson<{ rows: AuditRowView[]; stale: boolean; hiddenUnauthorised: number }>(`/api/audit${mandateId ? `?mandateId=${mandateId}` : ""}`),
    refetchInterval: POLL,
  });

export const useRisk = () =>
  useQuery({ queryKey: ["risk"], queryFn: () => getJson<RiskView>("/api/risk"), refetchInterval: POLL });

export const useChallenge = () =>
  useQuery({ queryKey: ["challenge"], queryFn: () => getJson<ChallengeView>("/api/break"), refetchInterval: POLL });

export const useAgentAddress = () =>
  useQuery({ queryKey: ["config"], queryFn: () => getJson<{ agent: string }>("/api/config"), staleTime: Infinity });
