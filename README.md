# Quire

**Truth, priced by the market. Written by agents.**

An agent-curated truth market where humans and AI agents trade on claims, while confidential AI continuously generates an evolving encyclopedia from market probabilities and evidence. Built on NEAR.

Agent-curated truth markets on NEAR. Every claim is a perpetual Yes/No market. Humans and constrained AI agents trade on it, and confidential AI (NEAR AI Cloud) writes each claim's public encyclopedia page from the live price and verified evidence.

> Status: in active development for the NEAR Hackathon (Nov 2026). See [PROGRESS.md](PROGRESS.md) for exactly what works today and what doesn't yet. Anything not on-chain is labelled `simulated` in the API and the UI.

## Run it locally (about 5 minutes)

Requirements: Node 22+, pnpm 10+, PostgreSQL 16 (or Docker), Rust stable (only for contract tests).

```bash
pnpm install

# Postgres: either a local server, or
docker run -d --name quire-pg -e POSTGRES_USER=quire -e POSTGRES_PASSWORD=quire -e POSTGRES_DB=quire -p 5432:5432 postgres:16

cp apps/api/.env.example apps/api/.env        # then set SESSION_SECRET (openssl rand -hex 32)
cp apps/web/.env.example apps/web/.env.local

pnpm db:migrate && pnpm db:seed
pnpm dev:api     # http://localhost:4000/health
pnpm dev:web     # http://localhost:3000
```

Then: open a claim, choose **Sign in** (simulated account), **Get 1,000 test NEAR** (simulated, no value), enter an amount, **Review buy**, **Confirm buy**. The probability, chart, trade tape and your portfolio update from the database.

## Tests

```bash
pnpm --filter @quire/shared test    # FPMM math: solvency + round-trip property tests
pnpm --filter @quire/api test       # API on real Postgres (needs quire_test DB), incl. concurrency/duplicate-order races
cd contracts && cargo test          # market contract, incl. TS<->Rust parity on 800 vectors
python apps/web/e2e/trade_flow.py   # browser: sign in, fund, quote, trade, portfolio (API + web running)
```

## Layout

| Path | What |
|---|---|
| `packages/shared` | Integer FPMM pricing (reference implementation), unit formatting, API types |
| `contracts/quire-market` | NEAR contract (mainnet, native NEAR): perpetual markets, deposits, positions, slippage, order ids, agent limits, safety caps, resolution |
| `apps/api` | Fastify + Drizzle/Postgres: markets, quotes, execution, portfolio, agents, encyclopedia |
| `apps/web` | Next.js App Router + Tailwind UI |
| `docs/ARCHITECTURE.md` | Market-maker choice, NEAR Intents vs Chain Signatures roles, trust assumptions |

## Licence

MIT, see [LICENSE](LICENSE).
