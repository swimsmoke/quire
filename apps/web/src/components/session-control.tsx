"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { fmtNear } from "@/lib/format";
import { buttonPrimary, Sheet } from "./ui";
import { Avatar } from "./avatar";

export function SessionControl({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { me, ready, balance, signInSimulated, onchain, connectWallet, chain } = useSession();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // the menu drawer asks for the sign-in sheet this way
  useEffect(() => {
    const open = () => setOpen(true);
    window.addEventListener("quire:signin", open);
    return () => window.removeEventListener("quire:signin", open);
  }, []);

  if (!ready) return <span className="h-8 w-20" aria-hidden />;

  if (me) {
    return (
      <button onClick={onOpenMenu} className="flex h-9 items-center gap-2 rounded-full pr-0.5 pl-3 text-sub transition-colors hover:bg-fill">
        <span className="tabular hidden text-label-2 sm:inline">{fmtNear(balance)} NEAR</span>
        <Avatar account={me.session.accountId} size={32} />
        <span className="sr-only">Account {me.session.accountId}, open menu</span>
      </button>
    );
  }

  if (onchain) {
    return (
      <>
        <button
          onClick={async () => {
            setError(null);
            try {
              await connectWallet();
            } catch (e) {
              setError((e as Error).message || "Couldn't connect the wallet.");
              setOpen(true);
            }
          }}
          className="h-8 rounded-full bg-label px-4 text-footnote font-semibold text-bg transition-[transform,opacity] duration-200 hover:opacity-85 active:scale-95"
        >
          Connect wallet
        </button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Wallet not connected">
          <p className="text-sub text-label-2">{error}</p>
          <p className="mt-3 text-sub text-label-2">Quire runs on NEAR {chain.network}. Use a NEAR wallet such as Meteor Wallet, switched to {chain.network}.</p>
        </Sheet>
      </>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="h-8 rounded-full bg-label px-4 text-footnote font-semibold text-bg transition-[transform,opacity] duration-200 hover:opacity-85 active:scale-95">
        Sign in
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Sign in">
        <form
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
          <p className="text-sub text-label-2">
            NEAR wallet sign-in isn&apos;t connected in this build. Use a simulated account to try trading. It is not a wallet, and nothing it does goes on-chain.
          </p>
          <label className="mt-5 block">
            <span className="mb-1.5 block text-footnote text-label-2">Account name</span>
            <span className="flex h-11 items-center rounded-lg bg-bg-2 px-3 ring-tint transition-shadow focus-within:ring-2">
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                pattern="[a-z0-9_\-]{2,32}"
                title="2 to 32 lowercase letters, numbers, - or _"
                required
                data-autofocus
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full bg-transparent text-body outline-none placeholder:text-label-3"
                placeholder="ada"
              />
              <span className="text-label-3">.sim</span>
            </span>
          </label>
          {error && <p className="mt-2 text-footnote text-no">{error}</p>}
          <button disabled={busy} className={`${buttonPrimary} mt-5 w-full`}>
            {busy ? "Signing in…" : "Continue"}
          </button>
        </form>
      </Sheet>
    </>
  );
}
