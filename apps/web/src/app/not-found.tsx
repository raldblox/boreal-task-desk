import Link from "next/link";

import { Eyebrow } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

/** The site's one 404: unknown pages, missing tasks, and every /admin page for non-admins. */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col items-start gap-6 px-5 py-20 sm:px-8 md:py-32 lg:px-12">
      <Eyebrow>Page not found</Eyebrow>
      <h1 className="text-4xl font-light tracking-[-0.035em] sm:text-5xl">We can&apos;t find that page</h1>
      <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
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
