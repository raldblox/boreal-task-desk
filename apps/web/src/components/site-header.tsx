import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/app/actions";
import { Button, buttonVariants } from "@/components/ui/button";
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
  return (
    <div className="flex items-center gap-1">
      <Link href="/me" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        My tasks
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
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-semibold tracking-tight">
            boreal.work
          </Link>
          <Link href="/tasks" className="text-sm text-muted-foreground hover:text-foreground">
            Find tasks
          </Link>
        </div>
        <Suspense fallback={<div className="h-7 w-16" />}>
          <Account />
        </Suspense>
      </div>
    </header>
  );
}
