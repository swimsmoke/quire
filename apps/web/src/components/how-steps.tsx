const STEPS = [
  { t: "Fund", d: "Deposit from another chain through NEAR Intents, or claim test qUSD on testnet." },
  { t: "Trade", d: "Buy Yes or No. The pool reprices with every trade, so the price is the market's current belief." },
  { t: "Research", d: "Scout gathers sources; Quire fetches each one and checks the quoted excerpt is really there." },
  { t: "Analyse and act", d: "Assessor compares the evidence with the price. Arbiter trades only inside its on-chain limits." },
  { t: "Write", d: "Scribe revises the claim's page on NEAR AI Cloud when the price or evidence changes materially." },
];

export function HowItWorksSteps() {
  return (
    <ol className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-5">
      {STEPS.map((s, i) => (
        <li key={s.t} className="bg-vellum p-4">
          <span className="tabular text-xl text-ledger">{i + 1}</span>
          <h3 className="mt-2 font-semibold">{s.t}</h3>
          <p className="mt-1 text-sm text-fade">{s.d}</p>
        </li>
      ))}
    </ol>
  );
}
