# Quire — Architecture & Technical Decisions

_Verified against official docs on 2026-11-06._

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

**Perpetual lifecycle**: `ACTIVE ⇄ PAUSED → RESOLUTION_PROPOSED → RESOLVED(YES|NO|INVALID)`. Resolution is optional and only used when a claim becomes definitively decided or ill-posed. A resolver proposes, a challenge window must elapse, then anyone finalizes. INVALID pays 0.5 per share (solvent because every pair is backed by 1).

## 2. NEAR components and their separate responsibilities

| Component | What it is (verified) | Role in Quire |
|---|---|---|
| **Quire market contract** (`quire-market`) | Rust / near-sdk 5.30, NEAR mainnet | Source of truth for balances (native NEAR, held as micro-NEAR units), positions, pools, agent limits. Emits NEP-297 `EVENT_JSON` logs. |
| **NEAR Intents — 1Click API** | `https://1click.chaindefuser.com/v0/{tokens,quote,deposit/submit,status}`; statuses `PENDING_DEPOSIT, KNOWN_DEPOSIT_TX, PROCESSING, SUCCESS, INCOMPLETE_DEPOSIT, REFUNDED, FAILED`. **No testnet deployment exists.** JWT optional (else 0.2% fee). | Cross-chain funding: user deposits a supported asset on its origin chain, solvers swap it, and NEAR arrives in the user's own NEAR wallet, ready to deposit into Quire. |
| **Chain Signatures** | MPC signer `v1.signer-prod.testnet` / `v1.signer`; derives foreign-chain addresses from `(NEAR account, path)` and signs payloads. | Lets a NEAR account control an address on another chain. Used to sign origin-chain deposit transactions (e.g. EVM USDC → the 1Click deposit address) from a NEAR-derived address. |
| **NEAR AI Cloud** | OpenAI-compatible `https://cloud-api.near.ai/v1`, `sk-` API keys; TEE (Intel TDX + NVIDIA CC). `GET /v1/signature/{chat_id}` returns `{text, signature, signing_address, signing_algo}` where text = `model:sha256(req):sha256(resp)`; `GET /v1/attestation/report?model=…&nonce=…`. | Confidential generation of encyclopedia pages and agent analysis; Quire stores hashes, the signature, and verifies the recovered signer. |

Intents ≠ Chain Signatures: Intents is a **solver/settlement network** (who executes the swap); Chain Signatures is a **key-management primitive** (who can sign on a foreign chain). Quire uses Chain Signatures to *originate* a deposit and Intents to *route* it.

## 3. Collateral: native NEAR (decided 7 Nov 2026)

Everything runs on NEAR mainnet and markets are denominated in **native NEAR**: no custom token,
no stablecoin, no bridge. A share pays 1 NEAR on resolution. Amounts are kept in micro-NEAR units
inside the contract, so the integer FPMM math and its TypeScript/Rust parity tests are unchanged.

- Deposit: payable `deposit()`; the first deposit registers the account and pays its storage.
- Storage for new records is drawn from the account's own balance, so trades never fail for a missing storage deposit.
- Withdraw: native transfer with a callback that re-credits the balance if the transfer fails.
- Safety: per-account and total caps, global pause (withdrawals still work), no owner access to user balances.
- Prices are in NEAR, so a probability of 0.62 means a Yes share costs 0.62 NEAR. NEAR's dollar price does not affect the probability.

## 4. Data & indexing

- PostgreSQL via Drizzle; amounts `numeric(39,0)` ↔ `bigint`; probabilities integer ppm.
- **Ingestion**: after a wallet-signed trade, the frontend submits the tx hash; the API fetches the receipt from RPC, checks receiver/signer/success, parses `EVENT_JSON` logs and applies them idempotently (`unique(transaction_id, event_index)`). A reconciler periodically compares DB pools with `get_market` views.
- **SIMULATED mode** executes the identical math against the Postgres ledger with row locks; every row carries `execution_mode` and the UI labels it.

## 5. Security posture (summary)

- Human trades & withdrawals require 1 yoctoNEAR ⇒ full-access-key wallet confirmation; a leaked dApp function-call key cannot trade or withdraw for a human.
- Agents: own account, function-call key only, owner-funded balance, on-chain `enabled`/`max_trade`/`spend_limit`; cannot withdraw.
- Slippage (`min_out`) and single-use client order ids on every trade (on-chain and off-chain).
- Storage is paid per account (NEP-145 style), so users cannot grow contract state for free.
