import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import type { ReviewInput } from "./judge";
import { createNearAiReviewer } from "./near-ai";
import { checkProof, type PrivateInferenceProof, recoverSigner, sha256Hex } from "./tee-proof";

// A fake NEAR AI Cloud: answers chat completions with a set reply, signs each one the way the
// real service does (EIP-191 over "<model>:<request hash>:<response hash>"), and attests the
// signing key in a synthetic TDX v4 quote that binds the address and the caller's nonce.

const MODEL = "z-ai/glm-5.3-flash";
const KEY = secp256k1.utils.randomPrivateKey();
const ADDRESS = `0x${Buffer.from(keccak_256(secp256k1.getPublicKey(KEY, false).subarray(1)).subarray(12)).toString("hex")}`;

function sign(text: string, key = KEY): string {
  const message = Buffer.from(text, "utf8");
  const digest = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${message.length}`), message]));
  const sig = secp256k1.sign(digest, key);
  return `0x${Buffer.from(sig.toCompactRawBytes()).toString("hex")}${(27 + sig.recovery).toString(16)}`;
}

function quote(address: string, nonce: string): string {
  const q = Buffer.alloc(1000);
  q.writeUInt16LE(4, 0);
  Buffer.from(`${address.replace(/^0x/, "").padEnd(64, "0")}${nonce}`, "hex").copy(q, 48 + 520);
  return q.toString("hex");
}

interface FakeOptions {
  reply?: object | string;
  chatStatus?: number;
  /** Sign something other than the real response (a tampered or swapped answer). */
  signWrongResponse?: boolean;
  /** Attest a different key than the one that signs. */
  attestOther?: boolean;
  /** 404s before the signature is ready. */
  signatureMisses?: number;
}

function fakeNearAi(options: FakeOptions = {}) {
  const calls: string[] = [];
  let misses = options.signatureMisses ?? 0;
  let last: { request: string; response: string; id: string } | null = null;
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    calls.push(u.pathname);
    if (u.pathname.endsWith("/chat/completions")) {
      if (options.chatStatus && options.chatStatus !== 200) return new Response('{"error":{"message":"nope"}}', { status: options.chatStatus });
      const content = typeof options.reply === "string" ? options.reply : JSON.stringify(options.reply);
      const id = `chat-${calls.length}`;
      const response = JSON.stringify({ id, model: MODEL, choices: [{ message: { content }, finish_reason: "stop" }] });
      last = { request: String(init?.body), response, id };
      return new Response(response, { status: 200 });
    }
    if (u.pathname.includes("/signature/")) {
      if (misses-- > 0) return new Response("not yet", { status: 404 });
      const responseHash = options.signWrongResponse ? sha256Hex("something else") : sha256Hex(last!.response);
      const text = `${MODEL}:${sha256Hex(last!.request)}:${responseHash}`;
      return Response.json({ text, signature: sign(text), signing_address: ADDRESS, signing_algo: "ecdsa" });
    }
    if (u.pathname.endsWith("/attestation/report")) {
      const nonce = u.searchParams.get("nonce")!;
      const attested = options.attestOther ? "0x1111111111111111111111111111111111111111" : ADDRESS;
      return Response.json({ model_attestations: [{ signing_address: ADDRESS, intel_quote: quote(attested, nonce), request_nonce: nonce }] });
    }
    return new Response("not found", { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch: fakeFetch, calls };
}

const reviewer = (fake: ReturnType<typeof fakeNearAi>) =>
  createNearAiReviewer({ apiKey: "test-key", model: MODEL, fetch: fake.fetch, sleep: async () => {} });

let photo: Buffer;
beforeAll(async () => {
  photo = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#88aa99" } }).png().toBuffer();
});

const reviewInput = (): ReviewInput => ({
  description: "Photograph the storefront at 18 Gen. T. de Leon, Valenzuela, with its business sign.",
  acceptanceCriteria: ["The business sign is readable"],
  resultFormat: "photo",
  submission: { text: "Storefront attached.", files: [{ contentType: "image/png", bytes: photo }] },
});

const PASS = {
  criteria: [{ criterion: "The business sign is readable", met: true, evidence: 'The sign reads "Lakas Hardware Trading".' }],
  decision: "pass",
  rule_ids: ["R4.1"],
  reasoning: "The sign is readable and matches the brief.",
};

describe("NEAR AI private reviewer", () => {
  it("returns a verdict only with a proof that checks: hashes, signature and TEE quote", async () => {
    const fake = fakeNearAi({ reply: PASS });
    const result = await reviewer(fake).review(reviewInput());
    expect(result).toMatchObject({ outcome: "pass", ruleIds: ["R4.1"], model: MODEL });
    const proof = (result as { proof: PrivateInferenceProof }).proof;
    expect(proof).toMatchObject({ provider: "near-ai-cloud", model: MODEL, signingAddress: ADDRESS });
    expect(checkProof(proof)).toEqual([]);
    expect(recoverSigner(proof.signedText, proof.signature)).toBe(ADDRESS);
    expect(fake.calls).toEqual(["/v1/chat/completions", "/v1/signature/chat-1", "/v1/attestation/report"]);
  });

  it("sends a resized photo, never the original bytes", async () => {
    let body = "";
    const fake = fakeNearAi({ reply: PASS });
    const spy = (async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith("/chat/completions")) body = String(init?.body);
      return fake.fetch(url, init);
    }) as typeof fetch;
    await createNearAiReviewer({ apiKey: "k", model: MODEL, fetch: spy, sleep: async () => {} }).review(reviewInput());
    expect(body).toContain("data:image/jpeg;base64,");
    expect(body.length).toBeLessThan(photo.toString("base64").length);
    // The task block carries the task only; photo bytes never land in the prompt as text.
    expect(body).not.toMatch(/"type":"Buffer"/);
  });

  it("reuses an attested key until its TTL runs out", async () => {
    const fake = fakeNearAi({ reply: PASS });
    const r = reviewer(fake);
    await r.review(reviewInput());
    await r.review(reviewInput());
    expect(fake.calls.filter((c) => c.endsWith("/attestation/report"))).toHaveLength(1);
  });

  it("waits for a signature that isn't ready yet", async () => {
    const result = await reviewer(fakeNearAi({ reply: PASS, signatureMisses: 2 })).review(reviewInput());
    expect(result.outcome).toBe("pass");
  });

  it("retries rather than judge on an answer whose signature covers a different response", async () => {
    const result = await reviewer(fakeNearAi({ reply: PASS, signWrongResponse: true })).review(reviewInput());
    expect(result).toMatchObject({ outcome: "retry", reason: expect.stringMatching(/doesn't cover this request and response/) });
  });

  it("retries when the TEE quote doesn't bind the signing key", async () => {
    const result = await reviewer(fakeNearAi({ reply: PASS, attestOther: true })).review(reviewInput());
    expect(result).toMatchObject({ outcome: "retry", reason: expect.stringMatching(/quote doesn't bind/) });
  });

  it("retries when NEAR AI is busy or out of credits, and sends a bad request to a person", async () => {
    expect((await reviewer(fakeNearAi({ chatStatus: 429 })).review(reviewInput())).outcome).toBe("retry");
    expect((await reviewer(fakeNearAi({ chatStatus: 402 })).review(reviewInput())).outcome).toBe("retry");
    expect((await reviewer(fakeNearAi({ chatStatus: 503 })).review(reviewInput())).outcome).toBe("retry");
    expect((await reviewer(fakeNearAi({ chatStatus: 400 })).review(reviewInput())).outcome).toBe("needs_human");
  });

  it("sends unusable answers, unsure verdicts and files it can't read privately to a person", async () => {
    expect((await reviewer(fakeNearAi({ reply: "not json" })).review(reviewInput())).outcome).toBe("needs_human");
    expect(await reviewer(fakeNearAi({ reply: { ...PASS, decision: "unsure" } })).review(reviewInput())).toMatchObject({ outcome: "needs_human" });
    const pdf = { ...reviewInput(), submission: { text: null, files: [{ contentType: "application/pdf", bytes: Buffer.from("%PDF") }] } };
    expect(await reviewer(fakeNearAi({ reply: PASS })).review(pdf)).toMatchObject({ outcome: "needs_human", reason: expect.stringMatching(/privately/) });
  });

  it("applies the same rulebook checks as the Claude reviewer", async () => {
    // A pass with an unmet criterion and no R4.4 can't stand.
    const unmet = { ...PASS, criteria: [{ ...PASS.criteria[0]!, met: false }] };
    expect(await reviewer(fakeNearAi({ reply: unmet })).review(reviewInput())).toMatchObject({ outcome: "needs_human" });
  });

  it("screens with a proof, and refuses only on valid screening rules", async () => {
    const screen = { description: "Follow a person home.", acceptanceCriteria: ["Photo of the house"], requiredAttributes: [], resultFormat: "photo", budgetCents: 500 };
    const refused = await reviewer(fakeNearAi({ reply: { decision: "refuse", rule_ids: ["R2.2"], reasoning: "Harassment." } })).screen(screen);
    expect(refused).toMatchObject({ outcome: "refused", ruleIds: ["R2.2"] });
    expect(checkProof((refused as { proof: PrivateInferenceProof }).proof)).toEqual([]);
    const bogus = await reviewer(fakeNearAi({ reply: { decision: "refuse", rule_ids: ["R9.9"], reasoning: "?" } })).screen(screen);
    expect(bogus.outcome).toBe("needs_human");
  });
});

describe("checkProof", () => {
  it("names each problem with a tampered proof", async () => {
    const fake = fakeNearAi({ reply: PASS });
    const proof = ((await reviewer(fake).review(reviewInput())) as { proof: PrivateInferenceProof }).proof;
    expect(checkProof({ ...proof, responseSha256: "00" })).toEqual([expect.stringMatching(/doesn't cover/)]);
    expect(checkProof({ ...proof, signingAddress: "0x2222222222222222222222222222222222222222" })).toEqual([
      expect.stringMatching(/doesn't recover/),
      expect.stringMatching(/quote doesn't bind/),
    ]);
    expect(checkProof({ ...proof, attestation: { ...proof.attestation, nonce: "ab".repeat(32) } })).toEqual([expect.stringMatching(/quote doesn't bind/)]);
  });
});
