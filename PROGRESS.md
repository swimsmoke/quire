# Quire — Build Progress

Deadline: **NEAR Hackathon, 14 Nov 2026 23:59 UTC**. Submission = public repo + public X post with video/screenshots.

## ✅ Done and tested

| Component | Evidence |
|---|---|
| Monorepo (pnpm): `packages/shared`, `apps/api`, `contracts/` | `pnpm install` |
| FPMM math (TS, bigint only) | 10 tests incl. 500 randomized solvency runs, 2,000 buy→sell round trips |
| Market contract (Rust, near-sdk 5.30) | 30 unit tests: trading, slippage, duplicate orders, 1-yocto confirmation, storage, agents (limits/disable/no-withdraw/reclaim), resolution & redemption |
| TS ⇄ Rust parity | 800 shared vectors, bit-exact |
| Postgres schema (22 tables) + migration | applied to local Postgres 16 |
| API: markets, quote, simulated trades, portfolio, faucet, dev auth | 10 integration tests on real Postgres incl. 40 concurrent trades and concurrent duplicate-order race |
| Live smoke test | faucet → quote → trade → probability 50.0% → 52.4% over HTTP |
| Read APIs: agents, activity feed, encyclopedia + revisions, evidence, agent activity | 4 more integration tests (14 total) |
| Frontend (Next.js 16, Tailwind 4; iOS-style design with light / dark / system themes): Home, Markets, Claim, Portfolio, Agents, How it works | production build passes; browser E2E: sign in → test funds → quote → review → confirm → probability 50% → 48.5% → portfolio shows position; desktop + mobile, light + dark screenshots reviewed; scrubbable chart, review/confirm sheets, theme persistence covered by `apps/web/e2e/trade_flow.py` |

## Honest gaps in the current UI
- Sign-in is a simulated account only (NEAR wallet sign-in = step 3).
- Cross-chain deposit panel states NEAR Intents is not connected; nothing can be started.
- Encyclopedia, evidence and agent activity show empty states until steps 4-5 generate real data.

## Network and collateral (7 Nov)
- NEAR mainnet; markets priced and settled in **native NEAR** (no qUSD, no USDC).
- `deposit()` auto-registers; storage drawn from balance; native-NEAR withdrawals with failure re-credit.
- Safety caps (10 NEAR per account, 100 NEAR total by default), global pause, withdrawals always open.
- Manual GitHub Action `deploy-mainnet`; guide in docs/DEPLOY_MAINNET.md. CI builds the wasm on every push.
- Simulated mode (local dev and tests) labels its balances "test NEAR"; they have no value.

## ⚠️ Not yet verified in this workspace

- **Contract wasm build + testnet deploy**: this workspace cannot download the wasm Rust target. CI workflow (`.github/workflows/ci.yml`) builds it on GitHub, or run `contracts/build.sh` locally.
- **Live calls to NEAR RPC, NEAR AI Cloud, 1Click**: blocked from this workspace's network. Adapters will be written to the verified API shapes and must be exercised from your machine or a deployed backend.

## Roadmap (dependency order)

1. ~~Foundation + market engine~~ ✅
2. ~~Frontend (all pages on real API)~~ ✅
3. NEAR wallet sign-in (NEP-413), on-chain trade flow, tx ingestion + reconciler
4. Evidence system (fetch + verbatim excerpt verification) + NEAR AI Cloud article pipeline with signature verification
5. Agents: research → analysis → constrained trading (on-chain limits)
6. NEAR Intents funding (quote/deposit/status/credit) + Chain Signatures deposit signing
7. E2E, deploy, README for AI judges, demo video
