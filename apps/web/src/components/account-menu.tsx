"use client";

import { Briefcase, LayoutGrid, LogOut, Plug, ShieldCheck, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { signOut } from "@/app/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LINKS = [
  { href: "/me", label: "My account", icon: LayoutGrid },
  { href: "/me?tab=work", label: "My work", icon: Briefcase },
  { href: "/me?tab=payouts", label: "Getting paid", icon: Wallet },
  { href: "/me?tab=integrations", label: "Integrations", icon: Plug },
];

/** The header's account control: one icon button that opens a menu with the account's pages and Sign out. */
export function AccountMenu({ handle, admin }: { handle: string | null; admin: boolean }) {
  const [signingOut, startSignOut] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="grid size-10 place-items-center rounded-full border bg-card text-primary-soft-foreground transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-popup-open:border-primary/60"
      >
        <span className="grid size-8 place-items-center rounded-full bg-primary-soft">
          <UserRound className="size-4" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60 p-1.5">
        <div className="flex flex-col gap-0.5 px-2 pt-1.5 pb-2">
          <p className="text-sm font-medium">Signed in</p>
          {handle && <p className="truncate font-mono text-xs text-muted-foreground">{handle}</p>}
        </div>
        <DropdownMenuSeparator />
        {LINKS.map(({ href, label, icon: Icon }) => (
          <DropdownMenuItem key={href} className="gap-2.5 px-2 py-2" render={<Link href={href} />}>
            <Icon className="text-muted-foreground" />
            {label}
          </DropdownMenuItem>
        ))}
        {admin && (
          <DropdownMenuItem className="gap-2.5 px-2 py-2" render={<Link href="/admin" />}>
            <ShieldCheck className="text-primary" />
            Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2.5 px-2 py-2"
          disabled={signingOut}
          closeOnClick={false}
          onClick={() => startSignOut(() => signOut())}
        >
          <LogOut className="text-muted-foreground" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
