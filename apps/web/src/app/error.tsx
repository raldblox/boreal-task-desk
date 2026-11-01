"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Eyebrow } from "@/components/brand";
import { Button, buttonVariants } from "@/components/ui/button";

/** Any page that fails to render. Nothing is lost: every change is saved by the desk before a page shows it. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-5 px-4 py-16 md:py-24">
      <Eyebrow>Something went wrong</Eyebrow>
      <h1 className="text-3xl font-semibold tracking-tight">This page didn&apos;t load</h1>
      <p className="text-muted-foreground">
        Your tasks and money are safe: nothing changes unless you see it confirmed. Try again, or check the status page if
        it keeps happening.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={() => retry()}>
          Try again
        </Button>
        <Link href="/status" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Status
        </Link>
      </div>
      {digest && <p className="font-mono text-xs text-muted-foreground">Error {digest}</p>}
    </main>
  );
}
