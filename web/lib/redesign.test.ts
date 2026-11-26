import { describe, expect, it } from "vitest";
import { gaugePositions } from "./gauge";
import { overview } from "./overview";
import { presetValue } from "./presets";
import { setupSteps } from "./setupSteps";

const E = 10n ** 18n;

describe("gaugePositions", () => {
  it("places the live value and the limit on a shared scale", () => {
    expect(gaugePositions(3000n, 300)).toEqual({ live: 30, limit: 3 }); // scale 10,000
    expect(gaugePositions(-3000n, 300)).toEqual({ live: 30, limit: 3 });
  });
  it("grows the scale for large values", () => {
    expect(gaugePositions(20_000n, 10_000)).toEqual({ live: 50, limit: 25 }); // scale 40,000
  });
  it("has no limit mark when the breaker is off", () => {
    expect(gaugePositions(500n, 0)).toEqual({ live: 5, limit: null });
  });
  it("handles a missing live value", () => {
    expect(gaugePositions(null, 5000)).toEqual({ live: null, limit: 50 });
  });
  it("stays between 0 and 100", () => {
    const { live, limit } = gaugePositions(0n, 1);
    expect(live).toBe(0);
    expect(limit).toBeGreaterThanOrEqual(0);
  });
});

describe("presetValue", () => {
  it.each([
    ["off", 1234n, 0],
    ["0.5", null, 5000],
    ["1", 1n, 10_000],
    ["below", 3000n, 300],
    ["below", -40n, 4],
  ] as const)("%s with live %s is %s", (preset, live, value) => expect(presetValue(preset, live)).toBe(value));
  it.each([0n, 1n, -1n, null])("below is impossible with live %s", (live) => {
    expect(presetValue("below", live)).toBeNull();
  });
});

describe("setupSteps", () => {
  it("starts with test USD for a new wallet", () => {
    expect(setupSteps({ usd: 0n, mandates: [], balance: null })).toEqual({ step: 1, done: [false, false, false] });
  });
  it("skips the faucet when the wallet already holds enough", () => {
    expect(setupSteps({ usd: 1000n * E, mandates: [], balance: null })).toEqual({ step: 2, done: [true, false, false] });
  });
  it("continues with the deposit when the mandate exists but holds nothing", () => {
    expect(setupSteps({ usd: 1000n * E, mandates: [3n], balance: 0n })).toEqual({ step: 3, done: [true, true, false] });
  });
  it("needs test USD again when the deposit cannot be paid", () => {
    expect(setupSteps({ usd: 10n * E, mandates: [3n], balance: 0n })).toEqual({ step: 1, done: [false, true, false] });
  });
  it("is ready when the latest mandate holds money", () => {
    expect(setupSteps({ usd: 0n, mandates: [3n], balance: 5n * E })).toEqual({ step: 4, done: [true, true, true] });
  });
  it("waits while the balance is still loading", () => {
    expect(setupSteps({ usd: 1000n * E, mandates: [3n], balance: null })).toEqual({ step: 3, done: [true, true, false] });
  });
});

describe("overview", () => {
  const row = (time: number, reason: number, over: object = {}) =>
    ({ id: `${time}`, time, reason, kind: reason === 0 ? "executed" : "blocked", unauthorised: reason === 1, ...over }) as never;
  it("is empty without history", () => {
    expect(overview([], 1000)).toEqual({ total: 0, blocked: 0, lastHour: 0, latest: null });
  });
  it("counts decisions, blocks and the last hour, newest first", () => {
    const rows = [row(10_000, 7), row(9_000, 0), row(5_000, 6), row(100, 1)];
    expect(overview(rows, 10_500)).toEqual({ total: 4, blocked: 3, lastHour: 2, latest: rows[0] });
  });
  it("shows the newest decision of an agent, not a stranger's attempt", () => {
    const rows = [row(10_000, 1), row(9_000, 6)];
    expect(overview(rows, 10_000).latest).toBe(rows[1]);
  });
});

import { needsWizard } from "./setupSteps";

describe("needsWizard", () => {
  const fresh = { active: true, balance: 0n, periodStart: 0n };
  it("shows the wizard to an owner with no mandates", () => expect(needsWizard([], undefined)).toBe(true));
  it("waits while the latest mandate is loading", () => expect(needsWizard([1n], undefined)).toBe(false));
  it("shows it for a new, unfunded, active mandate", () => expect(needsWizard([1n], fresh)).toBe(true));
  it("hides it for a funded mandate", () => expect(needsWizard([1n], { ...fresh, balance: 1n })).toBe(false));
  it("hides it for a revoked mandate", () => expect(needsWizard([1n], { ...fresh, active: false })).toBe(false));
  it("hides it for a mandate that has traded and was emptied", () => expect(needsWizard([1n], { ...fresh, periodStart: 5n })).toBe(false));
});
