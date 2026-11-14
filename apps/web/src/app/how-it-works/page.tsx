import { PageIn } from "@/components/page-in";
import Link from "next/link";
import { PageTitle, Steps } from "@/components/section";
import { buttonPrimary } from "@/components/ui";

export const metadata = { title: "How it works" };

const SECTIONS: { h: string; p: string[] }[] = [
  {
    h: "Claims are markets that never close",
    p: [
      "Every claim on Quire, such as whether Bitcoin will trade above $150,000, is a market with two outcomes. A Yes share pays 1 NEAR if the claim is eventually resolved true; a No share pays 1 NEAR if it is resolved false.",
      "Markets have no end date. You can buy or sell at any time, so the price keeps reflecting what traders believe now. A claim is settled only once its answer is public, by the AI jury described below. If a claim proves ill-posed, it resolves invalid and every share redeems for 0.50.",
    ],
  },
  {
    h: "Prices come from a pool, not an order book",
    p: [
      "Each market holds a pool of Yes and No shares. The implied probability of Yes is the share of No in the pool. Buying Yes takes Yes shares out, which makes the next one more expensive.",
      "That gives three different numbers, and Quire always shows them separately: the probability (the price of the next small share), your execution price (the average you actually pay, including price impact and the 1% fee), and your position value (at the current probability, and what selling everything now would really pay).",
      "Every Yes and No pair is backed by exactly 1 NEAR held by the contract, so the market can always pay out.",
    ],
  },
  {
    h: "Anyone can ask",
    p: [
      "Start with a question. If the answer is already known, Quire answers it like an encyclopedia: Scout pulls passages from Wikipedia, a model on NEAR AI Cloud reads them and replies with the quotes it relied on, and nothing is traded, because Quire only prices questions that are still open. If it is undecided, Quire looks for a market that already covers it, so you see what people currently believe. If there isn't one, an AI on NEAR AI Cloud drafts the claim for you: a clear yes or no question, what it means and what would make it Yes. You check the wording and open the market from your own wallet with as little as 0.1 NEAR of liquidity.",
      "That liquidity sets the opening price and comes back to you, along with your share of the pool, when the claim resolves.",
    ],
  },
  {
    h: "Trading happens on NEAR, from your own wallet",
    p: [
      "Quire's markets live in a smart contract on NEAR. You deposit NEAR into it from your wallet, and every deposit, trade and withdrawal is a transaction your wallet asks you to approve. Withdrawals stay open even if trading is paused, and nothing in the contract lets its owner move your balance.",
      "After each trade, Quire's server looks the transaction up on NEAR itself before recording it, so the charts and history only ever show trades that really happened on-chain. This build runs on NEAR testnet, and the contract is unaudited.",
    ],
  },
  {
    h: "Evidence is checked by retrieval, not by opinion",
    p: [
      "When a claim opens, Scout looks up reference pages for its subject on its own. Anyone can add more sources with a quoted sentence. Either way, Scout fetches the page itself, records when and what it retrieved, and marks whether the quote actually appears on the page. A model calling a source credible never counts as verification.",
      "Only quotes found on the page are passed to the encyclopedia writer and the jury.",
    ],
  },
  {
    h: "Confidential AI writes the encyclopedia",
    p: [
      "Each claim has a public page written by Scribe on NEAR AI Cloud, where inference runs inside hardware enclaves. Scribe receives the live probability and its history, trading activity, the verified evidence and the previous revision, and must return a fixed structure that Quire validates. It can cite only evidence Quire actually retrieved; any other citation is dropped.",
      "The first page is written automatically when a claim opens, so whoever asked doesn't need to know the subject. Pages are revised when something material changes, such as a price move of several points or newly verified evidence, not on every trade. Every revision is kept.",
      "Each revision records hashes of the exact request and response, and Quire checks the enclave's signature over them. That shows where and how the text was generated. It does not prove the text is correct, and the page says so.",
    ],
  },
  {
    h: "An AI jury settles claims, and anyone can challenge it",
    p: [
      "When a claim's answer is public, anyone can ask the AI jury. Three models from different families on NEAR AI Cloud each read the claim, its resolution rule and the checked quotes, without seeing the price, and answer Yes, No, Invalid or Not yet with the quotes they rely on. Each answer carries its own enclave signature, and a vote whose signature fails is not counted.",
      "Two matching verdicts are proposed to the contract from a separate jury account. The contract's owner cannot propose, cancel or change a ruling. During the challenge window anyone can dispute with a 0.5 NEAR bond, which reopens trading until the jury rules again: the bond comes back if the ruling changes, and goes to the market's creator if it doesn't.",
      "When the window passes without a dispute, anyone can settle the claim, and holders of the winning side redeem 1 NEAR per share. Every ruling, with each judge's reasoning and sources, is on the Verdicts page.",
    ],
  },
  {
    h: "What is planned next",
    p: [
      "Analysis and trading agents: the contract already enforces per-agent limits (an on/off switch, a largest trade, a total spend, and no withdrawals), but no trading agent runs in this build.",
      "Cross-chain funding: the funding page already shows live NEAR Intents quotes for turning USDC, ETH, SOL or BTC into NEAR. NEAR Intents only runs on mainnet, so sending switches on when Quire moves there. Chain Signatures, to sign that deposit from a NEAR account, is not connected yet.",
      "Wider source discovery for Scout beyond reference pages, and appeals that go to a larger, separate panel instead of back to the same jury.",
    ],
  },
];

export default function HowItWorks() {
  return (
    <PageIn>
    <>
      <PageTitle title="How it works" subtitle="Quire connects markets, people, evidence and confidential AI. Here is how the pieces fit, in the order a claim moves through them, and what is still planned." />
      <Steps />
      <div className="mt-16 space-y-14">
        {SECTIONS.map((s) => (
          <section key={s.h} className="grid gap-x-14 gap-y-3 border-t hairline pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <h2 className="text-title2 leading-tight font-semibold tracking-[-0.02em]">{s.h}</h2>
            <div className="max-w-[66ch] space-y-4">
              {s.p.map((p, j) => (
                <p key={j} className="text-body leading-[1.7] text-label-2">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-16">
        <Link href="/markets" className={buttonPrimary}>
          Explore markets
        </Link>
      </p>
    </>
    </PageIn>
  );
}
