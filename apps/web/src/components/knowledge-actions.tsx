"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, clientRequest } from "@/lib/api";
import { useSession } from "@/lib/session";
import { buttonPrimary, buttonSecondary, Segmented } from "./ui";

/** Ask Scribe for a new revision. The server decides whether one is due. */
export function GenerateArticle({ slug, hasArticle }: { slug: string; hasArticle: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="mt-6">
      <button
        disabled={busy}
        className={`${hasArticle ? buttonSecondary : buttonPrimary} h-10`}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await clientRequest<{ revisionNumber: number; signatureVerified: boolean | null; model: string }>(`/markets/${slug}/encyclopedia/generate`, { method: "POST" });
            setMsg({
              ok: true,
              text: `Revision ${r.revisionNumber} written by ${r.model}. ${r.signatureVerified === true ? "The enclave's signature over the request and response checked out." : r.signatureVerified === false ? "The enclave signature did not verify; see the generation record." : "No enclave signature was available to check."}`,
            });
            router.refresh();
          } catch (e) {
            if (e instanceof ApiError && e.code === "IN_PROGRESS") {
              setMsg({ ok: true, text: e.message });
              setTimeout(() => router.refresh(), 4000);
            } else setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't reach Quire. Try again." });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Scribe is writing…" : hasArticle ? "Check for a new revision" : "Write the first revision"}
      </button>
      {busy && <p className="mt-2 text-footnote text-label-2">Confidential inference on NEAR AI Cloud usually takes 10 to 40 seconds.</p>}
      {msg && (
        <p role="status" className={`mt-2 max-w-[62ch] text-footnote ${msg.ok ? "text-label-2" : "text-no"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

type Stance = "SUPPORTS" | "CONTRADICTS" | "CONTEXT";

/** Submit a source. Quire fetches the page and checks the quote is on it. */
export function AddEvidence({ slug }: { slug: string }) {
  const router = useRouter();
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [stance, setStance] = useState<Stance>("SUPPORTS");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = "mt-1 w-full rounded-lg bg-bg-2 px-3 py-2 text-body outline-none ring-tint transition-shadow focus:ring-2";

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className={`${buttonSecondary} mt-5 h-10`}>
        Add a source
      </button>
    );
  return (
    <form
      className="mt-5 max-w-xl space-y-4 border-t hairline pt-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const r = await clientRequest<{ check: { status: string; detail: string } }>(`/markets/${slug}/evidence`, { method: "POST", body: { url, excerpt, stance, submittedBy: me?.session.accountId } });
          setMsg({ ok: r.check.status === "EXCERPT_VERIFIED", text: r.check.detail });
          if (r.check.status === "EXCERPT_VERIFIED") {
            setUrl("");
            setExcerpt("");
          }
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, text: err instanceof ApiError ? err.message || "Check the link and the quote (at least 20 characters)." : "Couldn't reach Quire. Try again." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block text-footnote text-label-2">
        Link to the source (https)
        <input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://en.wikipedia.org/wiki/Bitcoin" className={field} />
      </label>
      <label className="block text-footnote text-label-2">
        Exact quote from that page (copy and paste one sentence)
        <textarea required minLength={20} maxLength={600} rows={3} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} className={field} />
      </label>
      <div>
        <span className="text-footnote text-label-2">This quote</span>
        <div className="mt-1 max-w-sm">
          <Segmented
            label="Stance"
            size="sm"
            value={stance}
            onChange={setStance}
            options={[
              { value: "SUPPORTS", label: "Supports" },
              { value: "CONTRADICTS", label: "Contradicts" },
              { value: "CONTEXT", label: "Gives context" },
            ]}
          />
        </div>
      </div>
      <button disabled={busy} className={`${buttonPrimary} h-10`}>
        {busy ? "Fetching the page…" : "Check and add"}
      </button>
      {msg && (
        <p role="status" className={`text-footnote ${msg.ok ? "text-yes" : "text-no"}`}>
          {msg.text}
        </p>
      )}
      <p className="text-footnote text-label-3">Quire fetches the page itself. Only quotes found word for word are passed to the encyclopedia writer. Pages that need JavaScript or block automated readers can&apos;t be checked.</p>
    </form>
  );
}
