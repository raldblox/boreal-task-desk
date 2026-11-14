"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { PassportRequestStart } from "@boreal/zkpassport/query";
import { passportQuery } from "@boreal/zkpassport/query";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Nfc } from "lucide-react";

import { Button } from "@/components/ui/button";

type Status = "idle" | "starting" | "waiting" | "scanned" | "proving" | "verifying" | "done";

const LABEL: Record<Status, string> = {
  idle: "Verify with ZKPassport",
  starting: "Preparing the request…",
  waiting: "Waiting for the ZKPassport app…",
  scanned: "Approve in the app, then scan your passport…",
  proving: "Your phone is building the proof (up to a minute)…",
  verifying: "Checking your proof…",
  done: "Verified",
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(data.message || "Something went wrong. Try again.");
  return data;
}

/**
 * ZKPassport: the worker's phone reads their passport's chip and proves 18+, nationality and a
 * unique identifier, bound to a one-time nonce from boreal.work. The proofs go to boreal.work's
 * server, which checks them before signing the worker in (or, with `link`, adding the passport).
 */
/** `pill`: /signin's look, an outlined pill with a passport-chip mark, beside PayPal's button. */
export function ZkPassportSignIn({ next = "/tasks", link = false, pill = false }: { next?: string; link?: boolean; pill?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  // The QR drawn for a request URL; one for an older URL is ignored, so no reset is needed.
  const [drawn, setDrawn] = useState<{ url: string; data: string } | null>(null);
  const qr = url && drawn?.url === url ? drawn.data : null;
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  useEffect(() => {
    if (!url) return;
    let live = true;
    import("qrcode")
      .then((QR) => QR.toDataURL(url, { margin: 1, width: 240 }))
      .then((data) => live && setDrawn({ url, data }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [url]);

  function fail(message: string) {
    if (cancelled.current) return;
    setError(message);
    setStatus("idle");
    setUrl(null);
  }

  async function begin() {
    setError(null);
    setStatus("starting");
    try {
      const start = await post<PassportRequestStart>("/api/worker/passport/start", {});
      const { ZKPassport, NullifierType } = await import("@zkpassport/sdk");
      const zk = new ZKPassport(start.domain);
      const builder = await zk.request({
        name: "boreal.work",
        logo: `${window.location.origin}/apple-icon.png`,
        purpose: link ? "Prove you're 18 or older and one person, for your boreal.work account" : "Prove you're 18 or older and one person, to work on boreal.work",
        scope: start.scope,
        devMode: start.devMode,
        uniqueIdentifierType: NullifierType.SALTED,
      });
      const request = passportQuery(builder, start.nonce).done();
      request.onRequestReceived(() => setStatus("scanned"));
      request.onGeneratingProof(() => setStatus("proving"));
      request.onReject(() => fail("You declined the request in the app. Start again when you're ready."));
      request.onError((message) => fail(message || "The ZKPassport app couldn't finish. Try again."));
      request.onSuccess(async ({ proofs, result }) => {
        if (cancelled.current) return false;
        setStatus("verifying");
        try {
          await post("/api/worker/passport/finish", { id: start.id, proofs, result, link });
          setStatus("done");
          router.push(next);
          router.refresh();
          return true;
        } catch (e) {
          fail(e instanceof Error ? e.message : "Couldn't check the proof. Try again.");
          return false;
        }
      });
      setUrl(request.url);
      setStatus("waiting");
    } catch (e) {
      fail(e instanceof Error ? e.message : "Couldn't start ZKPassport. Try again.");
    }
  }

  const busy = status !== "idle";
  return (
    <div className="flex flex-col gap-3">
      <Button onClick={begin} disabled={busy} variant="outline" size="lg" className={pill ? "h-12 w-full gap-3 rounded-full text-base" : "h-auto min-h-11 w-full whitespace-normal text-base"}>
        {pill && <Nfc className="size-5 text-primary" />}
        {pill && status === "idle" ? "Sign in with your passport" : link && status === "idle" ? "Add my passport with ZKPassport" : LABEL[status]}
      </Button>
      {url && (status === "waiting" || status === "scanned") && (
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-background p-4 text-center text-sm text-muted-foreground">
          {qr ? (
            // A data URL made in the browser; next/image adds nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code to open this request in the ZKPassport app" width={240} height={240} className="rounded-md" />
          ) : null}
          <p>Scan with your phone&apos;s camera, or on this phone:</p>
          <a href={url} className="font-medium text-primary underline-offset-4 hover:underline">
            Open in the ZKPassport app
          </a>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
