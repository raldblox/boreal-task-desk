"use client";

import { useActionState } from "react";

import type { OwnerActionState } from "@/app/owner/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Action = (prev: OwnerActionState, form: FormData) => Promise<OwnerActionState>;

/** One owner action as a small form: its fields, a button, and what the desk answered. */
export function OwnerActionForm({
  action,
  label,
  confirm,
  variant = "outline",
  children,
}: {
  action: Action;
  label: string;
  /** When set, a box the owner ticks before the button works. */
  confirm?: string;
  variant?: "default" | "outline" | "destructive";
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {children}
      {confirm && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" required className="mt-0.5" />
          <span>{confirm}</span>
        </label>
      )}
      <Button type="submit" size="sm" variant={variant} disabled={pending} className="w-fit">
        {pending ? "Working…" : label}
      </Button>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.ok && <p className="text-sm text-muted-foreground">{state.ok}</p>}
    </form>
  );
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** The limits and the spending mode, as the owner set them, to change. */
export function LimitFields({ maxTaskBudget, maxDailySpend, spendingMode }: { maxTaskBudget: number; maxDailySpend: number; spendingMode: "ask" | "auto" }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maxTaskBudget">Most per task (USD)</Label>
          <Input id="maxTaskBudget" name="maxTaskBudget" inputMode="decimal" defaultValue={dollars(maxTaskBudget)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maxDailySpend">Most per day (USD)</Label>
          <Input id="maxDailySpend" name="maxDailySpend" inputMode="decimal" defaultValue={dollars(maxDailySpend)} required />
        </div>
      </div>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium">Paying from your saved PayPal</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="spendingMode" value="ask" defaultChecked={spendingMode === "ask"} className="mt-0.5" />
          <span>Ask me each time: you approve every payment before anything is held.</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="spendingMode" value="auto" defaultChecked={spendingMode === "auto"} className="mt-0.5" />
          <span>Pay on its own, within these limits.</span>
        </label>
      </fieldset>
    </>
  );
}
