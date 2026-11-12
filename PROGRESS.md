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
- Manual GitHub Action `deploy-contract`; guide in docs/DEPLOY.md. CI builds the wasm on every push.
- Simulated mode (local dev and tests) labels its balances "test NEAR"; they have no value.

## On-chain trading (12 Nov), testnet
- Wallet connection through NEAR Connect (Meteor and others); deposit, withdraw, buy and sell are wallet-signed contract calls.
- API verifies each transaction hash against NEAR RPC and mirrors the contract's events (5 tests with a fake RPC).
- Owner page `/admin`: deposit and create markets from the owner's wallet.
- Deployed mode shows only markets that exist on the contract; no sample data.
- No sign-in needed on-chain: positions and trades are public chain data, read by account id.
- NOT yet run against the live network from this workspace (no network route to NEAR): first real run is the deployed site.

## Live on NEAR testnet (12 Nov)
- Contract `hardsealowner.testnet`, owner `hardseal5642.testnet`; site https://quire-gamma.vercel.app; API on Render; database on Neon.
- Verified live by the owner: wallet connect (Meteor), deposit, three markets created, two-wallet trades.

## Encyclopedia and evidence (12 Nov)
- Scout: `POST /markets/:slug/evidence` fetches the page and checks the quote appears word for word (https only, public hosts only).
- Scribe: `POST /markets/:slug/encyclopedia/generate` builds structured input from live market state + verified evidence, calls NEAR AI Cloud,
  validates the JSON structure (one retry), drops citations that are not provided evidence, stores the revision and keeps old ones.
- Verification recorded per revision: sha256 of exact request and response bytes, enclave signature checked (hashes present + signer recovered),
  signing address looked up in the attestation report. The hardware quote itself is NOT verified by Quire.
- Update policy: first revision, new verified evidence, or a Yes move of 3+ points; minimum 2 minutes between revisions.
- 9 tests with fake NEAR AI and fake web fetch (28 API tests total). NOT yet run against the real NEAR AI Cloud from this workspace.
- Agents page: Scout and Scribe active with real activity logs; Assessor and Arbiter marked "not active in this build".

## Not built (roadmap, stated in the app)
- Analysis and trading agents running live; NEAR Intents funding; Chain Signatures; automatic source discovery.

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
