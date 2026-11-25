import { describe, expect, it } from "vitest";
import { chatPayload } from "./chatPayload";
import { sourceState } from "./sourceState";
import { txFailure } from "./txFailure";

describe("sourceState", () => {
  const now = 10_000;
  it.each([
    [null, "missing"],
    [String(now - 900), "ok"],
    [String(now - 901), "old"],
    [String(now + 50), "ok"],
  ])("timestamp %s is %s", (timestamp, state) => expect(sourceState(timestamp, now, 900)).toBe(state));
  it("judges nothing before the clock runs", () => expect(sourceState("1", 0, 900)).toBe("ok"));
});

describe("txFailure", () => {
  const timeout = Object.assign(new Error("timed out"), { name: "WaitForTransactionReceiptTimeoutError" });
  it("a sent but unconfirmed transaction is not called a failure", () => {
    const result = txFailure({ error: timeout, hash: "0xabc", reverted: false, stepsDone: 0, now: 0 });
    expect(result).toEqual({ text: expect.stringMatching(/sent.*not confirmed.*before you repeat/i), hash: "0xabc" });
    expect(result.text).not.toMatch(/nothing changed/i);
  });
  it("a reverted transaction changed nothing and can be inspected", () => {
    expect(txFailure({ error: new Error("reverted"), hash: "0xabc", reverted: true, stepsDone: 0, now: 0 })).toEqual({
      text: expect.stringMatching(/refused.*nothing changed/i),
      hash: "0xabc",
    });
  });
  it("says what went through before a later step failed", () => {
    const rejected = Object.assign(new Error("x"), { code: 4001 });
    const { text } = txFailure({ error: rejected, hash: undefined, reverted: false, stepsDone: 1, now: 0 });
    expect(text).toMatch(/rejected/i);
    expect(text).toMatch(/step before.*went through/i);
  });
  it("an early failure keeps the plain explanation", () => {
    expect(txFailure({ error: new Error("?"), hash: undefined, reverted: false, stepsDone: 0, now: 0 })).toEqual({
      text: "The transaction did not go through. Nothing changed.",
      hash: undefined,
    });
  });
});

describe("chatPayload", () => {
  const u = (content: string) => ({ role: "user" as const, content });
  const a = (content: string) => ({ role: "assistant" as const, content });
  it("leaves out an order that never got an answer, so it is not executed later", () => {
    expect(chatPayload([u("Buy $50 of gold."), u("What is the price?")])).toEqual([u("What is the price?")]);
    expect(chatPayload([u("one"), a("1"), u("lost"), u("two")])).toEqual([u("one"), a("1"), u("two")]);
  });
  it("leaves out empty answers together with their question", () => {
    expect(chatPayload([u("one"), a(""), u("two")])).toEqual([u("two")]);
  });
  it("keeps the last 20 messages and starts with the user", () => {
    const turns = Array.from({ length: 31 }, (_, i) => (i % 2 ? a(`${i}`) : u(`${i}`)));
    const payload = chatPayload(turns);
    expect(payload.length).toBeLessThanOrEqual(20);
    expect(payload[0]!.role).toBe("user");
    expect(payload.at(-1)).toEqual(u("30"));
  });
});
