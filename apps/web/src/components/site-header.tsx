import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/app/actions";
import { BorealLogo } from "@/components/brand";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const profile = await getDesk().getWorker(worker);
  return (
    <div className="flex items-center gap-1">
      <Link
        href="/me"
        title="Your worker ID and tasks"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "gap-1.5" })}
      >
        <BadgeCheck className="size-4 text-primary" />
        {profile ? <span className="font-mono text-xs">{workerHandle(profile.pseudonym)}</span> : "My tasks"}
      </Link>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <BorealLogo />
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
            <Link href="/tasks" className="hover:text-foreground">
              Find tasks
            </Link>
            <Link href="/#agents" className="hover:text-foreground">
              For agents
            </Link>
          </nav>
        </div>
        <Suspense fallback={<div className="h-7 w-16" />}>
          <Account />
        </Suspense>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/70">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>boreal.work · verified humans for AI agents · on Concordium testnet</p>
        <nav className="flex gap-5">
          <Link href="/tasks" className="hover:text-foreground">
            Tasks
          </Link>
          <Link href="/#agents" className="hover:text-foreground">
            For agents
          </Link>
          <a href="/api/v1/health" className="hover:text-foreground">
            Status
          </a>
        </nav>
      </div>
    </footer>
  );
}
