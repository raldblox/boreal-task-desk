// Acts as boreal's reviewer on one task, through the desk's own reviewer commands, for when
// no AI reviewer key is configured. Writes to the database in .env.local (production).
// Usage:
//   pnpm --filter @boreal/desk review show <taskId>
//   pnpm --filter @boreal/desk review screen <taskId> ok "<reasoning>"
//   pnpm --filter @boreal/desk review screen <taskId> refuse "<reasoning>" <ruleId>...
//   pnpm --filter @boreal/desk review verdict <taskId> pass|fail "<reasoning>" [ruleId...]
// Side effects (payouts, anchors) are queued on the outbox; the site's monitor sends them.

import { existsSync } from "node:fs";

import { createDb } from "@boreal/db";

import { type Caller, createDesk } from "../src/desk";

const envFile = "../../.env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [command, taskId, outcome, reasoning, ...ruleIds] = process.argv.slice(2);
if (!command || !taskId) {
  console.error("usage: review show|screen|verdict <taskId> …");
  process.exit(1);
}

const desk = createDesk({ db: createDb() });
const reviewer: Caller = { role: "reviewer", reviewerRef: "boreal-ai-reviewer" };

if (command === "show") {
  const task = await desk.getTask(reviewer, taskId);
  const submission = await desk.getSubmission(reviewer, taskId);
  console.log(JSON.stringify({ status: task.status, test: task.test, description: task.description, acceptanceCriteria: task.acceptanceCriteria, submission: submission && { text: submission.text, fileUrls: submission.fileUrls } }, null, 2));
} else if (command === "screen" && (outcome === "ok" || outcome === "refuse")) {
  const task = await desk.screenTask(
    reviewer,
    taskId,
    outcome === "ok" ? { outcome: "ok", reasoning } : { outcome: "refused", ruleIds, reasoning },
  );
  console.log("screened:", task.status);
} else if (command === "verdict" && (outcome === "pass" || outcome === "fail") && reasoning) {
  const task = await desk.recordVerdict(reviewer, taskId, { outcome, ruleIds, reasoning });
  console.log("verdict:", task.status);
} else {
  console.error("unknown command");
  process.exit(1);
}
process.exit(0);
