/** JSON serialisation that turns bigint into decimal strings (never numbers). */
export function toJson(payload: unknown): string {
  return JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}
