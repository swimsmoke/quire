"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { parseUnits } from "@quire/shared";
import { ApiError, clientRequest } from "@/lib/api";
import { chainError, useSession } from "@/lib/session";
import type { ClaimDraft, Market } from "@/lib/types";
import { category, fmtNear, pct } from "@/lib/format";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { ChainFunds } from "@/components/trade-ticket";

const CATEGORIES = ["crypto", "ai", "near", "tech", "science", "sports", "politics", "economy", "culture", "other"];
const field = "mt-1.5 w-full rounded-xl border hairline bg-bg-2/70 px-3.5 py-2.5 text-body outline-none transition-[box-shadow,border-color] focus:border-tint focus:ring-4 focus:ring-tint/15";

const slugify = (q: string) =>
  q
    .toLowerCase()
    .replace(/^(will|is|does|can|has|are)\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-[^-]*$/, (m) => (m.length < 3 ? "" : m)) || "claim";

export function AskFlow({ initial }: { initial: string }) {
  const router = useRouter();
  const { me, onchain, token, balance, callContract, refresh, connectWallet, claimTestFunds } = useSession();
  const [q, setQ] = useState(initial);
  const [matches, setMatches] = useState<Market[] | null>(null);
  const [step, setStep] = useState<"search" | "write">("search");
  const [draft, setDraft] = useState<ClaimDraft>({ question: initial, subject: "", category: "other", description: "", resolutionCriteria: "" });
  const [prob, setProb] = useState("50");
  const [liq, setLiq] = useState("0.2");
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const seq = useRef(0);

  // look for claims that already cover the question while the person types
  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) {
      setMatches(null);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await clientRequest<{ markets: Market[] }>(`/markets?q=${encodeURIComponent(text)}`);
        if (n === seq.current) setMatches(r.markets.slice(0, 5));
      } catch {
        if (n === seq.current) setMatches([]);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  async function draftWithAi() {
    setDrafting(true);
    setMsg(null);
    try {
      const r = await clientRequest<{ draft: ClaimDraft }>("/ai/draft-claim", { method: "POST", body: { question: q.trim() } });
      setDraft(r.draft);
    } catch (e) {
      setDraft((d) => ({ ...d, question: q.trim() }));
      setMsg(e instanceof ApiError ? `Couldn't draft it: ${e.message}` : "Couldn't reach Quire. Fill in the fields yourself.");
    } finally {
      setDrafting(false);
      setStep("write");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const liquidity = parseUnits(liq);
      if (liquidity < 100_000n) throw new Error("A new market needs at least 0.1 NEAR of liquidity.");
      const p = Math.round(Number(prob) * 10_000);
      if (!(p >= 10_000 && p <= 990_000)) throw new Error("The opening price must be between 1 and 99.");
      if (liquidity > BigInt(balance)) throw new Error(`Your Quire balance is ${fmtNear(balance, 3)} NEAR. ${onchain ? "Deposit" : "Get test NEAR"} first, then create the market.`);
      const slug = slugify(draft.question);
      let landed: string;
      if (onchain) {
        let hash: string;
        try {
          hash = await callContract("create_market", { slug, question: draft.question, category: draft.category, initial_prob_ppm: String(p), liquidity: liquidity.toString(), fee_bps: 100 }, { gasTgas: 60 });
        } catch (err) {
          throw new Error(chainError(err));
        }
        landed = slug;
        for (let attempt = 0; ; attempt++) {
          try {
            const r = await clientRequest<{ slug: string }>("/onchain/markets", {
              method: "POST",
              body: { txHash: hash, signerId: me!.session.accountId, subject: draft.subject, description: draft.description, resolutionCriteria: draft.resolutionCriteria },
            });
            landed = r.slug;
            break;
          } catch (err) {
            if (attempt < 5) {
              await new Promise((res) => setTimeout(res, 2500));
              continue;
            }
            throw new Error(`The market is on NEAR (transaction ${hash}) but Quire couldn't record it yet: ${(err as Error).message}`);
          }
        }
      } else {
        const r = await clientRequest<{ slug: string }>("/markets", {
          method: "POST",
          token,
          body: { slug, ...draft, initialProbPpm: p, liquidity: liq },
        });
        landed = r.slug;
      }
      await refresh();
      router.push(`/markets/${landed}?new=1`);
    } catch (err) {
      setMsg((err as Error).message);
      setBusy(false);
    }
  }

  const set = (k: keyof ClaimDraft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const lowBalance = (() => {
    try {
      return parseUnits(liq || "0") > BigInt(balance);
    } catch {
      return false;
    }
  })();

  return (
    <div className="mx-auto max-w-[760px] pt-12 md:pt-20">
      <h1 className="text-[2.25rem] leading-[1.1] font-semibold tracking-[-0.03em] md:text-[3.25rem]">What do you want to know?</h1>
      <p className="mt-3 max-w-[56ch] text-body text-label-2">
        Ask it as a yes or no question. If Quire already has a market on it, you&apos;ll see what people currently believe. If not, open one and let the market answer.
      </p>

      <div className="glass mt-8 rounded-2xl p-2">
        <label htmlFor="ask" className="sr-only">
          Your question
        </label>
        <textarea
          id="ask"
          rows={2}
          maxLength={300}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setStep("search");
          }}
          placeholder="Will an open model beat GPT-5 on ARC-AGI-2?"
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-title3 leading-snug outline-none placeholder:text-label-3"
        />
      </div>

      {step === "search" && matches && (
        <section aria-live="polite" className="mt-8">
          {matches.length > 0 ? (
            <>
              <h2 className="text-sub font-medium text-label-2">Already on Quire</h2>
              <ul className="mt-2 divide-y hairline border-y hairline">
                {matches.map((m) => (
                  <li key={m.id}>
                    <Link href={`/markets/${m.slug}`} className="group flex items-center gap-4 py-3.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-medium group-hover:text-tint">{m.question}</span>
                        <span className="text-footnote text-label-2">{category(m.category)}</span>
                      </span>
                      <span className="tabular text-title3 font-semibold">{pct(m.probabilityYesPpm, 0)}</span>
                      <ArrowUpRight size={16} className="text-label-3" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sub text-label-2">None of these is your question?</p>
            </>
          ) : (
            <p className="text-sub text-label-2">Nobody has asked this yet. You can be the first.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={draftWithAi} disabled={drafting || q.trim().length < 8} className={buttonPrimary}>
              <Sparkles size={16} className="mr-2" aria-hidden />
              {drafting ? "Drafting on NEAR AI…" : "Draft the market with AI"}
            </button>
            <button
              onClick={() => {
                setDraft((d) => ({ ...d, question: q.trim() }));
                setStep("write");
              }}
              disabled={q.trim().length < 8}
              className={buttonSecondary}
            >
              Write it myself
            </button>
          </div>
          {q.trim().length > 0 && q.trim().length < 8 && <p className="mt-2 text-footnote text-label-3">Write a little more first.</p>}
        </section>
      )}

      {step === "write" && (
        <form onSubmit={create} className="mt-10">
          <h2 className="text-title2 font-semibold tracking-[-0.02em]">Your market</h2>
          <p className="mt-1 max-w-[60ch] text-sub text-label-2">
            Check the wording: traders price exactly what you write here. Once it&apos;s open, Scout gathers sources and Scribe writes the encyclopedia page on its own.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="text-footnote font-medium text-label-2 sm:col-span-2">
              Claim
              <input required minLength={8} maxLength={300} value={draft.question} onChange={set("question")} className={field} />
            </label>
            <label className="text-footnote font-medium text-label-2">
              What it&apos;s about
              <input required maxLength={80} value={draft.subject} onChange={set("subject")} placeholder="Bitcoin" className={field} />
            </label>
            <label className="text-footnote font-medium text-label-2">
              Category
              <select value={draft.category} onChange={set("category")} className={field}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {category(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-footnote font-medium text-label-2 sm:col-span-2">
              What it means
              <textarea required maxLength={600} rows={2} value={draft.description} onChange={set("description")} className={field} />
            </label>
            <label className="text-footnote font-medium text-label-2 sm:col-span-2">
              What would make it Yes
              <textarea required maxLength={600} rows={2} value={draft.resolutionCriteria} onChange={set("resolutionCriteria")} className={field} />
            </label>
            <label className="text-footnote font-medium text-label-2">
              Opening price of Yes (%)
              <input required inputMode="decimal" value={prob} onChange={(e) => setProb(e.target.value)} className={field} />
              <span className="mt-1 block font-normal text-label-3">Only where trading starts. Leave it at 50 if unsure.</span>
            </label>
            <label className="text-footnote font-medium text-label-2">
              Liquidity you put in (NEAR)
              <input required inputMode="decimal" value={liq} onChange={(e) => setLiq(e.target.value)} className={field} />
              <span className="mt-1 block font-normal text-label-3">At least 0.1. It comes back to you, plus fees, when the market resolves.</span>
            </label>
          </div>

          {!me ? (
            <div className="mt-8">
              {onchain ? (
                <button type="button" onClick={() => connectWallet().catch((e) => setMsg(chainError(e)))} className={buttonPrimary}>
                  Connect a NEAR wallet to continue
                </button>
              ) : (
                <p className="text-sub text-label-2">Sign in from the top right to open the market.</p>
              )}
            </div>
          ) : (
            <>
              {onchain && lowBalance && (
                <div className="mt-8 max-w-sm">
                  <p className="text-sub text-label-2">Your Quire balance is {fmtNear(balance, 3)} NEAR. Deposit enough to cover the liquidity.</p>
                  <ChainFunds />
                </div>
              )}
              {!onchain && lowBalance && (
                <p className="mt-8 flex flex-wrap items-center gap-3 text-sub text-label-2">
                  Your practice balance is {fmtNear(balance, 3)} NEAR.
                  <button type="button" onClick={() => claimTestFunds().catch((e) => setMsg((e as Error).message))} className="rounded-full border hairline px-3.5 py-1.5 text-footnote font-medium text-label hover:border-label-3">
                    Get 1,000 test NEAR
                  </button>
                </p>
              )}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button disabled={busy} className={buttonPrimary}>
                  {busy ? (onchain ? "Confirm in your wallet…" : "Opening…") : onchain ? "Open market on NEAR" : "Open market"}
                </button>
                <button type="button" onClick={() => setStep("search")} className="h-11 px-3 text-sub text-label-2 hover:text-label">
                  Back
                </button>
              </div>
            </>
          )}
          {msg && (
            <p role="status" className="mt-4 max-w-[62ch] text-sub text-no">
              {msg}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
