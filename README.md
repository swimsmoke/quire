<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/quire-mark-on-dark.svg">
    <img src="docs/brand/quire-mark-on-light.svg" width="104" alt="Quire logo: a Q drawn as a Yes/No ring">
  </picture>
</p>

# Quire

**Ask anything. Let the market answer.**

Quire is a truth market on NEAR. You bring a question. If someone already asked it, you see what people currently believe. If not, you open a market on it: AI can draft the claim for you, you seed it with as little as 0.1 NEAR, and people trade Yes or No from their own wallets. The market never closes. An AI running on NEAR AI Cloud researches the claim and keeps an encyclopedia page for it, rewritten as the price and the evidence change.

Built at NEAR HACKATHON (November 2026). Runs on testnet; the contract is unaudited.

- App: https://quire-gamma.vercel.app
- Contract: [`hardsealowner.testnet`](https://testnet.nearblocks.io/address/hardsealowner.testnet)
- Tracks: Open Innovation, Privacy & Private AI

![Quire's home page: ask a yes or no question](docs/screenshots/home.jpg)

## Screens

| | |
|---|---|
| ![Live encyclopedia revision with its enclave signature check](docs/screenshots/encyclopedia-live.jpg) | **From the live site: proof behind every page.** This is the Bitcoin claim on NEAR testnet. Scribe wrote revision 2 on its own when Yes moved 6.2 points. Under "How this revision was generated" you can see the model, the hashes of the exact request and response, the enclave's signing key, and that the signature and attestation checks passed. |
| ![Ask page finding an existing market](docs/screenshots/ask.jpg)<br>**Ask.** Existing markets show up as you type; if none fits, AI drafts a new one. | ![A market with its chart and trade panel](docs/screenshots/market.jpg)<br>**Trade.** Buy Yes or No; every trade moves the price. |
| ![A trader's profile with profit chart and positions](docs/screenshots/profile.jpg)<br>**Profiles.** Profit over time, positions, trades and markets opened. | ![Leaderboard ranked by profit](docs/screenshots/leaderboard.jpg)<br>**Leaderboard.** Traders ranked by profit across every claim. |
| ![Slide-out menu with account and links](docs/screenshots/menu.jpg)<br>**Menu.** Account, profile, leaderboard and cross-chain funding. | ![Home and a market on a phone](docs/screenshots/mobile.jpg)<br>**Phone.** Same app with a bottom tab bar. |

These were captured from a local run in practice mode, so records carry a "Simulated" tag. On the live site they show NEAR testnet.

## Try it

**On the live site**

1. Open the [Bitcoin claim](https://quire-gamma.vercel.app/markets/btc-above-150k). You'll see the Yes price, a chart, and trades from two testnet wallets.
2. Scroll to **Encyclopedia** and open **How this revision was generated**. It shows the model, hashes of the exact request and response, and whether the enclave's signature checked out.
3. Scroll to **Evidence**. Each quote has been fetched from its source and checked word for word.
4. Connect a NEAR testnet wallet (Meteor works), deposit a little test NEAR in **Funds**, and buy Yes or No. Once the transaction lands, the price moves and the trade shows up with a link to the explorer.
5. Go to **Ask** and type a question. Matching claims show up as you type. For a new one, press **Draft the market with AI**, check the fields and open it. Within a minute or so the new claim has sources from Scout and a first encyclopedia page.
6. **Leaderboard** ranks traders by profit across all claims. Click a name for their profile: profit chart, positions, trades and the markets they opened.
7. Open the menu (top right) and choose **Fund from any chain** for a live NEAR Intents quote, for example USDC on Base to NEAR. Sending stays off on testnet; see below.

The API also answers directly (it's on a free host, so the first request can take up to a minute):

```bash
curl -s https://quire-api-0tkm.onrender.com/health
# "executionMode":"ONCHAIN_TESTNET", "marketContract":"hardsealowner.testnet"

curl -s https://quire-api-0tkm.onrender.com/markets/btc-above-150k/encyclopedia
# current.content has eight sections; current.inference has the hashes and signature result
```

**Locally**

Needs Node 22+, pnpm and Docker. No keys or wallets.

```bash
pnpm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev:api    # http://localhost:4000
pnpm dev:web    # http://localhost:3000
```

This starts in simulated mode: five example claims and a test ledger, all labelled "Simulated". Sign in with any name, click **Get 1,000 test NEAR**, then **+50**, **Review buy**, **Confirm buy**, and the price, chart and your position update. **Ask** works here too and opens markets from the practice balance. Article generation needs `NEAR_AI_API_KEY` in `apps/api/.env`. To point at the real contract, set `QUIRE_EXECUTION_MODE=ONCHAIN_TESTNET`, `QUIRE_MARKET_CONTRACT=hardsealowner.testnet` and `QUIRE_DEV_AUTH=false`.

**Tests**

```bash
pnpm --filter @quire/shared test   # market math
pnpm --filter @quire/api test      # API, needs Postgres (docker compose up -d)
cd contracts && cargo test         # contract
python apps/web/e2e/trade_flow.py  # browser walk-through of the steps above; needs the app running and Playwright
```

## How it works

**Markets.** Each claim uses a fixed-product market maker. Every Yes+No pair is backed by 1 NEAR in the contract, so it can always pay out, and the Yes probability is the share of No left in the pool. Prices use integer math only, and the TypeScript quote engine is checked against the Rust contract on the same test vectors, so the quote you see is what executes.

**Trading.** You deposit NEAR into the contract and trade with your wallet. The server never trusts the browser: it looks each transaction up on NEAR, checks it succeeded against the contract, and records the events.

**Asking.** Anyone with a deposit can create a market; the contract takes the seed liquidity from their balance (0.1 NEAR minimum) and gives the pool back to them when the claim resolves. Search matches on keywords, so differently worded questions still find the existing claim.

**Research.** When a claim opens, Scout searches Wikipedia for its subject and submits the opening sentences of the best matches. Like any submitted source, each page is fetched and the quote must appear on it word for word.

**Encyclopedia.** The first revision is written automatically when a claim opens. After that, a new one is written when there's new verified evidence or the price moves 3 points or more. The model gets the live price, its history, trading stats, the checked evidence and the previous revision, and has to return a fixed eight-section structure. Citations that don't match real evidence are dropped. Old revisions are kept.

**Funding from other chains.** NEAR Intents (1Click API) swaps assets like USDC on Base, ETH or SOL into NEAR. Quire's API reads 1Click's token list and asks for dry quotes, which never create a deposit address. NEAR Intents only runs on mainnet and Quire is on testnet, so sending is switched off and the page says so. With `ONECLICK_API_KEY` set the quotes come from solvers; without it the page shows an estimate from 1Click's live prices, labelled as such.

**Verification.** NEAR AI Cloud runs the model inside a hardware enclave that signs hashes of each request and response. Quire hashes what it actually sent and received and checks the signature matches. That proves where the text came from, not that it's true, and the page says so.

## What's built and what isn't

| | |
|---|---|
| Contract: deposits, withdrawals, trading with slippage limits, safety caps, pause, resolution | Live on testnet |
| Wallet trading from the web app | Live |
| Encyclopedia on NEAR AI Cloud with signature checks | Live |
| Evidence fetching and quote checking | Live |
| Anyone can create a market, with AI drafting | Live |
| Automatic research and first article for new claims | Live |
| Trader leaderboard and profiles | Live |
| Cross-chain funding quotes via NEAR Intents | Live (quotes only) |
| Trading and analysis agents | Not running yet. The contract already enforces agent spending limits |
| Sending through NEAR Intents | With the mainnet launch |
| Chain Signatures | Planned |

## Trust

Anyone can create a market. The contract owner can pause trading and resolves claims after a challenge window. The owner can't touch user balances, and withdrawals work even when paused. The database is only a mirror; balances live in the contract.

## Repo

- `contracts/quire-market`: the NEAR contract
- `packages/shared`: market math
- `apps/api`: API, chain indexing, evidence checks, encyclopedia generation
- `apps/web`: the web app
- `docs/`: architecture and deploy notes

Main libraries: near-sdk, Next.js, Fastify, Drizzle, PostgreSQL, NEAR Connect, viem, Tailwind.

## Licence

MIT
