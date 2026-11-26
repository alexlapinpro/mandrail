import { describe, expect, it, vi } from "vitest";
import { createPendingChanges } from "./pendingChanges";

describe("pending rule changes", () => {
  it("counts changes in flight and tells listeners", () => {
    const store = createPendingChanges();
    const seen = vi.fn();
    store.subscribe(seen);
    const one = store.start();
    const two = store.start();
    expect(store.count()).toBe(2);
    one();
    one(); // ending twice changes nothing
    expect(store.count()).toBe(1);
    two();
    expect(store.count()).toBe(0);
    expect(seen).toHaveBeenCalledTimes(4); // two starts, two ends
  });
  it("stops telling a listener after unsubscribe", () => {
    const store = createPendingChanges();
    const seen = vi.fn();
    store.subscribe(seen)();
    store.start()();
    expect(seen).not.toHaveBeenCalled();
  });
});
