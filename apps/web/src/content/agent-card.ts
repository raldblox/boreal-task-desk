import { createHash } from "node:crypto";

import { badgeCardFields, type RegistryNetwork } from "@boreal/concordium";

// boreal.work's own entry in Concordium's Agent Registry: an A2A v1.0 Agent Card that is also
// an ERC-8004 registration file, served at /.well-known/agent-card.json. The registry pins the
// card's SHA-256 on-chain, so the served bytes must never drift: fixed key order, nothing that
// changes between requests (no fees, counts or timestamps), and every change ships with a
// CARD_VERSION bump and a new on-chain hash (docs/registry.md).

/**
 * Bump on any change to the card's bytes, then pin the new hash in the registry. The snapshot
 * test fails until the new version's hashes are recorded there.
 */
export const CARD_VERSION = "1.1.0";

/**
 * The card before it listed A2A, still served while `A2A_IN_CARD` is off, so deploying the A2A
 * endpoint doesn't change the pinned bytes. Turning the flag on serves CARD_VERSION, whose new
 * hash must be pinned right after (docs/registry.md).
 */
export const CARD_VERSION_WITHOUT_A2A = "1.0.0";

export const CARD_PATH = "/.well-known/agent-card.json";

/** The MCP revision boreal's server speaks (the SDK's latest). */
const MCP_PROTOCOL_VERSION = "2025-11-25";
/** The A2A version /api/a2a speaks (JSON-RPC binding). */
const A2A_PROTOCOL_VERSION = "1.0";

export interface CardInput {
  /** This deployment's address, e.g. https://testnet.boreal.work. */
  site: string;
  /** The live site, for the provider link. */
  liveSite: string;
  network: RegistryNetwork;
  /** True where the Concordium x402 rail is switched on. */
  x402: boolean;
  /** boreal's own registry badge and the account that owns it, once registered. */
  badge: { token: string; owner: string } | null;
  /** List the A2A endpoint (`A2A_IN_CARD=1`). Off keeps the 1.0.0 card's bytes exactly. */
  a2a?: boolean;
}

const SERVICE = `boreal.work is a verified human task desk for AI agents. Hand off a step you can't do alone to a verified human: something in the physical world (visit a place, photograph a shelf, check a notice, buy an item) or a judgment only a person can give. Fund the task into escrow, a reviewer judges the result against your own acceptance criteria, and you pay only for work that passes. Every step lands in a hash-chained audit trail anchored on Concordium.

boreal is a deterministic service, not an AI agent: its rulebook decides every state change. Connect over MCP or REST; an agent links itself with request_link and its owner approves the key.`;

const SERVICE_A2A = `${SERVICE.slice(0, SERVICE.indexOf("Connect over"))}Connect over A2A, MCP or REST; an agent links itself with request_link and its owner approves the key. Over A2A, each message carries one structured data part, { "action": "<tool>", ...arguments }: boreal doesn't read free text.`;

/** The card as an object, keys in their served order. */
export function agentCard({ site, liveSite, network, x402, badge, a2a = false }: CardInput) {
  const badgeFields = badge ? badgeCardFields(network, badge.token, badge.owner) : null;
  const testnet = network === "testnet";
  const mcp = `${site}/api/mcp`;
  const rest = `${site}/api/v1`;
  const a2aUrl = `${site}/api/a2a`;
  const service = a2a ? SERVICE_A2A : SERVICE;
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: testnet ? "boreal.work testnet" : "boreal.work",
    description: testnet
      ? `${service}\n\nThis is boreal's testnet: money here is never real (PayPal sandbox, Concordium testnet tokens). The live site is ${liveSite}, with its own keys and accounts. Guide: ${site}/agents.md`
      : `${service}\n\nThis is the live site: money here is real. Guide: ${site}/agents.md`,
    version: a2a ? CARD_VERSION : CARD_VERSION_WITHOUT_A2A,
    provider: { organization: "boreal.work", url: liveSite },
    documentationUrl: `${site}/agents.md`,
    // A2A first (JSON-RPC); MCP and REST name their own protocols, so A2A clients skip them.
    supportedInterfaces: [
      ...(a2a ? [{ url: a2aUrl, protocolBinding: "JSONRPC", protocolVersion: A2A_PROTOCOL_VERSION }] : []),
      { url: mcp, protocolBinding: "MCP", protocolVersion: MCP_PROTOCOL_VERSION },
      { url: rest, protocolBinding: "REST", protocolVersion: "v1" },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      ...(badgeFields ? { extensions: [badgeFields.extension] } : {}),
    },
    // Over A2A boreal reads data parts only; the older card kept text/plain.
    defaultInputModes: a2a ? ["application/json"] : ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    ...(a2a
      ? {
          securitySchemes: {
            borealKey: {
              httpAuthSecurityScheme: {
                scheme: "Bearer",
                description: "Your boreal agent key (bk_...). Without one, send the request_link action and have your owner approve it.",
              },
            },
          },
          securityRequirements: [{ schemes: { borealKey: { list: [] } } }],
        }
      : {}),
    skills: [
      {
        id: "hire-verified-human",
        name: "Hire a verified human",
        description:
          "Post a task for a step that needs a person: something in the physical world (visit, photograph, check, buy) or a judgment only a human can give. Limit it to workers who proved an attribute (18 or older, country of residence) with Concordium ID.",
        tags: ["human-in-the-loop", "physical-world", "tasks", "verified-humans"],
      },
      {
        id: "quote-fees",
        name: "Quote fees",
        description: "Get the exact total for a worker budget before posting: the budget plus boreal's platform and review fees, in US cents.",
        tags: ["fees", "pricing"],
      },
      {
        id: "fund-escrow",
        name: "Fund a task into escrow",
        description:
          "Pay a task's total into escrow with PayPal or, where it is switched on, a Concordium x402 token payment. The worker is paid only on a final pass; fails, expiries and cancellations are refunded.",
        tags: ["escrow", "payments", "paypal", "x402", "concordium"],
      },
      {
        id: "review-results",
        name: "Review and accept results",
        description:
          "Read the worker's submission, pass or fail it against your acceptance criteria citing the rulebook, accept a pass early to pay at once, or dispute a verdict once before a panel with a human member.",
        tags: ["review", "acceptance", "disputes"],
      },
      {
        id: "audit-trail",
        name: "Read the audit trail",
        description: "Get a task's hash-chained event trail, anchored on Concordium as salted hashes, to show what happened and when.",
        tags: ["audit", "provenance", "concordium"],
      },
    ],
    services: [
      ...(a2a ? [{ name: "A2A", endpoint: a2aUrl, version: A2A_PROTOCOL_VERSION }] : []),
      { name: "MCP", endpoint: mcp, version: MCP_PROTOCOL_VERSION },
      { name: "REST", endpoint: rest, version: "v1" },
      { name: "web", endpoint: site },
    ],
    x402Support: x402,
    active: true,
    registrations: badgeFields ? [badgeFields.registration] : [],
  };
}

/** The exact bytes served, and their SHA-256 (what the registry pins on-chain). */
export function agentCardBytes(input: CardInput): { body: string; sha256: string } {
  const body = JSON.stringify(agentCard(input), null, 2);
  return { body, sha256: createHash("sha256").update(body, "utf8").digest("hex") };
}
