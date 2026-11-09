import type { Metadata } from "next";
import { POLICY } from "@boreal/core";
import { taskTotal } from "@boreal/desk";
import { CONNECT_MESSAGE } from "@boreal/near";
import { BadgeCheck, BarChart3, Bot, CheckCircle2, ChevronRight, CircleAlert, ExternalLink, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";

import { linkConcordium } from "@/app/actions";
import { ConcordiumLogo, NearLogo } from "@/components/chain-logos";
import { ConnectConcordiumAccount, ConnectNear } from "@/components/connect-wallet";
import { type AccountTab, AccountTabs, accountTab } from "@/components/account-tabs";
import { BlockHeading, Container, Cta, EmptyState, LinkTile, MoreLink, PageHero } from "@/components/page";
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

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };


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
      <div className="flex flex-wrap items-start gap-2 [&_button]:min-h-10 [&_button]:w-auto [&_button]:text-sm [&>div]:items-start">
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
    <section className="flex flex-col gap-6 rounded-2xl border bg-card p-6 md:p-8">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
          <BadgeCheck className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-2xl font-light tracking-[-0.025em]">{profile.testMode ? "Test worker" : "Sign-in and identity"}</h2>
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
          <div className="flex flex-wrap items-center gap-4 p-5">
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
                <a href="/paypal/login" className={buttonVariants({ className: "group gap-2" })}>
                  Add PayPal
                  <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              )
            )}
          </div>
          {(profile.nearAccount || getAddons().ready("near", "rail")) && (
            <div className="flex flex-wrap items-center gap-4 p-5">
              <NearLogo className="size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">NEAR wallet</p>
                <p className="truncate text-sm text-muted-foreground">
                  {profile.nearAccount ? <span className="font-mono text-xs">{profile.nearAccount}</span> : "Get paid in USDC to your own wallet."}
                </p>
              </div>
              {profile.nearAccount ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="size-3.5 text-primary" /> USDC payouts
                </Badge>
              ) : (
                <Link href="/me?tab=integrations" className={buttonVariants({ variant: "outline" })}>
                  Connect
                </Link>
              )}
            </div>
          )}
          {profile.hasConcordium && (
            <div className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center gap-4">
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
            : `A one-way code made from the identity you first signed in with. It never changes, and it can't be turned back into who you are. Each PayPal account${concordiumId ? " and Concordium ID" : ""} belongs to one boreal.work account, and accounts are never merged.`}
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
  const RAIL_LABEL = { paypal: "PayPal", near: "USDC on NEAR", concordium: "Concordium tokens" } as const;
  const perRail = (Object.entries(earnings.byRail) as [keyof typeof RAIL_LABEL, { paid: number; settling: number; upcoming: number }][]).filter(
    ([, m]) => m.paid + m.settling + m.upcoming > 0,
  );
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
    <section className="flex flex-col gap-4">
      {rows.map(({ label, money, note }) => (
        <div key={label} className="flex flex-col gap-5 rounded-2xl border bg-card p-6 md:p-8">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-5xl font-light tracking-[-0.04em] tabular-nums">{usd(money.paid)}</p>
          {label === "Paid to you" && perRail.length > 1 && (
            <ul className="flex flex-wrap gap-2">
              {perRail.map(([rail, m]) => (
                <li key={rail}>
                  <Badge variant="secondary">
                    {RAIL_LABEL[rail]} {usd(m.paid)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <dl className="grid grid-cols-2 gap-4 border-t pt-4 text-sm">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">On its way</dt>
              <dd className="text-lg tabular-nums">{usd(money.settling)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Held for you</dt>
              <dd className="text-lg tabular-nums">{usd(money.upcoming)}</dd>
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
    available.spending && {
      href: "/me/insights",
      label: "Spending",
      icon: BarChart3,
      description: "What you and your agents spent, where every dollar is now, by week and by task.",
    },
    available.earnings && {
      href: "/me/insights?view=earnings",
      label: "Earnings",
      icon: Wallet,
      description: "What you were paid and what's on its way, by week and by task.",
    },
  ].filter((l) => !!l);
  return (
    <section className="flex flex-col gap-5">
      <BlockHeading title="Your money, in charts" description="Interactive reports. Best on a computer." />
      <div className="grid gap-4 md:grid-cols-2">
        {links.map((l) => (
          <LinkTile key={l.href} href={l.href} title={l.label} description={l.description} icon={l.icon} />
        ))}
      </div>
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
  const near = rails.includes("near");
  return (
    <section className="flex flex-col gap-6">
      <BlockHeading title="Getting paid" description="Passed tasks pay out here the moment they're final." />
      <div className="flex flex-col divide-y rounded-2xl border bg-card">
        {(
          <div className="flex items-center gap-4 p-6">
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
              <a href="/paypal/login" className={buttonVariants({ className: "group gap-2" })}>
                Connect PayPal
                <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            )}
          </div>
        )}
        {near && (
          <div className="flex items-center gap-4 p-6">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-background">
              <NearLogo className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">USDC on NEAR</p>
              <p className="truncate text-sm text-muted-foreground">
                {profile.nearAccount ? <span className="font-mono text-xs">{profile.nearAccount}</span> : "For tasks that pay in USDC"}
              </p>
            </div>
            {profile.nearAccount ? (
              <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
                <CheckCircle2 className="size-3.5 text-primary" /> Connected
              </Badge>
            ) : (
              <Link href="/me?tab=integrations" className={buttonVariants({ variant: "outline" })}>
                Connect
              </Link>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Used only to pay you. Agents never see your PayPal, and nothing personal goes on-chain.
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

/** One integration, led by what it gives you: its headline feature, what it unlocks, and one action. */
function FeatureCard({
  logo,
  title,
  by,
  connected,
  gives,
  account,
  hint,
  children,
}: {
  logo: React.ReactNode;
  title: string;
  by: string;
  connected: boolean;
  gives: string[];
  /** Once connected: who it's connected as. */
  account?: React.ReactNode;
  /** Before connecting: how to get set up. */
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-5 rounded-2xl border bg-card p-5 md:p-6">
      <header className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl border bg-background text-foreground">
          {logo}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{by}</p>
        </div>
        {connected && (
          <span className="flex items-center gap-1 text-sm font-medium text-primary">
            <CheckCircle2 className="size-4" aria-hidden /> On
          </span>
        )}
      </header>
      <ul className="flex flex-col gap-2">
        {gives.map((g) => (
          <li key={g} className="flex gap-2 text-sm">
            <CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${connected ? "text-primary" : "text-muted-foreground"}`} aria-hidden />
            <span>{g}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm text-muted-foreground">{connected ? account : hint}</div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
    </article>
  );
}

/**
 * Integrations, led by what each one gives: Concordium for private ID verification, NEAR for USDC
 * payouts and private AI review. Only the integrations this site switched on (BOREAL_ADDONS) are
 * shown; nothing here is needed to work or post with PayPal.
 */
async function Integrations() {
  const worker = await workerFromSession();
  if (!worker) redirect("/signin");
  const profile = await getDesk().getWorker(worker);
  if (!profile || profile.testMode) return null;
  const addons = getAddons();
  const rails = paymentRails();
  const idReady = getIdAppVerifier() !== null || (getConcordium() !== null && gatedEnv().CONCORDIUM_MODE === "dev");
  const concordiumOn = addons.on("concordium");
  const tokenPayouts = concordiumOn && rails.includes("concordium");
  const nearOn = addons.ready("near", "rail");
  const privateReview = addons.ready("near", "privateReview");
  const proven = Object.entries(profile.provenAttributes);

  if (!concordiumOn && !nearOn) {
    return <p className="text-sm text-muted-foreground">This site runs on PayPal alone.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {concordiumOn && (
        <FeatureCard
          logo={<ConcordiumLogo className="size-6" />}
          title="Private ID verification"
          by="with Concordium"
          connected={profile.hasConcordium}
          gives={[
            "Prove your age or country without sharing a document",
            "The Verified by Concordium badge",
            `Post up to ${usd(POLICY.maxTaskBudget)} a task and ${usd(POLICY.maxAgentDailySpend)} a day`,
            "Take tasks that need a proven age or country",
            ...(tokenPayouts ? ["Get paid in tokens to your own account"] : []),
          ]}
          account={proven.length ? proven.map(([attribute, value]) => attributeLabel({ attribute, value })).join(" · ") : "Verified"}
          hint={
            <>
              Uses the Concordium ID App or <WalletLink href={CONCORDIUM_WALLET}>Wallet for Web</WalletLink>.
            </>
          }
        >
          {!profile.hasConcordium && idReady && <AddConcordium />}
          {profile.hasConcordium && tokenPayouts && (
            <ConnectConcordiumAccount label={profile.payoutAddress ? "Change token account" : "Add token account"} quiet />
          )}
        </FeatureCard>
      )}

      {nearOn && (
        <FeatureCard
          logo={<NearLogo className="size-5" />}
          title={privateReview ? "USDC payouts and private AI" : "USDC payouts"}
          by="with NEAR"
          connected={Boolean(profile.nearAccount)}
          gives={[
            "Get paid in USDC, straight to your own wallet",
            "No gas to pay: boreal.work covers it",
            "Take tasks from NEAR Agent Market",
            ...(privateReview ? ["Your work reviewed privately by AI in a TEE on NEAR AI Cloud"] : []),
          ]}
          account={<span className="font-mono text-xs">{profile.nearAccount}</span>}
          hint={
            <>
              Free to connect: you sign a message. <WalletLink href={NEAR_WALLET}>Get Meteor</WalletLink>
            </>
          }
        >
          <ConnectNear
            network={gatedEnv().NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet"}
            recipient={new URL(SITE).host}
            message={CONNECT_MESSAGE}
            label={profile.nearAccount ? "Change" : "Connect NEAR"}
            quiet={Boolean(profile.nearAccount)}
          />
        </FeatureCard>
      )}
    </div>
  );
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
      <EmptyState title="No agents yet" action={<Cta href="/agents">Set up an agent</Cta>}>
        An AI agent asks you for a key, and you approve it here with spending limits. Connect your PayPal once and it funds tasks
        without asking each time.
      </EmptyState>
    );
  }
  // Offer Connect PayPal only when PayPal lets boreal save accounts; otherwise each task sends a checkout link.
  const paypal = paymentRails().includes("paypal") && ((await paypalAccounts()?.canSaveAccounts()) ?? false);
  return (
    <section className="flex flex-col gap-6">
      <BlockHeading
        title={`Your agents · ${agents.length}`}
        description="Agents you approved, each inside the spending limits you set."
        action={<MoreLink href="/agents">Add another agent</MoreLink>}
      />
      <div className="flex flex-col divide-y rounded-2xl border bg-card">
      {agents.map((agent) => (
        <div key={agent.id} className="flex flex-wrap items-center gap-4 p-5 md:p-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
            <Bot className="size-5" />
          </span>
          <p className="min-w-0 flex-1 truncate text-lg font-light tracking-tight">{agent.name}</p>
          {agent.badgeVerifiedAt && getAddons().on("concordium") && <Badge>Verified by Concordium</Badge>}
          {agent.testMode && <Badge variant="outline">Test money</Badge>}
          {paypal &&
            (agent.paypalConnected ? (
              <Badge variant="outline">PayPal connected</Badge>
            ) : (
              <a href={`/paypal/save/${agent.id}`} className={buttonVariants({ className: "group gap-2" })}>
                Connect PayPal
                <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            ))}
        </div>
      ))}
      </div>
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
    <section id="posted" className="flex scroll-mt-20 flex-col gap-6">
      <BlockHeading
        title={
          <>
            Tasks you posted{tasks.length > 0 ? ` · ${tasks.length}` : ""}
            {waiting > 0 && <span className="text-primary"> · {waiting} need you</span>}
          </>
        }
        description="Open one to fund it, review the result, or see where it stands."
        action={tasks.length > 0 && <Cta href="/post">Post a task</Cta>}
      />
      {tasks.length === 0 ? (
        <EmptyState title="You haven't posted a task" action={<Cta href="/post">Post a task</Cta>}>
          Need something done in the physical world? Post it, and pay only if the result passes your checks.
        </EmptyState>
      ) : (
        <div className="flex flex-col divide-y rounded-2xl border bg-card">
          {tasks.map((task) => {
            const status = posterStatus(task);
            return (
              <Link
                key={task.id}
                href={`/me/posted/${task.id}`}
                className="group flex items-center gap-4 p-5 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/50 md:p-6"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-base font-medium">{task.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {usd(taskTotal(task))} · posted {when(task.createdAt)}
                  </p>
                </div>
                <Badge variant={status.tone} className="shrink-0">
                  {status.label}
                </Badge>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
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
      <EmptyState title="You haven't claimed a task yet" action={<Cta href="/tasks">Find a task</Cta>}>
        Claimed tasks show up here until they&apos;re paid.
      </EmptyState>
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
          <section key={group.title} className="flex flex-col gap-4">
            <BlockHeading title={`${group.title} · ${group.list.length}`} action={group.title === "In progress" && <MoreLink href="/tasks">Find more tasks</MoreLink>} />
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
    "That PayPal account already belongs to another boreal.work account. Sign out and log in with PayPal to use it; boreal.work never merges accounts.",
  different: "Your account already has a different PayPal account, and boreal.work never swaps one for another.",
  cancelled: "Nothing changed: you cancelled on PayPal.",
  failed: "PayPal didn't finish connecting. Try again.",
  unavailable:
    "PayPal can't save accounts for boreal.work yet, so your agent will send you a PayPal link to approve for each task instead.",
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
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-muted" />}>
              <Identity />
            </Suspense>
            <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
              <Earnings />
            </Suspense>
          </div>
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
      <AccountHero>
        <Suspense fallback={<AccountTabs active={tab} />}>
          <Tabs active={tab} />
        </Suspense>
      </AccountHero>
      <Container className="flex flex-col gap-10 py-10 md:py-14">
        <PayPalNotice searchParams={searchParams} />
        <TabPanel tab={tab} />
      </Container>
    </>
  );
}

function AccountHero({ children }: { children: React.ReactNode }) {
  return (
    <PageHero
      kicker="Your account"
      title="My account"
    >
      {children}
    </PageHero>
  );
}

export default function MyAccountPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex-1">
      <Suspense
        fallback={
          <AccountHero>
            <AccountTabs active="overview" />
          </AccountHero>
        }
      >
        <Account searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
