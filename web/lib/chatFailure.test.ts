import { describe, expect, it } from "vitest";
import { chatFailure } from "./chatFailure";

describe("chat failure", () => {
  it.each([400, 403, 404, 429])("%s: nothing was sent, so the text comes back", (status) => {
    expect(chatFailure({ status, message: "No." })).toEqual({ text: "No.", restore: true });
  });
  it("says how long to wait", () => {
    expect(chatFailure({ status: 429, message: "Too many messages.", retryAfter: 12 }).text).toBe("Too many messages. Try again in 12 s.");
  });
  it.each([500, 502, 504])("%s: a trade may have happened, so warn and keep the text out", (status) => {
    const result = chatFailure({ status, message: "Failed." });
    expect(result.restore).toBe(false);
    expect(result.text).toMatch(/Failed\. .*decisions on-chain.*before you repeat/);
  });
  it("a lost connection is treated the same", () => {
    expect(chatFailure(new TypeError("fetch failed")).restore).toBe(false);
  });
});
