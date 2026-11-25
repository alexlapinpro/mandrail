# HackQuest form texts

**Name:** Mandrail

**Tagline:** Rules for AI agents that trade tokenized assets, enforced on BNB Chain before the trade happens.

**Tracks:** Developer Track, CoinMarketCap × Atlas

**Short description**

AI agents start to trade tokenized real-world assets for people, but a prompt is not a rule. With Mandrail the owner signs a mandate and the agent can trade only through an on-chain guard. The guard runs 13 checks in a fixed order: assets, jurisdiction, approved venues, limits, fresh prices, agreement between CoinMarketCap and Atlas, volatility, market hours. Every decision, allowed or blocked, stays on-chain with its reason and numbers.

**What makes it different**

- Blocked attempts do not revert. They are a permanent record of what the agent tried.
- Live CoinMarketCap and Atlas data decide trades on-chain, not only on a dashboard.
- Break my agent: a public agent without safety rules holds a testnet mandate. In our own test of ten attacks none got through.

**BNB Chain use**

10 verified contracts on BSC testnet, agent registered in the official ERC-8004 registry (id 2929), Atlas feeds read from BSC mainnet, tEQUITY priced from NVDAB, a tokenized stock on BNB Chain.

**Built during the event:** yes, 25–27 Nov 2026.

| Field | Value |
|---|---|
| Repository | filled in after the first push |
| Live app | filled in after the Railway deployment |
| Video | filled in after recording |
| Team and contacts | filled in by the team |
