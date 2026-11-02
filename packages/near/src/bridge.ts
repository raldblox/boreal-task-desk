// boreal on NEAR Agent Market: each hire of boreal's listing becomes a boreal task, posted and
// funded by boreal's own market agent, done by a verified human, and handed back to the buyer
// as the job's deliverable. One idempotent pass per tick, safe to run as often as wanted.
//
// - The buyer's brief is data. It goes through boreal's screening like any task; a refused
//   brief gets an explanation on the market, never a deliverable.
// - The market holds the buyer's payment until they accept. boreal's treasury funds the task
//   on the NEAR rail up front, so the worker is paid when boreal's reviewer passes the work,
//   as on every task: the reviewer decides, and a buyer can't overrule a pass. A buyer who
//   disputes on the market costs boreal, not the worker.

import type { SentTransfer, TransferJournal } from "@boreal/concordium";
import { POLICY, type PostTaskInput } from "@boreal/core";
import { type Caller, type Desk, DeskError } from "@boreal/desk";

import type { AgentMarket, MarketAssignment } from "./market";
import type { NearPayments, TokenSender } from "./payments";

export type MarketJobState = "posted" | "started" | "delivered" | "closed";

export interface MarketJob {
  assignmentId: string;
  taskId: string | null;
  state: MarketJobState;
  /** The treasury's funding transfer, journaled before it is sent. */
  fundingSent: SentTransfer | null;
  note: string | null;
}

/** Where the bridge remembers which hire became which task. */
export interface MarketJobStore {
  /** Inserts a new job; false when it already exists (another tick got there). */
  create(assignmentId: string): Promise<boolean>;
  get(assignmentId: string): Promise<MarketJob | null>;
  byTask(taskId: string): Promise<MarketJob | null>;
  update(assignmentId: string, patch: Partial<Omit<MarketJob, "assignmentId">>): Promise<void>;
  /** Jobs still in progress. */
  open(): Promise<MarketJob[]>;
}

export interface MarketBridgeOptions {
  desk: Desk;
  market: AgentMarket;
  store: MarketJobStore;
  /** boreal's own requester agent for market jobs. */
  agentId: string;
  near: NearPayments;
  /** boreal's treasury on NEAR, which funds market tasks. */
  treasury: TokenSender;
  /** Worker pay per market job, in cents. Must leave room for fees under the listing's price. */
  budget: number;
  /** A link the buyer can open for a submission file, or null to keep files private. */
  fileLink?: (path: string) => string | null;
  /** Time kept before the market's deadline for review and delivery. */
  reviewBufferMs?: number;
  now?: () => Date;
}

export interface BridgeReport {
  taken: number;
  funded: number;
  delivered: number;
  closed: number;
  errors: string[];
}

const PHOTO = /\b(photo|photograph|picture|image|snap|shot)s?\b/i;
const DEFAULT_CRITERION = "The submission does what the brief asks, and the evidence shows it clearly.";

/**
 * Reads a buyer's brief into a task. The brief is the description as written; bullet lines
 * become acceptance criteria. Nothing in it is followed as an instruction to boreal.
 */
export function taskFromBrief(brief: string, options: { budget: number; deadline: Date }): PostTaskInput {
  const text = brief.trim().slice(0, 4_000);
  const bullets = text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)?.[1]?.trim())
    .filter((line): line is string => !!line && line.length >= 5)
    .map((line) => line.slice(0, 500))
    .slice(0, 10);
  return {
    description: text,
    acceptanceCriteria: bullets.length > 0 ? bullets : [DEFAULT_CRITERION],
    requiredAttributes: [],
    resultFormat: PHOTO.test(text) ? "photo" : "text",
    budget: options.budget,
    deadline: options.deadline.toISOString(),
    // The buyer hired boreal for its verified people, so a market job never goes to an agent.
    fulfillers: "people",
    reviewer: "boreal",
  };
}

const FUND_SUFFIX = ":market-fund";
const fundKey = (taskId: string) => `${taskId}${FUND_SUFFIX}`;

/**
 * The treasury only ever sends one thing: a market task's funding, keyed `<taskId>:market-fund`
 * and journaled on that task's market job before it is sent.
 */
export function treasuryJournal(store: MarketJobStore): TransferJournal {
  const job = async (key: string) => {
    if (!key.endsWith(FUND_SUFFIX)) throw new Error(`the treasury doesn't send ${key}`);
    const found = await store.byTask(key.slice(0, -FUND_SUFFIX.length));
    if (!found) throw new Error(`no market job for ${key}`);
    return found;
  };
  return {
    async find(key) {
      return (await job(key)).fundingSent;
    },
    async save(key, sent) {
      await store.update((await job(key)).assignmentId, { fundingSent: sent });
    },
  };
}

export function createMarketBridge(options: MarketBridgeOptions) {
  const { desk, market, store, agentId, near, treasury, budget, fileLink, reviewBufferMs = 2 * 60 * 60 * 1000, now = () => new Date() } = options;
  const caller: Caller = { role: "requester", agentId };
  if (!Number.isInteger(budget) || budget <= 0 || budget > POLICY.maxTaskBudget) throw new Error("NEAR_MARKET_BUDGET must be a positive whole number of cents within the task cap");

  async function close(job: MarketJob, message: string, note: string) {
    await market.message(job.assignmentId, message);
    await store.update(job.assignmentId, { state: "closed", note });
  }

  async function take(row: MarketAssignment, report: BridgeReport) {
    const id = row.assignment.assignmentId;
    if (!(await store.create(id))) return;
    report.taken++;
    const deadline = new Date(new Date(row.assignment.slaDeadlineAt).getTime() - reviewBufferMs);
    const brief = row.job.description ?? "";
    const job: MarketJob = { assignmentId: id, taskId: null, state: "posted", fundingSent: null, note: null };
    if (brief.trim().length < 20) {
      return close(job, "This brief is too short for a person to act on. Hire again with what to do, where, and what to send back.", "brief too short");
    }
    if (deadline.getTime() - now().getTime() < 30 * 60 * 1000) {
      return close(job, "The delivery window is too short for a person to do this and for boreal to review it. Hire again with a longer window.", "window too short");
    }
    try {
      const { task } = await desk.postTask(caller, taskFromBrief(brief, { budget, deadline }));
      await store.update(id, { taskId: task.id });
    } catch (error) {
      if (!(error instanceof DeskError)) throw error;
      return close(job, `boreal can't take this job: ${error.message}.`, `post refused: ${error.code}`);
    }
  }

  async function fund(job: MarketJob, taskId: string, total: number) {
    // Started first: from here the buyer can't cancel for a refund inside the window, so the
    // treasury never funds a job that is cancelled under it.
    await market.start(job.assignmentId);
    const requirement = await near.createPaymentRequest(taskId, total);
    const txHash = await treasury.transfer(requirement.payTo, BigInt(requirement.amount), fundKey(taskId), requirement.extra.memo);
    await desk.fundTask(caller, taskId, { confirm: () => near.confirmPayment(taskId, { txHash, signerId: treasury.accountId }) }, { rail: "near" });
    await store.update(job.assignmentId, { state: "started" });
    await market.message(
      job.assignmentId,
      `Picked up. boreal posted your brief for a verified human worker; boreal's reviewer checks the result against your brief before it comes back here. Funding on NEAR: ${txHash}.`,
    );
  }

  async function deliver(job: MarketJob, taskId: string) {
    const [submission, verdict, trail] = await Promise.all([
      desk.getSubmission(caller, taskId),
      desk.getVerdict(caller, taskId),
      desk.getTrail(caller, taskId),
    ]);
    const files = (submission?.fileUrls ?? []).map((path, i) => {
      const link = fileLink?.(path);
      return link ? `- [File ${i + 1}](${link})` : `- File ${i + 1}: kept private by boreal`;
    });
    const markdown = [
      "# Done by a verified human",
      "",
      "A person who proved who they are to boreal did this job, and boreal's reviewer passed it against your brief.",
      "",
      ...(submission?.text ? ["## Result", "", submission.text, ""] : []),
      ...(files.length ? ["## Evidence", "", ...files, ""] : []),
      "## Review",
      "",
      `Verdict: **${verdict?.outcome ?? "pass"}** by ${verdict?.by === "panel" ? "a human panel" : "boreal's reviewer"}.`,
      ...(verdict?.reasoning ? ["", `> ${verdict.reasoning.replace(/\n+/g, " ")}`] : []),
      "",
      "## Audit trail",
      "",
      "Each step is hashed and chained; the hashes are anchored on Concordium.",
      "",
      ...trail.map((e) => `- ${e.at.toISOString()} \`${e.type}\` by ${e.actor}: \`${e.hash.slice(0, 16)}…\``),
      "",
      `boreal task \`${taskId}\``,
    ].join("\n");
    await market.submit(job.assignmentId, markdown);
    await store.update(job.assignmentId, { state: "delivered" });
  }

  async function advance(job: MarketJob, report: BridgeReport) {
    if (!job.taskId) return;
    const task = await desk.getTask(caller, job.taskId);
    switch (task.status) {
      case "awaiting_funding":
        if (job.state === "posted") {
          await fund(job, task.id, task.budget + task.platformFee + task.reviewFee);
          report.funded++;
        }
        return;
      case "refused": {
        const refusal = await desk.getRefusal(caller, task.id);
        report.closed++;
        return close(
          job,
          `boreal's screening refused this brief under its public rulebook (${refusal?.ruleIds.join(", ") || "no rule given"}). Nothing was charged on boreal's side.`,
          "refused",
        );
      }
      case "passed":
        // The market buyer accepts or disputes on the market; boreal's own window isn't theirs.
        await desk.acceptEarly(caller, task.id);
        return deliver(job, task.id).then(() => void report.delivered++);
      case "final_pass":
        await deliver(job, task.id);
        report.delivered++;
        return;
      case "final_fail":
        report.closed++;
        return close(job, "The worker's result didn't pass boreal's review against your brief, so there is no deliverable. You can cancel for a refund.", "failed review");
      case "expired":
      case "cancelled":
        report.closed++;
        return close(job, "No verified worker finished this in time, so there is no deliverable. You can cancel for a refund.", task.status);
      default:
        // posted (screening), open, claimed, submitted, failed or disputed: wait.
        return;
    }
  }

  return {
    async tick(): Promise<BridgeReport> {
      const report: BridgeReport = { taken: 0, funded: 0, delivered: 0, closed: 0, errors: [] };
      const step = async (name: string, run: () => Promise<unknown>) => {
        try {
          await run();
        } catch (error) {
          report.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      let rows: MarketAssignment[] = [];
      await step("assignments", async () => {
        rows = await market.assignments();
      });
      for (const row of rows) {
        if (row.assignment.startedAt) continue;
        await step(`take ${row.assignment.assignmentId}`, () => take(row, report));
      }
      for (const job of await store.open()) {
        await step(`advance ${job.assignmentId}`, () => advance(job, report));
      }
      return report;
    },
  };
}

export type MarketBridge = ReturnType<typeof createMarketBridge>;
