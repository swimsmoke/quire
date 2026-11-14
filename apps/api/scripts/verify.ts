/**
 * pnpm verify [api-url]
 *
 * Re-checks, from your own machine, every enclave signature Quire shows: the
 * current encyclopedia revision of each claim and every juror's vote. For each
 * one it confirms that the signed text names the request and response hashes
 * Quire recorded, and that the signature recovers to the stated signing address.
 * It does not verify the hardware attestation quote itself.
 */
import { recoverMessageAddress } from "viem";

const API = (process.argv[2] ?? process.env.QUIRE_API_URL ?? "https://quire-api-0tkm.onrender.com").replace(/\/$/, "");

interface Inf {
  model: string;
  requestHash: string | null;
  responseHash: string | null;
  signatureText: string | null;
  signature: string | null;
  signingAddress: string | null;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function check(i: Inf): Promise<{ ok: boolean; why: string }> {
  if (!i.signatureText || !i.signature || !i.signingAddress) return { ok: false, why: "no signature recorded" };
  const parts = i.signatureText.split(":");
  const [respHash, reqHash] = [parts.pop(), parts.pop()];
  if (reqHash !== i.requestHash || respHash !== i.responseHash) return { ok: false, why: "signed hashes differ from the recorded ones" };
  const who = await recoverMessageAddress({ message: i.signatureText, signature: i.signature as `0x${string}` });
  if (who.toLowerCase() !== i.signingAddress.toLowerCase()) return { ok: false, why: `signature recovers to ${who}` };
  return { ok: true, why: `signed by ${i.signingAddress}` };
}

let pass = 0;
let fail = 0;
const line = async (label: string, i: Inf | null) => {
  if (!i) return;
  const r = await check(i);
  r.ok ? pass++ : fail++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${label}\n      ${i.model}, ${r.why}`);
};

console.log(`Checking enclave signatures served by ${API}\n`);
const { markets } = await get<{ markets: { slug: string; question: string }[] }>("/markets");
for (const m of markets) {
  const e = await get<{ current: { revisionNumber: number; inference: Inf | null } | null }>(`/markets/${m.slug}/encyclopedia`).catch(() => null);
  if (e?.current?.inference) await line(`Encyclopedia, revision ${e.current.revisionNumber}: ${m.question}`, e.current.inference);
}
const { results } = await get<{ results: { id: string; verdict: string; market: { question: string } }[] }>("/results");
for (const r of results) {
  const d = await get<{ inferences: Inf[] }>(`/rulings/${r.id}`);
  for (const [n, i] of d.inferences.entries()) await line(`Jury vote ${n + 1} (ruling ${r.verdict}): ${r.market.question}`, i);
}
console.log(`\n${pass} signatures verified, ${fail} failed.`);
process.exit(fail ? 1 : 0);
