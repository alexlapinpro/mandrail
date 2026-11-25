import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentFilterError } from "./errors";

beforeEach(() => {
  // The SDK keeps the fetch it was created with, so every test needs a new client.
  delete (globalThis as Record<string, unknown>).__mandrail_azureModel;
  Object.assign(process.env, {
    AZURE_OPENAI_ENDPOINT: "http://azure.test",
    AZURE_OPENAI_API_KEY: "k",
    AZURE_OPENAI_DEPLOYMENT: "d",
    AZURE_OPENAI_API_VERSION: "v",
  });
});
afterEach(() => vi.unstubAllGlobals());

const answer = (status: number, body: object) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })));
const ask = async () => (await import("./client")).azureModel().complete({ messages: [{ role: "user", content: "x" }], tools: [] });

describe("Azure client", () => {
  it("recognises the provider's content filter", async () => {
    answer(400, { error: { code: "content_filter", message: "The response was filtered" } });
    await expect(ask()).rejects.toBeInstanceOf(ContentFilterError);
  });
  it("leaves other errors alone", async () => {
    answer(400, { error: { code: "bad_request", message: "x" } });
    await expect(ask()).rejects.not.toBeInstanceOf(ContentFilterError);
  });
  it("recognises an answer that was cut by the filter", async () => {
    answer(200, { choices: [{ index: 0, finish_reason: "content_filter", message: { role: "assistant", content: null } }] });
    await expect(ask()).rejects.toBeInstanceOf(ContentFilterError);
  });
});
