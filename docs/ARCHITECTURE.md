# Quire — Architecture & Technical Decisions

_Last updated 2026-11-12. Describes what is built; planned parts are marked as planned._

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

**Perpetual lifecycle**: `ACTIVE ⇄ PAUSED → RESOLUTION_PROPOSED → RESOLVED(YES|NO|INVALID)`. Resolution is optional and only used when a claim becomes definitively decided or ill-posed. A resolver proposes, a challenge window must elapse, then anyone finalizes. INVALID pays 0.5 per share (solv## 2. NEAR components in use

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

Evidence: a person submits a URL and a quote. The server fetches the page (https only, public hosts only, size and time limits),
strips markup, and marks the quote found or not found. Only found quotes are given to the model.

## 6. Security posture

- Human trades and withdrawals require 1 yoctoNEAR, which forces a full-access-key wallet confirmation.
- Slippage bound (`min_out`) and single-use client order ids on every trade.
- Agents (planned): own account, function-call key only, owner-funded balance, on-chain `enabled` / `max_trade` / `spend_limit`, no withdrawals. Enforced and unit-tested in the contract; no agent runs yet.
- Open endpoints (evidence submission, generate) are rate-limited; generation is bounded by the update policy.
- Market creation is open: any registered account seeds a market from its own balance (minimum 0.1 NEAR) and receives the pool back after resolution.
- Centralised parts: the owner sets caps, can pause, and is the resolver (with a challenge window). The API is a mirror, not a custodian.
