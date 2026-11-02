"use client";

import { useActionState, useState } from "react";

import type { ActionState } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/**
 * The poster's own verdict (review_result): a pass is final at once and pays the worker; a fail
 * cites the rules the result broke (R5.3), and the worker can dispute it once.
 */
export function ReviewForm({ action, rules }: { action: Action; rules: { id: string; text: string }[] }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [outcome, setOutcome] = useState<"pass" | "fail">("pass");
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 text-sm font-medium">Does it meet every check?</legend>
        {(["pass", "fail"] as const).map((value) => (
          <label
            key={value}
            className="flex items-center gap-2 rounded-xl border p-3 text-sm font-medium has-checked:border-primary/50 has-checked:bg-primary-soft/30"
          >
            <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
            {value === "pass" ? "Pass" : "Fail"}
          </label>
        ))}
      </fieldset>
      {outcome === "fail" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Which rule did it break?</legend>
          {rules.map((rule) => (
            <label key={rule.id} className="flex gap-2 text-sm">
              <input type="checkbox" name="ruleId" value={rule.id} defaultChecked={rule.id === "R4.1"} className="mt-0.5" />
              <span>
                <span className="font-mono text-xs">{rule.id}</span> {rule.text}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="reasoning">{outcome === "pass" ? "A note for the worker" : "What's missing, for the worker"}</Label>
        <Textarea id="reasoning" name="reasoning" rows={3} minLength={5} maxLength={2000} required />
        <p className="text-xs text-muted-foreground">
          {outcome === "pass"
            ? "Your pass is final straight away: the worker is paid now."
            : "Judge only against your checks; where one is ambiguous, the worker's reasonable reading wins. The worker can dispute a fail once, to a panel with a human member."}
        </p>
      </div>
      <Button type="submit" size="lg" variant={outcome === "pass" ? "default" : "outline"} disabled={pending} className="w-full sm:w-fit">
        {pending ? "Saving…" : outcome === "pass" ? "Pass and pay the worker" : "Fail it"}
      </Button>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
