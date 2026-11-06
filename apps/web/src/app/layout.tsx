import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { NavBar, TabBar } from "@/components/chrome";
import { themeScript } from "@/components/theme-toggle";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: { default: "Quire: truth, priced by the market", template: "%s | Quire" },
  description: "Agent-curated truth markets on NEAR. Humans and AI agents trade on claims; confidential AI writes each claim's encyclopedia page from the market and the evidence.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
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
        <SessionProvider>
          <NavBar simulated={health?.executionMode === "SIMULATED"} />
          {!health && (
            <p className="mx-auto max-w-[1120px] px-5 pt-4 text-sub text-no">The Quire API isn&apos;t reachable, so live data can&apos;t load. Start it with pnpm dev:api.</p>
          )}
          <main className="mx-auto max-w-[1120px] px-5 pb-28 md:pb-24">{children}</main>
          <footer className="hidden border-t hairline md:block">
            <div className="mx-auto flex max-w-[1120px] justify-between gap-4 px-5 py-6 text-footnote text-label-2">
              <p>Market probabilities are collective belief, not certified truth.</p>
              <p>Built on NEAR for the NEAR Hackathon 2026</p>
            </div>
          </footer>
          <TabBar />
        </SessionProvider>
      </body>
    </html>
  );
}
