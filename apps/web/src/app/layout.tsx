import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-serif/400.css";
import "@fontsource/ibm-plex-serif/400-italic.css";
import "@fontsource/ibm-plex-serif/600.css";
import "@fontsource/grand-hotel/400.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/500-italic.css";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { NavBar } from "@/components/chrome";
import { SiteFooter } from "@/components/site-footer";
import { SmoothScroll } from "@/components/smooth-scroll";
import { themeScript } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import { connection } from "next/server";

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
    { media: "(prefers-color-scheme: light)", color: "#f2f3f6" },
    { media: "(prefers-color-scheme: dark)", color: "#080a10" },
  ],
};


export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request (data is live), while letting slow-changing API responses come from the data cache.
  await connection();
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
          <NavBar simulated={health?.executionMode === "SIMULATED"} />
          <SmoothScroll />
          {!health && (
            <p className="mx-auto max-w-[1200px] px-5 pt-4 text-sub text-no">The Quire API isn&apos;t reachable, so live data can&apos;t load. Start it with pnpm dev:api.</p>
          )}
          <main className="mx-auto max-w-[1200px] px-5">{children}</main>
          <SiteFooter apiOnline={!!health} />
        </SessionProvider>
      </body>
    </html>
  );
}
