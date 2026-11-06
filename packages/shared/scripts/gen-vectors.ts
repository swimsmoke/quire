/**
 * Generates deterministic FPMM test vectors consumed by the Rust contract
 * tests (contracts/quire-market/tests/vectors.json), proving the on-chain
 * math and the off-chain quote engine agree bit-for-bit.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FpmmError, quoteBuy, quoteSell, seedPool, type Outcome } from "../src/fpmm.js";

// mulberry32 PRNG for reproducibility
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(42);
const big = (min: bigint, max: bigint) => min + (BigInt(Math.floor(r() * 2 ** 52)) * (max - min)) / 2n ** 52n;

type V =
  | { kind: "seed"; liquidity: string; prob_ppm: string; ok: boolean; yes?: string; no?: string; lp_yes?: string; lp_no?: string }
  | { kind: "buy" | "sell"; yes: string; no: string; outcome: Outcome; amount: string; fee_bps: string; ok: boolean; out?: string; fee?: string; gross?: string; new_yes?: string; new_no?: string };

const vectors: V[] = [];

for (let i = 0; i < 200; i++) {
  const liquidity = big(1n, 10n ** 13n);
  const prob = big(5_000n, 995_000n);
  try {
    const s = seedPool(liquidity, prob);
    vectors.push({ kind: "seed", liquidity: `${liquidity}`, prob_ppm: `${prob}`, ok: true, yes: `${s.pool.yes}`, no: `${s.pool.no}`, lp_yes: `${s.lpYes}`, lp_no: `${s.lpNo}` });
  } catch (e) {
    if (!(e instanceof FpmmError)) throw e;
    vectors.push({ kind: "seed", liquidity: `${liquidity}`, prob_ppm: `${prob}`, ok: false });
  }
}

for (let i = 0; i < 600; i++) {
  const yes = big(1n, 10n ** 13n);
  const no = big(1n, 10n ** 13n);
  const outcome: Outcome = r() < 0.5 ? "YES" : "NO";
  const fee = big(0n, 500n);
  const tiny = r() < 0.1;
  const amount = tiny ? big(1n, 50n) : big(1n, 10n ** 12n);
  const kind = r() < 0.5 ? "buy" : "sell";
  const base = { kind, yes: `${yes}`, no: `${no}`, outcome, amount: `${amount}`, fee_bps: `${fee}` } as const;
  try {
    if (kind === "buy") {
      const q = quoteBuy({ yes, no }, outcome, amount, fee);
      vectors.push({ ...base, ok: true, out: `${q.sharesOut}`, fee: `${q.fee}`, new_yes: `${q.poolAfter.yes}`, new_no: `${q.poolAfter.no}` });
    } else {
      const q = quoteSell({ yes, no }, outcome, amount, fee);
      vectors.push({ ...base, ok: true, out: `${q.collateralOut}`, fee: `${q.fee}`, gross: `${q.grossCollateral}`, new_yes: `${q.poolAfter.yes}`, new_no: `${q.poolAfter.no}` });
    }
  } catch (e) {
    if (!(e instanceof FpmmError)) throw e;
    vectors.push({ ...base, ok: false });
  }
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../../contracts/quire-market/tests/vectors.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(vectors, null, 0));
const ok = vectors.filter((v) => v.ok).length;
console.log(`wrote ${vectors.length} vectors (${ok} ok, ${vectors.length - ok} expected errors) -> ${out}`);
