import { describe, expect, it } from "vitest";
import {
  InvalidAmount,
  formatPpm,
  formatUsd,
  gapPpm,
  helperThreshold,
  parseUsd,
  percentToPpm,
  priceToWei,
} from "./units";

const E = 10n ** 18n;

describe("percentToPpm", () => {
  it.each([
    [-2.35, -23500n],
    [0.004, 40n],
    [0, 0n],
    [100, 1000000n],
  ])("%s%% becomes %s ppm", (percent, ppm) => expect(percentToPpm(percent)).toBe(ppm));
});

describe("priceToWei", () => {
  it("keeps ten decimals", () => {
    expect(priceToWei(4000)).toBe(4000n * E);
    expect(priceToWei(142.7076373681)).toBe(142707637368100000000n);
  });
  it.each([0, -1, NaN, Infinity])("rejects %s", (n) => expect(() => priceToWei(n)).toThrow(InvalidAmount));
});

describe("parseUsd", () => {
  it("accepts plain decimal strings", () => {
    expect(parseUsd("50")).toBe(50n * E);
    expect(parseUsd("0.01")).toBe(E / 100n);
    expect(parseUsd(" 20.5 ")).toBe(205n * (E / 10n));
  });
  it.each(["$50", "1e3", "-5", "0", "0.00", "", " ", "1,000", "0x10", "1.", ".5", "1.1234567890123456789", "1".repeat(13)])(
    "rejects %j",
    (s) => expect(() => parseUsd(s)).toThrow(InvalidAmount),
  );
  it("rejects values that are not strings", () => {
    expect(() => parseUsd(50 as unknown as string)).toThrow(InvalidAmount);
  });
});

describe("formatting", () => {
  it("formats dollars", () => {
    expect(formatUsd(50n * E)).toBe("$50.00");
    expect(formatUsd(1234567n * E)).toBe("$1,234,567.00");
    expect(formatUsd(0n)).toBe("$0.00");
    expect(formatUsd(1n)).toBe("<$0.01");
    expect(formatUsd(100n * E + 1n)).toBe("$100.00");
  });
  it("formats ppm as percent without losing small moves", () => {
    expect(formatPpm(-23500n)).toBe("-2.35%");
    expect(formatPpm(40n)).toBe("0.004%");
    expect(formatPpm(0n)).toBe("0%");
    expect(formatPpm(10000n)).toBe("1%");
  });
});

describe("helperThreshold", () => {
  it.each([
    [-40n, 20],
    [3n, 1],
    [2n, 1],
    [1n, null],
    [-1n, null],
    [0n, null],
  ])("%s gives %s", (ppm, limit) => expect(helperThreshold(ppm)).toBe(limit));
});

describe("gapPpm", () => {
  it("is relative to the Atlas price", () => {
    expect(gapPpm(101n * E, 100n * E)).toBe(10000n);
    expect(gapPpm(98n * E, 100n * E)).toBe(20000n);
  });
});
