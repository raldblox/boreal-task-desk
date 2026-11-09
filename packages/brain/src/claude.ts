import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

import {
  IMAGE_TYPES,
  type Reviewer,
  reviewOutcome,
  reviewPrompt,
  reviewSchema,
  screenOutcome,
  screenPrompt,
  screenSchema,
  submissionBlock,
  SYSTEM,
  type Undecided,
} from "./judge";
import { RULEBOOK_VERSION } from "./rulebook";

// boreal.work's AI reviewer on Claude. It suggests; code decides. Every answer is checked
// against the rulebook (judge.ts) before it can become a verdict, and anything uncertain goes
// to a human.

export type { ReviewInput, Reviewer, ReviewResult, ScreenInput, ScreenResult } from "./judge";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeReviewerOptions {
  client?: Pick<Anthropic, "beta">;
  model?: string;
  effort?: Effort;
}

/** Rate limits, overloads and connection trouble are worth retrying; anything else needs a person. */
function undecided(error: unknown): Undecided {
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
    return { outcome: "retry", reason: `Claude unavailable: ${error.message}` };
  }
  if (error instanceof Anthropic.APIConnectionError) return { outcome: "retry", reason: "could not reach Claude" };
  if (error instanceof Anthropic.APIError) return { outcome: "needs_human", reason: `Claude API error ${error.status}` };
  return { outcome: "needs_human", reason: error instanceof Error ? error.message : "reviewer failed" };
}

export function createClaudeReviewer(options: ClaudeReviewerOptions = {}): Reviewer {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? "claude-opus-5-5";
  const effort = options.effort ?? "high";

  async function ask<S extends z.ZodType>(
    schema: S,
    content: Anthropic.Beta.BetaContentBlockParam[],
  ): Promise<{ parsed: z.infer<S>; model: string } | Undecided> {
    let response;
    try {
      response = await client.beta.messages.parse({
        model,
        max_tokens: 16000,
        // A safety decline is re-run on Anthropic's recommended fallback model, chosen by category.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // The rulebook prompt is identical for every call, so it is cached.
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        output_config: { effort, format: betaZodOutputFormat(schema) },
      });
    } catch (error) {
      return undecided(error);
    }
    if (response.stop_reason === "refusal") {
      return { outcome: "needs_human", reason: `the model declined (${response.stop_details?.category ?? "no category"})` };
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return { outcome: "needs_human", reason: "the reviewer gave no usable answer" };
    }
    return { parsed: response.parsed_output as z.infer<S>, model: response.model };
  }

  return {
    async screen(input) {
      const answer = await ask(screenSchema, [{ type: "text", text: screenPrompt(input) }]);
      if ("outcome" in answer) return answer;
      return screenOutcome(answer.parsed);
    },

    async review(input) {
      const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: reviewPrompt(input) }];
      for (const file of input.submission.files) {
        const data = file.bytes.toString("base64");
        if (file.contentType === "application/pdf") {
          content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
        } else if (IMAGE_TYPES.includes(file.contentType)) {
          content.push({
            type: "image",
            source: { type: "base64", media_type: file.contentType as "image/jpeg", data },
          });
        } else {
          return { outcome: "needs_human", reason: `can't review a ${file.contentType} file` };
        }
      }
      content.push({ type: "text", text: submissionBlock(input) });

      const answer = await ask(reviewSchema, content);
      if ("outcome" in answer) return answer;
      return reviewOutcome(answer.parsed, input, answer.model);
    },
  };
}

export { RULEBOOK_VERSION };
