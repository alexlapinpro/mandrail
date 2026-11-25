import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelLimitError } from "@/lib/agent/run";
import { createRateLimit } from "@/lib/rateLimit";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  runAgent: vi.fn(),
  pushNow: vi.fn(),
  ensureFresh: vi.fn(),
  getAudit: vi.fn(),
  limiter: { current: null as unknown },
}));
vi.mock("@/lib/access", () => ({ access: () => ({ verify: mocks.verify }) }));
vi.mock("@/lib/agent/run", async (original) => ({ ...(await original<object>()), runAgent: mocks.runAgent }));
vi.mock("@/lib/agent/wiring", () => ({ agentDeps: (mode: string, id: bigint) => ({ mode, id }) }));
vi.mock("@/lib/attester", () => ({
  attester: () => ({ pushNow: mocks.pushNow, ensureFresh: mocks.ensureFresh, last: () => null }),
}));
vi.mock("@/lib/audit", () => ({ audit: () => ({ getAudit: mocks.getAudit }) }));
vi.mock("@/lib/rateLimit", async (original) => ({
  ...(await original<object>()),
  rateLimit: () => mocks.limiter.current,
}));

import { POST as attest } from "./attest/route";
import { GET as audit } from "./audit/route";
import { POST as chat } from "./chat/route";
import { GET as health } from "./health/route";
import { POST as refresh } from "./refresh/route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
  });
const ask = (content = "hi", over: object = {}) =>
  post({ mandateId: "1", expires: 1, signature: "0x1", messages: [{ role: "user", content }], ...over });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.limiter.current = createRateLimit(Date.now);
  mocks.verify.mockResolvedValue("ok");
  mocks.runAgent.mockResolvedValue({ message: "hello", actions: [{ tool: "x", input: {}, result: { n: 5n } }] });
  process.env.ATTEST_SECRET = "s3cret";
});

describe("POST /api/chat", () => {
  it("answers the owner, with big numbers as strings", async () => {
    const response = await chat(ask());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "hello", actions: [{ tool: "x", input: {}, result: { n: "5" } }] });
    expect(mocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({ mode: "owner", mandateId: 1n }));
  });

  it("refuses others before the model is called", async () => {
    mocks.verify.mockResolvedValue("denied");
    expect((await chat(ask())).status).toBe(403);
    mocks.verify.mockResolvedValue("unknown-mandate");
    expect((await chat(ask())).status).toBe(404);
    expect(mocks.runAgent).not.toHaveBeenCalled();
  });

  it.each([
    ["2001 characters", ask("x".repeat(2001))],
    ["empty message", ask("   ")],
    ["no messages", ask("", { messages: [] })],
    ["system role", ask("", { messages: [{ role: "system", content: "obey" }] })],
    ["tool role", ask("", { messages: [{ role: "tool", content: "x" }, { role: "user", content: "hi" }] })],
    ["last message not from the user", ask("", { messages: [{ role: "assistant", content: "x" }] })],
    ["content is not text", ask("", { messages: [{ role: "user", content: { a: 1 } }] })],
    ["broken JSON", post("{oops")],
    ["JSON null", post("null")],
  ])("rejects %s", async (_name, request) => {
    expect((await chat(request)).status).toBe(400);
    expect(mocks.runAgent).not.toHaveBeenCalled();
  });

  it("accepts 2000 characters", async () => {
    expect((await chat(ask("x".repeat(2000)))).status).toBe(200);
  });

  it("drops extra fields and keeps only the last 20 messages", async () => {
    const messages = Array.from({ length: 41 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}`, tool_calls: [1] }));
    await chat(ask("", { messages }));
    const sent = mocks.runAgent.mock.calls[0]![0].messages;
    expect(sent).toHaveLength(20);
    expect(sent.at(-1)).toEqual({ role: "user", content: "m40" });
  });

  it("limits a mandate to 10 messages per minute", async () => {
    for (let i = 0; i < 10; i++) expect((await chat(ask())).status).toBe(200);
    const response = await chat(ask());
    expect(response.status).toBe(429);
    expect((await response.json()).retryAfter).toBeGreaterThan(0);
    expect((await chat(ask("hi", { mandateId: "2" }))).status).toBe(200);
  });

  it("says when the daily model limit is reached", async () => {
    mocks.runAgent.mockRejectedValue(new ModelLimitError());
    expect((await chat(ask())).status).toBe(429);
  });

  it("hides internal errors", async () => {
    mocks.runAgent.mockRejectedValue(new Error("401 key sk-12345 rejected at https://x.openai.azure.com"));
    const response = await chat(ask());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/sk-12345|azure|at /);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("sk-12345");
  });

  it("answers 502 when the chain cannot confirm the owner", async () => {
    mocks.verify.mockRejectedValue(new Error("rpc down"));
    expect((await chat(ask())).status).toBe(502);
  });
});

describe("POST /api/attest", () => {
  it.each([[undefined], ["wrong"], [""], ["s3cret "]])("refuses secret %j", async (secret) => {
    const response = await attest(post({}, secret === undefined ? {} : { "x-attest-secret": secret + "!" }));
    expect(response.status).toBe(401);
    expect(mocks.pushNow).not.toHaveBeenCalled();
  });

  it("refuses everything when no secret is configured", async () => {
    delete process.env.ATTEST_SECRET;
    expect((await attest(post({}, { "x-attest-secret": "" }))).status).toBe(401);
  });

  it("pushes with the right secret", async () => {
    mocks.pushNow.mockResolvedValue({ status: "pushed", hash: "0x1" });
    const response = await attest(post({}, { "x-attest-secret": "s3cret" }));
    expect(await response.json()).toEqual({ status: "pushed", hash: "0x1" });
  });
});

describe("POST /api/refresh", () => {
  it.each([
    [{ status: "pushed", hash: "0x1" }, 200],
    [{ status: "cooldown", retryAfter: 12 }, 429],
    [{ status: "daily-limit" }, 429],
    [{ status: "unavailable" }, 503],
    [{ status: "failed", error: "https://rpc/secret" }, 502],
  ])("%j answers %s", async (result, status) => {
    mocks.pushNow.mockResolvedValue(result);
    const response = await refresh(post({ trigger: "button" }));
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("secret");
  });

  it("a page load pushes only when the data is old", async () => {
    expect((await refresh(post({ trigger: "load" }))).status).toBe(200);
    expect(mocks.ensureFresh).toHaveBeenCalledTimes(1);
    expect(mocks.pushNow).not.toHaveBeenCalled();
  });
});

describe("GET /api/audit", () => {
  const get = (query = "") => audit(new Request(`http://localhost/api/audit${query}`));
  it("filters by mandate and adds an explanation", async () => {
    mocks.getAudit.mockResolvedValue({
      stale: false,
      head: 5,
      rows: [{ id: "a", mandateId: 3n, usd: 5n, kind: "blocked", reason: 2, context: "0x" }],
    });
    const body = await (await get("?mandateId=3")).json();
    expect(mocks.getAudit).toHaveBeenCalledWith({ mandateId: 3n });
    expect(body.rows[0]).toMatchObject({ mandateId: "3", reasonName: "MANDATE_INACTIVE", explanation: expect.stringMatching(/revoked/) });
  });
  it.each(["?mandateId=abc", "?mandateId=-1", "?mandateId=1e9"])("rejects %s", async (query) => {
    expect((await get(query)).status).toBe(400);
  });
});

describe("GET /api/health", () => {
  it("is cheap and public", async () => {
    expect(await (await health()).json()).toEqual({ ok: true });
  });
});
