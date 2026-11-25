import { describe, expect, it, vi } from "vitest";
import { createCached } from "./cached";

describe("cached", () => {
  it("shares one call among parallel readers and for the time to live", async () => {
    let now = 0;
    const load = vi.fn(async () => ++calls);
    let calls = 0;
    const get = createCached(load, 4000, () => now);
    expect(await Promise.all([get(), get(), get()])).toEqual([1, 1, 1]);
    now = 3999;
    expect(await get()).toBe(1);
    now = 4000;
    expect(await get()).toBe(2);
  });
  it("does not remember a failure", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("rpc")).mockResolvedValueOnce("ok");
    const get = createCached(load, 4000, () => 0);
    await expect(get()).rejects.toThrow("rpc");
    expect(await get()).toBe("ok");
  });
});
