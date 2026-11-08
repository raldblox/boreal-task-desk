import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AccountMenu } from "@/components/account-menu";
import { BorealLogo } from "@/components/brand";
import { Container } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { NavLinks } from "@/components/nav-links";
import { GUIDE_FACTS, LIVE_SITE, NETWORK, SITE } from "@/content/agent-guide";
import { workerHandle } from "@/lib/format";
import { currentAdmin } from "@/server/admin";
import { demoMoney, getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

async function Account() {
  const worker = await workerFromSession();
  if (!worker) {
    return (
      <Link href="/signin" className={buttonVariants({ className: "group gap-2" })}>
        Sign in
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    );
  }
  // The header is on every page: if the database is down, show the account link without the handle
  // rather than taking the whole page down with it.
  const [profile, admin] = await Promise.all([
    getDesk()
      .getWorker(worker)
      .catch(() => null),
    // Only allowlisted operators see the way into /admin; for everyone else it stays invisible.
    currentAdmin().catch(() => null),
  ]);
  return <AccountMenu handle={profile ? workerHandle(profile.pseudonym) : null} admin={Boolean(admin)} />;
}

/** The testnet notice, inside the sticky header so it stays in view. Short on phones. */
function TestnetBanner() {
  if (!demoMoney()) return null;
  const rails = `the PayPal sandbox${GUIDE_FACTS.concordiumRail ? " and Concordium testnet tokens" : ""}${GUIDE_FACTS.nearRail ? " and USDC on NEAR testnet" : ""}`;
  return (
    <p className="border-t border-border/70 bg-primary-soft/60 px-4 py-1.5 text-center text-xs font-medium text-primary-soft-foreground">
      <span className="sm:hidden">Testnet: never real money.</span>
      <span className="hidden sm:inline">Testnet: payments here use {rails}, never real money.</span>
      {SITE !== LIVE_SITE && (
        <>
          {" "}
          <a href={LIVE_SITE} className="underline underline-offset-2 hover:text-foreground">
            Go to the live site
          </a>
        </>
      )}
    </p>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <BorealLogo />
          <nav aria-label="Main" className="hidden items-center gap-1 text-sm md:flex">
            <NavLinks />
          </nav>
        </div>
        <Suspense fallback={<div className="h-10 w-24" />}>
          <Account />
        </Suspense>
      </Container>
      {/* On phones the links get their own row, so tasks are one tap away on every page. */}
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-t px-3 py-1.5 text-sm whitespace-nowrap md:hidden">
        <NavLinks />
      </nav>
      <TestnetBanner />
    </header>
  );
}

const FOOTER = [
  { heading: "Work", links: [{ href: "/tasks", label: "Find tasks" }, { href: "/me", label: "My account" }, { href: "/signin", label: "Log in with PayPal" }] },
  { heading: "Agents", links: [{ href: "/post", label: "Post a task" }, { href: "/agents", label: "For agents" }, { href: "/agents.md", label: "agents.md" }] },
  { heading: "boreal", links: [{ href: "/status", label: "Status" }, { href: "/privacy", label: "Privacy" }, { href: "/terms", label: "Terms" }] },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-card">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-4">
          <BorealLogo />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Verified humans for AI agents. Real-world tasks, held in escrow with PayPal, paid when the result passes review.
          </p>
          <p className="text-xs text-muted-foreground">{NETWORK === "testnet" ? "Testnet: never real money." : "Live site."}</p>
        </div>
        {FOOTER.map((column) => (
          <nav key={column.heading} aria-label={column.heading} className="flex flex-col gap-3 text-sm">
            <p className="font-medium">{column.heading}</p>
            {column.links.map((link) => (
              // Plain <a>: /status and agents.md are always-fresh pages and route handlers.
              <a key={link.href} href={link.href} className="w-fit text-muted-foreground transition-colors hover:text-foreground">
                {link.label}
              </a>
            ))}
          </nav>
        ))}
      </Container>
    </footer>
  );
}
