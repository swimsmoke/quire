"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, clientRequest } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtNearCompact } from "@/lib/format";
import type { JuryVote, Ruling, RulingStage } from "@/lib/types";
import { buttonPrimary, buttonSecondary } from "./ui";
import { BROWSER_API } from "@/lib/api";
import { checkSignature } from "@/lib/verify";

/** "deepseek-ai/DeepSeek-V3.1" -> "DeepSeek V3.1" */
export function shortModel(id: string) {
  const name = id.split("/").pop() ?? id;
  const s = name.replace(/[-_]+/g, " ").replace(/\b(Instruct|FP8|AWQ|\d{4})\b/gi, "").replace(/\s+/g, " ").trim();
  return s.length > 24 ? `${s.slice(0, 23)}…` : s;
}

const VERDICT_TEXT: Record<string, string> = { YES: "Yes", NO: "No", INVALID: "Invalid", NOT_YET: "Not yet" };
const VERDICT_TONE: Record<string, string> = {
  YES: "bg-yes/12 text-yes",
  NO: "bg-no/12 text-no",
  INVALID: "bg-amber/15 text-amber",
  NOT_YET: "bg-bg-2 text-label-2",
};

export function VerdictBadge({ verdict, large = false }: { verdict: string | null; large?: boolean }) {
  const v = verdict ?? "NOT_YET";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold whitespace-nowrap ${VERDICT_TONE[v]} ${large ? "px-3.5 py-1.5 text-[0.95rem]" : "px-2.5 py-0.5 text-footnote"}`}>
      {verdict ? VERDICT_TEXT[v] : "No vote"}
    </span>
  );
}

const STAGE_TEXT: Record<RulingStage, string> = {
  NO_RULING: "No ruling, still open",
  NOT_PROPOSED: "Ruled, not yet on-chain",
  CHALLENGE_WINDOW: "Challenge window open",
  DISPUTED: "Disputed, awaiting a new ruling",
  READY_TO_SETTLE: "Ready to settle",
  SETTLED: "Settled",
};

export function StageText({ stage }: { stage: RulingStage }) {
  const dot = stage === "SETTLED" ? "bg-yes" : stage === "DISPUTED" ? "bg-no" : stage === "NO_RULING" ? "bg-label-3" : "bg-amber";
  return (
    <span className="inline-flex items-center gap-1.5 text-footnote font-medium text-label-2">
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {STAGE_TEXT[stage]}
    </span>
  );
}

export function decideTime(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(to).getTime() - now);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return <span className="tabular-nums">{h > 0 ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, "0")}`}</span>;
}

function VerifyVote({ rulingId, inferenceId }: { rulingId: string; inferenceId: string }) {
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (res) return <p className={`mt-2 text-caption ${res.ok ? "text-yes" : "text-no"}`}>{res.text}</p>;
  return (
    <button
      className="mt-2 self-start text-caption font-medium text-tint hover:underline disabled:opacity-60"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const d = (await (await fetch(`${BROWSER_API}/rulings/${rulingId}`)).json()) as { inferences: (Parameters<typeof checkSignature>[0] & { id: string })[] };
          const inf = d.inferences.find((i) => i.id === inferenceId);
          setRes(inf ? await checkSignature(inf) : { ok: false, text: "Signature record not found." });
        } catch {
          setRes({ ok: false, text: "Couldn't fetch the signature record." });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Checking…" : "Check the signature yourself"}
    </button>
  );
}

function JudgeCard({ v, seat, rulingId }: { v: JuryVote; seat: number; rulingId: string }) {
  return (
    <li className="flex flex-col rounded-2xl border border-separator bg-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-footnote text-label-3">Judge {seat}</p>
          <p className="text-callout leading-snug font-semibold break-words" title={v.model}>
            {shortModel(v.model)}
          </p>
        </div>
        <VerdictBadge verdict={v.verdict} />
      </div>
      {v.reasoning ? <p className="mt-3 text-footnote leading-relaxed text-label-2">{v.reasoning}</p> : <p className="mt-3 text-footnote text-no">{v.error ?? "No usable answer."}</p>}
      {v.citations.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {v.citations.map((c) => (
            <li key={c.key}>
              <a href={c.url} target="_blank" rel="noreferrer" className="inline-block max-w-[16rem] truncate rounded-full bg-bg-2 px-2.5 py-0.5 text-caption text-label-2 hover:text-label" title={c.title}>
                {c.key} · {new URL(c.url).hostname.replace(/^www\./, "")}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-auto pt-3 text-caption text-label-3">
        {v.signatureVerified ? (
          <span className="text-yes">Enclave signature verified</span>
        ) : v.signatureVerified === false ? (
          <span className="text-no">Signature failed, vote not counted</span>
        ) : (
          "No enclave signature"
        )}
        {v.confidence != null && ` · ${Math.round(v.confidence * 100)}% sure`}
      </p>
      {v.inferenceId && v.signatureVerified != null && <VerifyVote rulingId={rulingId} inferenceId={v.inferenceId} />}
    </li>
  );
}

/** Three seats that light up in turn while the jury deliberates. */
function Deliberating({ sources }: { sources: number | null }) {
  return (
    <div role="status" className="mt-6">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="jury-seat h-20 rounded-2xl border border-separator bg-elevated" style={{ animationDelay: `${i * 0.45}s` }} />
        ))}
      </div>
      <p className="mt-3 text-footnote text-label-2">
        Three judges on NEAR AI Cloud are reading {sources ? `${sources} checked sources` : "the checked sources"} on their own. This usually takes 20 to 60 seconds.
      </p>
    </div>
  );
}

export function RulingBody({ r }: { r: Ruling }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StageText stage={r.stage} />
        <span className="text-footnote text-label-3">
          Decided in {decideTime(r.durationMs)} from {r.evidenceCount} checked {r.evidenceCount === 1 ? "source" : "sources"}
        </span>
      </div>
      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        {r.votes.map((v, i) => (
          <JudgeCard key={i} v={v} seat={i + 1} rulingId={r.id} />
        ))}
      </ol>
    </>
  );
}

export function JuryPanel({ slug, initial, cooldownS, juryReady, onchainId }: { slug: string; initial: Ruling | null; cooldownS: number; juryReady: boolean; onchainId: number | null }) {
  const router = useRouter();
  const { me, token, onchain, callContract, refresh } = useSession();
  const [busy, setBusy] = useState<null | "jury" | "dispute" | "settle" | "redeem">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const r = initial;

  async function act(kind: "dispute" | "settle" | "redeem") {
    setBusy(kind);
    setMsg(null);
    try {
      if (onchain) {
        if (onchainId == null) throw new Error("This market has no on-chain id.");
        const method = { dispute: "dispute_resolution", settle: "finalize_resolution", redeem: "redeem" }[kind];
        const hash = await callContract(method, { market_id: onchainId }, kind === "dispute" ? { depositYocto: "1" } : {});
        await clientRequest("/onchain/resolution", { method: "POST", body: { txHash: hash, signerId: me!.session.accountId } });
        setMsg({ ok: true, text: kind === "dispute" ? "Disputed. Your bond is held until the jury rules again." : kind === "settle" ? "Settled. Winners can redeem now." : "Redeemed. Your winnings are in your Quire balance." });
      } else {
        const path = { dispute: "dispute", settle: "finalize", redeem: "redeem" }[kind];
        const res = await clientRequest<{ payout?: string }>(`/markets/${slug}/${path}`, { method: "POST", token });
        setMsg({
          ok: true,
          text:
            kind === "dispute"
              ? "Disputed. Your 0.5 NEAR bond is held until the jury rules again."
              : kind === "settle"
                ? "Settled. Winners can redeem now."
                : res.payout && res.payout !== "0"
                  ? `Redeemed ${fmtNearCompact(res.payout)} NEAR to your balance.`
                  : "You hold no winning shares in this claim.",
        });
      }
      await refresh();
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  async function askJury() {
    setBusy("jury");
    setMsg(null);
    try {
      const res = await clientRequest<Ruling>(`/markets/${slug}/jury`, { method: "POST", token });
      if (res.outcome === "NO_RULING") setMsg({ ok: true, text: "The judges did not agree that the evidence settles this yet, so the claim stays open." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't reach the jury. Try again." });
    } finally {
      setBusy(null);
    }
  }

  const decided = r && r.outcome !== "NO_RULING";
  const canAsk = juryReady && cooldownS === 0 && (!r || r.stage === "NO_RULING" || r.stage === "DISPUTED" || r.stage === "NOT_PROPOSED");

  return (
    <section id="ruling" aria-labelledby="ruling-h" className="card scroll-mt-28 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="ruling-h" className="display flex flex-wrap items-center gap-3 text-[1.6rem] leading-tight">
            {decided ? (
              <>
                The jury ruled
                <VerdictBadge verdict={r.verdict} large />
              </>
            ) : (
              "Settle this claim"
            )}
          </h2>
          <p className="mt-2 max-w-[60ch] text-callout text-label-2">
            {decided
              ? r.stage === "CHALLENGE_WINDOW"
                ? "Anyone who thinks the jury got it wrong can dispute it by posting a 0.5 NEAR bond. The bond comes back if the jury then changes its ruling."
                : r.stage === "SETTLED"
                  ? "The ruling stood through the challenge window and is final. Holders of the winning side redeem 1 NEAR per share."
                  : r.stage === "DISPUTED"
                    ? `Disputed by ${r.disputedBy}. Trading is open again until the jury rules a second time.`
                    : r.stage === "NOT_PROPOSED"
                      ? r.proposalError
                      : "The challenge window has closed with no dispute. Anyone can settle the claim now."
              : "When the answer is public, anyone can ask the AI jury. Three different models rule from the checked sources without seeing the price. Two matching verdicts propose the outcome on-chain."}
          </p>
        </div>
        {r?.stage === "CHALLENGE_WINDOW" && r.challengeEndsAt && (
          <div className="rounded-2xl bg-bg-2 px-4 py-3 text-right">
            <p className="text-caption text-label-3">Window closes in</p>
            <p className="display text-[1.5rem] leading-none">
              <Countdown to={r.challengeEndsAt} />
            </p>
          </div>
        )}
      </div>

      {busy === "jury" ? <Deliberating sources={r?.evidenceCount ?? null} /> : r ? <div className="mt-6"><RulingBody r={r} /></div> : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {canAsk && busy !== "jury" && (
          <button className={`${buttonPrimary} h-11`} disabled={!!busy} onClick={askJury}>
            {r?.stage === "DISPUTED" ? "Ask the jury again" : "Ask the AI jury"}
          </button>
        )}
        {r?.stage === "CHALLENGE_WINDOW" &&
          (me ? (
            <button className={`${buttonSecondary} h-11`} disabled={!!busy} onClick={() => act("dispute")}>
              {busy === "dispute" ? "Posting bond…" : "Dispute, 0.5 NEAR bond"}
            </button>
          ) : (
            <span className="text-footnote text-label-2">Sign in to dispute this ruling.</span>
          ))}
        {r?.stage === "READY_TO_SETTLE" && (
          <button className={`${buttonPrimary} h-11`} disabled={!!busy || (onchain && !me)} onClick={() => act("settle")}>
            {busy === "settle" ? "Settling…" : "Settle the claim"}
          </button>
        )}
        {r?.stage === "SETTLED" && me && (
          <button className={`${buttonPrimary} h-11`} disabled={!!busy} onClick={() => act("redeem")}>
            {busy === "redeem" ? "Redeeming…" : "Redeem winnings"}
          </button>
        )}
        {!juryReady && !r && <span className="text-footnote text-label-2">The jury needs NEAR AI Cloud, which is not configured on this server.</span>}
        {juryReady && cooldownS > 0 && (!r || r.stage === "NO_RULING") && <span className="text-footnote text-label-2">The jury can be asked again in {Math.ceil(cooldownS / 60)} min.</span>}
        {r && r.outcome !== "NO_RULING" && (
          <Link href="/verdicts" className="ml-auto text-footnote font-medium text-tint">
            All verdicts
          </Link>
        )}
      </div>
      {msg && (
        <p role="status" className={`mt-3 max-w-[62ch] text-footnote ${msg.ok ? "text-label-2" : "text-no"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

function ResultCard({ r }: { r: Ruling }) {
  const decided = r.outcome !== "NO_RULING";
  const pays = r.payout && r.payout.holders > 0 ? `${r.stage === "SETTLED" ? "Pays" : "Would pay"} ${fmtNearCompact(r.payout.total)} NEAR to ${r.payout.holders} ${r.payout.holders === 1 ? "holder" : "holders"}` : decided ? "No winning shares held" : "Market stays open";
  return (
    <li className="card flex flex-col p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-footnote font-semibold text-label-2 capitalize">{r.market.category}</span>
        <StageText stage={r.stage} />
      </div>
      <Link href={`/markets/${r.market.slug}#ruling`} className="display mt-3 text-[1.35rem] leading-snug hover:underline">
        {r.market.question}
      </Link>
      <div className="mt-4 flex items-center gap-3">
        <VerdictBadge verdict={r.verdict} large />
        <span className="text-footnote text-label-3">{decided ? `${r.votes.filter((v) => v.verdict === r.verdict).length} of 3 judges` : "Judges split or unsure"}</span>
      </div>
      <ul className="mt-5 space-y-2 border-t hairline pt-4">
        {r.votes.map((v, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-footnote">
            <span className="truncate text-label-2" title={v.model}>
              {shortModel(v.model)}
            </span>
            <VerdictBadge verdict={v.verdict} />
          </li>
        ))}
      </ul>
      <dl className="mt-auto grid grid-cols-2 gap-3 pt-5 text-footnote">
        <div>
          <dt className="text-label-3">Time to decide</dt>
          <dd className="font-semibold tabular-nums">{decideTime(r.durationMs)}</dd>
        </div>
        <div>
          <dt className="text-label-3">Payout</dt>
          <dd className="font-semibold">{pays}</dd>
        </div>
      </dl>
    </li>
  );
}

export function ResultsGrid({ results }: { results: Ruling[] }) {
  return (
    <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {results.map((r) => (
        <ResultCard key={r.id} r={r} />
      ))}
    </ul>
  );
}
