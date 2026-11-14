"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { buttonPrimary } from "@/components/ui";

interface Config {
  owner_id: string;
  resolver_id: string;
  challenge_period_ns: string;
}

/** Owner settings for the AI jury. Not linked from the site; only the contract owner's wallet can use it. */
export default function OwnerPage() {
  const { me, onchain, viewContract, callContract } = useSession();
  const [conf, setConf] = useState<Config | null>(null);
  const [resolver, setResolver] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!onchain) return;
    viewContract<Config>("get_config", {}).then(setConf).catch(() => setMsg("Couldn't read the contract."));
  }, [onchain, viewContract]);

  const isOwner = !!me && !!conf && me.session.accountId === conf.owner_id;
  const field = "mt-1 h-11 w-full rounded-xl border border-separator bg-elevated px-3 text-body outline-none focus:ring-2 ring-tint";

  async function run(method: string, args: object, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      await callContract(method, args, { gasTgas: 30 });
      setConf(await viewContract<Config>("get_config", {}));
      setMsg(done);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[560px] py-14">
      <h1 className="display text-[2.4rem]">Jury settings</h1>
      <p className="mt-2 text-callout text-label-2">For the contract owner. The owner chooses which account the jury proposes from and how long the challenge window lasts, and can do nothing else with outcomes.</p>
      {!onchain ? (
        <p className="mt-6 text-callout">This deployment runs in simulated mode.</p>
      ) : !conf ? (
        <p className="mt-6 text-callout text-label-2">{msg ?? "Reading the contract…"}</p>
      ) : (
        <div className="card mt-8 space-y-6 p-6">
          <dl className="space-y-2 text-callout">
            <div className="flex justify-between gap-4"><dt className="text-label-2">Owner</dt><dd className="font-medium">{conf.owner_id}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-label-2">Jury account</dt><dd className="font-medium">{conf.resolver_id}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-label-2">Challenge window</dt><dd className="font-medium">{Math.round(Number(BigInt(conf.challenge_period_ns) / 60_000_000_000n))} min</dd></div>
          </dl>
          {!isOwner ? (
            <p className="text-callout text-label-2">Sign in with {conf.owner_id} to change these.</p>
          ) : (
            <>
              <label className="block text-footnote text-label-2">
                Jury account
                <input className={field} value={resolver} onChange={(e) => setResolver(e.target.value.trim())} placeholder="quire-jury.testnet" />
              </label>
              <button className={`${buttonPrimary} h-11`} disabled={busy || !resolver} onClick={() => run("set_resolver", { resolver_id: resolver }, "Jury account updated.")}>
                Make this the jury account
              </button>
              <label className="block text-footnote text-label-2">
                Challenge window, in minutes
                <input className={field} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} />
              </label>
              <button className={`${buttonPrimary} h-11`} disabled={busy || !minutes || Number(minutes) < 1} onClick={() => run("set_challenge_period", { challenge_period_ns: String(BigInt(minutes) * 60_000_000_000n) }, "Challenge window updated.")}>
                Set challenge window
              </button>
            </>
          )}
          {msg && <p role="status" className="text-footnote text-label-2">{msg}</p>}
        </div>
      )}
    </div>
  );
}
