"use client";

import { useActionState } from "react";

import { type CloseAccountState, closeMyAccount } from "@/app/me/close/actions";
import { CLOSE_PHRASE } from "@/lib/close-account";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The last step of closing an account: two boxes, the phrase, then the one destructive button. */
export function CloseAccountForm() {
  const [state, action, pending] = useActionState<CloseAccountState, FormData>(closeMyAccount, null);
  return (
    <form action={action} className="flex flex-col gap-5">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="understand" required className="mt-0.5" />
        <span>I understand my sign-in, PayPal email, payout accounts and proven attributes are deleted, and my agents stop working.</span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="final" required className="mt-0.5" />
        <span>I understand this can&apos;t be undone. Signing in again later starts a new, empty account.</span>
      </label>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phrase">
          Type <span className="font-mono">{CLOSE_PHRASE}</span> to confirm
        </Label>
        <Input id="phrase" name="phrase" autoComplete="off" autoCapitalize="off" spellCheck={false} required className="max-w-xs" />
      </div>
      <Button type="submit" variant="destructive" disabled={pending} className="w-fit">
        {pending ? "Closing…" : "Close my account"}
      </Button>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
