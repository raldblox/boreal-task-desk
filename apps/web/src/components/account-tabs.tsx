import Link from "next/link";

import { cn } from "@/lib/utils";

// My account's sections as tabs. Links, not client state: each tab is its own URL (/me?tab=…),
// renders on the server inside <Suspense>, and works without JavaScript.

export const ACCOUNT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "work", label: "My work" },
  { id: "posted", label: "Posted" },
  { id: "agents", label: "Agents" },
  { id: "payouts", label: "Getting paid" },
  { id: "addons", label: "Add-ons" },
] as const;

export type AccountTab = (typeof ACCOUNT_TABS)[number]["id"];

export function accountTab(value: string | undefined): AccountTab {
  return ACCOUNT_TABS.some((t) => t.id === value) ? (value as AccountTab) : "overview";
}

/** The tab bar. `counts` puts a small number on a tab (things waiting there); 0 shows nothing. */
export function AccountTabs({ active, counts = {} }: { active: AccountTab; counts?: Partial<Record<AccountTab, number>> }) {
  return (
    <nav aria-label="My account" className="-mx-4 overflow-x-auto overflow-y-hidden px-4 [scrollbar-width:none]">
      <ul className="flex w-max min-w-full gap-1 border-b">
        {ACCOUNT_TABS.map((tab) => {
          const current = tab.id === active;
          const count = counts[tab.id] ?? 0;
          return (
            <li key={tab.id}>
              <Link
                href={tab.id === "overview" ? "/me" : `/me?tab=${tab.id}`}
                aria-current={current ? "page" : undefined}
                scroll={false}
                className={cn(
                  "-mb-px flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
                  current
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
