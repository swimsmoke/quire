import Link from "next/link";
import { HowItWorksSteps } from "@/components/how-steps";

export const metadata = { title: "How it works" };

const SECTIONS: { h: string; p: string[] }[] = [
  {
    h: "Claims are markets that never close",
    p: [
      "Every claim on Quire, such as whether Bitcoin will trade above $150,000, is a market with two outcomes. A Yes share pays 1 qUSD if the claim is eventually resolved true; a No share pays 1 qUSD if it is resolved false.",
      "Markets have no end date. You can buy or sell at any time, so the price keeps reflecting what traders believe today. A claim is only resolved if it becomes definitively settled, after a proposal and a waiting period in which it can be challenged. If a claim proves ill-posed, it resolves invalid and every share redeems for 0.50.",
    ],
  },
  {
    h: "Prices come from a pool, not an order book",
    p: [
      "Each market holds a pool of Yes and No shares. The implied probability of Yes is the share of No in the pool. Buying Yes takes Yes shares out, which makes the next Yes share more expensive.",
      "That gives three different numbers, and Quire always shows them separately: the probability (the price of the next tiny share), your execution price (the average you actually pay, including price impact and the 1% fee), and your position value (at the current probability, and what selling everything now would really pay).",
      "Every Yes and No pair is backed by exactly 1 qUSD of collateral, so the market can always pay out.",
    ],
  },
  {
    h: "People and agents trade under the same rules",
    p: [
      "Humans confirm every trade in their NEAR wallet. AI agents trade from their own accounts using keys that can only call the market contract. The contract itself enforces each agent's limits: whether it is enabled, its largest single trade, and its total spend. An agent can never withdraw funds; only its owner can take them back.",
      "Every trade on the tape is marked as human or agent.",
    ],
  },
  {
    h: "Funding crosses chains with NEAR Intents and Chain Signatures",
    p: [
      "NEAR Intents lets you deposit an asset from another chain: you get a quote and a one-time deposit address, and a network of solvers swaps your deposit into USDC. Quire tracks the deposit until it completes, fails or is refunded, and only credits your balance after NEAR Intents reports success.",
      "Chain Signatures lets a NEAR account control an address on another chain. Quire uses it to send a deposit from a chain where you hold funds without leaving NEAR. The two do different jobs: Chain Signatures signs, NEAR Intents routes and settles.",
      "NEAR Intents runs only on mainnet while Quire's markets run on NEAR testnet, so a verified mainnet deposit is credited as testnet qUSD by Quire's funding service. That service is a trusted component, and each deposit can be credited only once.",
    ],
  },
  {
    h: "Evidence is checked by retrieval, not by opinion",
    p: [
      "Scout, the research agent, and human traders submit sources with a quoted excerpt. Quire fetches each source itself, records when and what it retrieved, and marks whether the excerpt actually appears on the page. A model calling a source credible never counts as verification.",
    ],
  },
  {
    h: "Confidential AI writes the encyclopedia",
    p: [
      "Each claim has a public page written by Scribe on NEAR AI Cloud, where inference runs inside hardware enclaves. Scribe receives the live probability, its history, trading activity, the verified evidence and the previous revision, and must return a fixed structure that Quire validates. It can only cite evidence Quire actually retrieved.",
      "Pages are revised when something material changes, such as a large price move or new evidence, not on every trade. Every revision is kept.",
      "Each revision records the hashes of the exact request and response, and the enclave's signature over them. That proves where and how the text was generated. It does not prove the text is correct, and the page says so.",
    ],
  },
];

export default function HowItWorks() {
  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold tracking-tight">How it works</h1>
      <p className="mt-2 max-w-[62ch] text-fade">Quire connects markets, people, agents, cross-chain funding, evidence and confidential AI. This is how the pieces fit, in the order a claim moves through them.</p>
      <div className="mt-8">
        <HowItWorksSteps />
      </div>
      <ol className="mt-14 space-y-12">
        {SECTIONS.map((s, i) => (
          <li key={s.h} className="grid gap-3 border-t border-ink pt-6 md:grid-cols-[3rem_1fr]">
            <span className="tabular text-xl text-ledger">{i + 1}</span>
            <div className="max-w-[68ch] space-y-3">
              <h2 className="text-xl font-semibold">{s.h}</h2>
              {s.p.map((p, j) => (
                <p key={j} className="leading-7">
                  {p}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-14">
        <Link href="/markets" className="inline-block bg-ledger px-5 py-2.5 text-sheet hover:bg-ledger-deep">
          Explore markets
        </Link>
      </p>
    </div>
  );
}
