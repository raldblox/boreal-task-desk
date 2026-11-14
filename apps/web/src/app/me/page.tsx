import type { Metadata } from "next";
import { POLICY } from "@boreal/core";
import { taskTotal } from "@boreal/desk";
import { CONNECT_MESSAGE } from "@boreal/near";
import { BadgeCheck, BarChart3, Bot, CheckCircle2, ChevronRight, CircleAlert, ExternalLink, LockKeyhole, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";

import { linkConcordium } from "@/app/actions";
import { disconnectAgentPayPal, revokeAgentKey, setAgentLimits, setAgentPaused } from "@/app/owner/actions";
import { LoadingPanel } from "@/components/loader";
import { PayPalLoginButton } from "@/components/paypal-brand";
import { LimitFields, OwnerActionForm } from "@/components/owner-agent-controls";
import { ConcordiumLogo, NearLogo } from "@/components/chain-logos";
import { EVM_CHAIN_NAMES, evmConnectMessage } from "@boreal/evm";
import { ConnectConcordiumAccount, ConnectEvm, ConnectNear, FundAgentWallet } from "@/components/connect-wallet";
import { type AccountTab, AccountTabs, accountTab } from "@/components/account-tabs";
import { BlockHeading, Container, Cta, EmptyState, LinkTile, MoreLink, PageHero } from "@/components/page";
import { ConcordiumSignIn } from "@/components/concordium-sign-in";
import { ConcordiumWalletSignIn } from "@/components/concordium-wallet-sign-in";
import { ZkPassportSignIn } from "@/components/zkpassport-sign-in";
import { passportReady } from "@/server/zkpassport";
import { TaskCard } from "@/components/task-card";
import { TxLink } from "@/components/tx-link";
import { DevWallet } from "@/components/worker-forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { attributeLabel, posterStatus, usd, when, workerHandle } from "@/lib/format";
import { NETWORK, SITE } from "@/content/agent-guide";
import { gatedEnv, getAddons } from "@/server/addons";
import { getConcordium, getDesk, paymentRails } from "@/server/desk";
import { agentWallet } from "@/server/agent-wallet";
import { EXPLORER, txUrl } from "@/server/explorer";
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
/** NEAR AI Cloud's own explanation of private inference in TEEs. */
const NEAR_AI_PRIVATE_INFERENCE = "https://docs.near.ai/cloud/private-inference";
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
  const needsVerifiedPayPal = NETWORK === "mainnet" && !profile.hasConcordium && !profile.hasPassport && !profile.paypalVerified;
  const passport = passportReady();
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
                <PayPalLoginButton label="Add PayPal" />
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
          {(profile.hasPassport || passport) && (
            <div className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center gap-4">
                <ShieldCheck className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Passport (ZKPassport)</p>
                  <p className="text-sm text-muted-foreground">
                    {profile.hasPassport
                      ? "Signs you in, and proves you're 18 or older and one person."
                      : "Free. Your phone reads your passport's chip and proves you're 18 or older and one person; boreal.work never sees the passport. Needs a passport or ID card with a chip, and a phone with NFC that passes the ZKPassport app's check."}
                  </p>
                </div>
                {profile.hasPassport && <Badge variant="outline">Verified</Badge>}
              </div>
              {!profile.hasPassport && <ZkPassportSignIn next="/me?passport=added" link />}
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
            Only verified people can claim tasks:{" "}
            {[
              "verify your account with PayPal, then use Log in with PayPal again",
              ...(passport ? ["add your passport with ZKPassport above (free)"] : []),
              ...(concordiumId && getAddons().ready("concordium", "id") ? ["add Concordium ID under Integrations (free)"] : []),
            ].join(", or ")}
            .
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">Your worker ID</p>
        <code className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">{profile.pseudonym}</code>
        <p className="text-xs text-muted-foreground">
          {profile.testMode
            ? "Test workers see and do only test tasks."
            : `A one-way code made from the identity you first signed in with. It never changes, and it can't be turned back into who you are. Each PayPal account${concordiumId ? ", Concordium ID" : ""}${passport ? ", passport" : ""} belongs to one boreal.work account, and accounts are never merged.`}
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
  // Settled payouts on a chain, each linked to its transfer on the chain's explorer.
  const onChain = earnings.payouts
    .flatMap((p) => {
      if (p.test || p.status !== "settled" || (p.rail !== "near" && p.rail !== "concordium")) return [];
      const url = txUrl(p.rail, p.txHash);
      return url ? [{ ...p, rail: p.rail, url }] : [];
    })
    .slice(0, 5);
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
          {label === "Paid to you" && onChain.length > 0 && (
            <ul className="flex flex-col divide-y border-t text-sm">
              {onChain.map((p) => (
                <li key={`${p.taskId}-${p.at.toISOString()}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                  <span>
                    <span className="tabular-nums">{usd(p.amount)}</span>{" "}
                    <span className="text-muted-foreground">
                      · {RAIL_LABEL[p.rail]} · {when(p.at)}
                    </span>
                  </span>
                  <TxLink href={p.url}>{EXPLORER[p.rail]}</TxLink>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {note} A pass pays at once when the requester gives or accepts it; otherwise after the{" "}
            {POLICY.objectionWindowMs / 3_600_000} hours to dispute, sometimes a day more.
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
      <BlockHeading title="Getting paid" description="Passed tasks pay out here once they're final." />
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
              <PayPalLoginButton label="Connect PayPal" />
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
  status,
  gives,
  account,
  hint,
  children,
}: {
  logo: React.ReactNode;
  title: string;
  by: string;
  connected: boolean;
  /** The state once connected, in words: "Verified", "Connected". */
  status: string;
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
          <Badge variant="secondary" className="shrink-0 gap-1">
            <CheckCircle2 className="size-3.5 text-primary" aria-hidden /> {status}
          </Badge>
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
      {/* Wraps: wide actions (two Concordium buttons) drop below the text instead of squeezing it. */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="min-w-[12rem] flex-1 text-sm text-muted-foreground">{connected ? account : hint}</div>
        {children && <div className="max-w-full">{children}</div>}
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
  const evmOn = addons.ready("evm", "rail");
  const evmChainId = Number(gatedEnv().EVM_CHAIN_ID);
  const evmChain = EVM_CHAIN_NAMES[evmChainId] ?? `chain ${evmChainId}`;
  const privateReview = addons.ready("near", "privateReview");
  const proven = Object.entries(profile.provenAttributes);

  if (!concordiumOn && !nearOn && !evmOn) {
    return <p className="text-sm text-muted-foreground">This site runs on PayPal alone.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className={`grid gap-6 md:grid-cols-2 ${privateReview ? "xl:grid-cols-3" : ""}`}>
      {concordiumOn && (
        <FeatureCard
          logo={<ConcordiumLogo className="size-6" />}
          title="Private ID verification"
          by="with Concordium"
          connected={profile.hasConcordium}
          status="Verified"
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
          title="USDC payouts"
          by="with NEAR"
          connected={Boolean(profile.nearAccount)}
          status="Connected"
          gives={[
            "Get paid in USDC, straight to your own wallet",
            "No gas to pay: boreal.work covers it",
            "Take tasks from NEAR Agent Market",
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

      {evmOn && (
        <FeatureCard
          logo={<Wallet className="size-5" />}
          title="USDC payouts"
          by={`on ${evmChain}`}
          connected={Boolean(profile.evmAddress)}
          status="Connected"
          gives={[`Get paid in USDC on ${evmChain}, straight to your own wallet`, "Take tasks that pay there"]}
          account={
            profile.evmAddress ? (
              <span className="font-mono text-xs" title={profile.evmAddress}>
                {profile.evmAddress.slice(0, 6)}…{profile.evmAddress.slice(-4)}
              </span>
            ) : null
          }
          hint={<>Free to connect: your wallet signs a message, and nothing moves.</>}
        >
          <ConnectEvm
            template={evmConnectMessage(new URL(SITE).host, "{issuedAt}")}
            chain={evmChain}
            label={profile.evmAddress ? "Change" : "Connect wallet"}
            quiet={Boolean(profile.evmAddress)}
          />
        </FeatureCard>
      )}

      {privateReview && (
        // Nothing to connect: it powers boreal.work's own screening and review for every task.
        <FeatureCard
          logo={<LockKeyhole className="size-5" />}
          title="Private AI review"
          by="with NEAR AI Cloud"
          connected
          status="Included"
          gives={[
            "Your tasks and photos are checked privately, inside a TEE",
            "No outside AI company can read them",
            "Every verdict comes with a signed proof of where it came from",
          ]}
          account={<WalletLink href={NEAR_AI_PRIVATE_INFERENCE}>How private inference works</WalletLink>}
        />
      )}
      </div>
    </div>
  );
}

/** An agent's own NEAR wallet: what it holds, and a button to send it more. */
async function AgentNearWallet({ agent }: { agent: { name: string; nearAccount: string } }) {
  const wallet = await agentWallet(agent.nearAccount);
  if (!wallet) return null;
  return (
    <details className="group basis-full rounded-xl border bg-muted/30 px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
        <NearLogo className="size-4" />
        <span>
          USDC on NEAR{wallet.usdcCents !== null ? `: ${usd(wallet.usdcCents)}` : ""}{" "}
          <span className="font-mono text-xs text-muted-foreground">{wallet.account.length > 24 ? `${wallet.account.slice(0, 10)}…${wallet.account.slice(-6)}` : wallet.account}</span>
        </span>
        <span className="text-primary group-open:hidden">Add funds</span>
      </summary>
      <div className="pt-3">
        <FundAgentWallet agentName={agent.name} wallet={wallet} />
      </div>
    </details>
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
        An AI agent asks you for a key, and you approve it here with the limits it may spend. Save your PayPal account once; a new agent
        still asks you before each payment, unless you let it pay on its own.
      </EmptyState>
    );
  }
  // Offer Connect PayPal only when PayPal lets boreal save accounts; otherwise each task sends a checkout link.
  const paypal = paymentRails().includes("paypal") && ((await paypalAccounts()?.canSaveAccounts()) ?? false);
  // Limits, spend and the owner's controls per agent (RS-1, RS-2).
  const desk = getDesk();
  const overview = await desk.ownerAgentsOverview(worker.workerId);
  const activity = new Map(
    await Promise.all(
      overview.map(async (o) => [o.id, await desk.ownerAgentActivity(worker.workerId, o.id, 5).catch(() => ({ payments: [], changes: [] }))] as const),
    ),
  );
  return (
    <section className="flex flex-col gap-6">
      <BlockHeading
        title={`Your agents · ${agents.length}`}
        description="Agents you approved. Each spends only within the limits you set, and only from what you saved for it."
        action={<MoreLink href="/agents">Add another agent</MoreLink>}
      />
      <div className="flex flex-col gap-4">
        {agents.map((agent) => {
          const o = overview.find((row) => row.id === agent.id);
          const recent = activity.get(agent.id);
          return (
            <article key={agent.id} className="flex flex-col gap-5 rounded-2xl border bg-card p-5 md:p-6">
              {/* Who, and its state at a glance */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <Bot className="size-5" />
                </span>
                <p className="min-w-0 flex-1 truncate text-lg font-light tracking-tight">{agent.name}</p>
                {o && (o.paused ? <Badge variant="destructive">Paused</Badge> : o.hasKey ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">No key</Badge>)}
                {o && <Badge variant="outline">{o.spendingMode === "ask" ? "Asks you first" : "Pays on its own"}</Badge>}
                {agent.badgeVerifiedAt && getAddons().on("concordium") && <Badge>Verified by Concordium</Badge>}
                {agent.testMode && <Badge variant="outline">Test money</Badge>}
              </div>

              {/* A payment waiting for the owner comes before anything else */}
              {o?.approvalsWaiting.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary-soft/40 p-4">
                  <p className="text-sm">
                    <span className="font-medium">
                      {agent.name} asks to pay {usd(a.total)}.
                    </span>{" "}
                    <span className="text-muted-foreground">Waits until {when(a.expiresAt)}.</span>
                  </p>
                  <Link href={`/approve/${a.id}`} className={buttonVariants({ size: "sm" })}>
                    Approve or decline
                  </Link>
                </div>
              ))}

              {o && (
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {(
                    [
                      ["Today", o.spent.last24h],
                      ["This week", o.spent.last7d],
                      ["In all", o.spent.total],
                      ["Held now", o.held],
                    ] as const
                  ).map(([label, cents]) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-2xl font-light tracking-tight tabular-nums">{usd(cents)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {o && (
                <p className="text-sm text-muted-foreground">
                  Limits: {usd(o.maxTaskBudget)} a task, {usd(o.maxDailySpend)} a day.{" "}
                  {o.spendingMode === "ask"
                    ? "Each payment from your saved PayPal account waits for your OK."
                    : "It pays from your saved PayPal account without asking, within these limits."}
                  {o.paused && " Paused: it can read and cancel its tasks, but not post, pay, accept or review."}
                </p>
              )}

              {(paypal || agent.nearAccount) && (
                <div className="flex flex-wrap items-center gap-3">
                  {paypal &&
                    (agent.paypalConnected ? (
                      <Badge variant="outline">PayPal account saved</Badge>
                    ) : (
                      <a href={`/paypal/save/${agent.id}`} className={buttonVariants({ size: "sm", className: "group gap-2" })}>
                        Save a PayPal account
                        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </a>
                    ))}
                  {agent.nearAccount && (
                    <Suspense fallback={null}>
                      <AgentNearWallet agent={{ name: agent.name, nearAccount: agent.nearAccount }} />
                    </Suspense>
                  )}
                </div>
              )}

              {/* What it did lately, and what you changed */}
              {recent && (recent.payments.length > 0 || recent.changes.length > 0) && (
                <div className="grid gap-5 border-t pt-5 md:grid-cols-2">
                  {recent.payments.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Latest payments</p>
                      <ul className="flex flex-col gap-1.5 text-sm">
                        {recent.payments.map((p, i) => (
                          <li key={`${p.taskId}-${i}`} className="flex justify-between gap-3">
                            <span className="text-muted-foreground">
                              {when(p.at)}
                              {p.test ? " · test money" : ""}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {usd(p.amount)} <span className="text-muted-foreground">{paymentState(p.taskStatus)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {recent.changes.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Your changes</p>
                      <ul className="flex flex-col gap-1.5 text-sm">
                        {recent.changes.map((c, i) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span>{OWNER_ACTION[c.action] ?? c.action}</span>
                            <span className="shrink-0 text-muted-foreground">{when(c.at)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* The controls: everyday ones first, the ones that cut it off apart */}
              {o && (
                <details className="rounded-xl border p-4">
                  <summary className="cursor-pointer font-medium">Limits and controls</summary>
                  <div className="mt-4 flex flex-col gap-6">
                    <OwnerActionForm action={setAgentLimits.bind(null, o.id)} label="Save limits and mode" variant="default">
                      <LimitFields maxTaskBudget={o.maxTaskBudget} maxDailySpend={o.maxDailySpend} spendingMode={o.spendingMode} />
                    </OwnerActionForm>
                    <div className="flex flex-col gap-1.5">
                      <OwnerActionForm action={setAgentPaused.bind(null, o.id, !o.paused)} label={o.paused ? "Resume this agent" : "Pause this agent"} />
                      <p className="text-xs text-muted-foreground">
                        {o.paused ? "Resumed, it can post, pay, accept and review again." : "Paused, it can still read and cancel, but can't post, pay, accept or review."}
                      </p>
                    </div>
                    {(o.paymentSaved || o.hasKey) && (
                      <div className="flex flex-col gap-5 rounded-xl border border-destructive/30 p-4">
                        <p className="text-sm font-medium text-destructive">These cut the agent off</p>
                        {o.paymentSaved && (
                          <OwnerActionForm
                            action={disconnectAgentPayPal.bind(null, o.id)}
                            label="Disconnect the saved PayPal account"
                            variant="destructive"
                            confirm="Forget the PayPal account saved for this agent. It will send me a PayPal checkout link for each payment instead."
                          />
                        )}
                        {o.hasKey && (
                          <OwnerActionForm
                            action={revokeAgentKey.bind(null, o.id)}
                            label="Revoke its key"
                            variant="destructive"
                            confirm="Take this agent's key back now. It stops working until I approve a new link for it."
                          />
                        )}
                      </div>
                    )}
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** An owner's own changes, as the log records them, in words. */
const OWNER_ACTION: Record<string, string> = {
  pause: "Paused it",
  resume: "Resumed it",
  revoke_key: "Revoked its key",
  set_limits: "Changed its limits or mode",
  disconnect_payment: "Disconnected the saved PayPal account",
  approve_payment: "Approved a payment",
  decline_payment: "Declined a payment",
};

/** Where an agent's payment into escrow stands, from its task. */
function paymentState(status: string): string {
  if (status === "final_pass") return "paid";
  if (["final_fail", "refused", "expired", "cancelled"].includes(status)) return "released";
  return "held";
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
          Need something done in the physical world? Post it; the worker is paid only if the result passes your checks.
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
  saved: "PayPal account saved. Your agents pay from it within their limits; an agent on Ask me each time still sends you each payment to approve.",
  connected: "PayPal connected. It signs you in, and passed tasks on PayPal pay out to it.",
  taken:
    "That PayPal account already belongs to another boreal.work account with its own tasks. Sign out and sign in with PayPal to use that account; boreal.work doesn't merge two accounts that both have history.",
  different: "Your account already has a different PayPal account, and boreal.work never swaps one for another.",
  cancelled: "Nothing changed: you cancelled on PayPal.",
  failed: "PayPal didn't finish connecting. Try again.",
  unavailable:
    "PayPal can't save accounts for boreal.work yet, so your agent will send you a PayPal link to approve for each task instead.",
  off: "PayPal isn't switched on here.",
  "not-yours": "That agent isn't yours.",
};

async function PayPalNotice({ searchParams }: { searchParams: Promise<{ paypal?: string; concordium?: string; passport?: string }> }) {
  const params = await searchParams;
  const notice =
    params.concordium === "added"
      ? "Concordium ID added. You carry the Verified by Concordium badge and can claim tasks that need what you proved."
      : params.passport === "added"
        ? "Passport added. You're verified and can claim tasks."
        : PAYPAL_NOTICES[params.paypal ?? ""];
  if (!notice) return null;
  return (
    <Alert>
      <AlertDescription>{notice}</AlertDescription>
    </Alert>
  );
}

type SearchParams = Promise<{ tab?: string; paypal?: string; concordium?: string; passport?: string }>;

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

const SECTION_FALLBACK = <LoadingPanel className="h-40" />;

/** One tab's sections. */
function TabPanel({ tab }: { tab: AccountTab }) {
  switch (tab) {
    case "overview":
      return (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Suspense fallback={<LoadingPanel className="h-80" />}>
              <Identity />
            </Suspense>
            <Suspense fallback={<LoadingPanel className="h-64" />}>
              <Earnings />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <InsightsLink />
          </Suspense>
          <div className="flex flex-col gap-1 border-t pt-6">
            <p className="text-sm text-muted-foreground">Done with boreal.work? Closing deletes what identifies you. You&apos;ll see everything it does first.</p>
            <MoreLink href="/me/close" className="text-destructive">
              Close your account
            </MoreLink>
          </div>
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
