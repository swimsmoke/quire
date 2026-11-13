/**
 * Scout's own research. It searches Wikipedia for the claim's subject, takes the opening
 * sentences of the best-matching articles as candidate quotes, and submits each one through
 * the same check as human-submitted evidence (the page is fetched and the quote must be on it).
 */
export interface Candidate {
  url: string;
  excerpt: string;
}

const UA = { "user-agent": "QuireEvidenceBot/0.1 (evidence retrieval for a hackathon project)", accept: "application/json" };

export async function findCandidates(query: string, fetchFn: typeof fetch = fetch, maxPages = 2): Promise<Candidate[]> {
  const out: Candidate[] = [];
  try {
    const s = await fetchFn(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${maxPages}&srsearch=${encodeURIComponent(query)}`, { headers: UA, signal: AbortSignal.timeout(10_000) });
    if (!s.ok) return out;
    const titles: string[] = ((await s.json()) as { query?: { search?: { title: string }[] } }).query?.search?.map((x) => x.title) ?? [];
    for (const title of titles.slice(0, maxPages)) {
      const r = await fetchFn(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers: UA, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) continue;
      const j = (await r.json()) as { extract?: string; content_urls?: { desktop?: { page?: string } } };
      const url = j.content_urls?.desktop?.page;
      if (!url || !j.extract) continue;
      // candidate quotes: individual sentences, plainest first (parentheses often hide markup that differs on the page)
      const sentences = j.extract
        .split(/(?<=[.!?])\s+(?=[A-Z])/)
        .map((x) => x.trim())
        .filter((x) => x.length >= 40 && x.length <= 400);
      sentences.sort((a, b) => Number(/[()\[\]]/.test(a)) - Number(/[()\[\]]/.test(b)));
      for (const excerpt of sentences.slice(0, 3)) out.push({ url, excerpt });
    }
  } catch {
    /* research is best-effort */
  }
  return out;
}
