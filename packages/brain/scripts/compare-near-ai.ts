// Compares NEAR-hosted (TEE) vision models on two reviews: a generated photo with unreadable
// labels (must not pass) and a real screenshot with readable text (should pass).
// Usage (from packages/brain): pnpm exec tsx scripts/compare-near-ai.ts [model ...]
// Reads NEAR_AI_API_KEY from ../../.env.local; never prints it. Costs a few cents at most.
import { readFileSync } from "node:fs";

import { checkProof, createNearAiReviewer, type ReviewInput } from "../src/index";

const env = Object.fromEntries(
  readFileSync("../../.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
if (!env.NEAR_AI_API_KEY) throw new Error("NEAR_AI_API_KEY is not in .env.local");

const CASES: { name: string; expect: string; input: ReviewInput }[] = [
  {
    name: "generated shelf photo",
    expect: "not pass",
    input: {
      description: "Photograph the Korean sunscreen shelf at the Watsons on Taft Avenue, Malate, with the price tags readable.",
      acceptanceCriteria: ["Product names are readable", "Each product's price tag is readable"],
      resultFormat: "photo",
      submission: { text: "Here is the shelf, prices on the tags.", files: [{ contentType: "image/png", bytes: readFileSync("../../apps/film/public/proofs/sunscreen-store-a.png") }] },
    },
  },
  {
    name: "real status screenshot",
    expect: "pass",
    input: {
      description: "Take a screenshot of the boreal testnet status page that shows whether everything is working.",
      acceptanceCriteria: ["The page title is readable", "The overall status is readable", "The database's response time is readable"],
      resultFormat: "photo",
      submission: { text: "Screenshot attached.", files: [{ contentType: "image/png", bytes: readFileSync("C:/Users/raldb/Downloads/devpost-images/19-ui-status-live.png") }] },
    },
  },
];

const models = process.argv.slice(2).length ? process.argv.slice(2) : ["Qwen/Qwen3-VL-30B-A3B-Instruct", "Qwen/Qwen3.8-27B", "z-ai/glm-5.3-flash"];
for (const model of models) {
  const reviewer = createNearAiReviewer({ apiKey: env.NEAR_AI_API_KEY, model });
  for (const c of CASES) {
    const started = Date.now();
    const result = await reviewer.review(c.input);
    const proof = "proof" in result && result.proof ? (checkProof(result.proof).length ? "PROOF FAILED" : "proof ok") : "no proof";
    const verdict = "reason" in result ? `${result.outcome}: ${result.reason.slice(0, 160)}` : `${result.outcome} ${result.ruleIds.join(",")}: ${result.reasoning.slice(0, 200)}`;
    console.log(`\n[${model}] ${c.name} (expect ${c.expect}) · ${((Date.now() - started) / 1000).toFixed(1)}s · ${proof}\n  ${verdict}`);
  }
}
