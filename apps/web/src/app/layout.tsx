import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-serif/400.css";
import "@fontsource/ibm-plex-serif/400-italic.css";
import "@fontsource/ibm-plex-serif/600.css";
import "@fontsource/grand-hotel/400.css";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { NavBar } from "@/components/chrome";
import { themeScript } from "@/components/theme-toggle";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://quire-gamma.vercel.app"),
  title: { default: "Quire: truth, priced by the market", template: "%s | Quire" },
  description: "Ask a question, open a market on NEAR, and let traders and confidential AI work out the answer.",
  openGraph: { title: "Quire: ask anything, let the market answer", description: "Truth markets and a confidential-AI encyclopedia on NEAR.", siteName: "Quire", type: "website" },
  twitter: { card: "summary_large_image", title: "Quire: ask anything, let the market answer", description: "Truth markets and a confidential-AI encyclopedia on NEAR." },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const health = await api.health().catch(() => null);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="aurora" aria-hidden />
        <div className="grain" aria-hidden />
        <SessionProvider chain={{ mode: health?.executionMode ?? "SIMULATED", contractId: (health?.integrations.marketContract as string | null) ?? null, network: health?.network ?? "testnet" }}>
          <NavBar simulated={health?.executionMode === "SIMULATED"} apiOnline={!!health} />
          {!health && (
            <p className="mx-auto max-w-[1120px] px-5 pt-4 text-sub text-no">The Quire API isn&apos;t reachable, so live data can&apos;t load. Start it with pnpm dev:api.</p>
          )}
          <main className="mx-auto max-w-[1120px] px-5 pb-32 md:pb-24">{children}</main>
          <footer className="border-t hairline">
            <div className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-4 px-5 pt-6 pb-28 text-footnote text-label-2 md:pb-6">
              <p>Market probabilities are collective belief, not certified truth.</p>
              <p>Built on NEAR for the NEAR Hackathon 2026</p>
            </div>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
