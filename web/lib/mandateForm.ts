import { isAddress, parseUnits, stringToHex, zeroAddress, type Address, type Hex } from "viem";
import { ASSETS, type AssetSymbol } from "./assets";
import { parseUsd } from "./units";

export const JURISDICTIONS = ["SG", "US"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export interface MandateForm {
  agent: string;
  assets: AssetSymbol[];
  perTrade: string;
  perPeriod: string;
  periodDays: string;
  jurisdiction: Jurisdiction;
  volatility: string; // percent, empty = off
  divergence: string; // percent, empty = off
  riskAge: string; // seconds
  expires: string; // UTC, yyyy-mm-ddThh:mm, empty = never
  requireMarketOpen: boolean;
  identityId: string; // ERC-8004 id, empty = none
}

export interface MandateParams {
  agent: Address;
  jurisdiction: Hex;
  maxPerTradeUsd: bigint;
  maxPerPeriodUsd: bigint;
  periodSeconds: bigint;
  maxVolatilityPpm: number;
  maxDivergencePpm: number;
  maxRiskAgeSeconds: bigint;
  expiresAt: bigint;
  requireMarketOpen: boolean;
  agentRegistryId: bigint;
  allowedAssets: Address[];
}

export type FormErrors = Partial<Record<keyof MandateForm, string>>;

export const DEFAULT_FORM: MandateForm = {
  agent: "",
  assets: ["tGOLD"],
  perTrade: "100",
  perPeriod: "200",
  periodDays: "7",
  jurisdiction: "SG",
  volatility: "",
  divergence: "",
  riskAge: "900",
  expires: "",
  requireMarketOpen: false,
  identityId: "",
};

/** Percent text to ppm. Empty means off (0). */
export function parsePercent(text: string): number {
  const value = text.trim();
  if (value === "") return 0;
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(value)) throw new Error("percent");
  const ppm = Number(parseUnits(value, 4));
  if (ppm > 1_000_000) throw new Error("percent");
  return ppm;
}

function parseInteger(text: string): bigint {
  if (!/^[1-9]\d{0,8}$/.test(text.trim())) throw new Error("integer");
  return BigInt(text.trim());
}

function parseExpiry(text: string, now: number): bigint {
  if (text === "") return 0n;
  const seconds = Math.floor(Date.parse(`${text}Z`) / 1000);
  if (!(seconds > now)) throw new Error("expiry");
  return BigInt(seconds);
}

function parseAgent(text: string): Address {
  const value = text.trim();
  if (!isAddress(value, { strict: false }) || value === zeroAddress) throw new Error("address");
  return value;
}

export function toParams(
  form: MandateForm,
  now: number,
): { ok: true; params: MandateParams } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  const read = <T>(field: keyof MandateForm, message: string, parse: () => T): T => {
    try {
      return parse();
    } catch {
      errors[field] = message;
      return undefined as T;
    }
  };
  const percent = "Use a percentage from 0 to 100 with up to 4 decimals, or leave it empty.";
  const amount = "Use a plain amount above zero, for example 100.";

  const params: MandateParams = {
    agent: read("agent", "Enter the agent's address.", () => parseAgent(form.agent)),
    jurisdiction: read("jurisdiction", "Choose a jurisdiction.", () => {
      if (!JURISDICTIONS.includes(form.jurisdiction)) throw new Error("jurisdiction");
      return stringToHex(form.jurisdiction);
    }),
    maxPerTradeUsd: read("perTrade", amount, () => parseUsd(form.perTrade)),
    maxPerPeriodUsd: read("perPeriod", amount, () => parseUsd(form.perPeriod)),
    periodSeconds: read("periodDays", "Use whole days, at least 1.", () => parseInteger(form.periodDays) * 86_400n),
    maxVolatilityPpm: read("volatility", percent, () => parsePercent(form.volatility)),
    maxDivergencePpm: read("divergence", percent, () => parsePercent(form.divergence)),
    maxRiskAgeSeconds: read("riskAge", "Use whole seconds, at least 1.", () => parseInteger(form.riskAge)),
    expiresAt: read("expires", "Choose a time in the future (UTC).", () => parseExpiry(form.expires, now)),
    requireMarketOpen: form.requireMarketOpen,
    agentRegistryId: read("identityId", "Use a whole number, or leave it empty.", () =>
      form.identityId.trim() === "" ? 0n : parseInteger(form.identityId),
    ),
    allowedAssets: form.assets.map((symbol) => ASSETS[symbol].address),
  };
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, params };
}
