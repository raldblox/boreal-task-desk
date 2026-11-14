"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
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

/** What the browser's WebAuthn errors mean, in words an admin can act on. */
function explain(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  switch (name) {
    case "NotAllowedError":
      return "No passkey answered, or you cancelled. Press the button again and follow your browser's prompt.";
    case "InvalidStateError":
      return "That passkey is already on your account. Add one kept somewhere else, or use this one to confirm it's you.";
    case "NotSupportedError":
      return "This browser can't use passkeys. Try a current Chrome, Edge, Firefox or Safari.";
    case "SecurityError":
      return "The browser refused the request for this address. Open the admin area on boreal.work itself, over https.";
    case "AbortError":
      return "The request was interrupted. Try again.";
    default:
      return "That didn't work. Try again.";
  }
}

/** The admin's passkeys: enrol the first, use one to open /admin, or manage them. */
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
      setError(explain(e));
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
  const onlyOne = passkeys.length === 1;

  const registerForm = (
    <div className="flex flex-col gap-3">
      {first && needsCode && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll-code">Enrolment code</Label>
          <Input id="enroll-code" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
          <p className="text-xs text-muted-foreground">The operator who added you as an admin gives you this code once.</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="passkey-label">A name for this passkey</Label>
        <Input id="passkey-label" maxLength={60} placeholder="Windows Hello on my laptop" value={label} onChange={(e) => setLabel(e.target.value)} />
        <p className="text-xs text-muted-foreground">So you can tell your keys apart later.</p>
      </div>
      <Button type="button" variant={first ? "default" : "outline"} onClick={register} disabled={busy} className="w-fit">
        {busy ? "Follow your browser's prompt…" : first ? "Add passkey" : "Add another passkey"}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* State 1: no key yet. */}
      {first && (
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3">
            <KeyRound className="size-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">Add a passkey</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            The admin area moves money and decides disputes, so it asks for a passkey on top of your sign-in. Any passkey works: this
            computer&apos;s fingerprint, face or PIN (Windows Hello, Touch ID), your phone, a password manager, or a security key such
            as a YubiKey. It can&apos;t be phished.
          </p>
          <ol className="list-decimal pl-5 text-sm text-muted-foreground">
            <li>Paste the enrolment code and give the passkey a name.</li>
            <li>Press Add passkey, and choose where to keep it in your browser&apos;s prompt.</li>
            <li>Straight after, add a second one somewhere else (your phone, say), so losing one device doesn&apos;t lock you out.</li>
          </ol>
          {registerForm}
        </section>
      )}

      {/* State 2: keys exist, this browser hasn't used one yet. */}
      {!first && !passed && (
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3">
            <KeyRound className="size-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">Confirm it&apos;s you</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Use one of your passkeys. This browser then stays open to the admin area for 12 hours.
          </p>
          <Button type="button" onClick={check} disabled={busy} className="w-fit">
            {busy ? "Follow your browser's prompt…" : "Use my passkey"}
          </Button>
        </section>
      )}

      {/* State 3: passed; manage keys. */}
      {passed && (
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">This browser is open to the admin area</h2>
          </div>
          <a href={next} className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">
            Go to the admin area
          </a>
        </section>
      )}

      {onlyOne && (
        <Alert>
          <ShieldAlert aria-hidden />
          <AlertDescription>
            You have only one key. If you lose it, an operator has to reset your keys in the database before you can get back in. Register a
            second key{passed ? " below" : " once you're in"} and keep it somewhere safe.
          </AlertDescription>
        </Alert>
      )}

      {!first && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Your keys</h2>
          <ul className="flex flex-col divide-y rounded-xl border bg-card text-sm">
            {passkeys.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{p.label ?? "Security key"}</span>
                  <span className="text-xs text-muted-foreground">
                    Added {p.createdAt}
                    {p.lastUsedAt ? ` · last used ${p.lastUsedAt}` : " · not used yet"}
                  </span>
                </span>
                {passed && passkeys.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Remove "${p.label ?? "Security key"}"? It will no longer open the admin area.`)) {
                        void run(() => passkeyRemove(p.id, "removed from the passkey page"));
                      }
                    }}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {passed && passkeys.length === 1 && <p className="text-xs text-muted-foreground">Your only key can&apos;t be removed.</p>}
          {passed && <div className="rounded-xl border bg-card p-6">{registerForm}</div>}
        </section>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
