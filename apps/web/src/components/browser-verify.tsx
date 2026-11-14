"use client";

import { useState } from "react";
import { checkSignature, type SignedInference } from "@/lib/verify";

/** Recover the enclave signer in the reader's own browser instead of trusting Quire's check. */
export function BrowserVerify({ inf }: { inf: SignedInference }) {
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (res) return <p className={`mt-3 text-footnote ${res.ok ? "text-yes" : "text-no"}`}>{res.text}</p>;
  return (
    <button
      className="mt-3 rounded-full border border-separator bg-elevated px-3.5 py-1.5 text-footnote font-medium hover:bg-bg-2 disabled:opacity-60"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setRes(await checkSignature(inf));
        setBusy(false);
      }}
    >
      {busy ? "Checking…" : "Verify the signature in your browser"}
    </button>
  );
}
