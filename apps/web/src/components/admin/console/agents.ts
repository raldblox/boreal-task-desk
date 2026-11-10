"use client";

import { type AgAiHarnessSetup, type AgAiPromptStarter, type AgAiTool, createAiHarness, directLlmRunner } from "ag-studio";

import { anomalyStore } from "./anomaly-store";
import { buildAnomalyPage } from "./anomaly-page";
import { claudeAdapter, offlineAdapter } from "./claude-adapter";

// The console's agents, on AG Studio's agent framework:
// - boreal ops (primary): AG's own lead agent, taught boreal's money model, delegating to AG's
//   built-in data, planning, page and widget agents to answer questions with live widgets, and to
//   the anomaly agent for anything about what's wrong.
// - the anomaly agent: runs the desk's anomaly checks, builds an Anomalies page of alert and
//   evidence widgets, then digs in with queries and AG's widget agent.
// Every agent runs on Claude through the server (claude-adapter.ts). Without a key they all
// answer that the agent is off; the Scan for anomalies button works either way.

const BOREAL = `You work inside boreal.work's operator money console. boreal.work is a task desk: AI agents and people ("requesters") post real-world tasks, fund them into escrow, verified workers (people, or AI agents on NEAR) claim and do them, a reviewer passes or fails the result against the rulebook, and only then does money move.

How money works:
- Funding: on PayPal the requester's money is an authorization ("held"), captured only when the task is final; on Concordium and NEAR it is "received" into an escrow account at once.
- A pass pays the worker the task budget, the reviewer the review fee, and boreal.work the platform fee. A fail refunds the budget and platform fee and still pays the review fee. A cancel or expiry refunds everything.
- Payouts and refunds go through an outbox: "on its way" while queued, "stuck" after 2 hours, "retrying" after an error, "failed"/"returned" when the provider sends it back (the money is then back in escrow).
- GMV = task budgets plus fees, counted once funded. Fees earned = platform fees + review fees actually paid. Take rate = fees earned / money funded in.
- Requester kinds: agent, person, NEAR market buyer. Rails: paypal, concordium, near. Worker kinds: person, agent.

Data: the tables tasks, funnel, ledger, transfers and escrow, related through task ids, with a shared calendar (calendar::day, calendar::week, calendar::month). In ledger, the money columns (fundedIn, heldNow, paidToWorkers, platformFees, reviewFees, feesEarned, refunded, onItsWay, failed) already pick out one kind of movement, so sum them directly instead of filtering by kind. "This week" and "this month" mean calendar periods ending today.

Privacy: people appear only as shortened pseudonyms. Never try to identify anyone, and never ask for emails or account numbers.

Be concrete and brief: give the figures in your answer as well as building the widget, in US dollars.`;

export const PROMPT_STARTERS: AgAiPromptStarter[] = [
  { label: "Failed payouts this week", prompt: "Show failed payouts this week: how many, how much, which tasks, and on which rail." },
  { label: "Fees by rail this month", prompt: "Show fees earned by payment rail this month, split into platform and review fees." },
  { label: "Which agents spend most", prompt: "Which requesters spend most? Rank them by money funded in, with their pass rate." },
  { label: "Scan for anomalies", prompt: "Scan boreal.work's money for anomalies and build alert widgets for anything you find." },
];

export function borealAi({ enabled }: { enabled: boolean }): AgAiHarnessSetup {
  const adapter = enabled ? claudeAdapter() : offlineAdapter();
  return ({ api }) =>
    createAiHarness(api, ({ builtIn }) => {
      const scan = api.defineAiTool({
        name: "boreal_scan_anomalies",
        description:
          "Run boreal.work's anomaly checks on the live ledger and outbox: failed payouts this week, refund spikes against the trailing average, payouts stuck on their way or retrying, PayPal holds not captured, and escrow that doesn't match the ledger on each rail. Returns every finding with its amount (cents) and task ids.",
        params: (s) => s.object({}),
        execute: async (_args, ctx) => {
          const report = await anomalyStore.rescan();
          if (!report) return ctx.error("The anomaly checks couldn't run just now; try again.");
          const lines = report.anomalies.map((a) => `- [${a.severity}] ${a.kind}: ${a.title}. ${a.detail} Amount ${(a.amount / 100).toFixed(2)} USD; tasks ${a.taskIds.slice(0, 5).join(", ") || "none"}.`);
          const rails = report.reconciliation.map((r) => `${r.rail}: ${r.error ? `not checked (${r.error})` : `gap ${r.gap} cents`}`).join("; ");
          return ctx.success(
            report.anomalies.length ? `${report.anomalies.length} findings:\n${lines.join("\n")}\nEscrow vs ledger: ${rails}.` : `No anomalies. Escrow vs ledger: ${rails}.`,
            report,
          );
        },
      });
      const build = api.defineAiTool({
        name: "boreal_build_alert_widgets",
        description:
          "Build (or rebuild) the Anomalies page from the latest scan: the alert board plus an evidence widget for each kind of finding (failed transfers grid, payout timeline and longest-open transfers, refunds by day and payer, holds waiting, escrow check). Opens the page. Run boreal_scan_anomalies first.",
        params: (s) => s.object({}),
        execute: (_args, ctx) => {
          const report = anomalyStore.get();
          if (!report) return ctx.error("Run boreal_scan_anomalies first.");
          const ids = buildAnomalyPage(api, report.anomalies);
          return ctx.success(`Built the Anomalies page with widgets ${ids.join(", ")} and opened it.`);
        },
      });

      const anomaly = directLlmRunner({
        id: "boreal-anomaly",
        name: "Anomaly agent",
        description:
          "Monitors boreal.work's ledger and outbox for failed payouts, refund spikes, payouts stuck on their way and escrow reconciliation gaps, and builds alert widgets for what it finds. Delegate any question about what is wrong, risky or unusual with money.",
        schema: (s) => s.undefined(),
        adapter,
        maxTurns: 30,
        instructions: () =>
          `${BOREAL}\n\nYou are the anomaly agent. Always start with boreal_scan_anomalies, then boreal_build_alert_widgets so the operator sees the alert board and its evidence. Then, for the most serious finding, use execute_query to find what it has in common (one rail, one requester, one time window) and say so. If one more chart would make the cause obvious, delegate it to the widget or page agent. Finish with a short ranked summary: what is wrong, how much money, and the next step for an operator (e.g. resend a returned payout from Money → Pending and failed, retry a stuck outbox row from Money, contact a requester cancelling in bulk). Don't invent problems the checks didn't find.`,
        tools: (ctx) => [scan, build, ctx.studio.viewSchema(), ctx.studio.viewPage(), ctx.studio.executeQuery(), ctx.tools.delegateTo(["widget", "page"])],
      });

      // AG's built-in specialists, unchanged, on Claude.
      const specialists = (["data", "planning", "page", "widget"] as const).map((id) => directLlmRunner({ ...builtIn[id], adapter }));

      // boreal's lead: AG's lead agent with boreal's context, delegating to AG's agents and ours.
      const lead = builtIn.lead;
      const ops = directLlmRunner({
        ...lead,
        id: "boreal-ops",
        name: "boreal.work ops",
        description: "boreal.work's operator agent: answers questions about boreal.work's money with live widgets.",
        adapter,
        instructions: (ctx, params) =>
          `${BOREAL}\n\nYou are boreal.work ops, the lead agent. Answer operators' questions about money by building live widgets on the current page with AG's agents (plan, then delegate to data, page and widget). For anything about anomalies, failures, stuck payouts, refunds spiking or escrow not matching, delegate to boreal-anomaly.\n\n${lead.instructions?.(ctx, params) ?? ""}`,
        tools: (ctx, params) => [
          ...(lead.tools?.(ctx, params) ?? []).filter((t: AgAiTool) => t.name !== "delegate_to"),
          ctx.tools.delegateTo(["data", "planning", "page", "widget", "boreal-anomaly"]),
        ],
      });

      return { agents: [ops, anomaly, ...specialists], primary: "boreal-ops", promptStarters: PROMPT_STARTERS };
    });
}
