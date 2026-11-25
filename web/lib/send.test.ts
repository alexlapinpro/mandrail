import { createServer } from "node:http";
import { generatePrivateKey } from "viem/accounts";
import { describe, expect, it } from "vitest";

describe("sendTransaction", () => {
  it("broadcasts once when the RPC answer is lost, so a trade is never sent twice", async () => {
    const sent: string[] = [];
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (part) => (body += part));
      request.on("end", () => {
        const { id, method, params } = JSON.parse(body);
        const reply = (result: unknown) => response.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
        if (method === "eth_sendRawTransaction") {
          sent.push(params[0]);
          response.statusCode = 503; // accepted, but the answer never arrives
          return response.end();
        }
        if (method === "eth_getTransactionByHash") return reply(null);
        return reply("0x5f5e100");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    process.env.BSC_TESTNET_RPC_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    process.env.AGENT_PRIVATE_KEY = generatePrivateKey();
    const { sendTransaction } = await import("./send");
    const to = "0x00000000000000000000000000000000000000c1";
    await expect(sendTransaction("agent", { to, data: "0x", gas: 1n })).rejects.toThrow();
    server.close();
    expect(sent).toHaveLength(1);
  }, 20_000);
});
