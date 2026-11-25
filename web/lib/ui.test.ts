import { describe, expect, it } from "vitest";
import { railState } from "./rail";
import { ageText, countdownText } from "./time";
import { explainWalletError } from "./walletErrors";

describe("rail", () => {
  it("has the 13 checks in contract order", () => {
    expect(railState(0).map((g) => g.label)).toEqual([
      "Agent", "Active", "Not expired", "Asset", "Jurisdiction", "Venue", "Per trade", "Period",
      "Fresh price", "Sources agree", "Volatility", "Balance", "Market hours",
    ]);
  });
  it("an allowed trade passes every check", () => {
    expect(railState(0).every((g) => g.state === "passed")).toBe(true);
  });
  it("a blocked trade stops at its check and goes no further", () => {
    expect(railState(7).map((g) => g.state)).toEqual([
      ...Array(6).fill("passed"), "stopped", ...Array(6).fill("not-reached"),
    ]);
    expect(railState(1)[0]!.state).toBe("stopped");
    expect(railState(13)[12]!.state).toBe("stopped");
  });
  it("an unknown code shows nothing as passed", () => {
    expect(railState(99).every((g) => g.state === "not-reached")).toBe(true);
  });
});

describe("time", () => {
  it.each([[0, "0 s"], [59, "59 s"], [60, "1 min"], [3599, "59 min"], [3600, "1 h"], [90_000, "25 h"], [-5, "0 s"]])(
    "age of %s s is %s", (seconds, text) => expect(ageText(seconds)).toBe(text));
  it.each([[0, "now"], [-1, "now"], [59, "1 min"], [61, "2 min"], [3600, "1 h 0 min"], [90_061, "1 d 1 h"]])(
    "countdown of %s s is %s", (seconds, text) => expect(countdownText(seconds)).toBe(text));
});

describe("wallet errors", () => {
  const nested = (cause: object) => Object.assign(new Error("outer"), { cause: Object.assign(new Error("inner"), cause) });
  it.each([
    ["rejection by code", nested({ code: 4001 }), /rejected/i],
    ["rejection by name", nested({ name: "UserRejectedRequestError" }), /rejected/i],
    ["no gas", new Error("insufficient funds for gas * price + value"), /tBNB/],
    ["no tUSD", nested({ data: { errorName: "ERC20InsufficientBalance", args: [] } }), /tUSD/],
    ["too large withdrawal", nested({ data: { errorName: "ExceedsBalance", args: [2n, 1n] } }), /more than/i],
    ["not the owner", nested({ data: { errorName: "NotOwner" } }), /owner/i],
    ["wrong identity", nested({ data: { errorName: "IdentityMismatch" } }), /identity/i],
    ["invalid values", nested({ data: { errorName: "InvalidParams" } }), /values/i],
    ["anything else", new Error("0xdead"), /nothing changed/i],
    ["not even an error", undefined, /nothing changed/i],
  ])("%s", (_name, error, text) => expect(explainWalletError(error, 1000)).toMatch(text));

  it("says when the faucet opens again", () => {
    const error = nested({ data: { errorName: "FaucetCooldown", args: [1000n + 1800n] } });
    expect(explainWalletError(error, 1000)).toMatch(/30 min/);
  });
  it("does not print raw request data", () => {
    expect(explainWalletError(new Error("Request body: {secret}"), 0)).not.toContain("secret");
  });
});
