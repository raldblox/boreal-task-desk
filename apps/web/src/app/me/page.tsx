import { POLICY } from "@boreal/core";
import { taskTotal } from "@boreal/desk";
import { CONNECT_MESSAGE } from "@boreal/near";
import { BadgeCheck, BarChart3, Bot, CheckCircle2, ChevronRight, CircleAlert, ExternalLink, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";

import { linkConcordium } from "@/app/actions";
import { ConnectConcordiumAccount, ConnectNear } from "@/components/connect-wallet";
import { type AccountTab, AccountTabs, accountTab } from "@/components/account-tabs";
import { Eyebrow } from "@/components/brand";
import { ConcordiumSignIn } from "@/components/concordium-sign-in";
import { ConcordiumWalletSignIn } from "@/components/concordium-wallet-sign-in";
import { TaskCard } from "@/components/task-card";
import { DevWallet } from "@/components/worker-forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { attributeLabel, posterStatus, usd, when, workerHandle } from "@/lib/format";
import { NETWORK, SITE } from "@/content/agent-guide";
import { gatedEnv, getAddons } from "@/server/addons";
import { getConcordium, getDesk, paymentRails } from "@/server/desk";
import { getIdAppVerifier } from "@/server/id-app";
import { kickMonitorSoon } from "@/server/monitor";
import { paypalAccounts, paypalLoginEnabled } from "@/server/paypal-accounts";
import { posterFromSession } from "@/server/poster";
import { workerFromSession } from "@/server/session";

const ACTIVE = new Set(["claimed", "submitted", "passed", "failed", "disputed"]);

/** Where a person sets up the wallets an integration needs: accounts they hold themselves, never boreal. */
// Meteor makes free accounts on mainnet and testnet and signs messages, so the Connect button offers it.
const NEAR_WALLET = process.env.NEAR_WALLET_URL || "https://wallet.meteorwallet.app";
const CONCORDIUM_WALLET =
  process.env.CONCORDIUM_WALLET_URL || "https://chromewebstore.google.com/detail/concordium-wallet/mnnkpffndmickbiakofclnpoiajlegmg";

/** How a worker adds Concordium ID here: the ID App and Wallet for Web, or the development wallet locally. */
async function AddConcordium() {
  if (getIdAppVerifier()) {
    const network = gatedEnv().CONCORDIUM_NETWORK === "mainnet" ? "mainnet" : "testnet";
    return (
      <div className="flex flex-col gap-3">
        <ConcordiumSignIn projectId={gatedEnv().NEXT_PUBLIC_REOWN_PROJECT_ID!} network={network} next="/me?concordium=added" link />
        <ConcordiumWalletSignIn next="/me?concordium=added" link />
      </div>
    );
  }
  if (getConcordium() && gatedEnv().CONCORDIUM_MODE === "dev") {
    const request = await getDesk().workerProofRequest([]);
    return <DevWallet action={linkConcordium} request={JSON.stringify(request)} submitLabel="Connect Concordium ID" />;
  }
  const reason = getAddons().concordium.parts.find((p) => p.id === "id")?.reason;
  return (
    <p className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      Concordium ID can&apos;t be added here yet{reason ? `: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : "."}
    </p>
  );
}

/** Who the desk knows you as: a pseudonym, the identities that sign you in, and what you proved. */
async function Identity() {
  const worker = await workerFromSession();
  if (!worker) redirect("/signin");
  const profile = await getDesk().getWorker(worker);
  if (!profile) redirect("/signin");
  const since = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(profile.createdAt);
  const paypalLogin = paypalLoginEnabled();
  // On live money, a worker with only PayPal claims once PayPal has verified their account.
  const needsVerifiedPayPal = NETWORK === "mainnet" && !profile.hasConcordium && !profile.paypalVerified;
  const concordiumId = getAddons().on("concordium");
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
          <BadgeCheck className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold">{profile.testMode ? "Test worker" : "Your identities"}</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{workerHandle(profile.pseudonym)}</span> · worker since {since}
          </p>
        </div>
      </div>

      {profile.testMode ? (
        <div className="flex flex-wrap gap-2">
          {Object.entries(profile.provenAttributes).map(([attribute, value]) => (
            <Badge key={attribute} variant="outline">
              {attributeLabel({ attribute, value })}
            </Badge>
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y rounded-xl border">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <Wallet className="size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">PayPal</p>
              <p className="text-sm text-muted-foreground">
                {profile.hasPayPal
                  ? profile.paypalVerified
                    ? "Signs you in. Verified by PayPal."
                    : "Signs you in. PayPal hasn't verified this account."
                  : "Sign in with PayPal and get paid there."}
              </p>
            </div>
            {profile.hasPayPal ? (
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="size-3.5 text-primary" /> Connected
              </Badge>
            ) : (
              paypalLogin && (
                // A route handler that redirects to PayPal, so a full navigation, not <Link>.
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                <a href="/paypal/login" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Add PayPal
                </a>
              )
            )}
          </div>
          {profile.hasConcordium && (
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <ShieldCheck className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Concordium ID</p>
                  <p className="text-sm text-muted-foreground">
                    {concordiumId
                      ? "Signs you in, and proves what tasks ask for."
                      : "Added earlier. The Concordium integration is off on this site, so it isn't used here."}
                  </p>
                </div>
                <Badge variant={concordiumId ? "default" : "outline"}>Verified by Concordium</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(profile.provenAttributes).map(([attribute, value]) => (
                  <Badge key={attribute} variant="outline">
                    {attributeLabel({ attribute, value })}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {needsVerifiedPayPal && (
        <Alert>
          <AlertDescription>
            To claim tasks, verify your account with PayPal and log in again{concordiumId && getAddons().ready("concordium", "id") ? ", or add Concordium ID under Integrations" : ""}.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">Your worker ID</p>
        <code className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">{profile.pseudonym}</code>
        <p className="text-xs text-muted-foreground">
          {profile.testMode
            ? "Test workers see and do only test tasks."
            : `A one-way code made from the identity you first signed in with. It never changes, and it can't be turned back into who you are. Each PayPal account${concordiumId ? " and Concordium ID" : ""} belongs to one boreal account, and accounts are never merged.`}
        </p>
      </div>
    </section>
  );
}

/** What this worker has earned: paid, settling, and passes still inside their objection window. */
async function Earnings() {
  const worker = await workerFromSession();
  if (!worker) return null;
  // Someone is looking at their money: move anything waiting (payouts, closed windows) now.
  after(kickMonitorSoon);
  const earnings = await getDesk().getWorkerEarnings(worker);
  const rows = [
    {
      label: "Paid to you",
      money: earnings.real,
      note:
        NETWORK === "testnet"
          ? "Paid to your PayPal sandbox account (or a wallet you connected under Integrations): practice money, never real."
          : "Real money, paid to your PayPal account (or a wallet you connected under Integrations).",
    },
    { label: "Test money", money: earnings.test, note: "From test tasks. Not real money." },
  ].filter((r, i) => i === 0 || r.money.paid + r.money.settling + r.money.upcoming > 0);
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      {rows.map(({ label, money, note }) => (
        <div key={label} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tabular-nums">{usd(money.paid)}</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">On its way</dt>
              <dd className="font-medium tabular-nums">{usd(money.settling)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Held for you</dt>
              <dd className="font-medium tabular-nums">{usd(money.upcoming)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            {note} A passed task is held for {POLICY.objectionWindowMs / 3_600_000} hours, then paid. It&apos;s paid
            sooner if the requester accepts early.
          </p>
        </div>
      ))}
    </section>
  );
}

/**
 * A link to the person's money report, only once they have enough tasks for it to say something:
 * funded tasks they or their agents posted, or tasks they were paid for. Everyone else sees nothing.
 */
async function InsightsLink() {
  const worker = await workerFromSession();
  if (worker?.role !== "worker") return null;
  const available = await getDesk()
    .insightsAvailable(worker)
    .catch(() => ({ spending: false, earnings: false }));
  if (!available.spending && !available.earnings) return null;
  const links = [
    available.spending && { href: "/me/insights", label: "Spending" },
    available.earnings && { href: "/me/insights?view=earnings", label: "Earnings" },
  ].filter((l): l is { href: string; label: string } => !!l);
  return (
    <section className="flex items-center gap-3 rounded-2xl border bg-card p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
        <BarChart3 className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Your money, in charts</p>
        <p className="text-sm text-muted-foreground">Where every dollar is, by week and by task. Best on a computer.</p>
      </div>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {l.label}
        </Link>
      ))}
    </section>
  );
}

/** Where passed tasks pay out on PayPal (never on-chain). Integration rails are set up under Integrations. */
async function Payouts() {
  const worker = await workerFromSession();
  if (!worker) redirect("/signin");
  const profile = await getDesk().getWorker(worker);
  if (!profile || profile.testMode) return null;
  const rails = paymentRails();
  if (!rails.includes("paypal")) return null;
  const paypalLogin = paypalLoginEnabled();
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Getting paid</h2>
        <p className="text-sm text-muted-foreground">Passed tasks pay out here the moment they&apos;re final.</p>
      </div>
      <div className="flex flex-col divide-y rounded-xl border">
        {(
          <div className="flex items-center gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
              <Wallet className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">PayPal</p>
              <p className="truncate text-sm text-muted-foreground">
                {profile.paypalEmail ?? (paypalLogin ? "Connect to get paid for PayPal tasks" : "PayPal payouts open soon on this site")}
              </p>
            </div>
            {profile.paypalEmail && (
              <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
                <CheckCircle2 className="size-3.5 text-primary" /> Connected
              </Badge>
            )}
            {/* Log in with PayPal sets the payout, and a worker has one PayPal account: no "Change". */}
            {paypalLogin && !profile.hasPayPal && (
              // A route handler that redirects to PayPal, so a full navigation, not <Link>.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a href="/paypal/login" className={buttonVariants({ size: "sm" })}>
                Connect
              </a>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Used only to pay you. Agents never see it, and nothing about it goes on-chain.
      </p>
    </section>
  );
}

function WalletLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
      {children} <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

type ConnectionState = "connected" | "ready" | "unavailable";

const STATE_LOOK: Record<ConnectionState, { label: string; className: string }> = {
  connected: { label: "Connected", className: "bg-primary-soft text-primary-soft-foreground" },
  ready: { label: "Not connected", className: "bg-muted text-muted-foreground" },
  unavailable: { label: "Not available here yet", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};

function StatePill({ state }: { state: ConnectionState }) {
  const look = STATE_LOOK[state];
  return <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium ${look.className}`}>{look.label}</span>;
}

/**
 * One integration: what it gives you, how connecting works, then each thing you connect, with
 * its state and its Connect button. Nothing is typed in: wallets hand over the account.
 */
function IntegrationCard({
  mark,
  name,
  tagline,
  state,
  benefits,
  steps,
  children,
  footnote,
}: {
  mark: string;
  name: string;
  tagline: string;
  state: ConnectionState;
  benefits: React.ReactNode[];
  steps: React.ReactNode[];
  children: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border bg-card">
      <header className="flex items-start gap-4 p-6 pb-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-foreground text-lg font-semibold text-background">
          {mark}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{name}</h3>
            <StatePill state={state} />
          </div>
          <p className="text-sm text-muted-foreground">{tagline}</p>
        </div>
      </header>
      <div className="grid gap-6 px-6 pb-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">What you get</p>
          <ul className="flex flex-col gap-2">
            {benefits.map((benefit, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">How it works</p>
          <ol className="flex flex-col gap-2">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold tabular-nums">{i + 1}</span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="flex flex-col divide-y border-t bg-muted/30">{children}</div>
      {footnote && <p className="border-t px-6 py-3 text-xs text-muted-foreground">{footnote}</p>}
    </article>
  );
}

/** One thing to connect inside an integration: what it's for, then Connected (with the account) or its Connect button. */
function Connection({
  icon: Icon,
  title,
  purpose,
  state,
  connectedAs,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  purpose: string;
  state: ConnectionState;
  connectedAs?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 px-6 py-5">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">{title}</h4>
            <StatePill state={state} />
          </div>
          <p className="text-sm text-muted-foreground">{purpose}</p>
          {connectedAs && <div className="mt-1 text-sm">{connectedAs}</div>}
        </div>
      </div>
      {children && <div className="sm:pl-8">{children}</div>}
    </section>
  );
}

/**
 * Integrations beyond PayPal: what each one gives you, how connecting it works, and a Connect
 * button for each part. Only the integrations this site switched on (BOREAL_ADDONS) are offered;
 * nothing here is needed to work or post with PayPal.
 */
async function Integrations() {
  const worker = await workerFromSession();
  if (!worker) redirect("/signin");
  const profile = await getDesk().getWorker(worker);
  if (!profile || profile.testMode) return null;
  const addons = getAddons();
  const rails = paymentRails();
  const on = (["concordium", "near"] as const).filter((id) => addons.on(id));
  const reason = (id: "concordium" | "near", part: string) =>
    addons[id].parts.find((p) => p.id === part)?.reason?.replace(/\.$/, "") ?? "it isn't set up on this site";
  const idReady = getIdAppVerifier() !== null || (getConcordium() !== null && gatedEnv().CONCORDIUM_MODE === "dev");
  const concordiumRail = rails.includes("concordium");
  const nearRail = rails.includes("near");
  const proven = Object.entries(profile.provenAttributes);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          {on.length === 0
            ? "This site runs on PayPal alone: you sign in, work and get paid with PayPal. No integrations are switched on here."
            : "boreal runs on PayPal. Connect these to take more kinds of tasks and get paid in more ways. They're optional, and each one connects with a button: you never type an address."}
        </p>
      </div>

      {addons.on("concordium") && (
        <IntegrationCard
          mark="C"
          name="Concordium"
          tagline="Prove facts about yourself without sharing who you are, and get paid in tokens."
          state={profile.hasConcordium || profile.payoutAddress ? "connected" : idReady ? "ready" : "unavailable"}
          benefits={[
            "Take tasks that ask for proven age (18+) or country of residence",
            "The Verified by Concordium badge, so requesters know a real, verified person did the work",
            <>
              Higher posting limits: up to {usd(POLICY.maxTaskBudget)} a task instead of {usd(POLICY.unverifiedTaskBudget)}
            </>,
            "Sign in with Concordium ID as well as PayPal",
            ...(concordiumRail ? ["Get paid in tokens, to a Concordium account you hold"] : []),
          ]}
          steps={[
            <>
              Get the Concordium ID App on your phone, or the{" "}
              <WalletLink href={CONCORDIUM_WALLET}>Concordium Wallet for Web</WalletLink>, and create your identity there (once, with an ID
              document).
            </>,
            "Press Connect and approve the request. Your app sends a zero-knowledge proof: that you're 18+, your country, and a one-way code of your document number. Never your name, birthday or document photos.",
            "Your badge shows at once, and tasks that need it open up for you.",
          ]}
          footnote="Nothing personal goes on-chain: boreal anchors only salted hashes of what happened to a task."
        >
          <Connection
            icon={ShieldCheck}
            title="Concordium ID"
            purpose="Your verified identity: the badge, proven attributes and sign-in."
            state={profile.hasConcordium ? "connected" : idReady ? "ready" : "unavailable"}
            connectedAs={
              profile.hasConcordium ? (
                <div className="flex flex-wrap gap-1.5">
                  <Badge>Verified by Concordium</Badge>
                  {proven.map(([attribute, value]) => (
                    <Badge key={attribute} variant="secondary">
                      {attributeLabel({ attribute, value })}
                    </Badge>
                  ))}
                </div>
              ) : !idReady ? (
                <span className="text-amber-700 dark:text-amber-400">Can&apos;t be connected here yet: {lowerFirst(reason("concordium", "id"))}.</span>
              ) : undefined
            }
          >
            {!profile.hasConcordium && idReady && <AddConcordium />}
          </Connection>
          <Connection
            icon={Wallet}
            title="Concordium account for token payouts"
            purpose="Where tasks that pay in tokens send your money. Your own account: boreal never holds it."
            state={profile.payoutAddress ? "connected" : concordiumRail ? "ready" : "unavailable"}
            connectedAs={
              profile.payoutAddress ? (
                <code className="break-all text-xs">{profile.payoutAddress}</code>
              ) : !concordiumRail ? (
                <span className="text-muted-foreground">Token payouts aren&apos;t offered on this site yet.</span>
              ) : undefined
            }
          >
            {concordiumRail && (
              <ConnectConcordiumAccount label={profile.payoutAddress ? "Connect a different account" : "Connect Concordium Wallet"} />
            )}
          </Connection>
        </IntegrationCard>
      )}

      {addons.on("near") && (
        <IntegrationCard
          mark="N"
          name="NEAR"
          tagline="Get paid in USDC, a dollar stablecoin, straight to your own NEAR wallet."
          state={profile.nearAccount ? "connected" : nearRail ? "ready" : "unavailable"}
          benefits={[
            "Take tasks that pay in USDC on NEAR, including ones posted by agents on NEAR Agent Market",
            "Paid to your own wallet the moment your work passes review",
            "1 USDC is worth about 1 US dollar; keep it, send it, or change it in your wallet",
            "Your wallet stays yours: boreal never holds your keys or your money",
          ]}
          steps={[
            <>
              Have a NEAR wallet, such as <WalletLink href={NEAR_WALLET}>Meteor</WalletLink>, Intear or HOT. Creating one is free and takes
              about 2 minutes.
            </>,
            "Press Connect, pick your wallet and sign a short message. It's free: no transaction, no fee. It proves the account is yours.",
            "Tasks that pay in USDC on NEAR can now be claimed, and pay out to that account.",
          ]}
        >
          <Connection
            icon={Wallet}
            title="NEAR wallet"
            purpose="Where tasks that pay in USDC on NEAR send your money."
            state={profile.nearAccount ? "connected" : nearRail ? "ready" : "unavailable"}
            connectedAs={
              profile.nearAccount ? (
                <code className="break-all text-xs">{profile.nearAccount}</code>
              ) : !nearRail ? (
                <span className="text-amber-700 dark:text-amber-400">Can&apos;t be connected here yet: {lowerFirst(reason("near", "rail"))}.</span>
              ) : undefined
            }
          >
            {nearRail && (
              <ConnectNear
                network={gatedEnv().NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet"}
                recipient={new URL(SITE).host}
                message={CONNECT_MESSAGE}
                label={profile.nearAccount ? "Connect a different wallet" : "Connect NEAR wallet"}
              />
            )}
          </Connection>
        </IntegrationCard>
      )}
    </div>
  );
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The agents this person owns, if any: linking happens at /link when an agent asks. */
async function MyAgents() {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") return null;
  const agents = await getDesk()
    .listOwnerAgents(worker.workerId)
    .catch(() => []); // testers can't own agents
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed bg-card/60 p-6">
        <p className="font-medium">No agents yet</p>
        <p className="text-sm text-muted-foreground">
          An AI agent asks you for a key, and you approve it here with spending limits. Connect your PayPal once and it funds
          tasks without asking each time.
        </p>
        <Link href="/agents" className={buttonVariants({ variant: "outline", size: "sm", className: "mt-1" })}>
          Set up an agent
        </Link>
      </div>
    );
  }
  // Offer Connect PayPal only when PayPal lets boreal save accounts; otherwise each task sends a checkout link.
  const paypal = paymentRails().includes("paypal") && ((await paypalAccounts()?.canSaveAccounts()) ?? false);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Your agents · {agents.length}</h2>
      {agents.map((agent) => (
        <div key={agent.id} className="flex items-center gap-3 rounded-2xl border bg-card p-4">
          <Bot className="size-5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 truncate font-medium">{agent.name}</p>
          {agent.badgeVerifiedAt && getAddons().on("concordium") && <Badge>Verified by Concordium</Badge>}
          {agent.testMode && <Badge variant="outline">Test money</Badge>}
          {paypal &&
            (agent.paypalConnected ? (
              <Badge variant="outline">PayPal connected</Badge>
            ) : (
              <a href={`/paypal/save/${agent.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Connect PayPal
              </a>
            ))}
        </div>
      ))}
    </section>
  );
}

/** Tasks this person posted themselves, on the website: each with where it stands and what's next. */
async function PostedTasks() {
  const poster = await posterFromSession();
  if (!poster) redirect("/signin");
  const tasks = poster.requester ? await getDesk().listTasks(poster.requester, { limit: 50 }) : [];
  // Needing the poster comes first: paying, then reviewing.
  const waiting = tasks.filter((t) => t.status === "awaiting_funding" || (t.status === "submitted" && t.reviewMode === "requester")).length;
  return (
    <section id="posted" className="flex scroll-mt-20 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Tasks you posted{tasks.length > 0 ? ` · ${tasks.length}` : ""}
          {waiting > 0 && <span className="text-primary"> · {waiting} need you</span>}
        </h2>
        <Link href="/post" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Post a task
        </Link>
      </div>
      {tasks.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed bg-card/60 p-6">
          <p className="font-medium">You haven&apos;t posted a task</p>
          <p className="text-sm text-muted-foreground">
            Need something done in the physical world? Post it, and pay only if the result passes your checks.
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y rounded-2xl border bg-card">
          {tasks.map((task) => {
            const status = posterStatus(task);
            return (
              <Link
                key={task.id}
                href={`/me/posted/${task.id}`}
                className="flex items-center gap-3 p-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/40"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate font-medium">{task.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {usd(taskTotal(task))} · posted {when(task.createdAt)}
                  </p>
                </div>
                <Badge variant={status.tone} className="shrink-0">
                  {status.label}
                </Badge>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

async function MyTasks() {
  const worker = await workerFromSession();
  if (!worker) redirect("/signin");
  const tasks = await getDesk().listWorkerTasks(worker);
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed bg-card/60 p-8">
        <p className="font-semibold">You haven&apos;t claimed a task yet</p>
        <p className="text-sm text-muted-foreground">Claimed tasks show up here until they&apos;re paid.</p>
        <Link href="/tasks" className={buttonVariants({ className: "mt-1" })}>
          Find a task
        </Link>
      </div>
    );
  }
  const active = tasks.filter((t) => ACTIVE.has(t.status));
  const done = tasks.filter((t) => !ACTIVE.has(t.status));
  return (
    <div className="flex flex-col gap-10">
      {[
        { title: "In progress", list: active },
        { title: "Finished", list: done },
      ]
        .filter((g) => g.list.length > 0)
        .map((group) => (
          <section key={group.title} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {group.title} · {group.list.length}
            </h2>
            {group.list.map((task) => (
              <TaskCard key={task.id} task={task} showStatus />
            ))}
          </section>
        ))}
    </div>
  );
}

const PAYPAL_NOTICES: Record<string, string> = {
  saved: "PayPal connected. Your agent now funds tasks from it without asking you each time.",
  connected: "PayPal connected. It signs you in, and passed tasks on PayPal pay out to it.",
  taken:
    "That PayPal account already belongs to another boreal account. Sign out and log in with PayPal to use it; boreal never merges accounts.",
  different: "Your account already has a different PayPal account, and boreal never swaps one for another.",
  cancelled: "Nothing changed: you cancelled on PayPal.",
  failed: "PayPal didn't finish connecting. Try again.",
  unavailable:
    "PayPal can't save accounts for boreal yet, so your agent will send you a PayPal link to approve for each task instead.",
  off: "PayPal isn't switched on here.",
  "not-yours": "That agent isn't yours.",
};

async function PayPalNotice({ searchParams }: { searchParams: Promise<{ paypal?: string; concordium?: string }> }) {
  const params = await searchParams;
  const notice =
    params.concordium === "added"
      ? "Concordium ID added. You carry the Verified by Concordium badge and can claim tasks that need what you proved."
      : PAYPAL_NOTICES[params.paypal ?? ""];
  if (!notice) return null;
  return (
    <Alert>
      <AlertDescription>{notice}</AlertDescription>
    </Alert>
  );
}

type SearchParams = Promise<{ tab?: string; paypal?: string; concordium?: string }>;

/** The tab bar, with a count on the tabs where something waits for this person. */
async function Tabs({ active }: { active: AccountTab }) {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") return <AccountTabs active={active} />;
  const desk = getDesk();
  const [mine, poster] = await Promise.all([desk.listWorkerTasks(worker).catch(() => []), posterFromSession()]);
  const posted = poster?.requester ? await desk.listTasks(poster.requester, { limit: 50 }).catch(() => []) : [];
  return (
    <AccountTabs
      active={active}
      counts={{
        work: mine.filter((t) => t.status === "claimed").length,
        posted: posted.filter((t) => t.status === "awaiting_funding" || (t.status === "submitted" && t.reviewMode === "requester")).length,
      }}
    />
  );
}

const SECTION_FALLBACK = <div className="h-40 animate-pulse rounded-2xl bg-muted" />;

/** One tab's sections. */
function TabPanel({ tab }: { tab: AccountTab }) {
  switch (tab) {
    case "overview":
      return (
        <>
          <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-muted" />}>
            <Identity />
          </Suspense>
          <Suspense fallback={<div className="h-36 animate-pulse rounded-2xl bg-muted" />}>
            <Earnings />
          </Suspense>
          <Suspense fallback={null}>
            <InsightsLink />
          </Suspense>
        </>
      );
    case "work":
      return (
        <Suspense fallback={SECTION_FALLBACK}>
          <MyTasks />
        </Suspense>
      );
    case "posted":
      return (
        <Suspense fallback={SECTION_FALLBACK}>
          <PostedTasks />
        </Suspense>
      );
    case "agents":
      return (
        <Suspense fallback={SECTION_FALLBACK}>
          <MyAgents />
        </Suspense>
      );
    case "payouts":
      return (
        <Suspense fallback={SECTION_FALLBACK}>
          <Payouts />
        </Suspense>
      );
    case "integrations":
      return (
        <Suspense fallback={SECTION_FALLBACK}>
          <Integrations />
        </Suspense>
      );
  }
}

async function Account({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // Coming back from PayPal or Concordium lands on the tab that changed.
  const tab = accountTab(
    params.tab ??
      (params.concordium === "added"
        ? "integrations"
        : params.paypal === "saved" || params.paypal === "not-yours" || params.paypal === "unavailable"
          ? "agents"
          : undefined),
  );
  return (
    <>
      <Suspense fallback={<AccountTabs active={tab} />}>
        <Tabs active={tab} />
      </Suspense>
      <PayPalNotice searchParams={searchParams} />
      <div className="flex flex-col gap-6">
        <TabPanel tab={tab} />
      </div>
    </>
  );
}

export default function MyAccountPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 md:py-14">
      <div className="flex flex-col gap-3">
        <Eyebrow>Your account</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight">My account</h1>
      </div>
      <Suspense fallback={<AccountTabs active="overview" />}>
        <Account searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
