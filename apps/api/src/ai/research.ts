/**
 * Scout's own research. It searches Wikipedia with the claim's subject and with the words of the
 * question, reads the full text of the best-matching articles, and ranks sentences by how much they
 * say about the claim (shared words, figures, dates). The best ones are submitted through the same
 * check as human-submitted evidence: the page is fetched and the quote must be on it word for word.
 */
export interface Candidate {
  url: string;
  title: string;
  excerpt: string;
  score: number;
}

const UA = { "user-agent": "QuireEvidenceBot/0.1 (evidence retrieval for a hackathon project)", accept: "application/json" };
const API = "https://en.wikipedia.org/w/api.php";
const STOP = new Set(
  "will the and for that this with ever does have has are can what when who how than from into its was been being any more least before after above below reach over under about there their which would could should yes not".split(" "),
);

/** Lower-case word stems from a question: "Will Bitcoin trade above $150,000?" -> ["bitco", "trade", "150000"] */
export function keyTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/(\d),(?=\d{3})/g, "$1")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return [...new Set(words.map((w) => (/^\d+$/.test(w) ? w : w.slice(0, 5))))];
}

export function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((p) => p.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 50 && s.length <= 320 && !/[[\]{}=\\]|displaystyle|\(\s*\)/.test(s) && /[.!?]$/.test(s));
}

/** How much a sentence says about the claim. Zero means it shares no word with it. */
export function scoreSentence(s: string, terms: string[]): number {
  const lower = s.toLowerCase().replace(/(\d),(?=\d{3})/g, "$1");
  const tokens = lower.split(/[^a-z0-9]+/).map((w) => (/^\d+$/.test(w) ? w : w.slice(0, 5)));
  const hits = terms.filter((t) => tokens.includes(t)).length;
  if (hits === 0) return 0;
  let score = hits * 3;
  if (/\d/.test(s)) score += 1; // figures
  if (/\b(19|20)\d{2}\b/.test(s)) score += 1; // a date anchors it in time
  if (/[$€£]|\bper cent\b|%/.test(s)) score += 1; // prices and rates
  if (s.includes("(")) score -= 1; // parenthetical asides often render differently on the page
  return score;
}

async function getJson(fetchFn: typeof fetch, url: string) {
  const r = await fetchFn(url, { headers: UA, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`wikipedia ${r.status}`);
  return r.json() as Promise<Record<string, unknown>>;
}

export async function findCandidates(subject: string, question: string, fetchFn: typeof fetch = fetch, opts = { pages: 3, perPage: 2 }): Promise<Candidate[]> {
  const terms = keyTerms(`${subject} ${question}`);
  const queries = [...new Set([subject, keyTerms(question).length ? question.replace(/^(will|is|does|can|has|are)\s+/i, "").replace(/[?]/g, "") : subject])];
  const titles: string[] = [];
  try {
    for (const q of queries) {
      const s = (await getJson(fetchFn, `${API}?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(q)}`)) as { query?: { search?: { title: string }[] } };
      for (const t of s.query?.search ?? []) if (!titles.includes(t.title)) titles.push(t.title);
    }
  } catch {
    return [];
  }
  const out: Candidate[] = [];
  for (const title of titles.slice(0, opts.pages)) {
    try {
      const j = (await getJson(fetchFn, `${API}?action=query&prop=extracts|info&inprop=url&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`)) as {
        query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string }> };
      };
      const page = Object.values(j.query?.pages ?? {})[0];
      if (!page?.extract || !page.fullurl) continue;
      const ranked = sentences(page.extract)
        .map((excerpt) => ({ url: page.fullurl!, title: page.title, excerpt, score: scoreSentence(excerpt, terms) }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score);
      // a few spares per page, since a sentence that reads differently on the page fails the check
      out.push(...ranked.slice(0, opts.perPage * 3));
    } catch {
      /* skip this page */
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
