// The two server calls every Concordium sign-in makes, whichever app holds the identity:
// start builds and anchors the proof request, finish verifies the answer and signs in (or,
// with `link`, adds the Concordium ID to the signed-in worker).

/**
 * Quick sign-in with a wallet account that answered an earlier proof: it signs a one-time
 * message, nothing goes on-chain. `signedIn` is false when the account still needs a proof.
 */
export async function walletSignIn(
  sign: (message: string) => Promise<unknown>,
  account: string,
  link: boolean,
): Promise<{ signedIn: boolean }> {
  const challenge = await fetch("/api/worker/wallet/challenge", { method: "POST" });
  const { message } = (await challenge.json().catch(() => ({}))) as { message?: string };
  if (!challenge.ok || !message) throw new Error("Couldn't start the sign-in. Try again.");
  const signature = await sign(message);
  const res = await fetch("/api/worker/wallet/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, signature, link }),
  });
  const body = (await res.json().catch(() => ({}))) as { signedIn?: boolean; message?: string };
  if (!res.ok) throw new Error(body.message ?? "Couldn't sign you in with the wallet.");
  return { signedIn: body.signedIn === true };
}

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

/** A fee-free Web3 ID request for Concordium Wallet for Web: no anchor, nothing paid. */
export async function startWalletProof(): Promise<{ id: string; challenge: string; statements: unknown }> {
  const res = await fetch("/api/worker/verification/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: true }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; challenge?: string; statements?: unknown; message?: string };
  if (!res.ok || !body.id || !body.challenge) throw new Error(body.message ?? "Couldn't start the proof request.");
  return { id: body.id, challenge: body.challenge, statements: body.statements };
}

export async function finishProof(id: string | null, presentation: unknown, link = false, wallet = false): Promise<void> {
  const res = await fetch("/api/worker/verification/finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, presentation, link, wallet }),
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(body.message ?? "Your proof couldn't be verified.");
}
