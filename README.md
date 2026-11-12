# Quire

**Truth, priced by the market. Written by agents.**

Quire is a truth market on NEAR. Every claim is a Yes/No market that never closes. People trade on it from their own wallets, and confidential AI on NEAR AI Cloud writes the claim's public encyclopedia page from the live price and from evidence Quire has checked itself.

- **Live app:** https://quire-gamma.vercel.app
- **Contract (NEAR testnet):** [`hardsealowner.testnet`](https://testnet.nearblocks.io/address/hardsealowner.testnet)
- **Deploy transaction:** [`BG8X26U1…cv7Fb`](https://testnet.nearblocks.io/txns/BG8X26U11kNFHZHm7kCvuhF8aq9NJaUKjn6FETKcv7Fb)
- **Example claim with an AI-written page:** https://quire-gamma.vercel.app/markets/btc-above-150k

Built solo at NEAR HACKATHON, 6–14 November 2026. All code in this repository was written in that period. Unaudited prototype on testnet.

**Tracks:** Open Innovation · Privacy & Private AI

## Verify it: do X, see Y

### A. Without installing anything (live deployment)

| Do | See |
|---|---|
| Open https://quire-gamma.vercel.app/markets | Three claims with Yes percentages, each tagged "NEAR testnet" |
| Open the [Bitcoin claim](https://quire-gamma.vercel.app/markets/btc-above-150k) and scroll to **Trades** | Trades by two different `.testnet` accounts, each tagged "NEAR testnet" |
| On the same page, scroll to **Encyclopedia** and open **How this revision was generated** | The model name, sha256 hashes of the request and response, the enclave signing address, "Signature: Valid…" and the attestation line |
| Scroll to **Evidence** | A quoted source marked "Excerpt found in source" |
| Open https://quire-gamma.vercel.app/agents | Scout and Scribe "active" with activity records; Assessor and Arbiter "not active in this build" |

The same facts from a terminal:

```bash
# API: mode and contract (the host is on a free plan; the first request can take up to a minute)
curl -s https://quire-api-0tkm.onrender.com/health
# -> {"ok":true,"executionMode":"ONCHAIN_TESTNET","network":"testnet","integrations":{"marketContract":"hardsealowner.testnet",...}}

# Markets as mirrored from the contract
curl -s https://quire-api-0tkm.onrender.com/markets
# -> {"markets":[{"slug":"btc-above-150k","executionMode":"ONCHAIN_TESTNET","contractId":"hardsealowner.testnet",...}]}

# The same contract, read straight from NEAR (no Quire server involved)
curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"hardsealowner.testnet","method_name":"get_markets","args_base64":"e30="}}'
# -> result.result is a byte array; decoded it is the JSON list of markets with pool_yes, pool_no and price_yes_ppm

# The encyclopedia revision and its verification record
curl -s https://quire-api-0tkm.onrender.com/markets/btc-above-150k/encyclopedia
# -> current.content has eight sections; current.inference has requestHash, responseHash, signingAddress, signatureVerified
```

To trade yourself: connect a NEAR **testnet** wallet (Meteor works), deposit a little test NEAR in the **Funds** panel of a claim, choose Yes or No, **Review buy**, **Confirm buy**, approve in the wallet. You see "Order filled" with a link to the transaction, and the percentage moves.

### B. From a clean clone (local, simulated mode)

Requirements: Node 22+, pnpm 10+, Docker (or any PostgreSQL 16). No keys or accounts needed.

```bash
pnpm install
docker compose up -d                           # Postgres on localhost:5432 (user/password/db: quire)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev:api                                   # terminal 1: applies migrations, seeds example claims, serves http://localhost:4000
pnpm dev:web                                   # terminal 2: http://localhost:3000
```

| Do | See |
|---|---|
| `curl -s localhost:4000/health` | `"executionMode":"SIMULATED"` |
| Open http://localhost:3000 | A "Simulated" badge in the header and five example claims at 50.0% |
| Click **Sign in**, enter any name, **Continue** | Your `name.sim` account in the header |
| Open a claim, click **Get 1,000 test NEAR** | "Added 1,000 test NEAR." |
| Click **+50** twice, **Review buy**, **Confirm buy** | "Order filled … Yes is now 5x.x%", and the chart, trades list and your position update |
| Click **Write the first revision** | "NEAR_AI_API_KEY is not set on the server" (set that variable in `apps/api/.env` to generate for real) |

Simulated mode exists only so the app can be run without wallets or keys: it uses a test ledger in Postgres with the same market math, and labels every record "Simulated". To run locally against the live contract instead, set `QUIRE_EXECUTION_MODE=ONCHAIN_TESTNET`, `QUIRE_MARKET_CONTRACT=hardsealowner.testnet` and `QUIRE_DEV_AUTH=false` in `apps/api/.env`.

### C. Tests

```bash
pnpm --filter @quire/shared test    # 10 tests: market math, solvency and round-trip properties (no database needed)
cd contracts && cargo test          # 30 tests: the contract, incl. TypeScript/Rust parity on 800 vectors (no database needed)
pnpm --filter @quire/api test       # 29 tests on Postgres (creates its own quire_test database): trading, concurrency,
                                    #   on-chain ingestion, evidence checks, encyclopedia generation
python apps/web/e2e/trade_flow.py   # optional browser test of section B (needs Playwright; API and web running)
```

CI (`.github/workflows/ci.yml`) runs the first three, builds the web app and builds the contract wasm on every push.

## What is real, and what is not

| Part | Status |
|---|---|
| Market contract on NEAR testnet: deposits, withdrawals, buy/sell with slippage limits, duplicate-order protection, safety caps, pause, optional resolution with a challenge window | **Live.** 30 contract unit tests |
| Wallet-signed trading from the web app (NEAR Connect; Meteor and other wallets) | **Live** |
| Server verifies every trade by looking the transaction up on NEAR RPC and mirroring the contract's events | **Live.** Nothing the browser says is trusted except the hash to look up |
| Encyclopedia generation on NEAR AI Cloud with structure validation, revision history and an update policy | **Live** |
| Verification of each generation: sha256 of exact request and response bytes, enclave signature recovered and matched, signing address found in NEAR AI's attestation report | **Live.** Quire does **not** verify the hardware quote itself |
| Evidence checking: fetch the submitted page, confirm the quote is on it | **Live** |
| Analysis and trading agents | **Not running.** The contract enforces per-agent limits (on/off, largest trade, total spend, no withdrawals) and those paths are unit-tested, but no agent trades in this build |
| NEAR Intents cross-chain funding, Chain Signatures | **Not built.** Planned |
| Automatic source discovery | **Not built.** Sources are submitted by people |

The deployed app never shows sample data: every market, trade, source and article on the live site was created through the real flows.

## How it works

**Markets.** Each claim has a fixed-product market maker (the Gnosis/Omen design). Every Yes+No pair is backed by exactly 1 NEAR in the contract, so a market can always pay out. Probability of Yes = share of No in the pool. All math is integer-only; the TypeScript quote engine and the Rust contract are checked against the same 800 generated test vectors, so the quote in the app is exactly what the contract executes. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for why this model was chosen over LMSR, an order book or pari-mutuel for markets that never close.

**Trading.** `deposit()` credits NEAR to your balance in the contract (the first deposit registers you). `buy` and `sell` take a minimum-out bound and a one-time order id. People confirm each trade in their wallet. The API then fetches the transaction from NEAR RPC, checks it succeeded against this contract, and records the event.

**Encyclopedia.** When a revision is due (first revision, newly verified evidence, or a move of 3+ points in Yes), the server builds a structured input from the database: claim, live probability, sampled price history, trading stats, verified evidence, and the previous revision. It sends that to NEAR AI Cloud, requires a fixed eight-section JSON structure back, drops any citation that is not one of the provided evidence items, and stores the revision alongside the old ones.

**What the verification means.** NEAR AI Cloud runs models inside hardware enclaves that sign the hashes of each request and response. Quire hashes the bytes it actually sent and received, checks they are the ones signed, and checks the signature recovers to the enclave's stated address. That shows *which model produced this text from this input, inside NEAR AI's attested environment*. It does not show the text is true, and the page says so. Market probability is likewise presented as collective belief, not fact.

## Trust assumptions

- The contract owner creates markets, can pause trading, can change the safety caps and is the resolver. The owner cannot move user balances, and withdrawals work while paused.
- The API and database are a mirror for speed; the contract is the source of truth for balances and positions.
- Evidence submission and "write a revision" are open to anyone and rate-limited; the update policy bounds how often the model is called.
- The contract is unaudited. It runs on testnet; the caps (10 NEAR per account, 100 NEAR total) exist for a careful mainnet trial later.

## Layout

| Path | What |
|---|---|
| `contracts/quire-market` | The NEAR contract (Rust, near-sdk 5) |
| `packages/shared` | Integer market math (reference implementation) and unit formatting |
| `apps/api` | Fastify + Drizzle/Postgres: markets, on-chain ingestion, evidence checking, encyclopedia generation |
| `apps/web` | Next.js app |
| `docs/ARCHITECTURE.md` | Design decisions |
| `docs/DEPLOY.md` | How the contract is deployed (GitHub Action) |
| `PROGRESS.md` | Build log: what was done, tested and verified live |

## Built with

- **Contract:** Rust, `near-sdk` 5, `cargo-near`
- **API:** Node 22, TypeScript, Fastify, Drizzle ORM, PostgreSQL (`pg`), Zod, `viem` (signature recovery), `jose`
- **Web:** Next.js 16 (App Router), React 19, Tailwind CSS 4, `@hot-labs/near-connect` (wallets), Lucide icons, IBM Plex and Grand Hotel fonts via Fontsource
- **Testing:** Vitest, fast-check, cargo test, Playwright
- **Services:** NEAR testnet RPC (FastNEAR), NEAR AI Cloud, Vercel, Render, Neon

AI assistance: the code was written with Claude Code (Anthropic) under the author's direction during the hackathon; commits are co-authored accordingly. There is no pre-existing code.

## Licence

MIT, see [LICENSE](LICENSE).
