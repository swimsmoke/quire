"use client";

import { useState } from "react";
import { useSession } from "@/lib/session";
import { fmtNear } from "@/lib/format";
import { buttonPrimary, Sheet } from "./ui";

export function SessionControl() {
  const { me, ready, balance, signInSimulated, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <span className="h-8 w-20" aria-hidden />;

  if (me) {
    return (
      <>
        <button onClick={() => setAccount(true)} className="flex h-8 items-center gap-2 rounded-full pr-1 pl-3 text-sub transition-colors hover:bg-fill">
          <span className="tabular hidden text-label-2 sm:inline">{fmtNear(balance)} NEAR</span>
          <span className="grid size-7 place-items-center rounded-full bg-tint text-footnote font-semibold text-white" aria-hidden>
            {me.session.accountId.slice(0, 1).toUpperCase()}
          </span>
          <span className="sr-only">Account {me.session.accountId}</span>
        </button>
        <Sheet open={account} onClose={() => setAccount(false)} title="Account">
          <dl className="divide-y hairline border-y hairline text-sub">
            <div className="flex justify-between py-3">
              <dt className="text-label-2">Signed in as</dt>
              <dd>{me.session.accountId}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-label-2">Available</dt>
              <dd className="tabular">{fmtNear(balance)} NEAR</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-label-2">Sign-in method</dt>
              <dd>{me.session.method === "DEV_SIM" ? "Simulated account" : "NEAR wallet"}</dd>
            </div>
          </dl>
          <button
            onClick={() => {
              signOut();
              setAccount(false);
            }}
            className="mt-4 h-11 w-full rounded-full bg-fill text-sub font-semibold text-no transition-transform active:scale-[0.98]"
          >
            Sign out
          </button>
        </Sheet>
      </>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="h-8 rounded-full bg-tint px-4 text-footnote font-semibold text-white transition-[transform,background-color] duration-200 hover:bg-tint-press active:scale-95">
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
            <span className="flex h-11 items-center rounded-[10px] bg-bg-2 px-3 ring-tint transition-shadow focus-within:ring-2">
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
