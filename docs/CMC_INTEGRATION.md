# CoinMarketCap and Atlas integration

CoinMarketCap × Atlas track, one page. Mandrail on BSC testnet.

## Problem and audience

AI agents start to trade tokenized real-world assets for people. A price feed alone does not stop a bad trade. Mandrail turns market data into on-chain rules an agent cannot argue with. For owners who delegate to agents, agent-wallet providers, and RWA issuers who need an audit trail.

## What we use and why

| Source | Endpoint or feed | Fields | What it decides on-chain |
|---|---|---|---|
| CoinMarketCap Pro API | `GET /v3/cryptocurrency/quotes/latest?id=4705,40215` (PAXG, NVDAB) | `price` | Trade price and the minimum the owner must receive |
| | | `percent_change_1h` | **Volatility breaker**: `VOLATILITY_BREAKER` |
| | | `last_updated` | Staleness: `RISK_DATA_STALE`. Pushing an old quote again does not make it fresh |
| | | `percent_change_24h` | Shown to the owner |
| Atlas MultiFeed, BSC mainnet | `fetch(bytes4)`, feed 934 (NVDAB) at `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa` | price, on-chain timestamp | **Divergence breaker**: `PRICE_DIVERGENCE` between CMC and Atlas |

Why these assets: PAXG is tokenized gold. NVDAB is a tokenized NVIDIA stock on BNB Chain that both sources price, so two independent sources can be compared. Atlas has no gold feed we could find, so tGOLD uses CoinMarketCap alone and the UI says so.

## From `percent_change_1h` to a blocked trade

1. The attester reads CMC and converts -2.35% to -23,500 ppm.
2. `RiskOracle.updateBatch` stores it with CMC's own timestamp.
3. The owner sets a limit. The button "Set below current move" uses half of the live move.
4. `PolicyGuard` compares and blocks. The event carries the move and the limit.

Seen live on 26 Nov 2026:

| Decision | Numbers | Transaction |
|---|---|---|
| VOLATILITY_BREAKER | 1h move 0.7604%, limit 0.3802% | [0x3731b8d7…](https://testnet.bscscan.com/tx/0x3731b8d78595a7314e609889579049e16b04b5d994ed9f7d89ba30634a6c2c6e) |
| PRICE_DIVERGENCE | CMC $149.31, Atlas $149.65, gap 0.2288%, limit 0.1144% | [0x4215e11e…](https://testnet.bscscan.com/tx/0x4215e11e0414628759817ffb3569e14848fceddb9918bddeee4717eeec33e220) |

## Proof of live calls

Server log, followed by the transaction that carried the data:

```
[attester] trigger=manual CMC PAXG $3571.1641149621164 1h=0.75685097652% last_updated=2026-11-25T20:28:04.000Z
[attester] trigger=manual CMC NVDAB $148.3256030390051 1h=0.389075802963% last_updated=2026-11-25T20:28:04.000Z Atlas=$148.46
[attester] trigger=manual pushed 2 assets tx=0xe1131f1af3646da6ed6a0ac8beaf770bcb8db1e1707409ef743eb554f52e6267
```

[That transaction on BscScan](https://testnet.bscscan.com/tx/0xe1131f1af3646da6ed6a0ac8beaf770bcb8db1e1707409ef743eb554f52e6267). Calls are also visible in the CMC account's usage, and every push emits `RiskUpdated` on [RiskOracle](https://testnet.bscscan.com/address/0xBAe86c6B527866A4a256b5Dd0407Ba245e70e124#events).

## Quota and failure handling

One call prices both assets. Answers are cached for 30 s. Pushes run every 5 minutes (288 calls per day) plus before a trade when the quote is older than 120 s, with a hard limit of 500 per day. The agent's price lookups share the 30 s cache. Open pages never call CMC. If CMC misses a price or a change for one asset, that asset is skipped and never becomes 0. If Atlas does not answer, the CMC part still updates and the last Atlas price keeps its age, so the guard blocks once it is older than an hour.

## Contract addresses

PolicyGuard `0x93488ef82D9d678157Db8Ec977128d915884A60B`, RiskOracle `0xBAe86c6B527866A4a256b5Dd0407Ba245e70e124`. The full list is in the [README](../README.md#deployed-on-bsc-testnet-all-verified).

## What comes next

Today one attester relays both sources to testnet, which is a trust assumption. `AtlasRiskCheck` reads Atlas directly on BSC mainnet with the same rules; it is written and tested on a mainnet fork. Next: the guard itself reads Atlas, CMC data comes signed inside the trade, more bStocks (TSLAB and SPYB already have both a CMC id and a live Atlas feed).

## Team and contacts

Filled in on the HackQuest submission.
