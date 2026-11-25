import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { buildAccessMessage, createAccess } from "./access";

const GUARD = "0x00000000000000000000000000000000000000aA";
const NOW = 1_795_618_800;
const owner = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

const access = createAccess({
  guard: GUARD,
  now: () => NOW * 1000,
  ownerOf: async (id) => (id === 1n || id === 2n ? owner.address : null),
});
const sign = (who: typeof owner, mandateId: string, expires: number, guard = GUARD) =>
  who.signMessage({ message: buildAccessMessage({ mandateId, expires, guard: guard as `0x${string}` }) });

describe("chat access", () => {
  it("has a fixed, readable message", () => {
    expect(buildAccessMessage({ mandateId: "7", expires: NOW, guard: GUARD })).toBe(
      `Mandrail chat access\nMandate: 7\nChain: 97\nGuard: ${GUARD}\nExpires: ${NOW}`,
    );
  });

  it("accepts the owner", async () => {
    const signature = await sign(owner, "1", NOW + 3600);
    expect(await access.verify({ mandateId: "1", expires: NOW + 3600, signature })).toEqual({ status: "ok", owner: owner.address });
  });

  it("rejects another signer", async () => {
    const signature = await sign(stranger, "1", NOW + 60);
    expect(await access.verify({ mandateId: "1", expires: NOW + 60, signature })).toEqual({ status: "denied" });
  });

  it("rejects an expired signature", async () => {
    const signature = await sign(owner, "1", NOW);
    expect(await access.verify({ mandateId: "1", expires: NOW, signature })).toEqual({ status: "denied" });
  });

  it("rejects an expiry more than an hour ahead", async () => {
    const signature = await sign(owner, "1", NOW + 3601);
    expect(await access.verify({ mandateId: "1", expires: NOW + 3601, signature })).toEqual({ status: "denied" });
  });

  it("rejects a signature for another mandate", async () => {
    const signature = await sign(owner, "2", NOW + 60);
    expect(await access.verify({ mandateId: "1", expires: NOW + 60, signature })).toEqual({ status: "denied" });
  });

  it("rejects a signature for another guard", async () => {
    const signature = await sign(owner, "1", NOW + 60, "0x00000000000000000000000000000000000000bB");
    expect(await access.verify({ mandateId: "1", expires: NOW + 60, signature })).toEqual({ status: "denied" });
  });

  it("rejects a changed expiry", async () => {
    const signature = await sign(owner, "1", NOW + 60);
    expect(await access.verify({ mandateId: "1", expires: NOW + 600, signature })).toEqual({ status: "denied" });
  });

  it("reports an unknown mandate", async () => {
    const signature = await sign(owner, "9", NOW + 60);
    expect(await access.verify({ mandateId: "9", expires: NOW + 60, signature })).toEqual({ status: "unknown-mandate" });
  });

  it.each([
    [{ mandateId: "01", expires: NOW + 60, signature: "0x" }],
    [{ mandateId: "-1", expires: NOW + 60, signature: "0x12" }],
    [{ mandateId: 1, expires: NOW + 60, signature: "0x12" }],
    [{ mandateId: "1", expires: "soon", signature: "0x12" }],
    [{ mandateId: "1", expires: NOW + 60, signature: "nope" }],
    [{}],
  ])("rejects malformed input %j", async (input) => {
    expect(await access.verify(input as never)).toEqual({ status: "denied" });
  });

  it("costs no chain read for a broken signature", async () => {
    const ownerOf = vi.fn(async () => owner.address);
    const guarded = createAccess({ guard: GUARD, now: () => NOW * 1000, ownerOf });
    expect(await guarded.verify({ mandateId: "1", expires: NOW + 60, signature: `0x${"11".repeat(65)}` })).toEqual({ status: "denied" });
    expect(ownerOf).not.toHaveBeenCalled();
  });

  it("reads an owner once, because it can never change", async () => {
    const ownerOf = vi.fn(async () => owner.address);
    const guarded = createAccess({ guard: GUARD, now: () => NOW * 1000, ownerOf });
    const signature = await sign(owner, "1", NOW + 60);
    for (let i = 0; i < 3; i++) await guarded.verify({ mandateId: "1", expires: NOW + 60, signature });
    expect(ownerOf).toHaveBeenCalledTimes(1);
  });

  it("does not remember that a mandate is missing", async () => {
    const ownerOf = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(owner.address);
    const guarded = createAccess({ guard: GUARD, now: () => NOW * 1000, ownerOf });
    const signature = await sign(owner, "1", NOW + 60);
    expect((await guarded.verify({ mandateId: "1", expires: NOW + 60, signature })).status).toBe("unknown-mandate");
    expect((await guarded.verify({ mandateId: "1", expires: NOW + 60, signature })).status).toBe("ok");
  });
});
