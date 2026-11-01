import Link from "next/link";

import { Eyebrow } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

/** The site's one 404: unknown pages, missing tasks, and every /admin page for non-admins. */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-5 px-4 py-16 md:py-24">
      <Eyebrow>Page not found</Eyebrow>
      <h1 className="text-3xl font-semibold tracking-tight">We can&apos;t find that page</h1>
      <p className="text-muted-foreground">
        The link may be old, or the task may no longer be open to you. Open tasks are always on the tasks page.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/tasks" className={buttonVariants({ size: "lg" })}>
          Find tasks
        </Link>
        <Link href="/" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Go home
        </Link>
      </div>
    </main>
  );
}
