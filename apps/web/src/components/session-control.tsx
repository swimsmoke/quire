"use client";

import { useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { useSession } from "@/lib/session";
import { qusd } from "@/lib/format";

export function SessionControl() {
  const { me, ready, balance, signInSimulated, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <span className="text-sm text-fade">…</span>;

  if (me) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden sm:inline tabular text-fade">{qusd(balance)} qUSD</span>
        <span className="flex items-center gap-1.5 border border-rule bg-sheet px-2.5 py-1">
          <UserRound size={14} aria-hidden />
          <span>{me.session.accountId}</span>
        </span>
        <button onClick={signOut} className="text-fade hover:text-ink" aria-label="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="bg-ledger px-3 py-1.5 text-sm text-sheet hover:bg-ledger-deep" aria-expanded={open}>
        Sign in
      </button>
      {open && (
        <form
          className="absolute right-0 top-11 z-20 w-80 border border-rule bg-sheet p-4 text-sm shadow-[0_8px_0_-4px_var(--color-rule)]"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await signInSimulated(handle.trim().toLowerCase());
              setOpen(false);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="mb-3 text-fade">
            NEAR wallet sign-in isn&apos;t connected in this build. Use a simulated account to try trading; it is not a wallet and nothing it does goes on-chain.
          </p>
          <label className="block">
            <span className="mb-1 block">Account name</span>
            <span className="flex items-center border border-rule bg-vellum focus-within:border-ledger">
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                pattern="[a-z0-9_\-]{2,32}"
                required
                autoFocus
                className="w-full bg-transparent px-2 py-1.5 outline-none"
                placeholder="ada"
              />
              <span className="pr-2 text-fade">.sim</span>
            </span>
          </label>
          {error && <p className="mt-2 text-umber">{error}</p>}
          <button disabled={busy} className="mt-3 w-full bg-ledger py-1.5 text-sheet hover:bg-ledger-deep disabled:opacity-60">
            {busy ? "Signing in…" : "Sign in with simulated account"}
          </button>
        </form>
      )}
    </div>
  );
}
