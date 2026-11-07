"use client";

import { useState } from "react";
import type { ExecutionMode } from "@/lib/types";
import { Sheet } from "./ui";

/** Small marker on every record so simulated activity is never mistaken for on-chain activity. */
export function ModeTag({ mode }: { mode: ExecutionMode | "CONFIDENTIAL_TEE" }) {
  const label = { SIMULATED: "Simulated", ONCHAIN_TESTNET: "NEAR testnet", ONCHAIN_MAINNET: "NEAR mainnet", CONFIDENTIAL_TEE: "TEE inference" }[mode];
  const tone = mode === "SIMULATED" ? "text-sim bg-sim/12" : "text-tint bg-tint/12";
  return <span className={`inline-flex h-5 items-center rounded-full px-2 text-caption font-medium ${tone}`}>{label}</span>;
}

/** Nav-bar badge explaining simulated mode. */
export function SimulatedBadge() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-sim/12 px-2.5 text-footnote font-medium text-sim transition-transform active:scale-95">
        <span className="size-1.5 rounded-full bg-sim" aria-hidden />
        Simulated
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Simulated mode">
        <div className="space-y-3 pb-2 text-sub text-label-2">
          <p>Trades on this deployment settle on Quire&apos;s test ledger, not on NEAR. Balances are test NEAR with no value.</p>
          <p>Every simulated record carries an orange Simulated label. When markets move on-chain, those records show NEAR mainnet instead, with a link to the transaction.</p>
        </div>
      </Sheet>
    </>
  );
}
