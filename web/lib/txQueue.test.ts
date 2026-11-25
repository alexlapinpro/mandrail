import { describe, expect, it } from "vitest";
import { createTxQueue } from "./txQueue";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setup(start = 5) {
  const chain = { nonce: start };
  return { chain, queue: createTxQueue(async () => chain.nonce) };
}

describe("transaction queue", () => {
  it("runs 10 parallel jobs one at a time with consecutive nonces", async () => {
    const { queue, chain } = setup(5);
    let running = 0;
    let peak = 0;
    const nonces = await Promise.all(
      Array.from({ length: 10 }, () =>
        queue.enqueue("agent", async (nonce) => {
          peak = Math.max(peak, ++running);
          await wait(1);
          running--;
          chain.nonce = nonce + 1;
          return nonce;
        }),
      ),
    );
    expect(peak).toBe(1);
    expect(nonces).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("moves on when the RPC still reports the old nonce", async () => {
    const { queue } = setup(5); // the chain value never changes
    const run = () => queue.enqueue("agent", async (nonce) => nonce);
    expect([await run(), await run()]).toEqual([5, 6]);
  });

  it("a failed job does not block the next and gives its nonce back", async () => {
    const { queue } = setup(5);
    await expect(queue.enqueue("agent", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await queue.enqueue("agent", async (n) => n)).toBe(5);
  });

  it("retries a nonce error once, with a fresh nonce", async () => {
    const { queue, chain } = setup(5);
    const seen: number[] = [];
    const result = await queue.enqueue("agent", async (nonce) => {
      seen.push(nonce);
      if (seen.length === 1) {
        chain.nonce = 8;
        throw new Error("nonce too low: next nonce 8");
      }
      return nonce;
    });
    expect(result).toBe(8);
    expect(seen).toEqual([5, 8]);
  });

  it("surfaces a second nonce error", async () => {
    const { queue } = setup(5);
    let calls = 0;
    const job = queue.enqueue("agent", async () => {
      calls++;
      throw new Error("nonce too low");
    });
    await expect(job).rejects.toThrow("nonce too low");
    expect(calls).toBe(2);
  });

  it("does not retry other errors, so a trade is never sent twice", async () => {
    const { queue } = setup(5);
    let calls = 0;
    const job = queue.enqueue("agent", async () => {
      calls++;
      throw new Error("already known");
    });
    await expect(job).rejects.toThrow("already known");
    expect(calls).toBe(1);
  });

  it("different keys do not wait for each other", async () => {
    const { queue } = setup(5);
    let release = () => {};
    const slow = queue.enqueue("agent", () => new Promise<void>((r) => (release = r)));
    expect(await queue.enqueue("attester", async () => "done")).toBe("done");
    release();
    await slow;
  });
});
