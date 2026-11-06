import type { Metadata } from "next";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/400-italic.css";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { SiteHeader } from "@/components/site-header";
import { ModeNotice } from "@/components/mode";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: { default: "Quire: truth, priced by the market", template: "%s | Quire" },
  description: "Agent-curated truth markets on NEAR. Humans and AI agents trade on claims; confidential AI writes each claim's encyclopedia page from the market and the evidence.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const health = await api.health().catch(() => null);
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          {health ? (
            <ModeNotice mode={health.executionMode} />
          ) : (
            <div className="border-b border-umber/40 bg-[#e6cdb8] text-sm">
              <p className="mx-auto max-w-6xl px-5 py-2">The Quire API isn&apos;t reachable, so live data can&apos;t load. Start it with pnpm dev:api.</p>
            </div>
          )}
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-5 pb-24">{children}</main>
          <footer className="border-t border-rule">
            <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-5 py-6 text-sm text-fade">
              <p>Quire. Market probabilities are collective belief, not certified truth.</p>
              <p>Built on NEAR for the NEAR Hackathon 2026.</p>
            </div>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
