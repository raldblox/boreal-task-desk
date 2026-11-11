import { randomBytes } from "node:crypto";

import sharp from "sharp";
import { z } from "zod";

import {
  IMAGE_TYPES,
  type Reviewer,
  type ReviewInput,
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
import { checkProof, type PrivateInferenceProof, sha256Hex } from "./tee-proof";

// boreal.work's private reviewer: the same prompt and checks as the Claude reviewer, run on a
// model NEAR AI Cloud hosts inside a TEE (Intel TDX with NVIDIA confidential GPUs). The task,
// the worker's photos and the answer are never readable outside that TEE, and every answer
// comes back with a signature and an attestation that prove it (tee-proof.ts).
//
// A verdict is only returned with a proof that checks out. When the proof can't be fetched or
// doesn't check, the task is retried later rather than judged on an unproven answer, so the
// privacy promise holds for every verdict this reviewer gives.

export const NEAR_AI_URL = "https://cloud-api.near.ai/v1";
/** NEAR-hosted (TEE), reads photos, structured output. Chosen over Qwen3-VL-30B, which passed a generated photo with unreadable labels (scripts/compare-near-ai.ts). */
export const NEAR_AI_DEFAULT_MODEL = "z-ai/glm-5.3-flash";

/**
 * A photo sized for the model: at most 1280 px on its longest side, as JPEG. Enough to read a
 * price tag or a street number, and small enough for NEAR AI Cloud's request limit.
 */
export async function fitImage(bytes: Buffer): Promise<string> {
  const jpeg = await sharp(bytes, { animated: false })
    .rotate()
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export interface NearAiReviewerOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** How long a checked attestation of a signing key is reused, in ms. */
  attestationTtlMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

type Content = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

interface ModelAttestation {
  signing_address: string;
  intel_quote: string;
  request_nonce?: string;
}

class NearAiError extends Error {
  constructor(
    message: string,
    readonly retry: boolean,
  ) {
    super(message);
  }
}

export function createNearAiReviewer(options: NearAiReviewerOptions): Reviewer {
  const model = options.model ?? NEAR_AI_DEFAULT_MODEL;
  const base = (options.baseUrl ?? NEAR_AI_URL).replace(/\/+$/, "");
  const http = options.fetch ?? fetch;
  const ttl = options.attestationTtlMs ?? 60 * 60 * 1000;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => new Date());
  const auth = { Authorization: `Bearer ${options.apiKey}` };
  /** Signing keys already attested, by address: reused until the TTL runs out. */
  const attested = new Map<string, PrivateInferenceProof["attestation"]>();

  async function call(path: string, init?: RequestInit): Promise<{ status: number; body: string }> {
    let res: Response;
    try {
      // Inference on a TEE-hosted model can take a while; past this it counts as an outage and is retried.
      res = await http(`${base}${path}`, { ...init, headers: { ...auth, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(120_000) });
    } catch {
      throw new NearAiError("could not reach NEAR AI Cloud", true);
    }
    return { status: res.status, body: await res.text() };
  }

  function failed(what: string, status: number): NearAiError {
    // 402 is out of credits, 429 and 5xx are busy: all clear up on their own or with a top-up.
    const retry = status === 402 || status === 408 || status === 429 || status >= 500;
    return new NearAiError(`NEAR AI Cloud ${what} answered ${status}${status === 402 ? " (out of credits)" : ""}`, retry);
  }

  /** The signing key's attestation, with a fresh nonce bound into the TEE quote. */
  async function attestation(address: string): Promise<PrivateInferenceProof["attestation"]> {
    const cached = attested.get(address);
    if (cached && now().getTime() - new Date(cached.checkedAt).getTime() < ttl) return cached;
    const nonce = randomBytes(32).toString("hex");
    const { status, body } = await call(`/attestation/report?model=${encodeURIComponent(model)}&signing_algo=ecdsa&nonce=${nonce}`);
    if (status !== 200) throw failed("attestation", status);
    const report = JSON.parse(body) as { model_attestations?: ModelAttestation[] };
    const match = (report.model_attestations ?? []).find((m) => m.signing_address.toLowerCase() === address);
    // Another instance answered this attestation; the next try may reach the one that signed.
    if (!match) throw new NearAiError("the signing key wasn't in the model's attestation", true);
    const fresh = { nonce, checkedAt: now().toISOString(), intelQuote: match.intel_quote };
    attested.set(address, fresh);
    return fresh;
  }

  /** NEAR AI's signature over this completion, fetched once it's ready. */
  async function signature(completionId: string): Promise<{ text: string; signature: string; signing_address: string }> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { status, body } = await call(`/signature/${encodeURIComponent(completionId)}?model=${encodeURIComponent(model)}&signing_algo=ecdsa`);
      if (status === 200) return JSON.parse(body);
      if (status !== 404) throw failed("signature", status);
      await sleep(750 * (attempt + 1));
    }
    throw new NearAiError("NEAR AI Cloud had no signature for the answer", true);
  }

  async function ask<S extends z.ZodType>(schema: S, name: string, content: Content): Promise<{ parsed: z.infer<S>; proof: PrivateInferenceProof } | Undecided> {
    try {
      const request = JSON.stringify({
        model,
        temperature: 0,
        // Room for the models that reason before answering.
        max_tokens: 12000,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema: z.toJSONSchema(schema) } },
      });
      const { status, body } = await call("/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: request });
      if (status !== 200) {
        // Say why: a 4xx body names the problem (context too long, bad request), never the request itself.
        const detail = status === 413 || status === 400 ? `: ${body.slice(0, 200)}` : "";
        throw Object.assign(failed("chat", status), detail ? { message: `${failed("chat", status).message}${detail}` } : {});
      }
      const completion = JSON.parse(body) as { id: string; model?: string; choices?: { message?: { content?: string | null }; finish_reason?: string }[] };
      const choice = completion.choices?.[0];
      if (choice?.finish_reason === "length") return { outcome: "needs_human", reason: "the reviewer's answer was cut off" };

      const signed = await signature(completion.id);
      const address = signed.signing_address.toLowerCase();
      const proof: PrivateInferenceProof = {
        provider: "near-ai-cloud",
        model,
        completionId: completion.id,
        requestSha256: sha256Hex(request),
        responseSha256: sha256Hex(body),
        signedText: signed.text,
        signature: signed.signature,
        signingAddress: address,
        attestation: await attestation(address),
      };
      const problems = checkProof(proof);
      if (problems.length > 0) {
        // A key rotated since it was attested: attest again before trusting it.
        attested.delete(address);
        return { outcome: "retry", reason: `NEAR AI proof didn't check: ${problems.join("; ")}` };
      }

      let parsed: z.infer<S>;
      try {
        parsed = schema.parse(JSON.parse(choice?.message?.content ?? ""));
      } catch {
        return { outcome: "needs_human", reason: "the reviewer gave no usable answer" };
      }
      return { parsed, proof };
    } catch (error) {
      if (error instanceof NearAiError) return { outcome: error.retry ? "retry" : "needs_human", reason: error.message };
      return { outcome: "needs_human", reason: error instanceof Error ? error.message : "reviewer failed" };
    }
  }

  return {
    async screen(input) {
      const answer = await ask(screenSchema, "screening", screenPrompt(input));
      if ("outcome" in answer) return answer;
      const result = screenOutcome(answer.parsed);
      return "reason" in result ? result : { ...result, proof: answer.proof };
    },

    async review(input: ReviewInput) {
      const content: Exclude<Content, string> = [{ type: "text", text: reviewPrompt(input) }];
      for (const file of input.submission.files) {
        if (!IMAGE_TYPES.includes(file.contentType)) return { outcome: "needs_human", reason: `can't review a ${file.contentType} file privately` };
        let url: string;
        try {
          url = await fitImage(file.bytes);
        } catch {
          return { outcome: "needs_human", reason: "a submitted photo couldn't be read" };
        }
        content.push({ type: "image_url", image_url: { url } });
      }
      content.push({ type: "text", text: submissionBlock(input) });
      const answer = await ask(reviewSchema, "review", content);
      if ("outcome" in answer) return answer;
      const result = reviewOutcome(answer.parsed, input, answer.proof.model);
      return "reason" in result ? result : { ...result, proof: answer.proof };
    },
  };
}
