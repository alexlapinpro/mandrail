import { describe, expect, it } from "vitest";
import { ASSETS } from "./assets";
import { DEFAULT_FORM, parsePercent, toParams, type MandateForm } from "./mandateForm";

const AGENT = "0x984c85b2e74DfE176f9F6fBF5C80732fbC6cf222";
const NOW = Math.floor(Date.UTC(2026, 10, 26, 3) / 1000);
const E = 10n ** 18n;
const form = (over: Partial<MandateForm> = {}): MandateForm => ({ ...DEFAULT_FORM, agent: AGENT, ...over });
const params = (over: Partial<MandateForm> = {}) => {
  const result = toParams(form(over), NOW);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.params;
};
const errors = (over: Partial<MandateForm>) => {
  const result = toParams(form(over), NOW);
  return result.ok ? {} : result.errors;
};

describe("mandate form", () => {
  it("starts with the demo mandate", () => {
    expect(params()).toEqual({
      agent: AGENT,
      jurisdiction: "0x5347",
      maxPerTradeUsd: 100n * E,
      maxPerPeriodUsd: 200n * E,
      periodSeconds: 604_800n,
      maxVolatilityPpm: 0,
      maxDivergencePpm: 0,
      maxRiskAgeSeconds: 900n,
      expiresAt: 0n,
      requireMarketOpen: false,
      agentRegistryId: 0n,
      allowedAssets: [ASSETS.tGOLD.address],
    });
  });

  it("converts percentages to ppm", () => {
    expect(params({ volatility: "0.5", divergence: "0.0183" })).toMatchObject({ maxVolatilityPpm: 5000, maxDivergencePpm: 183 });
  });

  it("accepts an empty asset list, US and market hours", () => {
    expect(params({ assets: [], jurisdiction: "US", requireMarketOpen: true })).toMatchObject({
      allowedAssets: [], jurisdiction: "0x5553", requireMarketOpen: true,
    });
  });

  it("reads the expiry as UTC", () => {
    expect(params({ expires: "2026-11-27T12:00" }).expiresAt).toBe(BigInt(Date.UTC(2026, 10, 27, 12) / 1000));
  });

  it.each<[string, Partial<MandateForm>, keyof MandateForm]>([
    ["bad agent address", { agent: "0x123" }, "agent"],
    ["zero agent address", { agent: "0x0000000000000000000000000000000000000000" }, "agent"],
    ["zero per trade", { perTrade: "0" }, "perTrade"],
    ["dollar sign", { perTrade: "$5" }, "perTrade"],
    ["zero per period", { perPeriod: "0" }, "perPeriod"],
    ["zero period", { periodDays: "0" }, "periodDays"],
    ["fractional period", { periodDays: "1.5" }, "periodDays"],
    ["negative volatility", { volatility: "-1" }, "volatility"],
    ["too fine volatility", { volatility: "0.00001" }, "volatility"],
    ["volatility above 100%", { volatility: "101" }, "volatility"],
    ["word as divergence", { divergence: "low" }, "divergence"],
    ["zero price age", { riskAge: "0" }, "riskAge"],
    ["expiry in the past", { expires: "2026-11-25T12:00" }, "expires"],
    ["broken expiry", { expires: "soon" }, "expires"],
    ["unknown jurisdiction", { jurisdiction: "us" as never }, "jurisdiction"],
    ["bad identity", { identityId: "x" }, "identityId"],
  ])("%s is a field error", (_name, over, field) => {
    expect(errors(over)[field]).toBeTruthy();
  });

  it("reports every wrong field at once", () => {
    expect(Object.keys(errors({ perTrade: "0", agent: "" })).sort()).toEqual(["agent", "perTrade"]);
  });
});

describe("parsePercent", () => {
  it("treats empty as off", () => expect(parsePercent("")).toBe(0));
  it("accepts 100%", () => expect(parsePercent("100")).toBe(1_000_000));
});
