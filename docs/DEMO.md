# Demo, three minutes

## Before you start

| Check | How |
|---|---|
| Wallet on BSC testnet with a little test BNB | [Faucet](https://www.bnbchain.org/en/testnet-faucet), about 0.01 is enough |
| Prices are fresh | Press **Refresh risk data** shortly before the two breaker steps. The "Set below current" buttons use a tenth of the current value, so a refresh in between does not matter. To be fully safe type `0.0001` and save |
| Presenter's wallet is in `DEMO_OWNERS` | It keeps its own daily reserve of model calls and transactions |
| The wallet has no mandate yet, or press **New mandate** | A fresh mandate keeps the numbers below exact |
| Faucet not used in the last hour | It gives 1,000 test USD per hour |
| Chat signature | One signature lasts an hour |

Screen: 1440 px wide or more, so all three columns are visible.

## Script

The times fit an edited video. Live, wallet confirmations and model answers add up: skip the jurisdiction and rogue venue rows to stay within three minutes, or create and fund the mandate beforehand.

| Time | Do | Say | Expected |
|---|---|---|---|
| 0:00 | Show the page | "AI agents start to trade tokenized assets for us. A prompt is not a rule. Mandrail puts the rules on-chain." | |
| 0:15 | **Connect wallet**, **Get test USD**, **Create mandate** with the defaults, **Deposit** 300 | "I sign a mandate: gold only, $100 per trade, $200 a week, Singapore. The agent has its own key and can only go through the guard." | The mandate reads as a sentence, $300 held |
| 0:45 | **Sign to chat**, then "Buy $50 of gold." | "Live CoinMarketCap price. All 13 checks pass, the gold goes straight to me." | Allowed, link to BscScan |
| 1:05 | "Buy $150 of gold." | "It stops at the seventh check. The attempt is on-chain anyway, with the numbers." | Blocked: exceeds per trade |
| 1:20 | "Buy $50 of tEQUITY." | "Not in my mandate." | Blocked: asset not allowed |
| 1:30 | Tick **tEQUITY**, set jurisdiction **US**, send "Buy $50 of tEQUITY." again | "I allow it, but this stock token is restricted for US owners." | Blocked: jurisdiction restricted |
| 1:50 | Jurisdiction **SG**, **Set below current gap**, "Buy $20 of tEQUITY." | "CoinMarketCap and Atlas disagree by more than I accept. Two independent sources, live." | Blocked: price divergence |
| 2:10 | **Set below current move**, "Buy $20 of gold." | "The real one-hour move on CoinMarketCap trips the breaker." | Blocked: volatility breaker |
| 2:25 | "Buy $20 of gold on the rogue venue." | "Even a fake venue that pays nothing cannot be used." | Blocked: venue denied |
| 2:35 | **Revoke mandate**, **Revoke now**, "Buy $20 of gold." | "Kill switch. And I can still withdraw." | Blocked: mandate inactive |
| 2:45 | Scroll the decisions, open one BscScan link | "Every decision is public and verifiable." | `TradeBlocked` with reason |
| 2:52 | Open **Break my agent** | "And now you: make our agent steal." | Breaches: 0 |

## Break my agent

[`/break`](https://mandrail-production.up.railway.app/break) needs no wallet. QR code for slides: [break-qr.png](break-qr.png). The agent there has no safety rules and does what you ask, with any venue and any minimum. Only the contract protects the mandate: tGOLD, $5 per trade, $50 per day.

A **breach** is an execution outside the asset list or the limits, or one that delivered less than 99% of the oracle amount. Purchases inside the limits are allowed and labelled that way. All numbers come from chain events.

The model provider filters some wordings such as "ignore all rules". The page then says that nothing was sent; say the trade in plain words instead.

## If something goes wrong

| What you see | What to do |
|---|---|
| "too small to set a limit below it" | Refresh the risk data, or type a lower limit by hand |
| Blocked: risk data stale | Press **Refresh risk data** and send again |
| The model does not answer | Look at the decisions first, a trade may already be there. If not, send again; the unanswered message is not repeated by itself |
| The model is down | `/break` and the decisions stay readable; show the BscScan links from [CMC_INTEGRATION.md](CMC_INTEGRATION.md) |
| Wallet on another network | **Switch to BSC testnet** in the header |

## Extra steps for questions

- **Market hours**: tick "Stock tokens only while the US market is open", remove both breakers, jurisdiction SG, buy tEQUITY. Outside 14:30 to 21:00 UTC, at weekends and on US holidays it is blocked. 26 Nov 2026 is a holiday, on 27 Nov the market closes at 18:00 UTC.
- **Agent identity**: create a mandate with another ERC-8004 id. The registry says it belongs to another wallet and the contract refuses.
- **The same without the UI**: `pnpm scenarios` and `pnpm attacks`.

## Recording the video

Up to 3 minutes, 1440 × 900, browser zoom 100%. Record the script above in one take and cut the waiting time. Subtitle the spoken lines. End on the Break my agent counters and the repository address.
