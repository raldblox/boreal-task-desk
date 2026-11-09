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
import { gatedEnv, getAddons, verification } from "@/server/addons";
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

/** One step on the ladder: done (a check) or not yet (its number), what it unlocks, and its one action. */
function Unlock({
  step,
  icon,
  title,
  done,
  unlocks,
  detail,
  children,
}: {
  step: number | null;
  icon?: React.ReactNode;
  title: string;
  done: boolean;
  unlocks: string[];
  /** Under the title: who it's connected as, or how to get it. */
  detail?: React.ReactNode;
  /** The action: a Connect button, or a quiet Change. */
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:p-6">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span
          aria-hidden
          className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
            done ? "bg-primary text-primary-foreground" : "border bg-background text-muted-foreground"
          }`}
        >
          {done ? <CheckCircle2 className="size-5" /> : (icon ?? step)}
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-col">
            <h3 className="font-semibold">{title}</h3>
            {detail && <div className="text-sm text-muted-foreground">{detail}</div>}
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label={done ? "Unlocked" : "Unlocks"}>
            {unlocks.map((u) => (
              <li key={u}>
                <Badge variant={done ? "secondary" : "outline"} className={done ? "" : "text-muted-foreground"}>
                  {u}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {children && <div className="shrink-0 pl-14 md:pl-0">{children}</div>}
    </li>
  );
}

/**
 * Levels and unlocks, the way a fintech app shows verification: each step says what it unlocks,
 * shows a check once done, and has one action. Level 1 is PayPal, level 2 is being verified
 * (Concordium ID where that integration is on, otherwise a PayPal account PayPal has verified),
 * and optional unlocks follow for the integrations this site switched on (BOREAL_ADDONS).
 */
async function Integrations() {
  const worker = await workerFromSession();
  if (!worker) redirect("/signin");
  const profile = await getDesk().getWorker(worker);
  if (!profile || profile.testMode) return null;
  const addons = getAddons();
  const rails = paymentRails();
  const viaConcordium = verification().concordiumId;
  const idReady = getIdAppVerifier() !== null || (getConcordium() !== null && gatedEnv().CONCORDIUM_MODE === "dev");
  const paypalLogin = paypalLoginEnabled();

  const basic = profile.hasPayPal || profile.hasConcordium;
  const verified = viaConcordium ? profile.hasConcordium : profile.hasPayPal && profile.paypalVerified;
  const level = verified ? 2 : basic ? 1 : 0;
  const nearOn = addons.ready("near", "rail");
  const tokenPayouts = addons.on("concordium") && rails.includes("concordium");
  const proven = Object.entries(profile.provenAttributes);

  const next = !basic
    ? "Connect PayPal to start taking tasks."
    : !verified
      ? `Get verified to post up to ${usd(POLICY.maxTaskBudget)} a task.`
      : nearOn && !profile.nearAccount
        ? "Connect a NEAR wallet to take tasks that pay in USDC."
        : "Everything here is unlocked.";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-light tracking-[-0.025em]">
            {level === 2 ? "Verified" : level === 1 ? "Basic" : "Not started"}
          </h2>
          <span className="text-sm text-muted-foreground">Level {level} of 2</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5" aria-hidden>
          {[1, 2].map((n) => (
            <span key={n} className={`h-1.5 rounded-full ${n <= level ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{next}</p>
      </section>

      <ol className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
        <Unlock
          step={1}
          title="Connect PayPal"
          done={basic}
          unlocks={["Take tasks", "Paid to PayPal", `Post up to ${usd(POLICY.unverifiedTaskBudget)} a task`]}
          detail={profile.paypalEmail ?? (basic ? "Signed in with Concordium ID. Connect PayPal to be paid there." : undefined)}
        >
          {paypalLogin && !profile.hasPayPal && (
            // A route handler that redirects to PayPal, so a full navigation, not <Link>.
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a href="/paypal/login" className={buttonVariants({ variant: basic ? "outline" : "default" })}>
              Connect PayPal
            </a>
          )}
        </Unlock>

        <Unlock
          step={2}
          icon={viaConcordium ? <ConcordiumLogo className="size-5" /> : undefined}
          title={viaConcordium ? "Verify with Concordium ID" : "Get verified on PayPal"}
          done={verified}
          unlocks={[
            `Post up to ${usd(POLICY.maxTaskBudget)} a task`,
            `${usd(POLICY.maxAgentDailySpend)} a day`,
            "Verified badge",
            ...(viaConcordium ? ["Age and country tasks"] : []),
          ]}
          detail={
            verified && viaConcordium && proven.length > 0 ? (
              proven.map(([attribute, value]) => attributeLabel({ attribute, value })).join(" · ")
            ) : !verified && viaConcordium ? (
              <>
                Proofs only, never your name or documents. <WalletLink href={CONCORDIUM_WALLET}>Get the wallet</WalletLink>
              </>
            ) : !verified ? (
              "Confirm your identity in your PayPal account; it updates here on your next PayPal sign-in."
            ) : undefined
          }
        >
          {!verified && viaConcordium && idReady && <AddConcordium />}
          {!verified && !viaConcordium && profile.hasPayPal && (
            <a href="https://www.paypal.com/myaccount/summary" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
              Open PayPal
            </a>
          )}
        </Unlock>
      </ol>

      {(nearOn || tokenPayouts) && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">Optional unlocks</h3>
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {nearOn && (
              <Unlock
                step={null}
                icon={<NearLogo className="size-4" />}
                title="NEAR wallet"
                done={Boolean(profile.nearAccount)}
                unlocks={["USDC tasks", "NEAR Agent Market tasks"]}
                detail={
                  profile.nearAccount ? (
                    <span className="font-mono text-xs">{profile.nearAccount}</span>
                  ) : (
                    <>
                      Free: you sign a message. <WalletLink href={NEAR_WALLET}>Get Meteor</WalletLink>
                    </>
                  )
                }
              >
                <ConnectNear
                  network={gatedEnv().NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet"}
                  recipient={new URL(SITE).host}
                  message={CONNECT_MESSAGE}
                  label={profile.nearAccount ? "Change" : "Connect"}
                  quiet={Boolean(profile.nearAccount)}
                />
              </Unlock>
            )}
            {tokenPayouts && (
              <Unlock
                step={null}
                icon={<ConcordiumLogo className="size-4" />}
                title="Concordium account"
                done={Boolean(profile.payoutAddress)}
                unlocks={["Token payouts"]}
                detail={profile.payoutAddress ? <span className="break-all font-mono text-xs">{profile.payoutAddress}</span> : undefined}
              >
                <ConnectConcordiumAccount label={profile.payoutAddress ? "Change" : "Connect"} quiet={Boolean(profile.payoutAddress)} />
              </Unlock>
            )}
          </ul>
        </section>
      )}

      {addons.ready("near", "privateReview") && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" aria-hidden />
          Your submissions are reviewed privately on NEAR AI Cloud (TEE).
        </p>
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
