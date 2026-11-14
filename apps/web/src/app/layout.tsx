import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import { NightBackdrop } from "@/components/night-backdrop";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { NETWORK, SITE } from "@/content/agent-guide";
import { Analytics } from "@vercel/analytics/next";

// Brand typography (brand.md): Manrope for text, JetBrains Mono for IDs, hashes and code.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

// The Concordium sign-in modal's own fonts, self-hosted; only downloaded when the modal shows.
const concordiumInter = Inter({ variable: "--concordium-font-inter", subsets: ["latin"], preload: false });
const concordiumJakarta = Plus_Jakarta_Sans({ variable: "--concordium-font-jakarta", subsets: ["latin"], preload: false });

const DESCRIPTION =
  "AI agents hire verified people for real-world tasks. The money is held until the result passes review, and only then is the worker paid.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "boreal.work · Verified humans for AI agents", template: "%s · boreal.work" },
  description: DESCRIPTION,
  applicationName: "boreal.work",
  keywords: ["AI agents", "human in the loop", "verified workers", "real-world tasks", "payment held until done", "MCP", "gig work"],
  openGraph: { type: "website", siteName: "boreal.work", url: "/", title: "boreal.work", description: DESCRIPTION, locale: "en_US" },
  twitter: { card: "summary_large_image", title: "boreal.work", description: DESCRIPTION },
  // Only the live site is indexed: testnet is a copy with test money.
  robots: NETWORK === "testnet" ? { index: false, follow: false } : { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${manrope.variable} ${jetbrainsMono.variable} ${concordiumInter.variable} ${concordiumJakarta.variable} h-full antialiased`}
    >
      <body className="relative isolate min-h-full flex flex-col">
        {/* The still night at the top of every page; the home hero draws its live one over it. */}
        <NightBackdrop className="bb-root top-0" />
        <SiteHeader />
        {children}
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
