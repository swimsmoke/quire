import { ShieldCheck, ShieldQuestion, ChevronDown } from "lucide-react";
import type { Encyclopedia, Evidence } from "@/lib/types";
import { dateTime, pct } from "@/lib/format";
import { ModeTag } from "./mode";

const SECTION_ORDER: [string, string][] = [
  ["overview", "Overview"],
  ["background", "Background and context"],
  ["consensus", "Current market consensus"],
  ["supporting", "Supporting evidence"],
  ["contradicting", "Contradicting evidence"],
  ["uncertainties", "Important uncertainties"],
  ["history", "Market history"],
  ["changes", "Changes since the previous revision"],
];

type SectionBody = { body?: string; citations?: string[] } | string | undefined;

export function EncyclopediaArticle({ data, evidence, currentPpm }: { data: Encyclopedia; evidence: Evidence[]; currentPpm: number }) {
  const cur = data.current;
  if (!cur) {
    return (
      <div className="max-w-[62ch]">
        <p className="font-serif text-title3">No article yet.</p>
        <p className="mt-2 text-sub text-label-2">
          Scribe writes each revision with confidential inference on NEAR AI Cloud, from the live price and the verified evidence listed here, and revises it when either changes materially. Nothing here is pre-written.
        </p>
      </div>
    );
  }
  const content = cur.content as Record<string, SectionBody>;
  const evidenceIndex = new Map(evidence.map((e, i) => [e.id, i + 1]));
  const drift = Math.abs(currentPpm - cur.priceYesPpm);

  return (
    <article className="max-w-[66ch]">
      <p className="text-footnote text-label-2">
        AI-generated interpretation of the market and the cited evidence, not an established fact. Market probability is collective belief, not truth.
      </p>
      <div className="mt-6 space-y-8">
        {SECTION_ORDER.map(([key, title]) => {
          const s = content[key];
          const body = typeof s === "string" ? s : s?.body;
          const cites = typeof s === "object" ? (s?.citations ?? []) : [];
          if (!body) return null;
          return (
            <section key={key}>
              <h3 className="font-serif text-title3 font-semibold">{title}</h3>
              <p className="mt-2 font-serif text-[1.075rem] leading-[1.75] whitespace-pre-line">{body}</p>
              {cites.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {cites.map((id) => (
                    <a key={id} href={`#evidence-${id}`} className="tabular rounded-md bg-fill px-2 py-0.5 text-caption font-medium text-tint hover:bg-fill-2">
                      Source {evidenceIndex.get(id) ?? "?"}
                    </a>
                  ))}
                </p>
              )}
            </section>
          );
        })}
      </div>
      <footer className="mt-10 border-t hairline pt-4 text-footnote text-label-2">
        <p>
          Revision {cur.revisionNumber}, written {dateTime(cur.createdAt)} when Yes was {pct(cur.priceYesPpm)}. Trigger: {cur.triggerReason}.
          {drift >= 20_000 && <span className="text-no"> Yes has since moved to {pct(currentPpm)}; a revision is due.</span>}
        </p>
        {cur.inference && <InferenceMeta inf={cur.inference} />}
      </footer>
    </article>
  );
}

function InferenceMeta({ inf }: { inf: NonNullable<NonNullable<Encyclopedia["current"]>["inference"]> }) {
  const verified = inf.signatureVerified === true;
  return (
    <details className="group mt-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sub text-label">
        {verified ? <ShieldCheck size={16} className="text-yes" aria-hidden /> : <ShieldQuestion size={16} className="text-label-2" aria-hidden />}
        How this revision was generated
        <ModeTag mode={inf.mode === "CONFIDENTIAL_TEE" ? "CONFIDENTIAL_TEE" : "SIMULATED"} />
        <ChevronDown size={15} className="ml-auto text-label-3 transition-transform duration-300 ease-ios group-open:rotate-180" aria-hidden />
      </summary>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-footnote sm:grid-cols-[11rem_1fr]">
        <dt className="text-label-2">Model</dt>
        <dd>{inf.model} via {inf.provider}</dd>
        <dt className="text-label-2">Request hash</dt>
        <dd className="font-mono break-all">{inf.requestHash ?? "n/a"}</dd>
        <dt className="text-label-2">Response hash</dt>
        <dd className="font-mono break-all">{inf.responseHash ?? "n/a"}</dd>
        <dt className="text-label-2">Enclave signing key</dt>
        <dd className="font-mono break-all">{inf.signingAddress ?? "n/a"}</dd>
        <dt className="text-label-2">Signature</dt>
        <dd>{inf.signatureVerified == null ? "Not available" : verified ? "Valid: the enclave key signed the hashes of exactly what Quire sent and received" : "Failed verification"}</dd>
        <dt className="text-label-2">Attestation</dt>
        <dd>{inf.attestationBindsSigner == null ? "Not checked" : inf.attestationBindsSigner ? "Signing key is listed in NEAR AI's attestation report for this model" : "Signing key not found in the attestation report"}</dd>
      </dl>
      <p className="mt-3 text-footnote text-label-2">This shows where and how the text was generated. Quire checks the signature and the report listing, not the hardware quote itself, and none of it says whether the content is correct.</p>
    </details>
  );
}

const VERIFY_LABEL: Record<Evidence["verificationStatus"], string> = {
  EXCERPT_VERIFIED: "Excerpt found in source",
  FETCHED: "Source retrieved",
  UNVERIFIED: "Not yet checked",
  EXCERPT_NOT_FOUND: "Excerpt not found in source",
  FETCH_FAILED: "Source unreachable",
};

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) {
    return <p className="max-w-[62ch] text-sub text-label-2">No evidence yet. Add a source with a quote, and Quire fetches the page to check the quote is really on it.</p>;
  }
  return (
    <ol className="divide-y hairline border-y hairline">
      {evidence.map((e, i) => (
        <li key={e.id} id={`evidence-${e.id}`} className="flex scroll-mt-20 gap-4 py-5">
          <span className="tabular w-5 shrink-0 text-sub text-label-3">{i + 1}</span>
          <div className="min-w-0 max-w-[64ch]">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-body font-medium hover:text-tint">
                {e.title}
              </a>
              <span className={`text-footnote font-medium ${e.stance === "SUPPORTS" ? "text-yes" : e.stance === "CONTRADICTS" ? "text-no" : "text-label-2"}`}>
                {e.stance === "SUPPORTS" ? "Supports" : e.stance === "CONTRADICTS" ? "Contradicts" : "Context"}
              </span>
            </p>
            <blockquote className="mt-2 border-l-2 hairline pl-3 text-sub text-label-2">{e.excerpt}</blockquote>
            <p className="mt-2 text-footnote text-label-3">
              {e.sourceName}
              {e.publishedAt && `, published ${new Date(e.publishedAt).toISOString().slice(0, 10)}`}. {VERIFY_LABEL[e.verificationStatus]}. Added by {e.agentName ?? "a trader"}
              {e.retrievedAt && `, retrieved ${dateTime(e.retrievedAt)}`}.
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
