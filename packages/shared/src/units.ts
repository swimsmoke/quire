/**
 * Decimal <-> base-unit conversion without floating point.
 * qUSD (and outcome shares) use 6 decimals.
 */
export const QUSD_DECIMALS = 6;

const DEC_RE = /^(\d+)(?:\.(\d+))?$/;

/** "12.5" -> 12500000n (6 decimals). Rejects negatives, exponents, and excess precision. */
export function parseUnits(value: string, decimals = QUSD_DECIMALS): bigint {
  const v = value.trim();
  const m = DEC_RE.exec(v);
  if (!m) throw new RangeError(`invalid decimal amount: ${value}`);
  const whole = m[1]!;
  const frac = m[2] ?? "";
  if (frac.length > decimals) throw new RangeError(`too many decimal places (max ${decimals})`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

/** 12500000n -> "12.5" */
export function formatUnits(value: bigint, decimals = QUSD_DECIMALS, maxFrac = decimals): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? "." + frac : ""}`;
}

/** 623456n (ppm) -> "62.35%" style string */
export function formatPpmPercent(ppm: bigint, fractionDigits = 1): string {
  // percent with fixed digits, integer math: ppm / 10_000 = percent
  const scale = 10n ** BigInt(fractionDigits);
  const scaled = (ppm * scale + 5_000n) / 10_000n; // round half up
  const whole = scaled / scale;
  const frac = (scaled % scale).toString().padStart(fractionDigits, "0");
  return fractionDigits > 0 ? `${whole}.${frac}%` : `${whole}%`;
}

/** ppm price -> "0.62" style per-share price in qUSD */
export function formatPpmPrice(ppm: bigint, digits = 2): string {
  return formatUnits(ppm, 6, digits);
}
