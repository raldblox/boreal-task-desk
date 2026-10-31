// The two server calls every Concordium sign-in makes, whichever app holds the identity:
// start builds and anchors the proof request, finish verifies the answer and signs in.

export async function startProof(connectionId: string): Promise<{ id: string; request: unknown }> {
  const res = await fetch("/api/worker/verification/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ connectionId }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; request?: unknown; message?: string };
  if (!res.ok || !body.id) throw new Error(body.message ?? "Couldn't start the proof request.");
  return { id: body.id, request: body.request };
}

export async function finishProof(id: string | null, presentation: unknown): Promise<void> {
  const res = await fetch("/api/worker/verification/finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, presentation }),
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(body.message ?? "Your proof couldn't be verified.");
}
