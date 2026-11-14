/**
 * The AI jury. Three different models on NEAR AI Cloud read the claim, its
 * resolution criteria and the evidence Quire has checked against its source,
 * and each returns a verdict on its own. Two matching verdicts make a ruling.
 *
 * Jurors never see the market price, so the crowd cannot talk the jury into
 * an answer. Each verdict is a confidential inference with its own enclave
 * signature, stored like every other inference.
 */
import { z } from "zod";
import { confidentialChat, type InferenceResult, type NearAiConfig } from "../ai/nearai.js";

export const VERDICTS = ["YES", "NO", "INVALID", "NOT_YET"] as const;
export type Verdict = (typeof VERDICTS)[number];
export type Ruling = Exclude<Verdict, "NOT_YET">;

/** Model families to draw jurors from, most preferred first. One juror per family. */
const FAMILIES = ["deepseek", "qwen", "glm", "gpt-oss", "llama", "kimi", "mistral"];

export interface JuryEvidence {
  key: string;
  title: string;
  source: string;
  url: string;
  quote: string;
  retrievedAt: string | null;
}

export interface JuryInput {
  question: string;
  description: string;
  resolutionCriteria: string;
  evidence: JuryEvidence[];
  now: string;
}

const VoteSchema = z.object({
  verdict: z.enum(VERDICTS),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(1200),
  citations: z.array(z.string()).max(12).default([]),
});
export type ParsedVote = z.infer<typeof VoteSchema>;

export const JURY_PROMPT = `You are one of three independent judges who settle a prediction market on Quire.
You get a yes-or-no claim, the rule for when it counts as true, and quotes that Quire has checked word for word against their source pages.

Decide one verdict:
- "YES": the evidence shows the resolution rule has been met.
- "NO": the evidence shows the rule can no longer be met, or the rule's deadline passed without it being met.
- "INVALID": the claim cannot be judged as written (ambiguous, self-contradictory, or about something that cannot be checked).
- "NOT_YET": the evidence does not settle it either way. This is the right answer when in doubt.

Rules:
- Use only the quotes given. Do not use what you remember; your memory may be out of date.
- Cite the quotes you rely on by their keys (E1, E2, ...). A YES or NO needs at least one citation.
- Today's date is in "now".
- Reply with JSON only: {"verdict": "...", "confidence": 0.0 to 1.0, "reasoning": "two or three plain sentences", "citations": ["E1"]}`;

/** Pull the first JSON object out of a model reply, tolerating code fences and leading text. */
export function parseVote(text: string, keys: Set<string>): ParsedVote {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in the reply");
  const v = VoteSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
  const citations = [...new Set(v.citations)].filter((c) => keys.has(c));
  // A decisive verdict with nothing to point at is not a ruling.
  if ((v.verdict === "YES" || v.verdict === "NO") && citations.length === 0) return { ...v, verdict: "NOT_YET", citations };
  return { ...v, citations };
}

/** Two or more matching decisive verdicts make a ruling; anything else is NOT_YET. */
export function tally(verdicts: (Verdict | null)[]): { verdict: Verdict; count: number } {
  const counts = new Map<Verdict, number>();
  for (const v of verdicts) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  for (const v of ["YES", "NO", "INVALID"] as const) {
    const n = counts.get(v) ?? 0;
    if (n >= 2) return { verdict: v, count: n };
  }
  return { verdict: "NOT_YET", count: counts.get("NOT_YET") ?? 0 };
}

/** Choose three jurors from different model families, falling back to the configured model. */
export async function pickJurors(cfg: NearAiConfig): Promise<string[]> {
  const f = cfg.fetchFn ?? fetch;
  let ids: string[] = [];
  try {
    const r = await f(`${cfg.baseUrl}/models`, { headers: { authorization: `Bearer ${cfg.apiKey}` }, signal: AbortSignal.timeout(15_000) });
    if (r.ok) ids = ((await r.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
  } catch {
    /* fall through to the configured model */
  }
  const chosen: string[] = [];
  for (const fam of FAMILIES) {
    const hit = ids.find((id) => id.toLowerCase().includes(fam) && !chosen.includes(id));
    if (hit) chosen.push(hit);
    if (chosen.length === 3) break;
  }
  for (const id of ids) if (chosen.length < 3 && !chosen.includes(id)) chosen.push(id);
  while (chosen.length < 3) chosen.push(chosen[0] ?? cfg.model);
  return chosen;
}

export interface JurorResult {
  model: string;
  inference: InferenceResult | null;
  vote: ParsedVote | null;
  error: string | null;
}

export async function askJuror(cfg: NearAiConfig, model: string, input: JuryInput): Promise<JurorResult> {
  const keys = new Set(input.evidence.map((e) => e.key));
  const messages = [
    { role: "system" as const, content: JURY_PROMPT },
    { role: "user" as const, content: JSON.stringify(input) },
  ];
  let inference: InferenceResult | null = null;
  try {
    inference = await confidentialChat({ ...cfg, model }, messages);
    return { model: inference.model, inference, vote: parseVote(inference.content, keys), error: null };
  } catch (e) {
    return { model: inference?.model ?? model, inference, vote: null, error: (e as Error).message.slice(0, 300) };
  }
}
