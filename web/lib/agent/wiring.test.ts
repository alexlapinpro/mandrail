import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimit } from "../rateLimit";

const state = vi.hoisted(() => ({ limiter: null as unknown, pending: 0 }));
vi.mock("../rateLimit", async (original) => ({ ...(await original<object>()), rateLimit: () => state.limiter }));
vi.mock("../txQueue", () => ({ txQueue: () => ({ pending: () => state.pending }) }));
vi.mock("./client", () => ({ azureModel: () => ({ complete: vi.fn() }) }));
import { agentDeps } from "./wiring";

const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b1";
const DEMO = "0x00000000000000000000000000000000000000D1";
const owner = (who: string, id = 1n) => agentDeps("owner", id, who);
const count = (take: () => boolean) => {
  let n = 0;
  while (n < 5000 && take()) n++;
  return n;
};

beforeEach(() => {
  state.limiter = createRateLimit(Date.now);
  state.pending = 0;
  process.env.DEMO_OWNERS = `${DEMO.toLowerCase()}, 0x00000000000000000000000000000000000000d2`;
});

describe("daily limits", () => {
  it("counts per owner, not per mandate, because mandates are free", () => {
    expect(count(owner(A, 1n).takeModelCall)).toBe(200);
    expect(owner(A, 2n).takeModelCall()).toBe(false);
    expect(count(owner(A, 3n).takeTransaction)).toBe(80);
    expect(owner(A.toUpperCase().replace("0X", "0x"), 4n).takeTransaction()).toBe(false);
    expect(owner(B).takeModelCall()).toBe(true);
  });

  it("strangers together get 500 model calls and 200 transactions", () => {
    let models = 0;
    let transactions = 0;
    for (let i = 1; i <= 5; i++) {
      const who = `0x${String(i).padStart(40, "0")}`;
      models += count(owner(who).takeModelCall);
      transactions += count(owner(who).takeTransaction);
    }
    expect([models, transactions]).toEqual([500, 200]);
  });

  it("the presenter keeps an own reserve after strangers used up everything", () => {
    for (let i = 1; i <= 5; i++) {
      const who = `0x${String(i).padStart(40, "0")}`;
      count(owner(who).takeModelCall);
      count(owner(who).takeTransaction);
    }
    expect(count(owner(DEMO).takeModelCall)).toBe(500);
    expect(count(owner(DEMO).takeTransaction)).toBe(200);
  });

  it("refuses strangers while the agent's queue is full, not the presenter", () => {
    state.pending = 6;
    expect(owner(A).busy()).toBe(true);
    expect(owner(DEMO).busy()).toBe(false);
    state.pending = 5;
    expect(owner(A).busy()).toBe(false);
  });

  it("one visitor gets a share of the challenge, not all of it", () => {
    const visitor = agentDeps("challenge", 9n, "1.2.3.4");
    expect(count(visitor.takeModelCall)).toBe(60);
    expect(agentDeps("challenge", 9n, "5.6.7.8").takeModelCall()).toBe(true);
  });

  it("the challenge has 1000 model calls and 300 transactions in total", () => {
    let models = 0;
    let transactions = 0;
    for (let i = 0; i < 40; i++) {
      models += count(agentDeps("challenge", 9n, `10.0.0.${i}`).takeModelCall);
      transactions += count(agentDeps("challenge", 9n, `10.0.0.${i}`).takeTransaction);
    }
    expect([models, transactions]).toEqual([1000, 300]);
    expect(owner(A).takeModelCall()).toBe(true);
  });
});
