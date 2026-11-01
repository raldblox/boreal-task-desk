"use client";

import { type FormEvent, startTransition, useActionState, useState } from "react";

import type { ActionState } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

function FormError({ state }: { state: ActionState }) {
  if (!state?.error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  );
}

/** A single button that runs an action, like claim or release. */
export function ActionButton({
  action,
  children,
  variant = "default",
  size = "lg",
}: {
  action: Action;
  children: React.ReactNode;
  variant?: "default" | "outline";
  size?: "sm" | "lg";
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Button type="submit" variant={variant} disabled={pending} size={size} className="w-full sm:w-fit">
        {pending ? "Working…" : children}
      </Button>
      <FormError state={state} />
    </form>
  );
}

/** Where the worker is paid on one rail: their PayPal email, or their Concordium account. */
export function PayoutForm({ action, current, paypal }: { action: Action; current: string | null; paypal: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  const id = paypal ? "payoutPaypal" : "payoutConcordium";
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="rail" value={paypal ? "paypal" : "concordium"} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{paypal ? "PayPal email" : "Concordium account"}</Label>
        <Input
          id={id}
          name="payoutAddress"
          type={paypal ? "email" : "text"}
          defaultValue={current ?? ""}
          placeholder={paypal ? "you@example.com" : "Concordium account address"}
          required
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Saving…" : "Save"}
      </Button>
      <FormError state={state} />
    </form>
  );
}

/** Shrinks a photo to at most 2000 px on its longest side as a JPEG, so uploads stay small. */
async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Some formats (like HEIC on desktop browsers) can't be decoded here; the server validates them.
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
}

export function SubmitForm({ action, resultFormat }: { action: Action; resultFormat: "text" | "photo" | "file" }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [preparing, setPreparing] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (file instanceof File && file.size > 0 && resultFormat === "photo") {
      setPreparing(true);
      form.set("file", await shrinkPhoto(file));
      setPreparing(false);
    }
    startTransition(() => formAction(form));
  }

  const busy = pending || preparing;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {resultFormat !== "text" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="file">{resultFormat === "photo" ? "Photo" : "File"}</Label>
          <Input
            id="file"
            name="file"
            type="file"
            required
            accept={resultFormat === "photo" ? "image/*" : "image/*,application/pdf"}
            capture={resultFormat === "photo" ? "environment" : undefined}
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="text">{resultFormat === "text" ? "Your answer" : "Notes (optional)"}</Label>
        <Textarea id="text" name="text" rows={resultFormat === "text" ? 6 : 3} required={resultFormat === "text"} />
      </div>
      <Button type="submit" disabled={busy} size="lg" className="w-full sm:w-fit">
        {preparing ? "Preparing photo…" : pending ? "Submitting…" : "Submit result"}
      </Button>
      <FormError state={state} />
    </form>
  );
}

export function DisputeForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label htmlFor="reason">Why is the verdict wrong?</Label>
      <Textarea id="reason" name="reason" rows={4} minLength={10} required />
      <Button type="submit" variant="outline" disabled={pending} size="lg" className="w-full sm:w-fit">
        {pending ? "Sending…" : "Dispute verdict"}
      </Button>
      <FormError state={state} />
    </form>
  );
}

/** Stands in for the Concordium ID wallet until the real proof flow lands. */
export function DevWallet({ action, request }: { action: Action; request: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="request" value={request} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="pseudonym">Pseudonym</Label>
        <Input id="pseudonym" name="pseudonym" required minLength={3} placeholder="ph-maria" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="country">Country of residence</Label>
        <select
          id="country"
          name="country"
          defaultValue="PH"
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          <option value="PH">Philippines</option>
          <option value="SG">Singapore</option>
          <option value="US">United States</option>
          <option value="">Don&apos;t share</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="adult" defaultChecked /> I am 18 or older
      </label>
      <Button type="submit" disabled={pending} size="lg" className="w-full sm:w-fit">
        {pending ? "Verifying…" : "Prove and sign in"}
      </Button>
      <FormError state={state} />
    </form>
  );
}
