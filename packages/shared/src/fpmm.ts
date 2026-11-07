/**
 * Quire FPMM — Fixed Product Market Maker for perpetual binary claims.
 *
 * Integer-only (bigint) implementation. This file is the reference
 * specification for the Rust contract in contracts/quire-market/src/fpmm.rs.
 * Both are checked against the same generated test vectors, so any change
 * here MUST be mirrored there (run `pnpm --filter @quire/shared vectors`
 * then `cargo test`).
 *
 * Model
 * -----
 * - Collateral (NEAR) and outcome shares share the same base unit (6 decimals).
 * - 1 YES share + 1 NO share ("a complete set") is always backed by exactly
 *   1 unit of collateral. Total YES supply == total NO supply == sets minted.
 * - The pool holds reserves (yes, no) and keeps yes * no non-decreasing.
 * - Implied probability of YES = no / (yes + no).
 * - Buying: collateral is split into complete sets; the pool returns the
 *   trader's side so that the invariant holds.
 * - Selling: the trader's shares go into the pool and the pool burns complete
 *   sets to pay out collateral.
 * - All rounding favours the pool (and therefore solvency), never the trader.
 */

export const PRICE_SCALE = 1_000_000n; // prices / probabilities in parts-per-million
export const BPS = 10_000n;
export const MIN_PROB_PPM = 10_000n; // 1%
export const MAX_PROB_PPM = 990_000n; // 99%
/** Hard caps keep every intermediate product well inside u128 in the contract. */
export const MAX_RESERVE = 10n ** 15n; // 1e9 NEAR
export const MAX_TRADE = 10n ** 14n; // 1e8 NEAR
export const MAX_FEE_BPS = 500n; // 5%

export type Outcome = "YES" | "NO";

export interface Pool {
  yes: bigint;
  no: bigint;
}

export class FpmmError extends Error {
  constructor(
    public code:
      | "ZERO_AMOUNT"
      | "AMOUNT_TOO_LARGE"
      | "EMPTY_POOL"
      | "RESERVE_CAP"
      | "INSUFFICIENT_OUTPUT"
      | "BAD_PROBABILITY"
      | "BAD_FEE"
      | "INVARIANT",
    message: string,
  ) {
    super(message);
    this.name = "FpmmError";
  }
}

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

/** floor(sqrt(n)) via Newton's method — identical algorithm in Rust. */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of negative");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** ceil(sqrt(n)) */
export function isqrtCeil(n: bigint): bigint {
  const r = isqrt(n);
  return r * r === n ? r : r + 1n;
}

function assertPool(p: Pool) {
  if (p.yes <= 0n || p.no <= 0n) throw new FpmmError("EMPTY_POOL", "pool reserves must be positive");
}

function assertFee(feeBps: bigint) {
  if (feeBps < 0n || feeBps > MAX_FEE_BPS) throw new FpmmError("BAD_FEE", "fee out of range");
}

/** Implied probability of YES in ppm (floor). */
export function priceYes(p: Pool): bigint {
  assertPool(p);
  return (p.no * PRICE_SCALE) / (p.yes + p.no);
}

/** Implied probability of NO in ppm, defined as the complement so YES+NO == 1. */
export function priceNo(p: Pool): bigint {
  return PRICE_SCALE - priceYes(p);
}

export function priceOf(p: Pool, outcome: Outcome): bigint {
  return outcome === "YES" ? priceYes(p) : priceNo(p);
}

export function feeFor(amount: bigint, feeBps: bigint): bigint {
  assertFee(feeBps);
  return ceilDiv(amount * feeBps, BPS);
}

export interface BuyQuote {
  outcome: Outcome;
  collateralIn: bigint; // gross amount debited from trader
  fee: bigint;
  sharesOut: bigint;
  /** average execution price in ppm incl. fee: collateralIn / sharesOut */
  avgPricePpm: bigint;
  priceBeforePpm: bigint; // implied prob of the bought outcome before
  priceAfterPpm: bigint; // implied prob of the bought outcome after
  poolAfter: Pool;
}

export function quoteBuy(pool: Pool, outcome: Outcome, collateralIn: bigint, feeBps: bigint): BuyQuote {
  assertPool(pool);
  if (collateralIn <= 0n) throw new FpmmError("ZERO_AMOUNT", "amount must be positive");
  if (collateralIn > MAX_TRADE) throw new FpmmError("AMOUNT_TOO_LARGE", "amount exceeds max trade");
  const fee = feeFor(collateralIn, feeBps);
  const net = collateralIn - fee;
  if (net <= 0n) throw new FpmmError("ZERO_AMOUNT", "amount too small after fee");

  const same = outcome === "YES" ? pool.yes : pool.no;
  const other = outcome === "YES" ? pool.no : pool.yes;

  const newOther = other + net;
  // Round the retained reserve UP so the trader gets (at most) the exact amount.
  const newSame = ceilDiv(same * other, newOther);
  const sharesOut = same + net - newSame;
  if (sharesOut <= 0n) throw new FpmmError("INSUFFICIENT_OUTPUT", "trade too small");
  if (newOther > MAX_RESERVE || newSame > MAX_RESERVE) throw new FpmmError("RESERVE_CAP", "pool reserve cap reached");

  const poolAfter: Pool = outcome === "YES" ? { yes: newSame, no: newOther } : { yes: newOther, no: newSame };
  if (poolAfter.yes * poolAfter.no < pool.yes * pool.no) throw new FpmmError("INVARIANT", "invariant decreased");

  return {
    outcome,
    collateralIn,
    fee,
    sharesOut,
    avgPricePpm: (collateralIn * PRICE_SCALE) / sharesOut,
    priceBeforePpm: priceOf(pool, outcome),
    priceAfterPpm: priceOf(poolAfter, outcome),
    poolAfter,
  };
}

export interface SellQuote {
  outcome: Outcome;
  sharesIn: bigint;
  grossCollateral: bigint; // complete sets burned
  fee: bigint;
  collateralOut: bigint; // net paid to trader
  avgPricePpm: bigint; // collateralOut / sharesIn
  priceBeforePpm: bigint;
  priceAfterPpm: bigint;
  poolAfter: Pool;
}

/**
 * Selling s shares of `outcome`: pool receives s shares, then burns x sets.
 * Largest x with (same + s - x)(other - x) >= same*other is the smaller root of
 *   x^2 - (same + s + other) x + s*other = 0.
 * We use ceil(sqrt) so x is never over-estimated, then step down if needed.
 */
export function quoteSell(pool: Pool, outcome: Outcome, sharesIn: bigint, feeBps: bigint): SellQuote {
  assertPool(pool);
  assertFee(feeBps);
  if (sharesIn <= 0n) throw new FpmmError("ZERO_AMOUNT", "shares must be positive");
  if (sharesIn > MAX_TRADE) throw new FpmmError("AMOUNT_TOO_LARGE", "shares exceed max trade");

  const same = outcome === "YES" ? pool.yes : pool.no;
  const other = outcome === "YES" ? pool.no : pool.yes;
  const k = same * other;

  const b = same + sharesIn + other;
  const disc = b * b - 4n * sharesIn * other;
  let x = (b - isqrtCeil(disc)) / 2n;
  // Safety: guarantee invariant and positive reserves.
  while (x > 0n && ((same + sharesIn - x) * (other - x) < k || other - x <= 0n)) x -= 1n;
  if (x <= 0n) throw new FpmmError("INSUFFICIENT_OUTPUT", "trade too small");

  const fee = feeFor(x, feeBps);
  const collateralOut = x - fee;
  if (collateralOut <= 0n) throw new FpmmError("INSUFFICIENT_OUTPUT", "trade too small after fee");

  const newSame = same + sharesIn - x;
  const newOther = other - x;
  if (newSame > MAX_RESERVE) throw new FpmmError("RESERVE_CAP", "pool reserve cap reached");
  const poolAfter: Pool = outcome === "YES" ? { yes: newSame, no: newOther } : { yes: newOther, no: newSame };

  return {
    outcome,
    sharesIn,
    grossCollateral: x,
    fee,
    collateralOut,
    avgPricePpm: (collateralOut * PRICE_SCALE) / sharesIn,
    priceBeforePpm: priceOf(pool, outcome),
    priceAfterPpm: priceOf(poolAfter, outcome),
    poolAfter,
  };
}

export interface SeedResult {
  pool: Pool;
  /** Leftover shares that do not fit the pool go to the liquidity provider. */
  lpYes: bigint;
  lpNo: bigint;
  sets: bigint;
}

/** Seed a pool with `liquidity` collateral at initial YES probability `probPpm`. */
export function seedPool(liquidity: bigint, probPpm: bigint): SeedResult {
  if (liquidity <= 0n) throw new FpmmError("ZERO_AMOUNT", "liquidity must be positive");
  if (liquidity > MAX_RESERVE) throw new FpmmError("RESERVE_CAP", "liquidity exceeds cap");
  if (probPpm < MIN_PROB_PPM || probPpm > MAX_PROB_PPM) throw new FpmmError("BAD_PROBABILITY", "initial probability must be 1%-99%");
  // P(YES) = no / (yes + no). Keep the larger reserve at `liquidity`.
  if (probPpm >= PRICE_SCALE / 2n) {
    const no = liquidity;
    const yes = (liquidity * (PRICE_SCALE - probPpm)) / probPpm;
    return { pool: { yes, no }, lpYes: liquidity - yes, lpNo: 0n, sets: liquidity };
  }
  const yes = liquidity;
  const no = (liquidity * probPpm) / (PRICE_SCALE - probPpm);
  return { pool: { yes, no }, lpYes: 0n, lpNo: liquidity - no, sets: liquidity };
}

/** Mark-to-market value of a position at the current implied price (ppm). */
export function markValue(shares: bigint, pricePpm: bigint): bigint {
  return (shares * pricePpm) / PRICE_SCALE;
}

/**
 * Executable liquidation value: what selling the whole position into the pool
 * would actually pay now (accounts for price impact + fee). Returns 0n if the
 * position is too small to sell.
 */
export function liquidationValue(pool: Pool, outcome: Outcome, shares: bigint, feeBps: bigint): bigint {
  if (shares <= 0n) return 0n;
  try {
    return quoteSell(pool, outcome, shares, feeBps).collateralOut;
  } catch {
    return 0n;
  }
}
