import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  FpmmError,
  isqrt,
  isqrtCeil,
  MAX_TRADE,
  PRICE_SCALE,
  priceNo,
  priceYes,
  quoteBuy,
  quoteSell,
  seedPool,
  type Outcome,
  type Pool,
} from "../src/fpmm.js";
import { formatPpmPercent, formatUnits, parseUnits } from "../src/units.js";

const Q = (n: number | string) => parseUnits(String(n));

describe("isqrt", () => {
  it("matches exact squares and floors otherwise", () => {
    for (const n of [0n, 1n, 2n, 3n, 4n, 15n, 16n, 17n, 10n ** 30n, 10n ** 30n + 1n]) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1n) * (r + 1n) > n).toBe(true);
      const c = isqrtCeil(n);
      expect(c * c >= n && (c === 0n || (c - 1n) * (c - 1n) < n)).toBe(true);
    }
  });
});

describe("seedPool", () => {
  it("50% gives a symmetric pool and no leftover", () => {
    const s = seedPool(Q(1000), 500_000n);
    expect(s.pool).toEqual({ yes: Q(1000), no: Q(1000) });
    expect(s.lpYes + s.lpNo).toBe(0n);
    expect(priceYes(s.pool)).toBe(500_000n);
  });
  it("hits the requested probability within 1ppm and conserves sets", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 10_000n, max: 990_000n }), fc.bigInt({ min: 1_000_000n, max: 10n ** 13n }), (p, L) => {
        const s = seedPool(L, p);
        expect(s.pool.yes + s.lpYes).toBe(L);
        expect(s.pool.no + s.lpNo).toBe(L);
        const diff = priceYes(s.pool) - p;
        expect(diff >= -2n && diff <= 2n).toBe(true);
      }),
    );
  });
  it("rejects out-of-range probabilities", () => {
    expect(() => seedPool(Q(10), 5_000n)).toThrow(FpmmError);
    expect(() => seedPool(Q(10), 995_000n)).toThrow(FpmmError);
  });
});

describe("quoteBuy", () => {
  const pool: Pool = { yes: Q(1000), no: Q(1000) };
  it("buying YES moves YES probability up and gives > net shares", () => {
    const q = quoteBuy(pool, "YES", Q(100), 100n);
    expect(q.fee).toBe(Q(1));
    expect(q.sharesOut > Q(99)).toBe(true);
    expect(q.priceAfterPpm > q.priceBeforePpm).toBe(true);
    expect(priceYes(q.poolAfter) + priceNo(q.poolAfter)).toBe(PRICE_SCALE);
  });
  it("known value: 100 qUSD into 1000/1000 with no fee", () => {
    // newNo = 1100, newYes = ceil(1e6*1e6... ) -> shares = 1000 + 100 - 909.090910 = 190.909090
    const q = quoteBuy(pool, "YES", Q(100), 0n);
    expect(formatUnits(q.sharesOut)).toBe("190.90909");
    expect(q.poolAfter.no).toBe(Q(1100));
    expect(q.poolAfter.yes).toBe(909_090_910n);
  });
  it("rejects zero and oversize trades", () => {
    expect(() => quoteBuy(pool, "YES", 0n, 100n)).toThrow(FpmmError);
    expect(() => quoteBuy(pool, "YES", MAX_TRADE + 1n, 100n)).toThrow(FpmmError);
  });
});

describe("round trips never create value", () => {
  it("buy then sell the same shares returns <= amount paid", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1_000_000n, max: 10n ** 12n }),
        fc.bigInt({ min: 1_000_000n, max: 10n ** 12n }),
        fc.bigInt({ min: 100n, max: 10n ** 11n }),
        fc.constantFrom<Outcome>("YES", "NO"),
        fc.bigInt({ min: 0n, max: 500n }),
        (y, n, amt, o, fee) => {
          const b = quoteBuy({ yes: y, no: n }, o, amt, fee);
          let s;
          try {
            s = quoteSell(b.poolAfter, o, b.sharesOut, fee);
          } catch (e) {
            if (e instanceof FpmmError && e.code === "INSUFFICIENT_OUTPUT") return; // dust
            throw e;
          }
          expect(s.collateralOut <= amt).toBe(true);
          expect(s.poolAfter.yes * s.poolAfter.no >= y * n).toBe(true);
        },
      ),
      { numRuns: 2000 },
    );
  });
});

describe("solvency under random trading", () => {
  it("YES supply == NO supply == sets and collateral == sets + fees", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            trader: fc.integer({ min: 0, max: 4 }),
            side: fc.constantFrom("BUY", "SELL"),
            outcome: fc.constantFrom<Outcome>("YES", "NO"),
            amt: fc.bigInt({ min: 1n, max: 5n * 10n ** 9n }),
          }),
          { maxLength: 60 },
        ),
        fc.bigInt({ min: 20_000n, max: 980_000n }),
        (ops, p) => {
          const fee = 150n;
          const seed = seedPool(Q(5000), p);
          let pool = seed.pool;
          let sets = seed.sets;
          let fees = 0n;
          let collateral = seed.sets;
          const pos = Array.from({ length: 5 }, () => ({ YES: 0n, NO: 0n }));
          const lp = { YES: seed.lpYes, NO: seed.lpNo };
          for (const op of ops) {
            const h = pos[op.trader]!;
            try {
              if (op.side === "BUY") {
                const q = quoteBuy(pool, op.outcome, op.amt, fee);
                pool = q.poolAfter;
                h[op.outcome] += q.sharesOut;
                fees += q.fee;
                sets += q.collateralIn - q.fee;
                collateral += q.collateralIn;
              } else {
                const shares = op.amt > h[op.outcome] ? h[op.outcome] : op.amt;
                if (shares === 0n) continue;
                const q = quoteSell(pool, op.outcome, shares, fee);
                pool = q.poolAfter;
                h[op.outcome] -= shares;
                fees += q.fee;
                sets -= q.grossCollateral;
                collateral -= q.collateralOut;
              }
            } catch (e) {
              if (e instanceof FpmmError) continue;
              throw e;
            }
            const yesSupply = pool.yes + lp.YES + pos.reduce((a, x) => a + x.YES, 0n);
            const noSupply = pool.no + lp.NO + pos.reduce((a, x) => a + x.NO, 0n);
            expect(yesSupply).toBe(sets);
            expect(noSupply).toBe(sets);
            expect(collateral).toBe(sets + fees);
            expect(pool.yes > 0n && pool.no > 0n).toBe(true);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("units", () => {
  it("parses and formats without floats", () => {
    expect(parseUnits("12.5")).toBe(12_500_000n);
    expect(parseUnits("0.000001")).toBe(1n);
    expect(formatUnits(12_500_000n)).toBe("12.5");
    expect(() => parseUnits("1.0000001")).toThrow();
    expect(() => parseUnits("-1")).toThrow();
    expect(() => parseUnits("1e3")).toThrow();
    expect(formatPpmPercent(623_456n)).toBe("62.3%");
    expect(formatPpmPercent(623_456n, 2)).toBe("62.35%");
  });
});
