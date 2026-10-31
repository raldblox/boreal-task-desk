"use client";

import "@concordium/verification-web-ui/styles";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Status = "idle" | "connecting" | "proving" | "verifying";

const LABEL: Record<Status, string> = {
  idle: "Sign in with Concordium ID",
  connecting: "Scan the code with your Concordium ID App…",
  proving: "Approve the request in your app…",
  verifying: "Checking your proof…",
};

/**
 * Concordium ID App sign-in. The SDK shows the QR code and pairs with the app over
 * WalletConnect; the server builds and anchors the proof request, then verifies the answer.
 */
export function ConcordiumSignIn({ projectId, network }: { projectId: string; network: "testnet" | "mainnet" }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setError(null);
    setStatus("connecting");
    const { ConcordiumVerificationWebUI, resetSDK } = await import("@concordium/verification-web-ui");
    resetSDK();
    const sdk = new ConcordiumVerificationWebUI({
      network,
      projectId,
      metadata: {
        name: "boreal.work",
        description: "Sign in to do tasks for AI agents",
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`],
      },
    });

    let requestId: string | null = null;
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
        const res = await fetch("/api/worker/verification/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ connectionId: topic }),
        });
        const body = (await res.json().catch(() => ({}))) as { id?: string; request?: unknown; message?: string };
        if (!res.ok || !body.id) return fail(body.message ?? "Couldn't start the proof request.");
        requestId = body.id;
        await sdk.sendPresentationRequest(body.request as { challenge: string }, topic);
      } else if (type === "presentation_received") {
        setStatus("verifying");
        const res = await fetch("/api/worker/verification/finish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: requestId, presentation: data }),
        });
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) return fail(body.message ?? "Your proof couldn't be verified.");
        await sdk.showSuccessState().catch(() => {});
        window.removeEventListener("verification-web-ui-event", onEvent);
        router.push("/tasks");
        router.refresh();
      } else if (type === "error") {
        await fail((data as { message?: string })?.message ?? "The ID App connection failed.");
      }
    };

    window.addEventListener("verification-web-ui-event", onEvent);
    await sdk.renderUIModals(() => {
      window.removeEventListener("verification-web-ui-event", onEvent);
      setStatus("idle");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={begin} disabled={status !== "idle"} className="w-fit">
        {LABEL[status]}
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
