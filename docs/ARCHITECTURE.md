# Quire — Architecture & Technical Decisions

_Last updated 2026-11-13. Describes what is built; planned parts are marked as planned._

## 1. Market maker: FPMM (chosen) vs LMSR vs others

Quire markets are **perpetual**: no expiry, continuous trading, positions exitable at any time.

| | Pari-mutuel | CLOB (order book) | LMSR | **FPMM / CPMM (chosen)** |
|---|---|---|---|---|
| Continuous pricing & exit before resolution | ✗ (payout only at end) | ✓ but needs makers | ✓ | ✓ |
| Liquidity requirement | none | active market makers | subsidy `b·ln2`, loss bounded | seed collateral per market |
| Capital efficiency | n/a | high when liquid | fixed `b` regardless of activity | moderate; deepens as volume grows |
| Price impact | n/a | depends on book | set by `b` | set by pool depth |
| Fees | easy | easy | awkward (fees outside cost function) | natural (fee on collateral) |
| On-chain cost | low | high (matching, many writes) | needs `exp`/`ln` fixed-point | **integer ops + one isqrt** |
| Contract complexity / audit risk | low | high | medium-high | **low** |
| Solo hackathon fit | ✗ wrong product | ✗ | possible | **best** |

**Decision: FPMM** (fixed-product, complete-set minting — the design used by Gnosis/Omen).
- Each YES+NO "complete set" is backed by exactly 1 NEAR, so the system is solvent by construction: total YES supply = total NO supply = collateral backing.
- `P(YES) = pool_no / (pool_yes + pool_no)`; buying mints sets and returns the bought side so `pool_yes · pool_no` never decreases.
- Pure integer arithmetic (u128 / bigint). Every rounding direction favours the pool.
- The TypeScript implementation (`packages/shared/src/fpmm.ts`) is the reference; the Rust contract (`contracts/quire-market/src/fpmm.rs`) is checked against 800 generated vectors for bit-exact agreement.

**Clearly distinguished quantities** (API + UI):
- *Market probability* — `pool_no/(pool_yes+pool_no)`, the marginal price.
- *Execution price* — `collateral_in / shares_out` incl. fee and price impact.
- *Position value* — shown two ways: mark value (shares × probability) and liquidation value (what selling now actually pays).
- *Liquidity* — collateral backing (`sets`).
- *Volume* — gross collateral traded.

**Perpetual lifecycle**: `ACTIVE ⇄ PAUSED → RESOLUTION_PROPOSED → RESOLVED(YES|NO|INVALID)`. Resolution is optional and only used when a claim becomes definitively decided or ill-posed. The resolver (the AI jury account) proposes; anyone can `dispute_resolution` inside the challenge window by posting a 0.5 NEAR bond, which returns the market to ACTIVE until the jury rules again (the bond is refunded if the new ruling differs, otherwise paid to the market's creator); once a window passes undisputed, anyone finalizes and holders `redeem`. Disputes are stored under raw storage keys, so the upgrade needed no state migration. INVALID pays 0.5 per share (solvent, because each Yes+No pair holds exactly 1 NEAR). After resolution the pool's remaining value returns to whoever seeded the market.

## 2. NEAR components in use

| Component | Role in Quire | Status |
|---|---|---|
| **Quire market contract** (`contracts/quire-market`, Rust, near-sdk 5) | Source of truth for balances (native NEAR, held as micro-NEAR units), positions, pools, safety caps and agent limits. Emits NEP-297 `EVENT_JSON` logs. Deployed at `hardsealowner.testnet`. | Live on testnet |
| **NEAR wallets via NEAR Connect** (`@hot-labs/near-connect`) | Users sign deposits, trades and withdrawals in their own wallet (Meteor and others). | Live |
| **NEAR RPC** | The API fetches each submitted transaction hash, checks it succeeded against the contract, and mirrors the events. The web app reads balances with view calls. | Live |
| **NEAR AI Cloud** (OpenAI-compatible API, models inside TEEs) | Generates encyclopedia revisions. Quire stores sha256 of the exact request and response, fetches the enclave signature for the chat id, checks the signed text contains both hashes and that the signature recovers to the signing address, and checks that address appears in the attestation report. | Live |
| **NEAR Intents (1Click API)** | Funding page: token list and dry quotes (`/intents/tokens`, `/intents/quote`) for swapping an asset from another chain into NEAR. Dry quotes never create a deposit address. Mainnet only, so sending is off while Quire is on testnet. | Quotes live; sending off |
| **Chain Signatures** | Planned: sign the origin-chain deposit for an Intents swap from a NEAR account. | Not built |

## 3. Collateral: native NEAR

Markets are denominated in **native NEAR**: no custom token, no stablecoin, no bridge. A share pays 1 NEAR on resolution.
Amounts are kept in micro-NEAR units inside the contract, so the integer FPMM math and its TypeScript/Rust parity tests are exact.

- Deposit: payable `deposit()`; the first deposit registers the account and pays its storage.
- Storage for new records is drawn from the account's own balance, so trades never fail for a missing storage deposit.
- Withdraw: native transfer with a callback that re-credits the balance if the transfer fails.
- Safety: per-account and total caps, global pause (withdrawals still work), no owner access to user balances.
- Prices are in NEAR, so a probability of 0.62 means a Yes share costs 0.62 NEAR.

## 4. Data and ingestion

- PostgreSQL via Drizzle; amounts `numeric(39,0)` mapped to `bigint`; probabilities are integer parts per million. No floats in accounting.
- **On-chain mode**: the browser sends only a transaction hash. The API fetches it from RPC, requires success and the right receiver,
  parses the contract's events and applies them once (`unique(network, tx_hash)` and `unique(transaction_id, event_index)`).
  Positions and trades are public chain data, so they are read by account id without a login.
- **Simulated mode** (local development only) runs the same math against a Postgres ledger with row locks; every row carries
  `execution_mode` and the UI labels it "Simulated". The deployed app does not use it and seeds no sample markets.

## 5. Encyclopedia pipeline

1. Update policy: first revision, newly verified evidence, or a Yes move of at least `ARTICLE_MIN_MOVE_PPM` (default 3 points); at most one revision per `ARTICLE_MIN_INTERVAL_S`; one writer per claim at a time.
2. Structured input from the database: claim, live probability, sampled history, trading stats, verified evidence (keys `E1…`), previous revision.
3. NEAR AI Cloud chat completion; the reply must be one JSON object with eight fixed sections (zod-validated, one retry).
4. Citations that are not provided evidence keys are dropped and reported.
5. The revision is stored next to earlier ones with the inference record (hashes, signature, signer, checks).

Evidence: a person submits a URL and a quote, or Scout finds one itself. Scout searches Wikipedia with the claim's subject and
the words of its question, reads the full text of up to three articles, ranks sentences by relevance (shared words, figures,
dates), downloads each page to keep only sentences that appear on it, and submits at most two per page and five per run. Either way the server fetches the page (https only,
public hosts only, size and time limits), strips markup, and marks the quote found or not found. Only found quotes are given to the model.

Automatic runs: when a market is created, Scout researches it and Scribe writes the first revision with no one asking. After each
trade Scribe is asked again, and the update policy above decides whether a new revision is due. These run in the background
inside the API and skip its rate limits through a per-boot internal key.

## 6. Asking, profiles and the leaderboard

- **Ask**: the search matches on keywords as well as the full text, so differently worded questions find an existing claim.
  For a new one, `POST /ai/draft-claim` asks NEAR AI Cloud for a question, subject, category, description and resolution rule
  (zod-validated JSON). The person edits it and creates the market from their own wallet.
- **Profit**: one function (`apps/api/src/market/pnl.ts`) replays an account's trades: cash out for buys, cash in for sales,
  plus shares still held at today's Yes/No price. Liquidity a creator seeds is not trading and is left out. The leaderboard,
  profile totals and the profit chart all use it, so they always agree.

## 7. Security posture

- Human trades and withdrawals require 1 yoctoNEAR, which forces a full-access-key wallet confirmation.
- Slippage bound (`min_out`) and single-use client order ids on every trade.
- Agents (planned): own account, function-call key only, owner-funded balance, on-chain `enabled` / `max_trade` / `spend_limit`, no withdrawals. Enforced and unit-tested in the contract; no agent runs yet.
- Open endpoints (evidence submission, generate) are rate-limited; generation is bounded by the update policy.
- Market creation is open: any registered account seeds a market from its own balance (minimum 0.1 NEAR) and receives the pool back after resolution.
- AI jury (`apps/api/src/jury`, `routes/jury.ts`): three NEAR AI Cloud models from different families each vote YES, NO, INVALID or NOT_YET from the verified evidence, without the price. Each vote is a confidential inference with its signature checked; uncited YES/NO becomes NOT_YET and unsigned votes don't count. Two matching verdicts are sent as `propose_resolution` from `JURY_ACCOUNT_ID` (near-api-js, key in the server's environment). Rulings, votes and timings are stored in `rulings`; `/results`, `/rulings/:id` and `/markets/:slug/ruling` serve them. Disputes, finalization and redemption are signed by users' wallets and mirrored through `/onchain/resolution`.
- Centralised parts: the owner sets caps, can pause, chooses the jury account and the challenge window (both emit events), and cannot propose or cancel rulings. The jury runs from Quire's API, so new rulings depend on it; disputing, settling and redeeming don't. The API is a mirror, not a custodian.
