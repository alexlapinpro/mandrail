import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimit } from "../rateLimit";

const state = vi.hoisted(() => ({ limiter: null as unknown }));
vi.mock("../rateLimit", async (original) => ({ ...(await original<object>()), rateLimit: () => state.limiter }));
vi.mock("./client", () => ({ azureModel: () => ({ complete: vi.fn() }) }));
import { agentDeps } from "./wiring";

const count = (take: () => boolean) => {
  let n = 0;
  while (n < 2000 && take()) n++;
  return n;
};

describe("daily limits", () => {
  beforeEach(() => {
    state.limiter = createRateLimit(Date.now);
  });

  it("one mandate cannot use up the limits of all owners", () => {
    expect(count(agentDeps("owner", 1n).takeModelCall)).toBe(200);
    expect(count(agentDeps("owner", 1n).takeTransaction)).toBe(80);
    expect(agentDeps("owner", 2n).takeModelCall()).toBe(true);
    expect(agentDeps("owner", 2n).takeTransaction()).toBe(true);
  });

  it("all owners together get 500 model calls and 200 transactions", () => {
    let models = 0;
    let transactions = 0;
    for (let id = 1n; id <= 5n; id++) {
      models += count(agentDeps("owner", id).takeModelCall);
      transactions += count(agentDeps("owner", id).takeTransaction);
    }
    expect([models, transactions]).toEqual([500, 200]);
  });

  it("the challenge has its own 300 model calls and 200 transactions", () => {
    const deps = agentDeps("challenge", 9n);
    expect([count(deps.takeModelCall), count(deps.takeTransaction)]).toEqual([300, 200]);
    expect(agentDeps("owner", 1n).takeModelCall()).toBe(true);
  });
});
