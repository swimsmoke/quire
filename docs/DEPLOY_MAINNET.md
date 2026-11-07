# Deploying Quire to NEAR mainnet

Quire's markets are priced and settled in **native NEAR**. A Yes or No share pays 1 NEAR
if the claim resolves its way. There is no separate token to create or buy.
The contract is **unaudited**, so it ships with safety caps and every amount below is kept small.

## What you need

| Account | Purpose | Fund with |
|---|---|---|
| **Main** (your wallet) | Contract owner, resolver, market liquidity provider | 3.5 NEAR: 0.5 for fees and storage + 1 NEAR of liquidity for each of 3 markets |
| **Contract** (a separate, new account) | Holds the contract code | 3.5 NEAR: the code is 250 KB, which locks about 2.5 NEAR of storage (1 NEAR per 100 KB), plus headroom |
| **Demo 1**, **Demo 2** | Two-wallet demo | 1 NEAR each |

About 9 NEAR in total. Market liquidity is not lost: after the hackathon the owner can resolve each
market as invalid and redeem the pool, which returns the liquidity minus any trading losses.

## Steps

1. **Create the accounts** in any NEAR wallet listed at wallet.near.org (mainnet: names end in `.near`).
   Fund them as above.
2. **Export the contract account's private key** from its wallet (it starts with `ed25519:`).
   Never paste it into chat, an issue, or a commit.
3. **Store it in GitHub**: repo Settings -> Environments -> New environment `mainnet`
   -> Add environment secret `QUIRE_CONTRACT_PRIVATE_KEY` = the key.
   Optionally add yourself as a required reviewer so every deploy needs your click.
4. **Deploy**: Actions -> `deploy-mainnet` -> Run workflow. Enter the contract account and
   your main account, keep the default caps (10 NEAR per account, 100 NEAR in total).
   The job runs all contract tests, builds the wasm, deploys, initialises, and prints `get_config`.
5. **Upgrades** later: run the same workflow with *First deploy* unticked.

## How deposits work

- `deposit()` with NEAR attached credits your trading balance. The first deposit registers you and
  takes about 0.003 NEAR for storage; later records (positions, order ids) take a fraction of a cent
  of storage from your balance automatically.
- `withdraw(amount)` sends NEAR back to your wallet. Withdrawals always work, even when trading is paused.
- Internally amounts are micro-NEAR (1 unit = 0.000001 NEAR), which keeps the pricing math in exact integers.

## Safety rails in the contract

- `account_cap` / `tvl_cap`: a deposit that would exceed either fails, and the protocol returns the NEAR.
- Global `set_paused` stops trading and deposits; **withdrawals always work**.
- No function lets the owner move user balances.
- Human trades and withdrawals need a full-access-key wallet confirmation (1 yoctoNEAR).
- Agents can trade only within owner-set limits and can never withdraw.

## Trust assumptions (centralised parts)

- The owner creates markets and is the resolver; resolution has a challenge window during which the owner can cancel.
- The owner can change the caps and pause trading.
- The API/indexer mirrors chain state for speed; the contract is the source of truth for balances.
