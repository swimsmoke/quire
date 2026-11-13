# Quire

**Truth, priced by the market. Written by agents.**

Quire is a truth market on NEAR. Every claim is a Yes/No market that never closes. People trade on it from their own wallets, and an AI running on NEAR AI Cloud keeps an encyclopedia page for each claim, rewritten as the price and the evidence change.

Built at NEAR HACKATHON (November 2026). Runs on testnet; the contract is unaudited.

- App: https://quire-gamma.vercel.app
- Contract: [`hardsealowner.testnet`](https://testnet.nearblocks.io/address/hardsealowner.testnet)
- Tracks: Open Innovation, Privacy & Private AI

## Try it

**On the live site**

1. Open the [Bitcoin claim](https://quire-gamma.vercel.app/markets/btc-above-150k). You'll see the Yes price, a chart, and trades from two testnet wallets.
2. Scroll to **Encyclopedia** and open **How this revision was generated**. It shows the model, hashes of the exact request and response, and whether the enclave's signature checked out.
3. Scroll to **Evidence**. Each quote has been fetched from its source and checked word for word.
4. Connect a NEAR testnet wallet (Meteor works), deposit a little test NEAR in **Funds**, and buy Yes or No. Once the transaction lands, the price moves and the trade shows up with a link to the explorer.

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

This starts in simulated mode: five example claims and a test ledger, all labelled "Simulated". Sign in with any name, click **Get 1,000 test NEAR**, then **+50**, **Review buy**, **Confirm buy**, and the price, chart and your position update. Article generation needs `NEAR_AI_API_KEY` in `apps/api/.env`. To point at the real contract, set `QUIRE_EXECUTION_MODE=ONCHAIN_TESTNET`, `QUIRE_MARKET_CONTRACT=hardsealowner.testnet` and `QUIRE_DEV_AUTH=false`.

**Tests**

```bash
pnpm --filter @quire/shared test   # market math
pnpm --filter @quire/api test      # API, needs Postgres (docker compose up -d)
cd contracts && cargo test         # contract
```

## How it works

**Markets.** Each claim uses a fixed-product market maker. Every Yes+No pair is backed by 1 NEAR in the contract, so it can always pay out, and the Yes probability is the share of No left in the pool. Prices use integer math only, and the TypeScript quote engine is checked against the Rust contract on the same test vectors, so the quote you see is what executes.

**Trading.** You deposit NEAR into the contract and trade with your wallet. The server never trusts the browser: it looks each transaction up on NEAR, checks it succeeded against the contract, and records the events.

**Encyclopedia.** A new revision is written when there's new verified evidence or the price moves 3 points or more. The model gets the live price, its history, trading stats, the checked evidence and the previous revision, and has to return a fixed eight-section structure. Citations that don't match real evidence are dropped. Old revisions are kept.

**Verification.** NEAR AI Cloud runs the model inside a hardware enclave that signs hashes of each request and response. Quire hashes what it actually sent and received and checks the signature matches. That proves where the text came from, not that it's true, and the page says so.

## What's built and what isn't

| | |
|---|---|
| Contract: deposits, withdrawals, trading with slippage limits, safety caps, pause, resolution | Live on testnet |
| Wallet trading from the web app | Live |
| Encyclopedia on NEAR AI Cloud with signature checks | Live |
| Evidence fetching and quote checking | Live |
| Trading and analysis agents | Not running yet. The contract already enforces agent spending limits |
| NEAR Intents and Chain Signatures funding | Planned |

## Trust

The contract owner creates markets, can pause trading and resolves claims after a challenge window. The owner can't touch user balances, and withdrawals work even when paused. The database is only a mirror; balances live in the contract.

## Repo

- `contracts/quire-market`: the NEAR contract
- `packages/shared`: market math
- `apps/api`: API, chain indexing, evidence checks, encyclopedia generation
- `apps/web`: the web app
- `docs/`: architecture and deploy notes

Main libraries: near-sdk, Next.js, Fastify, Drizzle, PostgreSQL, NEAR Connect, viem, Tailwind.

## Licence

MIT
