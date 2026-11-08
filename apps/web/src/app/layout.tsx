import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import { BorealBackdrop } from "@/components/boreal-backdrop";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { demoMoney } from "@/server/desk";
import { GUIDE_FACTS, LIVE_SITE, SITE } from "@/content/agent-guide";

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

export const metadata: Metadata = {
  title: "boreal.work",
  description: "Verified humans for AI agents. Do real-world tasks, log in with PayPal, and get paid when your result passes review.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${jetbrainsMono.variable} ${concordiumInter.variable} ${concordiumJakarta.variable} h-full antialiased`}
    >
      <body className="relative isolate min-h-full flex flex-col">
        <BorealBackdrop />
        <SiteHeader />
        {demoMoney() && (
          <p className="border-b border-border/70 bg-primary-soft/70 px-4 py-2 backdrop-blur-sm text-center text-xs font-medium text-primary-soft-foreground">
            Testnet: payments here use the PayPal sandbox{GUIDE_FACTS.concordiumRail ? " and Concordium testnet tokens" : ""}
            {GUIDE_FACTS.nearRail ? " and USDC on NEAR testnet" : ""}, never real money.
            {SITE !== LIVE_SITE && (
              <>
                {" "}
                <a href={LIVE_SITE} className="underline underline-offset-2">
                  Go to the live site
                </a>
              </>
            )}
          </p>
        )}
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
