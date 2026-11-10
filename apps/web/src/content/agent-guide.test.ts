import { readAddons } from "@boreal/core";
import { describe, expect, it } from "vitest";

import { guideFacts, guideFor } from "./agent-guide";

// The agent guide tells the PayPal story, and mentions an integration only where it's on.

const PAYPAL_ONLY = guideFor(guideFacts(readAddons({ BOREAL_ADDONS: "none" })));
const ALL_ON = guideFor({ concordiumId: true, concordiumRail: true, registry: true, anchors: true, nearRail: true, privateReview: true, paypalVerifies: false });

describe("agent guide", () => {
  it("is all PayPal on a PayPal-only site", () => {
    for (const text of [PAYPAL_ONLY.AGENT_GUIDE, PAYPAL_ONLY.MCP_INSTRUCTIONS, PAYPAL_ONLY.LLMS_TXT]) {
      expect(text).toMatch(/PayPal/);
      expect(text).not.toMatch(/x402|PAYMENT-SIGNATURE|ft_transfer|Concordium ID App|Agent Registry|get_review_proof|NEAR AI Cloud|set_near_account|nearAccount|near-pay|payUrl|how they want to pay|how they'll pay/);
    }
    expect(PAYPAL_ONLY.AGENT_GUIDE).toMatch(/runs on PayPal/);
    expect(PAYPAL_ONLY.AGENT_GUIDE).toMatch(/This site runs on PayPal alone/);
    // Attributes need Concordium ID: the guide says to leave them out, and the example has none.
    expect(PAYPAL_ONLY.AGENT_GUIDE).toMatch(/`requiredAttributes`: leave it empty/);
    expect(PAYPAL_ONLY.AGENT_GUIDE).toContain('"requiredAttributes": []');
    // Verification is by the owner's PayPal account.
    expect(PAYPAL_ONLY.AGENT_GUIDE).toMatch(/owner's PayPal account is verified by PayPal/);
    expect(PAYPAL_ONLY.MCP_INSTRUCTIONS).not.toMatch(/optional rails/);
  });

  it("describes each integration, as optional, where it's on", () => {
    expect(ALL_ON.AGENT_GUIDE).toMatch(/runs on PayPal/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/\*\*Concordium\*\* \(integration/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/\*\*USDC on NEAR\*\* \(integration/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/Concordium and NEAR. PayPal works without them/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/anchored on Concordium/);
    expect(ALL_ON.AGENT_GUIDE).toContain('"requiredAttributes": [{ "attribute": "residency", "value": "PH" }]');
    expect(ALL_ON.MCP_INSTRUCTIONS).toMatch(/optional rails \(paypal, concordium, near\)/);
    // An agent's own NEAR wallet: how to make it, name it and have its owner fund it.
    expect(ALL_ON.AGENT_GUIDE).toMatch(/Ask your owner how they'll pay/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/before your first funding if you already have one/);
    expect(ALL_ON.MCP_INSTRUCTIONS).toMatch(/ask your owner how they want to pay for tasks/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/\*\*No NEAR wallet of your own\? Your owner pays from theirs\.\*\*/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/near-pay\.mjs` is one file, no dependencies/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/\*\*Your own NEAR wallet\*\*/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/\| set_near_account \| POST \/api\/v1\/me\/near-account \|/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/your `nearAccount` if you'll pay in USDC on NEAR/);
    // Private review: said once, and the proof is one call away.
    expect(ALL_ON.AGENT_GUIDE).toMatch(/private AI on NEAR AI Cloud/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/\| get_review_proof \| GET \/api\/v1\/tasks\/:id\/proof \|/);
  });
});
