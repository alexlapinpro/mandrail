import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
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
    expect(await access.verify({ mandateId: "1", expires: NOW + 3600, signature })).toBe("ok");
  });

  it("rejects another signer", async () => {
    const signature = await sign(stranger, "1", NOW + 60);
    expect(await access.verify({ mandateId: "1", expires: NOW + 60, signature })).toBe("denied");
  });

  it("rejects an expired signature", async () => {
    const signature = await sign(owner, "1", NOW);
    expect(await access.verify({ mandateId: "1", expires: NOW, signature })).toBe("denied");
  });

  it("rejects an expiry more than an hour ahead", async () => {
    const signature = await sign(owner, "1", NOW + 3601);
    expect(await access.verify({ mandateId: "1", expires: NOW + 3601, signature })).toBe("denied");
  });

  it("rejects a signature for another mandate", async () => {
    const signature = await sign(owner, "2", NOW + 60);
    expect(await access.verify({ mandateId: "1", expires: NOW + 60, signature })).toBe("denied");
  });

  it("rejects a signature for another guard", async () => {
    const signature = await sign(owner, "1", NOW + 60, "0x00000000000000000000000000000000000000bB");
    expect(await access.verify({ mandateId: "1", expires: NOW + 60, signature })).toBe("denied");
  });

  it("rejects a changed expiry", async () => {
    const signature = await sign(owner, "1", NOW + 60);
    expect(await access.verify({ mandateId: "1", expires: NOW + 600, signature })).toBe("denied");
  });

  it("reports an unknown mandate", async () => {
    const signature = await sign(owner, "9", NOW + 60);
    expect(await access.verify({ mandateId: "9", expires: NOW + 60, signature })).toBe("unknown-mandate");
  });

  it.each([
    [{ mandateId: "01", expires: NOW + 60, signature: "0x" }],
    [{ mandateId: "-1", expires: NOW + 60, signature: "0x12" }],
    [{ mandateId: 1, expires: NOW + 60, signature: "0x12" }],
    [{ mandateId: "1", expires: "soon", signature: "0x12" }],
    [{ mandateId: "1", expires: NOW + 60, signature: "nope" }],
    [{}],
  ])("rejects malformed input %j", async (input) => {
    expect(await access.verify(input as never)).toBe("denied");
  });
});
