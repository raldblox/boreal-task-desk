"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { finishProof, startProof } from "@/lib/concordium-proof";

type Status = "idle" | "connecting" | "proving" | "verifying";

const LABEL: Record<Status, string> = {
  idle: "Sign in with Concordium ID",
  connecting: "Waiting for the ID App…",
  proving: "Approve in the ID App…",
  verifying: "Checking your proof…",
};

/**
 * Concordium ID App sign-in. The SDK shows the QR code and pairs with the app over
 * WalletConnect; the server builds and anchors the proof request, then verifies the answer.
 */
export function ConcordiumSignIn({
  projectId,
  network,
  next = "/tasks",
  link = false,
}: {
  projectId: string;
  network: "testnet" | "mainnet";
  next?: string;
  /** Add the Concordium ID to the signed-in worker instead of signing in. */
  link?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // Closes the modal and stops listening; set while a sign-in is running.
  const cancel = useRef<(() => void) | null>(null);

  async function begin() {
    setError(null);
    setStatus("connecting");
    const { ConcordiumVerificationWebUI, resetSDK } = await import("@concordium/verification-web-ui");
    resetSDK();
    // The modal mounts straight under <body>, outside the page layout.
    if (!document.getElementById("concordium-modal-root")) {
      const root = document.createElement("div");
      root.id = "concordium-modal-root";
      document.body.appendChild(root);
    }
    const sdk = new ConcordiumVerificationWebUI({
      network,
      projectId,
      // Its own scoped root, so the modal's styles and the site's never mix.
      defaultContainer: "#concordium-modal-root",
      metadata: {
        name: "boreal.work",
        description: "Sign in to do tasks for AI agents",
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`],
      },
    });

    let requestId: string | null = null;
    // Some of the SDK's screens (like "processing") have no close button: Escape, a tap
    // outside the modal, or our Cancel button always close it.
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches(".desktop--modal-overlay, .mobile--modal-overlay")) close();
    };
    const close = () => {
      window.removeEventListener("verification-web-ui-event", onEvent);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
      ConcordiumVerificationWebUI.closeModal();
      cancel.current = null;
      setStatus("idle");
    };
    cancel.current = close;
    const fail = async (message: string) => {
      setError(message);
      setStatus("idle");
      await sdk.showErrorState().catch(() => {});
    };

    const onEvent = async (event: Event) => {
      const { type, data } = (event as CustomEvent<{ type: string; data: unknown }>).detail;
      if (type === "session_approved") {
        setStatus("proving");
        const topic = (data as { topic: string }).topic;
        try {
          const started = await startProof(topic);
          requestId = started.id;
          await sdk.sendPresentationRequest(started.request as { challenge: string }, topic);
        } catch (e) {
          return fail((e as Error).message);
        }
      } else if (type === "presentation_received") {
        setStatus("verifying");
        try {
          await finishProof(requestId, data, link);
        } catch (e) {
          return fail((e as Error).message);
        }
        await sdk.showSuccessState().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 1200));
        close();
        setStatus("verifying");
        // Refresh too, so the header and every page pick up the new session cookie.
        router.push(next);
        router.refresh();
      } else if (type === "error") {
        await fail((data as { message?: string })?.message ?? "The ID App connection failed.");
      }
    };

    window.addEventListener("verification-web-ui-event", onEvent);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    await sdk.renderUIModals(close);
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={begin}
        disabled={status !== "idle"}
        size="lg"
        className="h-auto min-h-11 w-full whitespace-normal text-base"
      >
        {link && status === "idle" ? "Connect with the Concordium ID App" : LABEL[status]}
      </Button>
      {status !== "idle" && status !== "verifying" && (
        <Button variant="ghost" onClick={() => cancel.current?.()} className="self-center text-muted-foreground">
          Cancel
        </Button>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
