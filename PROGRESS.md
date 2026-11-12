# Quire: build log

Built 6–14 November 2026 for the NEAR Hackathon. All code in this repository was written in that period.

## Live

- App: https://quire-gamma.vercel.app (Vercel) · API on Render · database on Neon
- Contract: `hardsealowner.testnet` on NEAR testnet, owner `hardseal5642.testnet`
- Deploy transaction: `BG8X26U11kNFHZHm7kCvuhF8aq9NJaUKjn6FETKcv7Fb`

## Verified on the live deployment (12 Nov)

| What | How it was verified |
|---|---|
| Contract deploy and init | GitHub Action `deploy-contract`; `get_config` read back from chain |
| Wallet connect, deposit | Owner wallet (Meteor) deposited NEAR into the contract |
| Market creation | Three markets created from `/admin` by the owner wallet and registered from their transaction events |
| Two-wallet trading | `quiredemo1.testnet` and `quiredemo2.testnet` deposited and traded; price, chart, tape and portfolio updated from verified transactions |
| Evidence check | A Wikipedia quote was fetched and found on the page |
| Encyclopedia generation | Revision 1 of the Bitcoin claim written by `deepseek-ai/DeepSeek-V4.1-Flash-1017` on NEAR AI Cloud; signature check valid; signing key listed in the attestation report |

## Verified by automated tests

| Suite | Count | Covers |
|---|---|---|
| `contracts/quire-market` (cargo test) | 30 | deposits, withdrawals, trading, slippage, duplicate orders, wallet confirmation, storage, caps, agent limits, resolution, TypeScript/Rust parity on 800 vectors |
| `packages/shared` (vitest) | 10 | market math incl. randomized solvency and round-trip properties |
| `apps/api` (vitest, real Postgres) | 29 | simulated trading incl. concurrency, on-chain ingestion with a fake RPC, evidence checks, encyclopedia generation with a fake NEAR AI server |
| `apps/web/e2e/trade_flow.py` | 1 flow | browser: sign in, fund, quote, trade, chart, theme (simulated mode) |

CI runs the first three and builds the web app and the contract wasm on every push.

## Not built

- Analysis and trading agents running live (contract limits exist and are tested).
- NEAR Intents funding and Chain Signatures.
- Automatic source discovery; verification of the TEE hardware quote itself.

## Known limits

- The contract is unaudited and runs on testnet.
- The API host is on a free plan; a scheduled GitHub Action requests it every 10 minutes so the demo stays responsive.
- Evidence pages that need JavaScript or block automated readers cannot be checked.
