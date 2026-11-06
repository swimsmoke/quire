import type { ExecutionMode } from "@/lib/types";

/** Inline marker on every record so simulated activity is never mistaken for on-chain activity. */
export function ModeTag({ mode }: { mode: ExecutionMode | "CONFIDENTIAL_TEE" }) {
  const label = {
    SIMULATED: "simulated",
    ONCHAIN_TESTNET: "NEAR testnet",
    ONCHAIN_MAINNET: "NEAR mainnet",
    CONFIDENTIAL_TEE: "TEE inference",
  }[mode];
  const tone = mode === "SIMULATED" ? "border-sim/50 text-sim" : "border-ledger/40 text-ledger";
  return <span className={`inline-block border px-1.5 text-xs leading-5 ${tone}`}>{label}</span>;
}

export function ModeNotice({ mode }: { mode: string }) {
  if (mode !== "SIMULATED") return null;
  return (
    <div className="border-b border-sim/30 bg-[#e3d6b4] text-sm">
      <p className="mx-auto max-w-6xl px-5 py-2">
        Simulated mode: trades settle on Quire&apos;s test ledger, not on NEAR. Every simulated record is marked <ModeTag mode="SIMULATED" />.
      </p>
    </div>
  );
}
