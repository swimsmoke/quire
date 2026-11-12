"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseUnits } from "@quire/shared";
import { clientRequest } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtNear } from "@/lib/format";
import { PageTitle } from "@/components/section";
import { buttonPrimary } from "@/components/ui";
import { ChainFunds } from "@/components/trade-ticket";

interface ContractConfig {
  owner_id: string;
  market_count: number;
  account_cap: string;
  tvl_cap: string;
  total_collateral: string;
  paused: boolean;
}

const EXAMPLES = [
  {
    slug: "btc-above-150k",
    question: "Will Bitcoin trade above $150,000?",
    category: "crypto",
    subject: "Bitcoin",
    description: "Whether the BTC/USD spot price closes above $150,000 on a major spot exchange.",
    resolution: "Resolves YES once the BTC/USD daily close on Coinbase exceeds $150,000. As a perpetual market it stays open until that happens or the claim is invalidated.",
  },
  {
    slug: "near-intents-100b-volume",
    question: "Will NEAR Intents reach $100B cumulative swap volume?",
    category: "near",
    subject: "NEAR Intents",
    description: "Whether cumulative volume settled through NEAR Intents reaches $100 billion.",
    resolution: "Resolves YES when the NEAR Intents explorer or an official NEAR source reports cumulative volume of at least $100B.",
  },
  {
    slug: "open-model-arc-agi-2-85",
    question: "Will an open-weights AI model score 85% or higher on ARC-AGI-2?",
    category: "ai",
    subject: "ARC-AGI-2",
    description: "Whether a model with publicly released weights reaches at least 85% on the ARC-AGI-2 private evaluation set.",
    resolution: "Resolves YES on a verified ARC Prize leaderboard entry of at least 85% by a model with downloadable weights.",
  },
];

const field = "mt-1 w-full rounded-lg bg-bg-2 px-3 py-2 text-body outline-none ring-tint transition-shadow focus:ring-2";

export default function AdminPage() {
  const { me, onchain, chain, balance, callContract, viewContract, refresh } = useSession();
  const [cfg, setCfg] = useState<ContractConfig | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [f, setF] = useState({ ...EXAMPLES[0]!, prob: "50", liquidity: "0.4" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; slug?: string } | null>(null);

  useEffect(() => {
    if (!onchain) return;
    viewContract<ContractConfig>("get_config", {}).then(setCfg, (e) => setCfgError((e as Error).message));
  }, [onchain, viewContract, msg]);

  if (!onchain) return <PageTitle title="Owner tools" subtitle="This deployment runs in simulated mode, so there is no contract to manage." />;
  if (!me) return <PageTitle title="Owner tools" subtitle="Connect the contract owner's wallet to create markets." />;

  const isOwner = cfg?.owner_id === me.session.accountId;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const liquidity = parseUnits(f.liquidity);
      if (liquidity > BigInt(balance)) throw new Error(`Deposit at least ${f.liquidity} NEAR into Quire first, using the balance section on this page.`);
      const prob = Math.round(Number(f.prob) * 10_000);
      if (!(prob >= 10_000 && prob <= 990_000)) throw new Error("Starting probability must be between 1 and 99.");
      const hash = await callContract(
        "create_market",
        { slug: f.slug, question: f.question, category: f.category, initial_prob_ppm: String(prob), liquidity: liquidity.toString(), fee_bps: 100 },
        { gasTgas: 60 },
      );
      let slug = f.slug;
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await clientRequest<{ slug: string }>("/onchain/markets", {
            method: "POST",
            body: { txHash: hash, signerId: me!.session.accountId, subject: f.subject, description: f.description, resolutionCriteria: f.resolution },
          });
          slug = r.slug;
          break;
        } catch (err) {
          if (attempt < 4) {
            await new Promise((res) => setTimeout(res, 2500));
            continue;
          }
          throw new Error(`The market exists on NEAR (transaction ${hash}) but Quire couldn't record it: ${(err as Error).message}`);
        }
      }
      setMsg({ ok: true, text: "Market created on NEAR.", slug });
      await refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title="Owner tools" subtitle={`Contract ${chain.contractId} on NEAR ${chain.network}.`} />
      {cfgError && <p className="text-sub text-no">Couldn&apos;t read the contract: {cfgError}. Check that it is deployed.</p>}
      {cfg && (
        <dl className="tabular grid grid-cols-2 gap-x-8 border-t hairline sm:grid-cols-4">
          {[
            ["Owner", cfg.owner_id],
            ["Markets on-chain", String(cfg.market_count)],
            ["Held for trading", `${fmtNear(cfg.total_collateral, 3)} of ${fmtNear(cfg.tvl_cap, 0)} NEAR cap`],
            ["Your Quire balance", `${fmtNear(balance, 3)} NEAR`],
          ].map(([k, v]) => (
            <div key={k} className="border-b hairline py-3">
              <dt className="text-footnote text-label-2">{k}</dt>
              <dd className="mt-0.5 text-sub font-medium break-all">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {cfg && !isOwner && <p className="mt-6 text-sub text-no">You&apos;re connected as {me.session.accountId}. Only {cfg.owner_id} can create markets.</p>}

      {isOwner && (
        <section className="mt-10 max-w-sm">
          <h2 className="text-title2 font-semibold">Your Quire balance</h2>
          <p className="mt-1 text-sub text-label-2">Deposit the NEAR you want to use as market liquidity. Keep about 0.5 NEAR in your wallet for network fees.</p>
          <ChainFunds />
        </section>
      )}
      {isOwner && (
        <form onSubmit={create} className="mt-10 max-w-2xl">
          <h2 className="text-title2 font-semibold">Create a market</h2>
          <p className="mt-1 text-sub text-label-2">Liquidity comes out of your Quire balance, so deposit NEAR first. The starting probability is only an opening price, not a forecast.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((x) => (
              <button key={x.slug} type="button" onClick={() => setF((s) => ({ ...s, ...x }))} className="h-8 rounded-md bg-fill px-3 text-footnote font-medium hover:bg-fill-2">
                Fill: {x.subject}
              </button>
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-footnote text-label-2 sm:col-span-2">
              Claim, as a yes/no question
              <input required maxLength={300} value={f.question} onChange={set("question")} className={field} />
            </label>
            <label className="text-footnote text-label-2">
              Web address name (lowercase, hyphens)
              <input required pattern="[a-z0-9-]{3,80}" value={f.slug} onChange={set("slug")} className={field} />
            </label>
            <label className="text-footnote text-label-2">
              Category
              <input required maxLength={32} value={f.category} onChange={set("category")} className={field} />
            </label>
            <label className="text-footnote text-label-2">
              Subject
              <input required maxLength={80} value={f.subject} onChange={set("subject")} className={field} />
            </label>
            <label className="text-footnote text-label-2">
              Starting probability of Yes (%)
              <input required inputMode="decimal" value={f.prob} onChange={set("prob")} className={field} />
            </label>
            <label className="text-footnote text-label-2 sm:col-span-2">
              Description
              <textarea required maxLength={600} rows={2} value={f.description} onChange={set("description")} className={field} />
            </label>
            <label className="text-footnote text-label-2 sm:col-span-2">
              How it could resolve
              <textarea required maxLength={600} rows={2} value={f.resolution} onChange={set("resolution")} className={field} />
            </label>
            <label className="text-footnote text-label-2">
              Liquidity (NEAR)
              <input required inputMode="decimal" value={f.liquidity} onChange={set("liquidity")} className={field} />
            </label>
          </div>
          <button disabled={busy} className={`${buttonPrimary} mt-6`}>
            {busy ? "Check your wallet…" : "Create market on NEAR"}
          </button>
          {msg && (
            <p role="status" className={`mt-4 text-sub ${msg.ok ? "" : "text-no"}`}>
              {msg.text}{" "}
              {msg.slug && (
                <Link href={`/markets/${msg.slug}`} className="text-tint hover:underline">
                  Open it
                </Link>
              )}
            </p>
          )}
        </form>
      )}
    </>
  );
}
