"use client";

import { Wallet } from "lucide-react";
import { useState, useTransition } from "react";

import { connectPayoutAccount } from "@/app/actions";
import { fundWithNear, nearTransferFor } from "@/app/post/actions";
import { detectWallet, oncePromptCloses, STORE_URL } from "@/components/concordium-wallet-sign-in";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Connect buttons for the payout accounts integrations pay to. Nobody types an address: the
// wallet hands over the account. A NEAR account is also proven, with a NEP-413 signature
// (free, no transaction) that the server checks against the account's full-access keys.

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** NEP-413 nonce: the signing time in ms (8 bytes, big-endian), then 24 random bytes. */
function freshNonce(): Uint8Array {
  const nonce = new Uint8Array(32);
  new DataView(nonce.buffer).setBigUint64(0, BigInt(Date.now()));
  nonce.set(crypto.getRandomValues(new Uint8Array(24)), 8);
  return nonce;
}

/** `quiet`: an outline button, for changing an account that's already connected. */
function ConnectButton({ busy, label, onClick, quiet = false }: { busy: string | null; label: string; onClick: () => void; quiet?: boolean }) {
  return (
    <Button
      onClick={onClick}
      disabled={busy !== null}
      variant={quiet ? "outline" : "default"}
      className="h-auto min-h-10 w-fit gap-2 whitespace-normal"
    >
      <Wallet className="size-4" aria-hidden />
      {busy ?? label}
    </Button>
  );
}

/** Connect a NEAR wallet (HOT, Meteor, MyNearWallet, Intear and others) and sign to prove the account. */
export function ConnectNear({
  network,
  recipient,
  message,
  taskId,
  label = "Connect NEAR wallet",
  quiet = false,
}: {
  network: "mainnet" | "testnet";
  /** The site's host, as the signature's recipient. */
  recipient: string;
  /** What the wallet signs (the server's CONNECT_MESSAGE). */
  message: string;
  /** On a task's setup: claim it once connected. */
  taskId?: string;
  label?: string;
  quiet?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function connect() {
    setError(null);
    setBusy("Choose your wallet…");
    try {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const connector = new NearConnector({
        network,
        features: { signMessage: true, [network]: true },
        footerBranding: null,
      });
      const wallet = await connector.connect();
      setBusy("Sign the message in your wallet (free)…");
      const nonce = freshNonce();
      const signed = await wallet.signMessage({ message, recipient, nonce, network });
      setBusy("Checking your signature…");
      startTransition(async () => {
        const result = await connectPayoutAccount(
          {
            rail: "near",
            signed: {
              accountId: signed.accountId,
              publicKey: signed.publicKey,
              signature: signed.signature,
              nonce: bytesToBase64(nonce),
              message,
              recipient,
            },
          },
          taskId,
        );
        // Only the page's own wallet session: the account stays connected on boreal.
        await connector.disconnect(wallet).catch(() => {});
        if (result?.error) setError(result.error);
        setBusy(null);
      });
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setError(/reject|cancel|closed/i.test(text) || !text ? "The wallet didn't connect. Try again when you're ready." : text);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ConnectButton quiet={quiet} busy={busy} label={label} onClick={connect} />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** Connect the Concordium Wallet for Web: the account picked in the wallet is the payout account. */
export function ConnectConcordiumAccount({
  taskId,
  label = "Connect Concordium Wallet",
  quiet = false,
}: {
  taskId?: string;
  label?: string;
  quiet?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [, startTransition] = useTransition();

  async function connect() {
    setError(null);
    setMissing(false);
    setBusy("Connect in the wallet…");
    const wallet = await detectWallet();
    if (!wallet) {
      setMissing(true);
      setBusy(null);
      return;
    }
    try {
      const account = await oncePromptCloses(() => wallet.connect());
      if (!account) throw new Error("The wallet didn't share an account.");
      setBusy("Saving…");
      startTransition(async () => {
        const result = await connectPayoutAccount({ rail: "concordium", account }, taskId);
        if (result?.error) setError(result.error);
        setBusy(null);
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The wallet didn't connect. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ConnectButton quiet={quiet} busy={busy} label={label} onClick={connect} />
      {missing && (
        <Alert>
          <AlertDescription>
            The Concordium Wallet for Web isn&apos;t installed in this browser.{" "}
            <a href={STORE_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline">
              Get it for Chrome
            </a>
            , create an account, then come back and connect.
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

/**
 * Pay for a posted task with USDC from the person's NEAR wallet: one ft_transfer to boreal.work's
 * escrow with the task's memo, then the desk checks it on chain and the task goes to screening.
 * The wallet shows the amount and asks for approval; boreal.work never holds the keys.
 */
export function PayWithNear({ taskId, total }: { taskId: string; total: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function pay() {
    setError(null);
    setBusy("Preparing the payment…");
    const prepared = await nearTransferFor(taskId);
    if ("error" in prepared) {
      setError(prepared.error);
      setBusy(null);
      return;
    }
    const { transfer } = prepared;
    try {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const connector = new NearConnector({ network: transfer.network, features: { signAndSendTransaction: true, [transfer.network]: true }, footerBranding: null });
      setBusy("Choose your wallet…");
      const wallet = await connector.connect();
      setBusy(`Approve ${total} in USDC in your wallet…`);
      const outcome = await wallet.signAndSendTransaction({
        receiverId: transfer.tokenContract,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "ft_transfer",
              args: { receiver_id: transfer.payTo, amount: transfer.amount, memo: transfer.memo },
              gas: "30000000000000",
              // NEP-141 asks for exactly 1 yoctoNEAR on ft_transfer.
              deposit: "1",
            },
          },
        ],
      });
      const txHash = outcome.transaction.hash;
      const signerId = outcome.transaction.signer_id;
      await connector.disconnect(wallet).catch(() => {});
      setBusy("Confirming on NEAR…");
      startTransition(async () => {
        const result = await fundWithNear(taskId, { txHash, signerId });
        if (result?.error) setError(result.error);
        setBusy(null);
      });
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setError(/reject|cancel|closed/i.test(text) || !text ? "Nothing was sent. Try again when you're ready." : text);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={pay} disabled={busy !== null} variant="outline" className="h-auto min-h-10 w-fit gap-2 whitespace-normal">
        <Wallet className="size-4" aria-hidden />
        {busy ?? `Pay ${total} in USDC on NEAR`}
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
