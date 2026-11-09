// Measures what one screening and one photo review cost on NEAR AI Cloud, from the API's own
// usage counts and the model's listed prices. Usage (from packages/brain):
//   pnpm exec tsx scripts/cost-near-ai.ts [model]
// Reads NEAR_AI_API_KEY from ../../.env.local; never prints it.
import { readFileSync } from "node:fs";

import { z } from "zod";

import { reviewPrompt, reviewSchema, screenPrompt, screenSchema, submissionBlock, SYSTEM } from "../src/judge";
import { fitImage, NEAR_AI_DEFAULT_MODEL, NEAR_AI_URL } from "../src/near-ai";

const env = Object.fromEntries(
  readFileSync("../../.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const model = process.argv[2] ?? NEAR_AI_DEFAULT_MODEL;
const auth = { Authorization: `Bearer ${env.NEAR_AI_API_KEY}` };
const models = (await (await fetch(`${NEAR_AI_URL}/models`, { headers: auth })).json()) as { data: { id: string; pricing: { input: number; output: number } }[] };
const price = models.data.find((m) => m.id === model)!.pricing;

async function run(label: string, schema: z.ZodType, name: string, content: unknown) {
  const body = JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 12000,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content },
    ],
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema: z.toJSONSchema(schema) } },
  });
  const res = (await (await fetch(`${NEAR_AI_URL}/chat/completions`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body })).json()) as {
    usage: { prompt_tokens: number; completion_tokens: number; completion_tokens_details?: { reasoning_tokens?: number } };
  };
  const u = res.usage;
  const usd = (u.prompt_tokens * price.input + u.completion_tokens * price.output) / 1e6;
  console.log(`${label}: ${u.prompt_tokens} in, ${u.completion_tokens} out (${u.completion_tokens_details?.reasoning_tokens ?? "?"} reasoning) = $${usd.toFixed(5)}`);
  return usd;
}

const screen = await run("screening", screenSchema, "screening", screenPrompt({
  description: "Before we pay a 30% deposit, confirm the supplier Lakas Hardware Trading operates a warehouse at 18 Gen. T. de Leon, Valenzuela. Photograph the storefront with its business sign and street number, and say whether it is open.",
  acceptanceCriteria: ["Business sign shows the supplier's name", "Street number is visible", "Says whether it is open"],
  requiredAttributes: [],
  resultFormat: "photo",
  budgetCents: 649,
}));
const input = {
  description: "Photograph the Korean sunscreen shelf at the Watsons on Taft Avenue, Malate, with the price tags readable.",
  acceptanceCriteria: ["Product names are readable", "Each product's price tag is readable"],
  resultFormat: "photo",
  submission: { text: "Here is the shelf.", files: [{ contentType: "image/png", bytes: readFileSync("../../apps/film/public/proofs/sunscreen-store-a.png") }] },
};
const review = await run("review (1 photo)", reviewSchema, "review", [
  { type: "text", text: reviewPrompt(input) },
  { type: "image_url", image_url: { url: await fitImage(input.submission.files[0]!.bytes) } },
  { type: "text", text: submissionBlock(input) },
]);
console.log(`model ${model}: $${price.input}/M in, $${price.output}/M out · one screening + one review ≈ $${(screen + review).toFixed(4)}`);
