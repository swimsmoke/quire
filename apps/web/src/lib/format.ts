import { formatPpmPercent, formatUnits } from "@quire/shared";

const big = (v: string | number | bigint) => (typeof v === "bigint" ? v : BigInt(v));

/** 523456 ppm -> "52.3%" */
export const pct = (ppm: string | number | bigint, digits = 1) => formatPpmPercent(big(ppm), digits);

/** Probability as a whole-number numeral for display: 523456 -> "52" */
export const pctWhole = (ppm: string | number | bigint) => formatPpmPercent(big(ppm), 0).replace("%", "");

/** per-share price: 523456 ppm -> "0.52" */
export const price = (ppm: string | number | bigint) => {
  const s = formatUnits(big(ppm), 6, 3);
  const [w, f = ""] = s.split(".");
  return `${w}.${f.padEnd(2, "0")}`;
};

/** NEAR with thousands grouping and up to `frac` decimals. */
export function fmtNear(v: string | number | bigint, frac = 2) {
  const s = formatUnits(big(v), 6, frac);
  const neg = s.startsWith("-");
  const [w, f] = (neg ? s.slice(1) : s).split(".");
  const grouped = w!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}${f ? "." + f : ""}`;
}

/**
 * Short NEAR amount that never hides a small balance: 0.4 stays "0.4", 12.5 stays "12.5",
 * large values compact to "12.3k" / "1.2M". (Testnet markets often hold well under 1 NEAR.)
 */
export function fmtNearCompact(v: string | bigint) {
  const u = big(v); // micro-NEAR
  const neg = u < 0n;
  const a = neg ? -u : u;
  const sign = neg ? "-" : "";
  if (a === 0n) return "0";
  if (a < 1_000n) return `${sign}<0.001`;
  const trim = (s: string) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);
  if (a < 1_000_000n) return sign + trim(formatUnits(a, 6, 3)); // under 1 NEAR: up to 3 decimals
  if (a < 1_000_000_000n) return sign + trim(fmtNear(a, 2)); // under 1,000 NEAR: up to 2 decimals
  const whole = a / 1_000_000n;
  if (whole >= 1_000_000n) return `${sign}${trim(formatUnits(whole, 6, 1))}M`;
  return `${sign}${trim(formatUnits(whole, 3, 1))}k`;
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export const shortAccount = (a: string) => (a.length > 22 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a);

const CATEGORY: Record<string, string> = { ai: "AI", near: "NEAR", crypto: "Crypto" };
export const category = (c: string) => CATEGORY[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

/** Signed NEAR amount for profit and loss: "+1.20", "−0.35". */
export const signed = (v: string | bigint, digits = 2) => {
  const n = BigInt(v);
  return `${n > 0n ? "+" : n < 0n ? "−" : ""}${fmtNear((n < 0n ? -n : n).toString(), digits)}`;
};
/** Text colour for a profit or loss. */
export const tone = (v: string | bigint) => (BigInt(v) > 0n ? "text-yes" : BigInt(v) < 0n ? "text-no" : "text-label-2");
