"use client";

import { Wallet } from "lucide-react";
import { useState, useTransition } from "react";

import { connectPayoutAccount } from "@/app/actions";
import { fundAgentTasksWithNear } from "@/app/pay/actions";
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

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

/**
 * Connect an EVM wallet (MetaMask, Coinbase Wallet, Rabby and others in the browser) for USDC
 * payouts: the wallet shares its address and signs a free message that moves nothing.
 * `template` is the server's connect message with `{issuedAt}` where the time goes, so the
 * wording lives in one place (`evmConnectMessage` in @boreal/evm).
 */
export function ConnectEvm({
  template,
  chain,
  taskId,
  label = "Connect wallet",
  quiet = false,
}: {
  template: string;
  /** The chain the rail pays on, by name, for the words around the button. */
  chain: string;
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
    const ethereum = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    if (!ethereum) {
      setMissing(true);
      return;
    }
    try {
      setBusy("Connect in your wallet…");
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error("The wallet didn't share an address.");
      setBusy("Sign the message in your wallet (free)…");
      const issuedAt = new Date().toISOString();
      const message = template.replace("{issuedAt}", issuedAt);
      const signature = (await ethereum.request({ method: "personal_sign", params: [message, address] })) as string;
      setBusy("Checking your signature…");
      startTransition(async () => {
        const result = await connectPayoutAccount({ rail: "evm", address, issuedAt, signature }, taskId);
        if (result?.error) setError(result.error);
        setBusy(null);
      });
    } catch (e) {
      const code = (e as { code?: number })?.code;
      const text = e instanceof Error ? e.message : "";
      setError(code === 4001 || /reject|denied|cancel/i.test(text) ? "The wallet didn't connect. Try again when you're ready." : text || "That didn't work. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ConnectButton quiet={quiet} busy={busy} label={label} onClick={connect} />
      {missing && (
        <Alert>
          <AlertDescription>
            No wallet found in this browser. Install a wallet that supports {chain}, such as{" "}
            <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="font-medium text-primary underline">
              MetaMask
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

/**
 * The owner pays several of their agent's tasks from their own NEAR wallet, in one approval: one
 * transaction to the USDC contract with an ft_transfer to escrow per task, each carrying that
 * task's memo. The server then funds each task against that transaction.
 */
export function PayTasksWithNear({
  agentName,
  total,
  network,
  token,
  payTo,
  transfers,
}: {
  agentName: string;
  total: string;
  network: "testnet" | "mainnet";
  token: string;
  payTo: string;
  transfers: { taskId: string; amount: string; memo: string }[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ funded: number; failed: { taskId: string; reason: string }[]; txHash: string } | null>(null);
  const explorer = `https://${network === "mainnet" ? "" : "testnet."}nearblocks.io/txns/`;

  async function pay() {
    setError(null);
    try {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const connector = new NearConnector({ network, features: { signAndSendTransaction: true, [network]: true }, footerBranding: null });
      setBusy("Choose your wallet…");
      const wallet = await connector.connect();
      setBusy(`Approve ${total} in USDC for ${transfers.length === 1 ? "1 task" : `${transfers.length} tasks`} in your wallet…`);
      const outcome = await wallet.signAndSendTransaction({
        receiverId: token,
        actions: transfers.map((t) => ({
          type: "FunctionCall" as const,
          params: {
            methodName: "ft_transfer",
            args: { receiver_id: payTo, amount: t.amount, memo: t.memo },
            // Ten transfers fit under NEAR's 300 Tgas per transaction.
            gas: "25000000000000",
            // NEP-141 asks for exactly 1 yoctoNEAR on ft_transfer.
            deposit: "1",
          },
        })),
      });
      await connector.disconnect(wallet).catch(() => {});
      const txHash = outcome.transaction.hash;
      setBusy("Confirming on NEAR…");
      const done = await fundAgentTasksWithNear(
        transfers.map((t) => t.taskId),
        { txHash, signerId: outcome.transaction.signer_id },
      );
      if ("error" in done) setError(done.error);
      else setResult({ ...done, txHash });
      setBusy(null);
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setError(/reject|cancel|closed/i.test(text) || !text ? "Nothing was sent. Try again when you're ready." : text);
      setBusy(null);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="font-medium text-primary">
          Paid. {result.funded === 1 ? "1 task is" : `${result.funded} tasks are`} funded and being checked; {agentName} sees it on its next check.
        </p>
        <a href={`${explorer}${result.txHash}`} target="_blank" rel="noreferrer" className="w-fit text-primary underline-offset-4 hover:underline">
          The payment on nearblocks
        </a>
        {result.failed.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              {result.failed.length === 1 ? "1 task wasn't" : `${result.failed.length} tasks weren't`} funded: {result.failed[0]!.reason}. Its money is
              in escrow; ask boreal.work to return it.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={pay} disabled={busy !== null} className="h-auto min-h-10 w-fit gap-2 whitespace-normal">
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

/**
 * The owner funds their agent's own NEAR wallet in one approval: USDC for tasks (registering the
 * account with the token first, refunded if it already is), and optionally a little NEAR for the
 * agent's transaction fees. The agent can never spend more than this, on top of its limits here.
 */
export function FundAgentWallet({
  agentName,
  wallet,
}: {
  agentName: string;
  wallet: { account: string; network: "testnet" | "mainnet"; token: string; decimals: number };
}) {
  const [dollars, setDollars] = useState("20");
  const [gas, setGas] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string[] | null>(null);
  const explorer = `https://${wallet.network === "mainnet" ? "" : "testnet."}nearblocks.io/txns/`;

  async function fund() {
    setError(null);
    const cents = Math.round(Number(dollars) * 100);
    if (!Number.isFinite(cents) || cents < 100 || cents > 100_000) {
      setError("Send between $1 and $1,000.");
      return;
    }
    const units = (BigInt(cents) * BigInt(10) ** BigInt(wallet.decimals - 2)).toString();
    try {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const connector = new NearConnector({
        network: wallet.network,
        features: { signAndSendTransactions: true, [wallet.network]: true },
        footerBranding: null,
      });
      setBusy("Choose your wallet…");
      const near = await connector.connect();
      setBusy(`Approve $${(cents / 100).toFixed(2)} in USDC for ${agentName} in your wallet…`);
      const transactions = [
        // 0.1 NEAR also creates an implicit account that has never received anything.
        ...(gas ? [{ receiverId: wallet.account, actions: [{ type: "Transfer" as const, params: { deposit: "100000000000000000000000" } }] }] : []),
        {
          receiverId: wallet.token,
          actions: [
            {
              type: "FunctionCall" as const,
              params: {
                methodName: "storage_deposit",
                args: { account_id: wallet.account, registration_only: true },
                gas: "30000000000000",
                deposit: "1250000000000000000000",
              },
            },
            {
              type: "FunctionCall" as const,
              params: {
                methodName: "ft_transfer",
                args: { receiver_id: wallet.account, amount: units, memo: `boreal: ${agentName}'s task budget` },
                gas: "30000000000000",
                deposit: "1",
              },
            },
          ],
        },
      ];
      const outcomes = await near.signAndSendTransactions({ transactions });
      await connector.disconnect(near).catch(() => {});
      setSent(outcomes.map((o) => o.transaction.hash));
      setBusy(null);
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setError(/reject|cancel|closed/i.test(text) || !text ? "Nothing was sent. Try again when you're ready." : text);
      setBusy(null);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium text-primary">Sent. {agentName} can pay for tasks from its wallet now.</p>
        <p className="flex flex-wrap gap-x-3">
          {sent.map((hash, n) => (
            <a key={hash} href={`${explorer}${hash}`} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
              Transaction {n + 1} on nearblocks
            </a>
          ))}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">USDC</span>
          <span className="flex items-center rounded-md border bg-background px-2">
            $
            <input
              inputMode="decimal"
              value={dollars}
              onChange={(e) => setDollars(e.target.value)}
              aria-label="USDC to send"
              className="h-9 w-20 bg-transparent px-1 tabular-nums outline-none"
            />
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={gas} onChange={(e) => setGas(e.target.checked)} className="accent-primary" />
          Add 0.1 NEAR for its fees
        </label>
      </div>
      <Button onClick={fund} disabled={busy !== null} className="h-auto min-h-10 w-fit gap-2 whitespace-normal">
        <Wallet className="size-4" aria-hidden />
        {busy ?? `Fund ${agentName} with USDC`}
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
