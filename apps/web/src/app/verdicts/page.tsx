import { PageIn } from "@/components/page-in";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageTitle } from "@/components/section";
import { ResultsGrid } from "@/components/jury";

export const metadata = { title: "Verdicts" };

export default async function VerdictsPage() {
  const { results, counts } = await api.results().catch(() => ({ results: [], counts: { total: 0, settled: 0 } }));
  return (
    <PageIn>
    <>
      <PageTitle
        title="Verdicts"
        subtitle="Every claim the AI jury has been asked to settle. Three models from different families read the checked quotes on their own, without seeing the price. When two agree, their verdict goes on-chain and waits out a challenge window, during which anyone who disagrees can put up a bond."
      >
        {counts.total > 0 && (
          <p className="mt-4 text-footnote text-label-3">
            {counts.total} {counts.total === 1 ? "claim" : "claims"} ruled on, {counts.settled} settled.
          </p>
        )}
      </PageTitle>
      {results.length === 0 ? (
        <div className="card reveal flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center sm:p-10">
          <div className="flex-1">
            <p className="display text-[1.7rem] leading-tight">No verdicts yet.</p>
            <p className="mt-2 max-w-[56ch] text-sub text-label-2">
              The jury is called once a claim&apos;s answer is public. Pick a claim, make sure it has a checked source, and press <span className="font-medium text-label">Ask the AI jury</span> on its page.
            </p>
          </div>
          <Link href="/markets" className="inline-flex h-12 shrink-0 items-center rounded-xl bg-tint px-6 text-sub font-semibold text-white transition-[filter] hover:brightness-110">
            Find a claim to settle
          </Link>
        </div>
      ) : (
        <ResultsGrid results={results} />
      )}
    </>
    </PageIn>
  );
}
