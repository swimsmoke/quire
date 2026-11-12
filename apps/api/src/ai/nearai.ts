/**
 * NEAR AI Cloud client (OpenAI-compatible) with confidential-inference verification.
 *
 * For each completion we keep sha256 of the exact request bytes we sent and of the exact
 * response bytes we received, then ask NEAR AI for the TEE's signature over those hashes
 * and check that (a) the signed text contains our two hashes and (b) the signature
 * recovers to the stated signing address. We also fetch the attestation report and check
 * the signing address is listed in it. We do NOT verify the hardware quote itself, and
 * none of this says anything about whether the generated text is true.
 */
import { createHash, randomBytes } from "node:crypto";
import { recoverMessageAddress } from "viem";

export interface NearAiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
}

export interface InferenceResult {
  model: string;
  chatId: string | null;
  content: string;
  requestHash: string;
  responseHash: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  signatureText: string | null;
  signature: string | null;
  signingAddress: string | null;
  signingAlgo: string | null;
  /** true only if the signed text contains both hashes AND the signature recovers to signingAddress */
  signatureVerified: boolean | null;
  attestationNonce: string | null;
  attestationReport: unknown;
  /** true if the signing address appears in NEAR AI's attestation report for this model */
  attestationBindsSigner: boolean | null;
  verificationNote: string | null;
}

export class NearAiError extends Error {
  constructor(
    public code: "NOT_CONFIGURED" | "HTTP_ERROR" | "BAD_RESPONSE",
    message: string,
  ) {
    super(message);
  }
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const PREFERRED = ["deepseek", "qwen", "glm", "llama"];

async function pickModel(cfg: NearAiConfig, f: typeof fetch): Promise<string> {
  try {
    const r = await f(`${cfg.baseUrl}/models`, { headers: { authorization: `Bearer ${cfg.apiKey}` }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return cfg.model;
    const ids: string[] = ((await r.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
    if (!ids.length || ids.includes(cfg.model)) return cfg.model;
    for (const p of PREFERRED) {
      const hit = ids.find((id) => id.toLowerCase().includes(p));
      if (hit) return hit;
    }
    return ids[0]!;
  } catch {
    return cfg.model;
  }
}

export async function confidentialChat(cfg: NearAiConfig, messages: { role: "system" | "user"; content: string }[]): Promise<InferenceResult> {
  if (!cfg.apiKey || cfg.apiKey === "none") throw new NearAiError("NOT_CONFIGURED", "NEAR_AI_API_KEY is not set on the server");
  const f = cfg.fetchFn ?? fetch;
  const model = await pickModel(cfg, f);
  const body = JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 2400 });
  const started = Date.now();
  let res: Response;
  let raw: string;
  try {
    res = await f(`${cfg.baseUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` }, body, signal: AbortSignal.timeout(120_000) });
    raw = await res.text();
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    throw new NearAiError("HTTP_ERROR", `Could not complete the request to NEAR AI Cloud (model ${model}): ${(e as Error).message}${cause ? ` [${cause.code ?? cause.message ?? ""}]` : ""}`);
  }
  if (!res.ok) throw new NearAiError("HTTP_ERROR", `NEAR AI Cloud returned ${res.status}: ${raw.slice(0, 300)}`);
  let json: { id?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new NearAiError("BAD_RESPONSE", "NEAR AI Cloud returned a non-JSON response");
  }
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new NearAiError("BAD_RESPONSE", "NEAR AI Cloud returned no message content");

  const out: InferenceResult = {
    model,
    chatId: json.id ?? null,
    content,
    requestHash: sha256(body),
    responseHash: sha256(raw),
    latencyMs: Date.now() - started,
    promptTokens: json.usage?.prompt_tokens ?? null,
    completionTokens: json.usage?.completion_tokens ?? null,
    signatureText: null,
    signature: null,
    signingAddress: null,
    signingAlgo: null,
    signatureVerified: null,
    attestationNonce: null,
    attestationReport: null,
    attestationBindsSigner: null,
    verificationNote: null,
  };

  // --- signature over (request hash, response hash) ---
  if (out.chatId) {
    try {
      const s = await f(`${cfg.baseUrl}/signature/${encodeURIComponent(out.chatId)}?model=${encodeURIComponent(model)}&signing_algo=ecdsa`, { headers: { authorization: `Bearer ${cfg.apiKey}` }, signal: AbortSignal.timeout(30_000) });
      if (s.ok) {
        const sig = (await s.json()) as { text?: string; signature?: string; signing_address?: string; signing_algo?: string };
        out.signatureText = sig.text ?? null;
        out.signature = sig.signature ?? null;
        out.signingAddress = sig.signing_address ?? null;
        out.signingAlgo = sig.signing_algo ?? null;
        if (sig.text && sig.signature && sig.signing_address) {
          const hashesMatch = sig.text.includes(out.requestHash) && sig.text.includes(out.responseHash);
          let signerOk = false;
          try {
            const sigHex = (sig.signature.startsWith("0x") ? sig.signature : `0x${sig.signature}`) as `0x${string}`;
            const rec = await recoverMessageAddress({ message: sig.text, signature: sigHex });
            signerOk = rec.toLowerCase() === sig.signing_address.toLowerCase();
          } catch {
            signerOk = false;
          }
          out.signatureVerified = hashesMatch && signerOk;
          if (!hashesMatch) out.verificationNote = "The signed text does not contain the hashes of the bytes Quire sent and received.";
          else if (!signerOk) out.verificationNote = "The signature does not recover to the stated signing address.";
        }
      } else out.verificationNote = `Signature endpoint returned ${s.status}.`;
    } catch (e) {
      out.verificationNote = `Could not fetch the signature: ${(e as Error).message}`;
    }
  }

  // --- attestation report: is the signing key one NEAR AI attests for this model? ---
  if (out.signingAddress) {
    try {
      const nonce = randomBytes(32).toString("hex");
      const a = await f(`${cfg.baseUrl}/attestation/report?model=${encodeURIComponent(model)}&nonce=${nonce}&signing_algo=ecdsa`, { headers: { authorization: `Bearer ${cfg.apiKey}` }, signal: AbortSignal.timeout(30_000) });
      if (a.ok) {
        const text = await a.text();
        out.attestationNonce = nonce;
        out.attestationBindsSigner = text.toLowerCase().includes(out.signingAddress.toLowerCase());
        // keep a compact copy: the full report can be megabytes
        out.attestationReport = { sha256: sha256(text), bytes: text.length, fetchedAt: new Date().toISOString() };
      }
    } catch {
      /* attestation is supplementary; leave as not checked */
    }
  }
  return out;
}
