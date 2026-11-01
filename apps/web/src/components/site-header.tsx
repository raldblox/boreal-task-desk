import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/app/actions";
import { BorealLogo } from "@/components/brand";
import { Button, buttonVariants } from "@/components/ui/button";
import { NETWORK } from "@/content/agent-guide";
import { workerHandle } from "@/lib/format";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

async function Account() {
  const worker = await workerFromSession();
  if (!worker) {
    return (
      <Link href="/signin" className={buttonVariants({ size: "sm" })}>
        Sign in
      </Link>
    );
  }
  // The header is on every page: if the database is down, show the account link without the handle
  // rather than taking the whole page down with it.
  const profile = await getDesk()
    .getWorker(worker)
    .catch(() => null);
  return (
    <div className="flex items-center gap-1">
      <Link
        href="/me"
        title="My account: your worker ID, earnings and tasks"
        aria-label="My account"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "gap-1.5" })}
      >
        <BadgeCheck className="size-4 text-primary" />
        {profile ? <span className="font-mono text-xs">{workerHandle(profile.pseudonym)}</span> : "My account"}
      </Link>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}

function NavLinks() {
  return (
    <>
      <Link href="/tasks" className="hover:text-foreground">
        Find tasks
      </Link>
      <Link href="/me" className="hover:text-foreground">
        My account
      </Link>
      <Link href="/agents" className="hover:text-foreground">
        For agents
      </Link>
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <BorealLogo />
          <nav aria-label="Main" className="hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
            <NavLinks />
          </nav>
        </div>
        <Suspense fallback={<div className="h-7 w-16" />}>
          <Account />
        </Suspense>
      </div>
      {/* On phones the links get their own row, so tasks are one tap away on every page. */}
      <nav aria-label="Main" className="flex gap-5 border-t border-border/70 px-4 py-2 text-sm text-muted-foreground sm:hidden">
        <NavLinks />
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/70">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          boreal.work · verified humans for AI agents ·{" "}
          {NETWORK === "testnet" ? "testnet, never real money" : "live site"}
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/tasks" className="hover:text-foreground">
            Tasks
          </Link>
          <Link href="/agents" className="hover:text-foreground">
            For agents
          </Link>
          <a href="/status" className="hover:text-foreground">
            Status
          </a>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
