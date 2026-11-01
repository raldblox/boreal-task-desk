"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { finishProof, startProof } from "@/lib/concordium-proof";

export const STORE_URL = "https://chromewebstore.google.com/detail/concordium-wallet/mnnkpffndmickbiakofclnpoiajlegmg";

/** The part of the Concordium Wallet for Web's injected API boreal uses. */
export type WalletApi = {
  connect(): Promise<string | undefined>;
  requestVerifiablePresentationV1(request: unknown): Promise<unknown>;
  signMessage(accountAddress: string, message: string): Promise<unknown>;
};

/** The extension injects window.concordium shortly after the page loads. */
export async function detectWallet(timeoutMs = 1500): Promise<WalletApi | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const api = (window as { concordium?: WalletApi }).concordium;
    if (api) return api;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

const PROMPT_OPEN = /another prompt is already open/i;

/**
 * The wallet allows one prompt at a time and frees the slot only once its window has closed, a
 * moment after the previous prompt resolves. Ask again for a few seconds before giving up.
 */
export async function oncePromptCloses<T>(ask: () => Promise<T>, timeoutMs = 4000): Promise<T> {
  const started = Date.now();
  for (;;) {
    try {
      return await ask();
    } catch (e) {
      if (!(e instanceof Error && PROMPT_OPEN.test(e.message)) || Date.now() - started > timeoutMs) throw e;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

type Status = "idle" | "connecting" | "proving" | "verifying" | "missing";

const LABEL: Record<Status, string> = {
  idle: "Use Concordium Wallet for Web",
  connecting: "Connect in the wallet…",
  proving: "Approve the proof in the wallet…",
  verifying: "Checking your proof…",
  missing: "Use Concordium Wallet for Web",
};

/**
 * Sign-in with the Concordium Wallet for Web browser extension. It answers the same anchored
 * proof request as the ID App, so the server side and the worker's pseudonym are the same.
 */
export function ConcordiumWalletSignIn({ next = "/tasks", link = false }: { next?: string; link?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setError(null);
    setStatus("connecting");
    const wallet = await detectWallet();
    if (!wallet) return setStatus("missing");
    try {
      await oncePromptCloses(() => wallet.connect());
      setStatus("proving");
      // The request's context names a connection; this one is the browser tab.
      const connectionId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      const { id, request } = await startProof(connectionId);
      const presentation = await oncePromptCloses(() => wallet.requestVerifiablePresentationV1(request));
      setStatus("verifying");
      await finishProof(id, presentation, link);
      router.push(next);
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      // The wallet can't build the proof when no identity in it holds what boreal asks for.
      setError(
        /unable to create proof/i.test(message)
          ? "Your wallet couldn't build the proof. boreal asks an identity to prove you're 18 or older and to share your country of residence and ID document issuer and number; pick an account whose identity has those, or use the Concordium ID App."
          : PROMPT_OPEN.test(message)
            ? "The wallet still has an earlier window open. Finish or close that window, then try again."
            : message || "The wallet didn't complete the sign-in.",
      );
      setStatus("idle");
    }
  }

  const busy = status === "connecting" || status === "proving" || status === "verifying";
  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={begin}
        disabled={busy}
        variant="outline"
        size="lg"
        className="h-auto min-h-11 w-full whitespace-normal text-base"
      >
        {LABEL[status]}
      </Button>
      {status === "missing" && (
        <Alert>
          <AlertDescription>
            The Concordium Wallet for Web isn&apos;t installed in this browser.{" "}
            <a href={STORE_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline">
              Get it for Chrome
            </a>
            , set up your identity, then come back and try again.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
