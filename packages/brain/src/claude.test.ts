import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { createClaudeReviewer, type ReviewInput } from "./claude";

/** A stand-in for the SDK that records each request and returns a scripted response. */
function fakeClient(reply: (() => object) | object) {
  const requests: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: Record<string, unknown>) => {
          requests.push(params);
          const next = typeof reply === "function" ? (reply as () => object)() : reply;
          return { stop_reason: "end_turn", model: "claude-opus-5-5", stop_details: null, ...next };
        },
      },
    },
  } as unknown as Pick<Anthropic, "beta">;
  return { client, requests };
}

const screenInput = {
  description: "Photograph item X on the shelf at the Manila shop, with its price tag visible.",
  acceptanceCriteria: ["Photo shows item X on a shelf", "Price tag is readable"],
  requiredAttributes: [{ attribute: "residency", value: "PH" }],
  resultFormat: "photo",
  budgetCents: 250,
};

const reviewInput: ReviewInput = {
  description: screenInput.description,
  acceptanceCriteria: screenInput.acceptanceCriteria,
  resultFormat: "photo",
  submission: { text: "Second shelf, left.", files: [{ contentType: "image/jpeg", bytes: Buffer.from([1, 2, 3]) }] },
};

const met = (ok = true) => screenInput.acceptanceCriteria.map((criterion) => ({ criterion, met: ok, evidence: "seen" }));

describe("request shape", () => {
  it("uses Opus 5.5 with default fallbacks, a cached rulebook prompt, and the photo as an image", async () => {
    const { client, requests } = fakeClient({
      parsed_output: { criteria: met(), decision: "pass", rule_ids: [], reasoning: "All criteria met." },
    });
    await createClaudeReviewer({ client }).review(reviewInput);
    const req = requests[0] as {
      model: string;
      fallbacks: string;
      betas: string[];
      system: { text: string; cache_control: object }[];
      messages: { content: { type: string; text?: string; source?: { data: string } }[] }[];
    };
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
    expect(req.system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0]!.text).toContain("R4.2");
    const content = req.messages[0]!.content;
    expect(content.find((b) => b.type === "image")?.source?.data).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(content.at(-1)?.text).toContain("<submission>");
  });
});

describe("screening", () => {
  it("allows a clean task", async () => {
    const { client } = fakeClient({ parsed_output: { decision: "allow", rule_ids: [], reasoning: "Clear and allowed." } });
    expect(await createClaudeReviewer({ client }).screen(screenInput)).toEqual({ outcome: "ok", reasoning: "Clear and allowed." });
  });

  it("refuses with the screening rules it cites", async () => {
    const { client } = fakeClient({ parsed_output: { decision: "refuse", rule_ids: ["R2.3", "R2.3"], reasoning: "Collects data." } });
    expect(await createClaudeReviewer({ client }).screen(screenInput)).toMatchObject({ outcome: "refused", ruleIds: ["R2.3"] });
  });

  it("sends a refusal citing a non-screening rule to a human", async () => {
    const { client } = fakeClient({ parsed_output: { decision: "refuse", rule_ids: ["R4.1"], reasoning: "x" } });
    expect((await createClaudeReviewer({ client }).screen(screenInput)).outcome).toBe("needs_human");
  });
});

describe("review", () => {
  const review = async (reply: object) => createClaudeReviewer({ client: fakeClient(reply).client }).review(reviewInput);

  it("passes when every criterion is met", async () => {
    const result = await review({ parsed_output: { criteria: met(), decision: "pass", rule_ids: ["R4.1"], reasoning: "ok" } });
    expect(result).toMatchObject({ outcome: "pass", model: "claude-opus-5-5" });
  });

  it("fails with a cited rule and a missed criterion", async () => {
    const result = await review({
      parsed_output: { criteria: met(false), decision: "fail", rule_ids: ["R4.1", "R4.2"], reasoning: "Tag unreadable." },
    });
    expect(result).toMatchObject({ outcome: "fail", ruleIds: ["R4.1", "R4.2"] });
  });

  it.each([
    ["a fail citing no rule", { criteria: met(false), decision: "fail", rule_ids: [], reasoning: "no" }],
    ["a fail citing an invented rule", { criteria: met(false), decision: "fail", rule_ids: ["R9.9"], reasoning: "no" }],
    ["a fail with every criterion met", { criteria: met(), decision: "fail", rule_ids: ["R4.1"], reasoning: "no" }],
    ["a pass with unmet criteria", { criteria: met(false), decision: "pass", rule_ids: [], reasoning: "eh" }],
    ["an unsure answer", { criteria: met(), decision: "unsure", rule_ids: [], reasoning: "blurry" }],
  ])("sends %s to a human", async (_name, parsed_output) => {
    expect((await review({ parsed_output })).outcome).toBe("needs_human");
  });

  it("accepts a pass on an impossible task with R4.4", async () => {
    const result = await review({ parsed_output: { criteria: met(false), decision: "pass", rule_ids: ["R4.4"], reasoning: "Shop closed for good." } });
    expect(result.outcome).toBe("pass");
  });

  it("sends a model refusal or an unparsed answer to a human", async () => {
    expect((await review({ stop_reason: "refusal", stop_details: { category: "cyber" }, parsed_output: null })).outcome).toBe("needs_human");
    expect((await review({ parsed_output: null })).outcome).toBe("needs_human");
  });

  it("retries later when Claude is rate limited", async () => {
    const client = {
      beta: { messages: { parse: async () => { throw new Anthropic.RateLimitError(429, undefined, "slow down", new Headers()); } } },
    } as unknown as Pick<Anthropic, "beta">;
    expect((await createClaudeReviewer({ client }).review(reviewInput)).outcome).toBe("retry");
  });

  it("won't review a file type it can't read", async () => {
    const { client, requests } = fakeClient({});
    const result = await createClaudeReviewer({ client }).review({
      ...reviewInput,
      submission: { text: null, files: [{ contentType: "image/heic", bytes: Buffer.from([1]) }] },
    });
    expect(result.outcome).toBe("needs_human");
    expect(requests).toHaveLength(0);
  });
});

describe("dispute vote", () => {
  const disputeInput = {
    ...reviewInput,
    verdict: { outcome: "fail" as const, ruleIds: ["R4.5"], reasoning: "The price tag can't be read.", by: "ai" },
    statements: [{ party: "worker" as const, reason: "The tag is readable in the second photo: 129.50." }],
  };

  it("sends the verdict and both statements after the submission, as material to weigh", async () => {
    const { client, requests } = fakeClient({
      parsed_output: { criteria: met(), decision: "pass", rule_ids: [], reasoning: "The second photo shows the tag clearly; I disagree with the fail." },
    });
    const vote = await createClaudeReviewer({ client }).dispute(disputeInput);
    expect(vote).toMatchObject({ outcome: "pass", model: "claude-opus-5-5" });
    const content = (requests[0] as { messages: { content: { type: string; text?: string }[] }[] }).messages[0]!.content;
    expect(content[0]!.text).toContain("dispute panel");
    expect(content.at(-1)?.text).toContain("<statements>");
    expect(content.at(-1)?.text).toContain("129.50");
  });

  it("holds a vote to the same checks as a review: a fail without a failing rule goes to the person", async () => {
    const { client } = fakeClient({ parsed_output: { criteria: met(false), decision: "fail", rule_ids: [], reasoning: "Not good." } });
    expect((await createClaudeReviewer({ client }).dispute(disputeInput)).outcome).toBe("needs_human");
  });
});
