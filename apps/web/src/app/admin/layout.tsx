import { ShieldCheck } from "lucide-react";
import Link from "next/link";

import { requireAdmin } from "@/server/admin";

// The admin area blocks on the server until the gate has run, so anyone who isn't an
// allowlisted admin gets a real 404 status before anything streams. Every page and action
// checks again, since layouts don't re-render on client navigation.
export const instant = false;

const NAV = [
  ["/admin", "Overview"],
  ["/admin/console", "Money console"],
  ["/admin/review", "Review queue"],
  ["/admin/tasks", "Tasks"],
  ["/admin/money", "Money"],
  ["/admin/agents", "Agents"],
  ["/admin/workers", "Workers"],
  ["/admin/controls", "Controls"],
  ["/admin/analytics", "Analytics"],
] as const;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-3 border-b pb-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <ShieldCheck className="size-4 text-primary" /> boreal.work admin
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="text-muted-foreground hover:text-foreground">
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
