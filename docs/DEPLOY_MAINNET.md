# Deploying Quire to NEAR mainnet

Quire runs on **NEAR mainnet with real USDC** (Circle's native USDC on NEAR,
`17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`, 6 decimals).
The contract is **unaudited**, so it ships with safety caps and every amount below is kept small.

## What you need

| Item | Purpose | Rough amount |
|---|---|---|
| **Main account** (your wallet) | Contract owner, resolver, market liquidity provider | ~0.5 NEAR for gas/storage + USDC for liquidity |
| **Contract account** (a separate, new account) | Holds the contract code | ~4 NEAR (storage for the code; check the exact wasm size in the CI artifact, about 1 NEAR per 100 KB) |
| **Two demo accounts** | Two-wallet demo | ~0.1 NEAR each + 1-2 USDC each |
| **USDC on NEAR** | Market liquidity and trades | 2 USDC per market is the practical minimum; 3 markets = 6 USDC |

Liquidity is not lost: after the hackathon the owner can resolve each market as invalid
and redeem the pool, which returns the liquidity minus any trading losses.

## Steps

1. **Create the accounts** in any NEAR wallet listed at wallet.near.org (mainnet, not testnet).
   Fund the contract account with ~4 NEAR and the others as above.
2. **Export the contract account's private key** from its wallet (it starts with `ed25519:`).
   Never paste it into chat, an issue, or a commit.
3. **Store it in GitHub**: repo Settings -> Environments -> New environment `mainnet`
   -> Add environment secret `QUIRE_CONTRACT_PRIVATE_KEY` = the key.
   Optionally add yourself as a required reviewer so every deploy needs your click.
4. **Deploy**: Actions -> `deploy-mainnet` -> Run workflow. Fill in the contract account,
   your main account, and keep the default caps (25 USDC per account, 200 USDC total).
   The job runs all contract tests, builds the wasm, deploys, initialises, and prints `get_config`.
5. **Upgrades** later: run the same workflow with *First deploy* unticked.

## Safety rails in the contract

- `account_cap` / `tvl_cap`: deposits that would exceed either are refunded in full.
- Global `set_paused` stops trading and deposits; **withdrawals always work**.
- No function lets the owner move user balances.
- Human trades and withdrawals need a full-access-key wallet confirmation (1 yoctoNEAR).
- Agents can trade only within owner-set limits and can never withdraw.

## Trust assumptions (centralised parts)

- The owner creates markets and is the resolver; resolution has a challenge window during which the owner can cancel.
- The owner can change the caps and pause trading.
- The API/indexer mirrors chain state for speed; the contract is the source of truth for balances.
