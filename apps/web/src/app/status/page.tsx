import { POLICY } from "@boreal/core";
import { paypalTarget } from "@boreal/paypal";
import { CircleAlert, CircleCheck, CircleDashed, CircleX } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { AddonsPanel } from "@/components/addons-panel";
import { Container, PageHero } from "@/components/page";
import { GUIDE_VERSION, LIVE_SITE, NETWORK, SITE, TESTNET_SITE } from "@/content/agent-guide";
import { getAddons, gatedEnv } from "@/server/addons";
import { getConcordium, getDesk, paymentRails } from "@/server/desk";
import { getIdAppVerifier } from "@/server/id-app";
import { paypalLoginEnabled } from "@/server/paypal-accounts";
import { type Check, databaseCheck, type Health, overall, queueCheck, registryCheck } from "@/server/status";

export const metadata: Metadata = {
  title: "Status · boreal.work",
  description: "Whether boreal.work, its database, payments, sign-in and payouts are working right now.",
};

const LOOK: Record<Health, { icon: typeof CircleCheck; label: string; tone: string }> = {
  ok: { icon: CircleCheck, label: "Working", tone: "text-primary" },
  degraded: { icon: CircleAlert, label: "Slow or partly down", tone: "text-amber-600 dark:text-amber-400" },
  down: { icon: CircleX, label: "Down", tone: "text-destructive" },
  off: { icon: CircleDashed, label: "Not switched on", tone: "text-muted-foreground" },
};

const HEADLINE: Record<Health, string> = {
  ok: "Everything is working",
  degraded: "Some things are slow or partly down",
  down: "Something is down",
  off: "Everything is working",
};

function Row({ check }: { check: Check }) {
  const look = LOOK[check.health];
  const Icon = look.icon;
  return (
    <li className="flex items-start gap-3 p-4">
      <Icon className={`mt-0.5 size-5 shrink-0 ${look.tone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{check.name}</p>
        <p className="text-sm text-muted-foreground">{check.detail}</p>
      </div>
      <span className={`shrink-0 text-xs font-medium ${look.tone}`}>{look.label}</span>
    </li>
  );
}

function ago(at: Date): string {
  const min = Math.round((Date.now() - at.getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

async function Checks() {
  await connection();
  const db = await databaseCheck();
  const addons = getAddons();
  const concordium = addons.on("concordium");
  const [queue, registry] = await Promise.all([
    db.health === "down" ? null : queueCheck(Boolean(getConcordium()?.anchor)).catch(() => null),
    concordium ? registryCheck() : null,
  ]);

  const rails = paymentRails();
  let paypalMode = "";
  try {
    paypalMode = rails.includes("paypal") ? (paypalTarget(gatedEnv()).mode === "live" ? "PayPal (live)" : "PayPal sandbox") : "";
  } catch {
    paypalMode = "PayPal (misconfigured)";
  }
  const railNames = [
    paypalMode,
    rails.includes("near") ? `USDC on NEAR ${NETWORK}` : "",
    rails.includes("concordium") ? `Concordium ${NETWORK} tokens` : "",
  ].filter(Boolean);
  // Workers who set up their own wallet through boreal to take a task, per chain (nothing personal).
  const setups = db.health === "down" ? null : await getDesk().walletSetupCounts().catch(() => null);
  const setupLine = setups
    ? [
        setups.near && addons.on("near") ? `${setups.near} ${setups.near === 1 ? "worker" : "workers"} set up a NEAR account through boreal` : "",
        setups.concordium && concordium ? `${setups.concordium} ${setups.concordium === 1 ? "worker" : "workers"} set up a Concordium account through boreal` : "",
      ].filter(Boolean)
    : [];
  const checks: Check[] = [
    { name: "Website and agent API", health: "ok", detail: "Pages, MCP server and REST API are answering" },
    db,
    {
      name: "Payments",
      health: railNames.length ? "ok" : "off",
      detail: railNames.length
        ? `Tasks can be funded with ${railNames.join(", ")}`
        : "PayPal isn't configured here yet (PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET); agents can link but not pay",
    },
    {
      name: "Log in with PayPal",
      health: paypalLoginEnabled() ? "ok" : "off",
      detail: paypalLoginEnabled()
        ? `Workers and owners sign in with ${NETWORK === "testnet" ? "PayPal sandbox" : "PayPal"} accounts`
        : "Not switched on here yet",
    },
    queue?.money ?? { name: "Payouts and refunds", health: db.health === "down" ? "down" : "degraded", detail: "Couldn't read the queue" },
    // Integration checks show only where the integration is on; a PayPal-only site has none of them.
    ...(concordium
      ? [
          {
            name: "Concordium ID (integration)",
            health: getIdAppVerifier() || addons.ready("concordium", "id") ? "ok" : "degraded",
            detail:
              getIdAppVerifier() || addons.ready("concordium", "id")
                ? `Workers can add Concordium ID to prove their age or country (Concordium ${NETWORK})`
                : (addons.concordium.parts.find((p) => p.id === "id")?.reason ?? "Not ready"),
          } satisfies Check,
          ...(queue ? [{ ...queue.anchors, name: "On-chain audit anchors (integration)" }] : []),
          ...(registry ? [{ ...registry, name: "Registry listing (integration)" }] : []),
        ]
      : []),
    ...(addons.on("near")
      ? [
          {
            name: "USDC on NEAR (integration)",
            health: rails.includes("near") ? "ok" : "degraded",
            detail: rails.includes("near")
              ? `Agents can fund in USDC on NEAR ${NETWORK}; workers are paid to their NEAR account`
              : (addons.near.parts.find((p) => p.id === "rail")?.reason ?? "Not ready"),
          } satisfies Check,
        ]
      : []),
  ];
  const state = overall(checks);
  const look = LOOK[state];
  const Icon = look.icon;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-6">
        <Icon className={`size-8 shrink-0 ${look.tone}`} aria-hidden />
        <div>
          <p className="text-3xl font-light tracking-[-0.03em]">{HEADLINE[state]}</p>
          <p className="text-sm text-muted-foreground">
            Checked {new Intl.DateTimeFormat("en-PH", { timeStyle: "medium", timeZone: "Asia/Manila" }).format(new Date())} (Manila)
            {queue?.lastDoneAt ? ` · last payout or anchor sent ${ago(queue.lastDoneAt)}` : ""}
          </p>
        </div>
      </div>
      <ul className="flex flex-col divide-y rounded-2xl border bg-card">
        {checks.map((c) => (
          <Row key={c.name} check={c} />
        ))}
      </ul>
      {setupLine.length > 0 && <p className="text-sm text-muted-foreground">{setupLine.join(". ")}.</p>}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-light tracking-[-0.025em]">Integrations</h2>
        <AddonsPanel addons={[addons.concordium, addons.near]} source={addons.source} />
      </section>
    </div>
  );
}

export default function StatusPage() {
  const other = NETWORK === "testnet" ? { label: "live site", url: LIVE_SITE } : { label: "testnet", url: TESTNET_SITE };
  return (
    <main className="flex-1">
      <PageHero
        kicker="Status"
        title={<>{NETWORK === "testnet" ? "boreal testnet" : "boreal.work"} status</>}
        lede={
          <>
            {NETWORK === "testnet"
            ? "This is the testnet: money here is never real."
            : "This is the live site: money here is real."}{" "}
          Refresh to check again.
          </>
        }
      />
      <Container className="flex flex-col gap-8 py-10 md:py-14">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-muted" />}>
        <Checks />
      </Suspense>
      <dl className="grid grid-cols-2 gap-4 rounded-2xl border bg-card p-6 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Network</dt>
          <dd className="font-medium capitalize">{NETWORK}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Agent guide</dt>
          <dd className="font-mono">{GUIDE_VERSION}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Rulebook</dt>
          <dd className="font-mono">v{POLICY.rulebookVersion}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Machine-readable</dt>
          <dd>
            <a href="/api/v1/health" className="text-primary underline-offset-4 hover:underline">
              /api/v1/health
            </a>
          </dd>
        </div>
      </dl>
      {other.url !== SITE && (
        <p className="text-sm text-muted-foreground">
          Looking for the {other.label}?{" "}
          <a href={`${other.url}/status`} className="text-primary underline-offset-4 hover:underline">
            {other.url.replace("https://", "")}/status
          </a>
        </p>
      )}
      </Container>
    </main>
  );
}
