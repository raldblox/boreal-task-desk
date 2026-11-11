"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { passkeyAuthFinish, passkeyAuthOptions, passkeyRegisterFinish, passkeyRegisterOptions, passkeyRemove } from "@/app/admin-passkey/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  passkeys: { id: string; label: string | null; createdAt: string; lastUsedAt: string | null }[];
  /** This session has already presented a passkey. */
  passed: boolean;
  /** A first passkey needs the enrolment code here. */
  needsCode: boolean;
  /** Where to go once the check passes. */
  next: string;
}

/** The admin's passkeys: use one to open /admin, register one, remove one. */
export function PasskeyPanel({ passkeys, passed, needsCode, next }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");

  /** Runs one ceremony, showing whatever went wrong in plain words. */
  async function run(step: () => Promise<{ error: string } | { ok: true }>, then?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const result = await step();
      if ("error" in result) setError(result.error);
      else if (then) then();
      else router.refresh();
    } catch (e) {
      // The browser throws when the person cancels or no key answers.
      setError(e instanceof Error && e.name === "NotAllowedError" ? "No key answered. Touch your key when it blinks, and try again." : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const check = () =>
    run(
      async () => {
        const started = await passkeyAuthOptions();
        if (!started.options) return { error: started.error ?? "That didn't work. Try again." };
        return passkeyAuthFinish(await startAuthentication({ optionsJSON: started.options }));
      },
      () => router.replace(next),
    );

  const register = () =>
    run(async () => {
      const started = await passkeyRegisterOptions(code);
      if (!started.options) return { error: started.error ?? "That didn't work. Try again." };
      return passkeyRegisterFinish(await startRegistration({ optionsJSON: started.options }), label, code);
    });

  const first = passkeys.length === 0;
  return (
    <div className="flex flex-col gap-6">
      {!first && !passed && (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <p className="font-medium">Use your passkey to open the admin area</p>
          <p className="text-sm text-muted-foreground">Plug in your security key and touch it when it blinks. The check lasts 12 hours on this browser.</p>
          <Button type="button" onClick={check} disabled={busy} className="w-fit">
            {busy ? "Waiting for your key…" : "Use my passkey"}
          </Button>
        </div>
      )}
      {passed && (
        <p className="text-sm">
          This browser has passed the passkey check.{" "}
          <a href={next} className="underline">
            Open the admin area
          </a>
        </p>
      )}

      {(first || passed) && (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <p className="font-medium">{first ? "Register your first passkey" : "Register another passkey"}</p>
          <p className="text-sm text-muted-foreground">
            A security key such as a YubiKey. Register a second one and keep it somewhere safe: a lost only key means an operator has to reset your passkeys in the database.
          </p>
          {first && needsCode && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="enroll-code">Enrolment code</Label>
              <Input id="enroll-code" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="passkey-label">A name for this key</Label>
            <Input id="passkey-label" maxLength={60} placeholder="YubiKey, desk drawer" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={register} disabled={busy} className="w-fit">
            {busy ? "Waiting for your key…" : "Register a passkey"}
          </Button>
        </div>
      )}

      {!first && (
        <ul className="flex flex-col divide-y rounded-xl border text-sm">
          {passkeys.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <span>
                {p.label ?? "Passkey"} <span className="text-muted-foreground">· added {p.createdAt}{p.lastUsedAt ? ` · last used ${p.lastUsedAt}` : ""}</span>
              </span>
              {passed && passkeys.length > 1 && (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => passkeyRemove(p.id, "removed from the passkey page"))}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
