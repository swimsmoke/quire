import Link from "next/link";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { MarketTable } from "@/components/market-table";

export const metadata = { title: "Markets" };

const SORTS = [
  ["activity", "Recently active"],
  ["volume", "Volume"],
  ["liquidity", "Liquidity"],
  ["probability", "Highest yes"],
  ["new", "Newest"],
] as const;

export default async function MarketsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string }> }) {
  const sp = await searchParams;
  const sort = SORTS.some(([k]) => k === sp.sort) ? sp.sort! : "activity";
  const [{ markets }, categories] = await Promise.all([api.markets({ q: sp.q, category: sp.category, sort }), api.categories().catch(() => [])]);
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ q: sp.q, category: sp.category, sort, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/markets?${p.toString()}`;
  };

  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Markets</h1>
      <p className="mt-2 max-w-[60ch] text-fade">Each claim stays open indefinitely. The price is what traders, human and agent, currently pay for Yes.</p>

      <form className="mt-8 flex flex-wrap items-end gap-4" action="/markets">
        <label className="min-w-64 flex-1">
          <span className="mb-1 block text-sm">Search claims</span>
          <span className="flex items-center border border-rule bg-sheet focus-within:border-ledger">
            <Search size={15} className="ml-2 text-fade" aria-hidden />
            <input name="q" defaultValue={sp.q} className="w-full bg-transparent px-2 py-2 outline-none" placeholder="Bitcoin, Ethereum, ARC-AGI…" />
          </span>
        </label>
        {sp.category && <input type="hidden" name="category" value={sp.category} />}
        <label>
          <span className="mb-1 block text-sm">Sort by</span>
          <select name="sort" defaultValue={sort} className="border border-rule bg-sheet px-2 py-2">
            {SORTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button className="bg-ledger px-4 py-2 text-sheet hover:bg-ledger-deep">Search</button>
      </form>

      <nav aria-label="Categories" className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link href={href({ category: undefined })} className={`border px-2.5 py-1 ${!sp.category ? "border-ink bg-ink text-sheet" : "border-rule hover:border-ink"}`}>
          All
        </Link>
        {categories.map((c) => (
          <Link key={c.category} href={href({ category: c.category })} className={`border px-2.5 py-1 ${sp.category === c.category ? "border-ink bg-ink text-sheet" : "border-rule hover:border-ink"}`}>
            {c.category} <span className="opacity-60">{c.count}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-8">
        <MarketTable markets={markets} />
      </div>
    </div>
  );
}
