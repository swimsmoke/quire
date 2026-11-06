import { ShieldCheck, ShieldQuestion } from "lucide-react";
import type { Encyclopedia, Evidence } from "@/lib/types";
import { dateTime, pct } from "@/lib/format";
import { ModeTag } from "./mode";

/** The nine required sections, in reading order. */
const SECTION_ORDER: [string, string][] = [
  ["overview", "Claim overview"],
  ["background", "Background and context"],
  ["consensus", "Current market consensus"],
  ["supporting", "Supporting evidence"],
  ["contradicting", "Contradicting evidence"],
  ["uncertainties", "Important uncertainties"],
  ["history", "Relevant market history"],
  ["changes", "Changes since the previous revision"],
];

type SectionBody = { body?: string; citations?: string[] } | string | undefined;

export function EncyclopediaArticle({ data, evidence, currentPpm }: { data: Encyclopedia; evidence: Evidence[]; currentPpm: number }) {
  const cur = data.current;
  if (!cur) {
    return (
      <div className="py-2">
        <p className="max-w-prose">
          No article yet. Scribe writes the first revision with confidential inference once this claim has verified evidence, and revises it when the market or the evidence changes materially.
        </p>
        <p className="mt-2 text-sm text-fade">Nothing on this page is pre-written: every revision is generated from live market state and the evidence listed below.</p>
      </div>
    );
  }
  const content = cur.content as Record<string, SectionBody>;
  const evidenceIndex = new Map(evidence.map((e, i) => [e.id, i + 1]));
  const drift = Math.abs(currentPpm - cur.priceYesPpm);

  return (
    <article>
      <p className="mb-6 text-sm text-fade">
        AI-generated interpretation of the market and the cited evidence. It is not an independently established fact, and market probability is collective belief, not truth.
      </p>
      <ol className="space-y-8">
        {SECTION_ORDER.map(([key, title], i) => {
          const s = content[key];
          const body = typeof s === "string" ? s : s?.body;
          const cites = typeof s === "object" ? s?.citations ?? [] : [];
          if (!body) return null;
          return (
            <li key={key} className="grid gap-2 md:grid-cols-[2.5rem_1fr]">
              <span className="tabular text-fade">{i + 1}.</span>
              <div>
                <h3 className="mb-2 font-semibold">{title}</h3>
                <p className="max-w-prose whitespace-pre-line leading-7">{body}</p>
                {cites.length > 0 && (
                  <p className="mt-2 text-sm text-fade">
                    Sources:{" "}
                    {cites.map((id) => (
                      <a key={id} href={`#evidence-${id}`} className="mr-2 underline decoration-rule hover:text-ink">
                        [{evidenceIndex.get(id) ?? "?"}]
                      </a>
                    ))}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <footer className="mt-8 border-t border-rule pt-4 text-sm">
        <p>
          Revision {cur.revisionNumber}, generated {dateTime(cur.createdAt)} at Yes {pct(cur.priceYesPpm)}.
          {drift >= 20_000 && <span className="text-umber"> The market has since moved to {pct(currentPpm)}; a revision is due.</span>}
        </p>
        <p className="text-fade">Trigger: {cur.triggerReason}</p>
        {cur.inference && <InferenceMeta inf={cur.inference} />}
      </footer>
    </article>
  );
}

function InferenceMeta({ inf }: { inf: NonNullable<NonNullable<Encyclopedia["current"]>["inference"]> }) {
  const verified = inf.signatureVerified === true;
  return (
    <details className="mt-3 border border-rule bg-sheet p-3">
      <summary className="flex cursor-pointer items-center gap-2">
        {verified ? <ShieldCheck size={15} className="text-ledger" aria-hidden /> : <ShieldQuestion size={15} className="text-fade" aria-hidden />}
        <span>Confidential generation record</span>
        <ModeTag mode={inf.mode === "CONFIDENTIAL_TEE" ? "CONFIDENTIAL_TEE" : "SIMULATED"} />
      </summary>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[10rem_1fr]">
        <dt className="text-fade">Model</dt>
        <dd>{inf.model} via {inf.provider}</dd>
        <dt className="text-fade">Request hash</dt>
        <dd className="break-all">{inf.requestHash ?? "n/a"}</dd>
        <dt className="text-fade">Response hash</dt>
        <dd className="break-all">{inf.responseHash ?? "n/a"}</dd>
        <dt className="text-fade">TEE signing address</dt>
        <dd className="break-all">{inf.signingAddress ?? "n/a"}</dd>
        <dt className="text-fade">Signature check</dt>
        <dd>{inf.signatureVerified == null ? "not checked" : verified ? "recovered signer matches the TEE key" : "failed"}</dd>
        <dt className="text-fade">Attestation</dt>
        <dd>{inf.attestationBindsSigner == null ? "not checked" : inf.attestationBindsSigner ? "signing key bound to attested hardware" : "not bound"}</dd>
      </dl>
      <p className="mt-3 text-xs text-fade">
        Attestation shows where and how the text was generated (inside a hardware enclave, by this model). It says nothing about whether the content is correct.
      </p>
    </details>
  );
}

const VERIFY_LABEL: Record<Evidence["verificationStatus"], string> = {
  EXCERPT_VERIFIED: "excerpt found in source",
  FETCHED: "source retrieved",
  UNVERIFIED: "not yet checked",
  EXCERPT_NOT_FOUND: "excerpt not found in source",
  FETCH_FAILED: "source unreachable",
};

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) {
    return <p className="py-4 text-sm text-fade">No evidence submitted yet. Scout and human traders add sources here; each one is fetched and its excerpt checked against the page.</p>;
  }
  return (
    <ol className="divide-y divide-rule">
      {evidence.map((e, i) => (
        <li key={e.id} id={`evidence-${e.id}`} className="grid gap-1 py-4 md:grid-cols-[2.5rem_1fr]">
          <span className="tabular text-fade">[{i + 1}]</span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-medium underline decoration-rule hover:decoration-ink">
                {e.title}
              </a>
              <span className={e.stance === "SUPPORTS" ? "text-ledger" : e.stance === "CONTRADICTS" ? "text-umber" : "text-fade"}>{e.stance.toLowerCase()}</span>
            </p>
            <blockquote className="mt-2 max-w-prose border-l-2 border-rule pl-3 text-sm">{e.excerpt}</blockquote>
            <p className="mt-2 text-xs text-fade">
              {e.sourceName}
              {e.publishedAt && `, published ${new Date(e.publishedAt).toISOString().slice(0, 10)}`}
              {e.retrievedAt && `, retrieved ${dateTime(e.retrievedAt)}`}. Check: {VERIFY_LABEL[e.verificationStatus]}. Submitted by {e.agentName ?? "a trader"}.
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
