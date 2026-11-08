"use client";

import Link from "next/link";

import "./globals.css";

/** When the root layout itself fails: its own document, so it stays plain. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-start justify-center gap-4 bg-background px-4 font-sans text-foreground sm:mx-auto sm:max-w-xl">
        <title>Something went wrong · boreal.work</title>
        <h1 className="text-4xl font-light tracking-[-0.035em]">boreal.work didn&apos;t load</h1>
        <p className="text-muted-foreground">Your tasks and money are safe. Try again in a moment.</p>
        <div className="flex gap-4">
          <button onClick={() => retry()} className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            Try again
          </button>
          <Link href="/status" className="self-center text-sm font-medium text-primary underline underline-offset-4">
            Status
          </Link>
        </div>
      </body>
    </html>
  );
}
