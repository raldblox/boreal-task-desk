"use client";

import { useActionState, useId, useState } from "react";

import type { AdminActionState } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Action = (prev: AdminActionState, form: FormData) => Promise<AdminActionState>;

/**
 * An admin change in two steps: open it, then give a reason and tick to confirm. The
 * server checks the admin, the reason and the confirmation again; this only guides.
 */
export function AdminForm({
  action,
  label,
  confirm,
  children,
  variant = "default",
}: {
  action: Action;
  label: string;
  /** What ticking the box agrees to, in plain words. */
  confirm: string;
  children?: React.ReactNode;
  variant?: "default" | "outline" | "destructive";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);
  const id = useId();
  // A change that went through closes the form; its result shows beside the button.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <Button type="button" size="sm" variant={variant} className="w-fit" onClick={() => setOpen(true)}>
          {label}…
        </Button>
        {state?.ok && <p className="text-xs text-muted-foreground">{state.ok}</p>}
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
      {children}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-reason`}>Reason for the audit log</Label>
        <Textarea id={`${id}-reason`} name="reason" required minLength={5} maxLength={1000} rows={2} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="mt-0.5" />
        <span>{confirm}</span>
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant={variant} disabled={pending}>
          {pending ? "Working…" : label}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.ok && <p className="text-sm text-muted-foreground">{state.ok}</p>}
    </form>
  );
}

/** Pass/fail (or ok/refuse) with the rules and reasoning the desk records in the trail. */
export function DecisionFields({ outcomes }: { outcomes: [value: string, label: string][] }) {
  const id = useId();
  return (
    <>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">Outcome</legend>
        {outcomes.map(([value, label], i) => (
          <label key={value} className="flex items-center gap-1.5">
            <input type="radio" name="outcome" value={value} defaultChecked={i === 0} required />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-rules`}>Rule IDs (required to fail or refuse)</Label>
        <input
          id={`${id}-rules`}
          name="ruleIds"
          placeholder="R4.1, R5.3"
          className="h-8 rounded-lg border bg-background px-2.5 font-mono text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-reasoning`}>Reasoning (shown to the worker and agent)</Label>
        <Textarea id={`${id}-reasoning`} name="reasoning" rows={3} />
      </div>
    </>
  );
}
