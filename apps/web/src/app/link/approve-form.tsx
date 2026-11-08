"use client";

import { POLICY } from "@boreal/core";
import { BadgeCheck } from "lucide-react";
import { useActionState, useState } from "react";

import type { LinkActionState } from "@/app/link/actions";
import {
  detectWallet,
  STORE_URL,
} from "@/components/concordium-wallet-sign-in";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Action = (
  prev: LinkActionState,
  form: FormData,
) => Promise<LinkActionState>;

interface Props {
  action: Action;
  agentName: string;
  /** The message the badge owner signs, with {badge} where the badge goes. */
  proofTemplate: string;
  myAgents: { id: string; name: string }[];
  maxTaskBudget: number;
  maxDailySpend: number;
  /** The Concordium add-on is on: owners can prove their agent's Verified by Concordium badge. */
  badges: boolean;
  /** What unlocks the full limits here, as a phrase ("once your PayPal account is verified by PayPal"). */
  verifiedBy: string;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

export function ApproveLinkForm({
  action,
  agentName,
  proofTemplate,
  myAgents,
  maxTaskBudget,
  maxDailySpend,
  badges,
  verifiedBy,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [badge, setBadge] = useState("");
  const [proof, setProof] = useState<{
    badge: string;
    account: string;
    signature: string;
  } | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const signedFor = proof && proof.badge === badge.trim() ? proof : null;

  async function signBadge() {
    setProofError(null);
    setSigning(true);
    try {
      const wallet = await detectWallet();
      if (!wallet) {
        setProofError("missing");
        return;
      }
      const account = await wallet.connect();
      if (!account) throw new Error("The wallet didn't share an account.");
      const message = proofTemplate.replace("{badge}", badge.trim());
      const signature = await wallet.signMessage(account, message);
      setProof({
        badge: badge.trim(),
        account,
        signature: JSON.stringify(signature),
      });
    } catch (e) {
      setProofError(
        e instanceof Error && e.message ? e.message : "The wallet didn't sign.",
      );
    } finally {
      setSigning(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Agent name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={agentName}
          maxLength={80}
          required
        />
      </div>

      {myAgents.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="replaceAgentId">Is this one of your agents?</Label>
          <select
            id="replaceAgentId"
            name="replaceAgentId"
            defaultValue="new"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="new">No, it&apos;s a new agent</option>
            {myAgents.map((a) => (
              <option key={a.id} value={a.id}>
                Yes: {a.name} (gets a new key; its old one stops working)
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="maxTaskBudget">Most it can pay per task (USD)</Label>
          <Input
            id="maxTaskBudget"
            name="maxTaskBudget"
            inputMode="decimal"
            defaultValue={dollars(Math.min(1_000, maxTaskBudget))}
            required
          />
          <p className="text-xs text-muted-foreground">
            Up to ${dollars(maxTaskBudget)} {verifiedBy}; $
            {dollars(POLICY.unverifiedTaskBudget)} until then.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="maxDailySpend">Most it can spend per day (USD)</Label>
          <Input
            id="maxDailySpend"
            name="maxDailySpend"
            inputMode="decimal"
            defaultValue={dollars(Math.min(5_000, maxDailySpend))}
            required
          />
          <p className="text-xs text-muted-foreground">
            Up to ${dollars(maxDailySpend)} {verifiedBy}; $
            {dollars(POLICY.unverifiedDailySpend)} until then.
          </p>
        </div>
      </div>

      {badges && (
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4">
          <div className="flex items-center gap-2">
            <BadgeCheck className="size-4 text-primary" />
            <p className="text-sm font-medium">
              Verified by Concordium badge (optional, Concordium add-on)
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            If your agent is in Concordium&apos;s Agent Registry, enter its
            badge and sign with the Concordium Wallet for Web account that owns
            it (on mainnet). Workers then see its tasks as posted by a verified
            agent, and it can use your full limits.
          </p>
          <Label htmlFor="badge" className="sr-only">
            Agent Registry badge
          </Label>
          <Input
            id="badge"
            name="badge"
            value={badge}
            onChange={(e) => setBadge(e.target.value)}
            placeholder="Badge, e.g. Mf22soLh1NuZYFgBK8iSs"
            autoComplete="off"
            spellCheck={false}
          />
          {badge.trim() &&
            (signedFor ? (
              <p className="text-sm text-primary">
                Signed by {signedFor.account.slice(0, 6)}…
                {signedFor.account.slice(-4)}
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={signBadge}
                disabled={signing}
                className="w-full sm:w-fit"
              >
                {signing
                  ? "Waiting for the wallet…"
                  : "Sign with Concordium Wallet"}
              </Button>
            ))}
          {proofError === "missing" ? (
            <p className="text-sm text-muted-foreground">
              The Concordium Wallet for Web isn&apos;t installed here.{" "}
              <a
                href={STORE_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline"
              >
                Get it for Chrome
              </a>
              .
            </p>
          ) : (
            proofError && (
              <p className="text-sm text-destructive">{proofError}</p>
            )
          )}
          <input
            type="hidden"
            name="badgeAccount"
            value={signedFor?.account ?? ""}
          />
          <input
            type="hidden"
            name="badgeSignature"
            value={signedFor?.signature ?? ""}
          />
        </div>
      )}

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        size="lg"
        disabled={pending || (!!badge.trim() && !signedFor)}
        className="h-11 text-base"
      >
        {pending ? "Approving…" : "Approve and give it a key"}
      </Button>
    </form>
  );
}
