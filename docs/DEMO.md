# Demo, three minutes

## Before you start

| Check | How |
|---|---|
| Wallet on BSC testnet with a little test BNB | [Faucet](https://www.bnbchain.org/en/testnet-faucet), about 0.01 is enough |
| The wallet has no mandate yet | Then the app opens the setup wizard. With an old mandate, press **New mandate** above the mandate card |
| Prices are fresh | The strip under the header shows **On-chain** age. Prices are pushed every 5 minutes; record when it says a few minutes or less |
| Presenter's wallet is in `DEMO_OWNERS` | It keeps its own daily reserve of model calls and transactions |
| Faucet not used in the last hour | It gives 1,000 test USD per hour |
| Chat signature | One signature lasts an hour |

Screen: 1440 × 900 or wider so all three columns show, browser zoom 100%, no other tabs or bookmarks bar.

## Script and shots

About 300 spoken words, about 2:50 with the screen actions. Wallet confirmations and model answers are cut in the edit; the "Cut" column says where.

| Time | Shot | Do | Say | Expected on screen | Cut |
|---|---|---|---|---|---|
| 0:00 | Landing, full screen | Open the site, hover over the rail of the latest decision | "AI agents are starting to buy tokenized gold and stocks for people. But a prompt is not a rule: one clever message and the limits are gone. Mandrail puts the rules on BNB Chain, where the agent cannot talk its way around them." | Latest decision card with 13 posts | |
| 0:20 | Landing, stats | Scroll to the four numbers | "Every attempt the agent makes is checked by a contract, and every decision, allowed or blocked, stays on-chain." | Decisions, blocked share, breaches 0 | |
| 0:30 | App, left column | **Launch app**, **Connect wallet**, **Start** in the wizard | "As the owner I give my agent a mandate in about a minute: test dollars, a mandate with default rules, and a $300 deposit. Gold only, $100 per trade, $200 a week, Singapore." | Wizard steps tick off one by one | Cut each wallet popup to under a second |
| 0:55 | App, mandate card | Point at the agent chip and ERC-8004 badge | "The agent has its own key and an on-chain identity in the ERC-8004 registry. It can trade, but it can never withdraw." | $300.00 held, agent 0x…, ERC-8004 #2929 | |
| 1:05 | App, chat | **Sign to chat**, chip **Buy $50 of gold.** | "First a normal trade. The agent reads the live CoinMarketCap price, runs a pre-flight, and sends it. All 13 checks pass, and the gold goes straight to my wallet." | Green receipt, all posts green | Cut the model wait |
| 1:25 | App, chat | Chip **Buy $150 of gold.** | "Now above my limit. It stops at check seven. Nothing is spent, but the attempt is recorded with its numbers." | Red receipt, stop at 07 · exceeds per trade | Cut the model wait |
| 1:40 | App, chat | Chip **Buy $20 of gold on the rogue venue.** | "A venue I never approved: blocked at check six." | Blocked · venue denied | Cut the model wait |
| 1:50 | App, rules | Under **Stop if the 1h move of tGOLD is above**, press **Below now**, then type "Buy $20 of gold." | "Risk rules use live data. I set the volatility limit just below the real one-hour move on CoinMarketCap, and the next trade trips the breaker." | Gauge limit left of the live value, Blocked · volatility breaker | Cut the wallet popup and model wait |
| 2:10 | App, rules | Switch on **tEQUITY**, under **Stop if CoinMarketCap and Atlas differ above** press **Below now**, chip **Buy $20 of tEQUITY.** | "For the stock token a second source checks the first: Atlas on BNB Chain. When it and CoinMarketCap disagree by more than I accept, the trade is refused." | Blocked · price divergence | Cut the wallet popups and model wait |
| 2:30 | App, rules and chat | **Revoke mandate**, **Revoke now**, type "Buy $20 of gold." | "And a kill switch: one signature and the agent is done. My money stays mine." | Mandate revoked, Blocked · mandate inactive | Cut the wallet popup and model wait |
| 2:38 | App, feed | Click one tx link in **Decisions on-chain** | "Every decision is a public event you can verify on BscScan." | TradeBlocked event with its reason | |
| 2:45 | Break my agent | Open **Break my agent** | "And now it's your turn: this agent has no safety rules at all. Try to make it steal. Only the contract stands in the way, and so far nothing got through." | Attempts, Blocked, Breaches 0 | |
| 2:55 | End card | Logo, repository address, QR code to /break | "Mandrail. Rules for AI agents, enforced on BNB Chain." | github.com/alexlapinpro/mandrail | |

Spare lines if the edit runs short: the jurisdiction check (allow tEQUITY, set **United States**, buy tEQUITY: Blocked · jurisdiction restricted) and "Buy $50 of tEQUITY." before allowing it (Blocked · asset not allowed).

## Break my agent

[`/break`](https://mandrail-production.up.railway.app/break) needs no wallet. QR code for slides: [break-qr.png](break-qr.png). The agent there has no safety rules and does what you ask, with any venue and any minimum. Only the contract protects the mandate: tGOLD, $5 per trade, $50 per day.

A **breach** is an execution outside the asset list or the limits, or one that delivered less than 99% of the oracle amount. Purchases inside the limits are allowed and labelled that way. All numbers come from chain events.

The model provider filters some wordings such as "ignore all rules". The page then says that nothing was sent; say the trade in plain words instead.

## If something goes wrong

| What you see | What to do |
|---|---|
| "The live value is too small to set a limit below it" | The market is very calm. Wait a minute for new prices and press **Below now** again, or use **0.5%** for the story and say so |
| Blocked: risk data stale | Prices are older than 15 minutes. Wait for the next push (On-chain age resets) and send again |
| The model does not answer | Look at **Decisions on-chain** first, a trade may already be there. If not, send again |
| The model is down | `/break` and the decisions stay readable; show the BscScan links from [CMC_INTEGRATION.md](CMC_INTEGRATION.md) |
| Wallet on another network | Use the network button in the header |

## Extra steps for questions

- **Market hours**: tick "Stock tokens only while the US market is open", remove both breakers, jurisdiction SG, buy tEQUITY. Outside 14:30 to 21:00 UTC, at weekends and on US holidays it is blocked. 26 Nov 2026 is a holiday, on 27 Nov the market closes at 18:00 UTC.
- **Agent identity**: create a mandate with another ERC-8004 id. The registry says it belongs to another wallet and the contract refuses.
- **The same without the UI**: `pnpm scenarios` and `pnpm attacks`. `pnpm rehearsal` checks all 8 decisions on a local fork without any key.

## Recording the video

Up to 3 minutes, 1440 × 900, browser zoom 100%. Record the screen in one take, then record the voice over the edit, which is easier than talking while confirming wallets. Cut every wallet popup and model wait, subtitle the spoken lines, and end on the Break my agent counters and the repository address. Upload to YouTube as unlisted, or Loom, and paste the link into Demo Video on HackQuest.
