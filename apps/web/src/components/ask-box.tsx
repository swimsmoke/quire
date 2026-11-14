"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp } from "lucide-react";

const PROMPTS = ["Will Bitcoin trade above $150,000?", "Will NEAR Intents pass $100B in volume?", "Will an open model hit 85% on ARC-AGI-2?"];

/** The homepage question box. Sends the question to /ask, which checks for an existing market first. */
export function AskBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = (text: string) => router.push(`/ask?q=${encodeURIComponent(text.trim())}`);
  return (
    <div className="w-full max-w-[640px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go(q);
        }}
        className="glass flex items-center gap-2 rounded-2xl py-2 pr-2 pl-5 transition-shadow focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--tint)_18%,transparent),inset_0_1px_0_var(--glass-edge)]"
      >
        <label htmlFor="home-ask" className="sr-only">
          Ask a yes or no question
        </label>
        <input
          id="home-ask"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={300}
          placeholder="Ask a yes or no question"
          className="h-12 min-w-0 flex-1 bg-transparent text-[1.05rem] outline-none placeholder:text-label-3"
        />
        <button aria-label="Ask" disabled={!q.trim()} className="grid size-12 shrink-0 place-items-center rounded-xl bg-tint text-white transition-[transform,opacity] duration-300 ease-glide active:scale-95 disabled:opacity-30">
          <ArrowUp size={18} strokeWidth={2.25} />
        </button>
      </form>
      <ul className="mt-4 flex flex-wrap gap-2">
        {PROMPTS.map((p) => (
          <li key={p}>
            <button onClick={() => go(p)} className="rounded-full border hairline px-3.5 py-1.5 text-footnote text-label-2 transition-colors hover:border-label-3 hover:text-label">
              {p}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
