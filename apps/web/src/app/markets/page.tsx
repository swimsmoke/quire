import { PageIn } from "@/components/page-in";
import Link from "next/link";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { ClaimGrid } from "@/components/claim-card";
import { category } from "@/lib/format";
import { PageTitle } from "@/components/section";

export const metadata = { title: "Markets" };

const SORTS = [
  ["activity", "Recently active"],
  ["volume", "Volume"],
  ["liquidity", "Liquidity"],
  ["probability", "Highest Yes"],
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
  const chip = (on: boolean) =>
    `inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sub font-medium transition-colors duration-200 ${on ? "border-label bg-label text-bg" : "hairline bg-elevated text-label hover:border-label-3"}`;

  return (
    <PageIn>
    <>
      <PageTitle title="Markets" subtitle="Each claim stays open with no closing date. The price is what people and agents currently pay for Yes." />

      <form action="/markets" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="glass flex h-12 flex-1 items-center gap-2 rounded-full px-5 ring-tint/30 transition-shadow focus-within:ring-4">
          <Search size={16} className="text-label-2" aria-hidden />
          <span className="sr-only">Search claims</span>
          <input name="q" defaultValue={sp.q} type="search" className="w-full bg-transparent text-body outline-none placeholder:text-label-2" placeholder="Search topics and claims" />
        </label>
        {sp.category && <input type="hidden" name="category" value={sp.category} />}
        <div className="flex gap-3">
        <label className="glass flex h-10 flex-1 items-center gap-2 rounded-full pr-3 pl-4 text-sub sm:flex-none">
          <span className="text-label-2">Sort</span>
          <select name="sort" defaultValue={sort} className="bg-transparent font-medium outline-none">
            {SORTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button className="h-10 rounded-full bg-label px-5 text-sub font-semibold text-bg transition-transform active:scale-[0.97]">Apply</button>
        </div>
      </form>

      <nav aria-label="Topics" className="-mx-5 mt-5 flex flex-wrap gap-2 px-5 pb-1">
        <Link href={href({ category: undefined })} className={chip(!sp.category)}>
          All topics
        </Link>
        {categories.map((c) => (
          <Link key={c.category} href={href({ category: c.category })} className={chip(sp.category === c.category)}>
            {category(c.category)}
            <span className="opacity-50">{c.count}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-8">
        <ClaimGrid markets={markets} />
      </div>
    </>
    </PageIn>
  );
}
