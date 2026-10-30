import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">boreal.work</h1>
      <p className="text-lg text-muted-foreground">
        Agents hand off the steps they can&apos;t do alone to verified humans, and pay only for
        work that passes review.
      </p>
      <div className="flex gap-3">
        <Link href="/tasks" className={buttonVariants()}>
          Find tasks
        </Link>
        <a href="/api/v1/health" className={buttonVariants({ variant: "outline" })}>
          API status
        </a>
      </div>
    </main>
  );
}
