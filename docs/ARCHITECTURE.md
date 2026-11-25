# Architecture

## Contracts

| Contract | Role | Who controls it |
|---|---|---|
| `PolicyGuard` | Holds each mandate's tUSD, runs the 13 checks, trades | Nobody: no admin, no upgrade |
| `MandateRegistry` | Mandates and their changes | Each mandate by its owner |
| `RiskOracle` | Latest CoinMarketCap and Atlas data per asset | Attester pushes, admin sets which assets need a second source |
| `ComplianceRegistry` | Restricted assets per jurisdiction, approved and denied venues | Admin |
| `MarketCalendar` | US market hours, holidays, early closes | Admin |
| `RWAMarket` | Demo venue: sells test assets at the oracle price | Admin |
| `RogueVenue` | Demo attacker: takes money, delivers nothing. Never approved | Nobody |
| `AtlasRiskCheck` | Read-only comparison with Atlas on BSC mainnet. Written and tested on a fork | Nobody |
| `TestUSD`, `TestRWA` | Test assets | Faucet; only the market mints |

## What happens in `executeTrade`

1. Run the checks in enum order. The first failure wins.
2. On failure emit `TradeBlocked` with the reason and context, return `(false, reason)`. Nothing moves and nothing reverts.
3. On success book the spend first, then buy. The guard approves exactly the amount, sets the approval back to 0, requires that exactly this amount left, and measures what the **owner** received. Less than 99% of the oracle-priced amount reverts the trade.
4. Tokens go straight to the owner. The guard never holds them.

Malformed input (unknown mandate, zero amount) and a misbehaving venue revert: these are errors, not policy decisions. The app shows them as "failed, no policy decision".

The spending period is a fixed window that starts with the first trade. Anyone can call `executeTrade`; a stranger gets `NOT_AGENT` and is recorded with their own address. The feed labels these "unauthorised caller".

## Reason codes and context

| Code | Reason | Context (ABI) |
|---|---|---|
| 0 | OK | empty |
| 1 | NOT_AGENT | `address caller, address agent` |
| 2 | MANDATE_INACTIVE | empty |
| 3 | MANDATE_EXPIRED | `uint64 expiresAt, uint64 now` |
| 4 | ASSET_NOT_ALLOWED | `address asset` |
| 5 | JURISDICTION_RESTRICTED | `address asset, bytes2 jurisdiction` |
| 6 | VENUE_DENIED | `address venue, bool approved, bool denied` |
| 7 | EXCEEDS_PER_TRADE | `uint256 requested, uint256 limit` |
| 8 | EXCEEDS_PERIOD | `uint256 requested, uint256 spent, uint256 limit` |
| 9 | RISK_DATA_STALE | `uint8 source (0 CMC, 1 Atlas), uint64 timestamp, uint64 now, uint64 maxAge` |
| 10 | PRICE_DIVERGENCE | `uint256 cmcPrice, uint256 atlasPrice, uint256 gapPpm, uint32 maxPpm` |
| 11 | VOLATILITY_BREAKER | `int256 change1hPpm, uint32 maxPpm` |
| 12 | INSUFFICIENT_BALANCE | `uint256 requested, uint256 balance` |
| 13 | UNDERLYING_MARKET_CLOSED | `address asset, uint64 now` |

Money and prices use 18 decimals. Moves and gaps use parts per million (1% = 10,000), because gold can move less than one basis point in an hour.

## Server

One Next.js process serves the UI, the API, the agent and the price loop.

| Part | Behaviour |
|---|---|
| Price push | Every 5 minutes when `ATTESTER_LOOP=on`, and before a trade when the on-chain quote is older than 120 s. At most one push per 30 s. Trades get 200 pushes per day and public triggers 150; the loop is never refused |
| Transactions | One queue per key. The outcome shown to the user comes from the receipt's events, never from model text |
| Chat access | The owner signs one EIP-191 message (mandate, chain, guard, expiry up to an hour). The server compares the signer with the on-chain owner. The mandate id is bound on the server; the model cannot choose it |
| Limits | 10 messages per minute per mandate, 30 per network address, 5 transactions per message. Daily caps per owner address and in total, because mandates are free. Addresses in `DEMO_OWNERS` have their own reserve. `/break`: 15 messages per minute and 60 model calls per day per network address, 1,000 model calls and 300 transactions in total |
| Shared reads | Pages poll the server; chain reads behind `/api/risk` and `/api/break` are shared for 4 s |
| Audit feed | Built from events, in memory. The chain is the only database. A decision is dropped only after three reads without it, so a lagging RPC node cannot hide it |

The process must run as **one replica**. Two would share keys without sharing the queue and collide on nonces. Scaling out needs a shared queue and shared counters.

## Trust assumptions

| Assumption | Why it is here | What replaces it |
|---|---|---|
| One attester relays both CoinMarketCap and Atlas to testnet | Atlas has no code at the MultiFeed address on testnet | Guard reads Atlas directly; quorum for CMC |
| Admin manages restrictions, venues, the calendar and the attester role | Hackathon scope | Multisig, then compliance providers |
| Jurisdiction is declared by the owner | No KYC in scope | Verifiable credentials |
| The demo agent key is on the server | Server-side agent | Agent wallet or TEE. The guard limits the damage either way |

## What an attacker can and cannot do

| With | Can | Cannot |
|---|---|---|
| The agent's key | Buy allowed assets within limits at the oracle price, tokens go to the owner | Withdraw, change the mandate, use an unapproved venue, exceed a limit, take delivery elsewhere |
| A persuasive prompt | The same as above | Anything more |
| The attester key | Push wrong prices, within the checks the mandate sets. Wrong prices can make the owner overpay or stop trading | Withdraw, trade, change mandates |
| The admin key | Everything the attester can, because it can grant that role. With a wrong price and a bad venue it can take what a mandate may still spend, within the mandate's limits | Withdraw unspent money, change mandates, exceed a limit. The owner can revoke and withdraw at any time |

## Known simplifications

- The calendar knows US winter hours only.
- The ERC-8004 identity is checked when a mandate is created, not at every trade.
- Making the period longer brings spending of an already ended window back into the count. This only tightens the limit.
- Strangers can add `NOT_AGENT` entries to a mandate's feed at their own gas cost.
- Only buying is supported.
- Rate limits live in memory and reset when the process restarts. That is also the emergency button.
- The period is a fixed window, not a rolling one: up to twice the period limit can be spent around the edge between two windows.
- The chat signature has no domain and no nonce. Someone who obtains it can talk to the agent of that mandate for up to an hour, within the mandate. Contract wallets cannot sign in.
- A stuck transaction is not replaced with a higher fee; later ones of the same key wait behind it.
- The contracts have not had an external audit.
