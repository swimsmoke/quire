import Link from "next/link";
import { PageTitle, Steps } from "@/components/section";
import { buttonPrimary } from "@/components/ui";

export const metadata = { title: "How it works" };

const SECTIONS: { h: string; p: string[] }[] = [
  {
    h: "Claims are markets that never close",
    p: [
      "Every claim on Quire, such as whether Bitcoin will trade above $150,000, is a market with two outcomes. A Yes share pays 1 NEAR if the claim is eventually resolved true; a No share pays 1 NEAR if it is resolved false.",
      "Markets have no end date. You can buy or sell at any time, so the price keeps reflecting what traders believe now. A claim is resolved only when it becomes definitively settled, after a proposal and a waiting period during which it can be cancelled. If a claim proves ill-posed, it resolves invalid and every share redeems for 0.50.",
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
    h: "Trading happens on NEAR, from your own wallet",
    p: [
      "Quire's markets live in a smart contract on NEAR. You deposit NEAR into it from your wallet, and every deposit, trade and withdrawal is a transaction your wallet asks you to approve. Withdrawals stay open even if trading is paused, and nothing in the contract lets its owner move your balance.",
      "After each trade, Quire's server looks the transaction up on NEAR itself before recording it, so the charts and history only ever show trades that really happened on-chain. This build runs on NEAR testnet, and the contract is unaudited.",
    ],
  },
  {
    h: "Evidence is checked by retrieval, not by opinion",
    p: [
      "Anyone can submit a source with a quoted sentence. Scout, Quire's evidence checker, fetches the page itself, records when and what it retrieved, and marks whether the quote actually appears on the page. A model calling a source credible never counts as verification.",
      "Only quotes found on the page are passed to the encyclopedia writer.",
    ],
  },
  {
    h: "Confidential AI writes the encyclopedia",
    p: [
      "Each claim has a public page written by Scribe on NEAR AI Cloud, where inference runs inside hardware enclaves. Scribe receives the live probability and its history, trading activity, the verified evidence and the previous revision, and must return a fixed structure that Quire validates. It can cite only evidence Quire actually retrieved; any other citation is dropped.",
      "Pages are revised when something material changes, such as a price move of several points or newly verified evidence, not on every trade. Every revision is kept.",
      "Each revision records hashes of the exact request and response, and Quire checks the enclave's signature over them. That shows where and how the text was generated. It does not prove the text is correct, and the page says so.",
    ],
  },
  {
    h: "What is planned next",
    p: [
      "Analysis and trading agents: the contract already enforces per-agent limits (an on/off switch, a largest trade, a total spend, and no withdrawals), but no trading agent runs in this build.",
      "Cross-chain funding: NEAR Intents to swap an asset from another chain into NEAR, and Chain Signatures to sign that deposit from a NEAR account. Neither is connected yet.",
      "Automatic source discovery for Scout, and an attested multi-model panel for the rare cases where a claim needs to be resolved.",
    ],
  },
];

export default function HowItWorks() {
  return (
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
  );
}
