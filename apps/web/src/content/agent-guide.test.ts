import { readAddons } from "@boreal/core";
import { describe, expect, it } from "vitest";

import { guideFacts, guideFor } from "./agent-guide";

// The agent guide tells the PayPal story, and mentions an add-on only where it's on.

const PAYPAL_ONLY = guideFor(guideFacts(readAddons({ BOREAL_ADDONS: "none" })));
const ALL_ON = guideFor({ concordiumId: true, concordiumRail: true, registry: true, anchors: true, nearRail: true, paypalVerifies: false });

describe("agent guide", () => {
  it("is all PayPal on a PayPal-only site", () => {
    for (const text of [PAYPAL_ONLY.AGENT_GUIDE, PAYPAL_ONLY.MCP_INSTRUCTIONS, PAYPAL_ONLY.LLMS_TXT]) {
      expect(text).toMatch(/PayPal/);
      expect(text).not.toMatch(/x402|PAYMENT-SIGNATURE|ft_transfer|Concordium ID App|Agent Registry/);
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

  it("describes each add-on, as optional, where it's on", () => {
    expect(ALL_ON.AGENT_GUIDE).toMatch(/runs on PayPal/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/\*\*Concordium\*\* \(add-on/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/\*\*USDC on NEAR\*\* \(add-on/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/Concordium and NEAR. PayPal works without them/);
    expect(ALL_ON.AGENT_GUIDE).toMatch(/anchored on Concordium/);
    expect(ALL_ON.AGENT_GUIDE).toContain('"requiredAttributes": [{ "attribute": "residency", "value": "PH" }]');
    expect(ALL_ON.MCP_INSTRUCTIONS).toMatch(/optional rails \(paypal, concordium, near\)/);
  });
});
