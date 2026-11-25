import { describe, expect, it } from "vitest";
import { createRateLimit } from "./rateLimit";

function setup() {
  let now = 0;
  return { limit: createRateLimit(() => now), advance: (ms: number) => (now += ms) };
}

describe("rate limit", () => {
  it("allows up to the maximum, then says how long to wait", () => {
    const { limit, advance } = setup();
    for (let i = 0; i < 10; i++) expect(limit.take("chat", "a", 10, 60_000).ok).toBe(true);
    advance(20_000);
    expect(limit.take("chat", "a", 10, 60_000)).toEqual({ ok: false, retryAfter: 40 });
    advance(40_000);
    expect(limit.take("chat", "a", 10, 60_000).ok).toBe(true);
  });

  it("separates keys and buckets", () => {
    const { limit } = setup();
    expect(limit.take("chat", "a", 1, 1000).ok).toBe(true);
    expect(limit.take("chat", "b", 1, 1000).ok).toBe(true);
    expect(limit.take("break", "a", 1, 1000).ok).toBe(true);
    expect(limit.take("chat", "a", 1, 1000).ok).toBe(false);
  });

  it("a refused call does not extend the wait", () => {
    const { limit, advance } = setup();
    limit.take("chat", "a", 1, 1000);
    advance(900);
    limit.take("chat", "a", 1, 1000);
    advance(100);
    expect(limit.take("chat", "a", 1, 1000).ok).toBe(true);
  });

  it("forgets idle keys so strangers cannot fill the memory", () => {
    const { limit, advance } = setup();
    for (let i = 0; i < 5000; i++) limit.take("break", `ip${i}`, 5, 1000);
    advance(2000);
    limit.take("break", "last", 5, 1000);
    expect(limit.size()).toBeLessThan(10);
  });
});
