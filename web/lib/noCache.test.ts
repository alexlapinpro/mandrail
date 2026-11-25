import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Next.js 14 stores fetch answers on disk unless told otherwise. A cached RPC or model answer would show old
// prices and could repeat an old decision after a restart, so every outgoing call must opt out.
const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}"));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(process.env, {
    AZURE_OPENAI_ENDPOINT: "http://azure.test",
    AZURE_OPENAI_API_KEY: "k",
    AZURE_OPENAI_DEPLOYMENT: "d",
    AZURE_OPENAI_API_VERSION: "v",
  });
});
afterEach(() => vi.unstubAllGlobals());

const cacheModes = () => fetchMock.mock.calls.map(([, init]) => init?.cache);

describe("outgoing requests are never cached", () => {
  it.each(["publicClient", "logsClient", "mainnetClient"] as const)("%s", async (name) => {
    const clients = await import("./clients");
    await clients[name]().getBlockNumber().catch(() => {});
    expect(cacheModes().length).toBeGreaterThan(0);
    expect(new Set(cacheModes())).toEqual(new Set(["no-store"]));
  });

  it("the model client", async () => {
    const { azureModel } = await import("./agent/client");
    await azureModel().complete({ messages: [{ role: "user", content: "hi" }], tools: [] }).catch(() => {});
    expect(cacheModes().length).toBeGreaterThan(0);
    expect(new Set(cacheModes())).toEqual(new Set(["no-store"]));
  });
});
