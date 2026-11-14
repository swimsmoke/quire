import Link from "next/link";
import { api } from "@/lib/api";
import { PageTitle } from "@/components/section";
import { ResultsGrid } from "@/components/jury";

export const metadata = { title: "Results" };

export default async function ResultsPage() {
  const { results, counts } = await api.results().catch(() => ({ results: [], counts: { total: 0, settled: 0 } }));
  return (
    <>
      <PageTitle
        title="Results"
        subtitle="Claims the AI jury has ruled on. Three models from different families each read the checked sources and vote without seeing the price. Two matching votes propose the outcome on NEAR, and anyone can dispute it with a bond before it settles."
      >
        {counts.total > 0 && (
          <p className="mt-4 text-footnote text-label-3">
            {counts.total} {counts.total === 1 ? "claim" : "claims"} ruled on, {counts.settled} settled.
          </p>
        )}
      </PageTitle>
      {results.length === 0 ? (
        <p className="text-sub text-label-2">
          No claim has gone to the jury yet. Open a claim whose answer is public, add a source, and press <span className="font-medium text-label">Ask the AI jury</span>.{" "}
          <Link href="/markets" className="text-tint hover:underline">
            Browse claims
          </Link>
        </p>
      ) : (
        <ResultsGrid results={results} />
      )}
    </>
  );
}
