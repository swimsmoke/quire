/**
 * Evidence retrieval. Quire fetches the submitted URL itself and checks whether the quoted
 * excerpt appears in the page text. A model's opinion never counts as verification.
 */
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface CheckResult {
  status: "EXCERPT_VERIFIED" | "EXCERPT_NOT_FOUND" | "FETCH_FAILED";
  detail: string;
  httpStatus: number | null;
  finalUrl: string | null;
  contentHash: string | null;
  pageTitle: string | null;
}

const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^::1$/, /^f[cd]/i, /^fe80/i];

async function assertPublic(url: URL) {
  if (url.protocol !== "https:") throw new Error("only https links are accepted");
  if (isIP(url.hostname) || url.hostname === "localhost" || !url.hostname.includes(".")) throw new Error("that address is not a public website");
  const addrs = await lookup(url.hostname, { all: true });
  if (addrs.some((a) => PRIVATE.some((re) => re.test(a.address)))) throw new Error("that address is not a public website");
}

export const normalize = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<sup[^>]*class="[^"]*reference[^"]*"[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)));
}

export async function checkEvidence(urlStr: string, excerpt: string, fetchFn: typeof fetch = fetch, skipDnsCheck = false): Promise<CheckResult> {
  const fail = (detail: string, httpStatus: number | null = null): CheckResult => ({ status: "FETCH_FAILED", detail, httpStatus, finalUrl: null, contentHash: null, pageTitle: null });
  let url: URL;
  try {
    url = new URL(urlStr);
    if (!skipDnsCheck) await assertPublic(url);
  } catch (e) {
    return fail((e as Error).message || "invalid link");
  }
  try {
    const res = await fetchFn(url, { redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "user-agent": "QuireEvidenceBot/0.1 (evidence retrieval for a hackathon project)", accept: "text/html,text/plain" } });
    if (!res.ok) return fail(`the site answered with HTTP ${res.status}`, res.status);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/|json|xml/.test(type)) return fail(`unsupported content type ${type || "unknown"}`, res.status);
    const body = (await res.text()).slice(0, 3_000_000);
    const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(body)?.[1]?.trim() ?? null;
    const found = normalize(htmlToText(body)).includes(normalize(excerpt));
    return {
      status: found ? "EXCERPT_VERIFIED" : "EXCERPT_NOT_FOUND",
      detail: found ? "The quoted text was found on the retrieved page." : "The page was retrieved, but the quoted text was not found on it word for word.",
      httpStatus: res.status,
      finalUrl: res.url || url.toString(),
      contentHash: createHash("sha256").update(body).digest("hex"),
      pageTitle: title,
    };
  } catch (e) {
    return fail(`could not retrieve the page: ${(e as Error).message}`);
  }
}
