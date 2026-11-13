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

/** compact NEAR: 12_345_000_000 -> "12.3k" */
export function fmtNearCompact(v: string | bigint) {
  const n = big(v) / 1_000_000n; // whole NEAR
  if (n >= 1_000_000n) return `${formatUnits(n, 6, 1)}M`;
  if (n >= 1_000n) return `${formatUnits(n, 3, 1)}k`;
  return fmtNear(v, 0);
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
