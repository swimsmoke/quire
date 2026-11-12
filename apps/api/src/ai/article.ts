import { z } from "zod";

const Section = z.object({ body: z.string().min(1).max(2400), citations: z.array(z.string()).max(12).default([]) });

/** The fixed structure every encyclopedia revision must have. */
export const ArticleSchema = z.object({
  overview: Section,
  background: Section,
  consensus: Section,
  supporting: Section,
  contradicting: Section,
  uncertainties: Section,
  history: Section,
  changes: Section,
});
export type Article = z.infer<typeof ArticleSchema>;
export const SECTION_KEYS = ["overview", "background", "consensus", "supporting", "contradicting", "uncertainties", "history", "changes"] as const;

export const SYSTEM_PROMPT = `You are Scribe, the encyclopedia writer for Quire, a market where people trade on claims.
Write a neutral, careful encyclopedia entry for ONE claim using ONLY the JSON input you are given.

Rules:
- Reply with a single JSON object and nothing else. No markdown fences, no commentary.
- Keys, exactly: overview, background, consensus, supporting, contradicting, uncertainties, history, changes.
- Each value is an object: {"body": string, "citations": string[]}.
- "citations" may contain only evidence keys from input.evidence (like "E1"). Never invent a source, a URL, a number or a quotation.
- If input.evidence is empty, say plainly in "supporting" and "contradicting" that no verified evidence has been submitted yet, with empty citations.
- "consensus" reports the market probability from input.market as what traders currently believe. It is collective belief, not established fact; say so.
- "history" describes only the price movement and trading in input.history and input.market.
- "changes" compares with input.previous. If input.previous is null, say this is the first revision.
- Keep each body between 1 and 4 sentences. Plain language. Do not give trading advice.`;

/** Parse the model's reply: the whole content must be the JSON object, optionally inside one code fence. */
export function parseArticle(content: string, allowedKeys: Set<string>): { article: Article; droppedCitations: string[] } {
  let text = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  if (fence) text = fence[1]!;
  const article = ArticleSchema.parse(JSON.parse(text));
  const dropped: string[] = [];
  for (const k of SECTION_KEYS) {
    article[k].citations = article[k].citations.filter((c) => {
      if (allowedKeys.has(c)) return true;
      dropped.push(c);
      return false;
    });
  }
  return { article, droppedCitations: dropped };
}
