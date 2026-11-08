import { ChevronRight, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/app/actions";
import { BorealLogo } from "@/components/brand";
import { Container } from "@/components/page";
import { Button, buttonVariants } from "@/components/ui/button";
import { NETWORK } from "@/content/agent-guide";
import { workerHandle } from "@/lib/format";
import { currentAdmin } from "@/server/admin";
import { getDesk } from "@/server/desk";
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
  return (
    <div className="flex items-center gap-2">
      {admin && (
        <Link href="/admin" title="boreal admin" className={buttonVariants({ variant: "ghost", size: "sm", className: "gap-1.5 text-primary" })}>
          <ShieldCheck className="size-4" />
          <span className="hidden sm:inline">Admin</span>
        </Link>
      )}
      <Link
        href="/me"
        title="My account: your worker ID, earnings and tasks"
        className="group flex h-10 items-center gap-2.5 rounded-lg border bg-card pr-3 pl-1.5 transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="grid size-7 place-items-center rounded-md bg-primary-soft text-primary-soft-foreground">
          <UserRound className="size-4" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-medium">My account</span>
          {profile && <span className="hidden font-mono text-[10px] text-muted-foreground sm:block">{workerHandle(profile.pseudonym)}</span>}
        </span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>
      <form action={signOut} className="hidden sm:block">
        <Button type="submit" variant="ghost">
          Sign out
        </Button>
      </form>
    </div>
  );
}

const NAV = [
  { href: "/tasks", label: "Find tasks" },
  { href: "/post", label: "Post a task" },
  { href: "/agents", label: "For agents" },
];

function NavLinks() {
  return (
    <>
      {NAV.map((item) => (
        <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 transition-colors hover:bg-muted hover:text-foreground">
          {item.label}
        </Link>
      ))}
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <BorealLogo />
          <nav aria-label="Main" className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
            <NavLinks />
          </nav>
        </div>
        <Suspense fallback={<div className="h-10 w-24" />}>
          <Account />
        </Suspense>
      </Container>
      {/* On phones the links get their own row, so tasks are one tap away on every page. */}
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-t px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground md:hidden">
        <NavLinks />
      </nav>
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
