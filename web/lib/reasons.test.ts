import { encodeAbiParameters, getAddress, parseAbiParameters, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { REASONS, decodeContext, explain, reasonName } from "./reasons";

const A = getAddress("0x00000000000000000000000000000000000000aa");
const B = getAddress("0x00000000000000000000000000000000000000bb");
const E = 10n ** 18n;
const enc = (types: string, values: unknown[]) =>
  encodeAbiParameters(parseAbiParameters(types) as never, values as never) as Hex;
const symbolOf = (a: string) => (a.toLowerCase() === A.toLowerCase() ? "tEQUITY" : a);

const cases: [number, Hex, Record<string, unknown>, RegExp][] = [
  [0, "0x", {}, /allowed/i],
  [1, enc("address,address", [A, B]), { caller: A, agent: B }, /not the agent/i],
  [2, "0x", {}, /revoked/i],
  [3, enc("uint64,uint64", [100n, 200n]), { expiresAt: 100n, now: 200n }, /expired/i],
  [4, enc("address", [A]), { asset: A }, /tEQUITY is not in the mandate/],
  [5, enc("address,bytes2", [A, "0x5553"]), { asset: A, jurisdiction: "US" }, /tEQUITY.*restricted.*US/],
  [6, enc("address,bool,bool", [B, false, false]), { venue: B, approved: false, denied: false }, /not approved/i],
  [7, enc("uint256,uint256", [150n * E, 100n * E]), { requested: 150n * E, limit: 100n * E }, /\$150\.00.*\$100\.00/],
  [
    8,
    enc("uint256,uint256,uint256", [50n * E, 160n * E, 200n * E]),
    { requested: 50n * E, spent: 160n * E, limit: 200n * E },
    /\$50\.00.*\$160\.00.*\$200\.00/,
  ],
  [
    9,
    enc("uint8,uint64,uint64,uint64", [1, 100n, 5000n, 3600n]),
    { source: "Atlas", timestamp: 100n, now: 5000n, maxAge: 3600n },
    /Atlas.*4900 s.*3600 s/,
  ],
  [
    10,
    enc("uint256,uint256,uint256,uint32", [101n * E, 100n * E, 10000n, 5000]),
    { cmcPrice: 101n * E, atlasPrice: 100n * E, gapPpm: 10000n, maxPpm: 5000n },
    /CoinMarketCap \$101\.00.*Atlas \$100\.00.*1%.*0\.5%/,
  ],
  [11, enc("int256,uint32", [-40n, 20]), { change1hPpm: -40n, maxPpm: 20n }, /-0\.004%.*0\.002%/],
  [12, enc("uint256,uint256", [50n * E, 40n * E]), { requested: 50n * E, balance: 40n * E }, /\$50\.00.*\$40\.00/],
  [13, enc("address,uint64", [A, 1795618800n]), { asset: A, now: 1795618800n }, /tEQUITY.*closed/],
];

describe("reasons", () => {
  it("has the contract's 14 codes in order", () => {
    expect(REASONS).toEqual([
      "OK", "NOT_AGENT", "MANDATE_INACTIVE", "MANDATE_EXPIRED", "ASSET_NOT_ALLOWED", "JURISDICTION_RESTRICTED",
      "VENUE_DENIED", "EXCEEDS_PER_TRADE", "EXCEEDS_PERIOD", "RISK_DATA_STALE", "PRICE_DIVERGENCE",
      "VOLATILITY_BREAKER", "INSUFFICIENT_BALANCE", "UNDERLYING_MARKET_CLOSED",
    ]);
  });

  it.each(cases)("decodes and explains code %s", (code, ctx, decoded, text) => {
    expect(decodeContext(code, ctx)).toEqual(decoded);
    expect(explain(code, decodeContext(code, ctx), symbolOf)).toMatch(text);
  });

  it("says when there is no price at all", () => {
    const ctx = decodeContext(9, enc("uint8,uint64,uint64,uint64", [0, 0n, 5000n, 900n]));
    expect(explain(9, ctx, symbolOf)).toMatch(/no CoinMarketCap price/i);
  });

  it("says when a venue is on the denylist", () => {
    expect(explain(6, decodeContext(6, enc("address,bool,bool", [B, true, true])), symbolOf)).toMatch(/denylist/i);
  });

  it("survives an unknown code and broken context", () => {
    expect(reasonName(99)).toBe("UNKNOWN_99");
    expect(decodeContext(7, "0x1234")).toEqual({});
    expect(explain(7, {}, symbolOf)).toMatch(/per-trade/i);
  });
});
