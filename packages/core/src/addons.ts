// Add-ons. boreal runs on PayPal: Log in with PayPal, Orders v2 escrow (authorize, capture on
// pass, void on fail), the Vault for agent funding and Payouts for workers. NEAR, Concordium,
// EVM and ZKPassport (passport proofs for workers) are optional add-ons, switched on per deployment with BOREAL_ADDONS and each stating up front
// what it needs. Pure: reads an env record, never the network.

type Env = Record<string, string | undefined>;

export const ADDON_IDS = ["concordium", "near", "evm", "zkpassport"] as const;
export type AddonId = (typeof ADDON_IDS)[number];

export type ConcordiumPart = "id" | "anchors" | "rail" | "registry";
export type NearPart = "rail" | "agentWorkers" | "market" | "privateReview";
export type EvmPart = "rail";
export type ZkPassportPart = "passport";
export type AddonPartId = ConcordiumPart | NearPart | EvmPart | ZkPassportPart;

/** One thing a part needs. `met: null` means it can only be checked live (a balance, say). */
export interface Requirement {
  label: string;
  /** The setting that satisfies it, for operators. */
  setting?: string;
  met: boolean | null;
}

export type PartState = "off" | "ready" | "blocked";

export interface AddonPart {
  id: AddonPartId;
  name: string;
  /** What switching this part on gives people. */
  unlocks: string;
  state: PartState;
  /** Why it's blocked, in a sentence; null when off or ready. */
  reason: string | null;
  requirements: Requirement[];
}

export interface AddonStatus {
  id: AddonId;
  name: string;
  enabled: boolean;
  /** One line: what the add-on is. */
  summary: string;
  /** What a person needs before using it (a wallet, an app, funds). */
  personNeeds: string[];
  parts: AddonPart[];
}

export interface Addons {
  /** `explicit` when BOREAL_ADDONS is set; `inferred` from older settings otherwise. */
  source: "explicit" | "inferred";
  concordium: AddonStatus;
  near: AddonStatus;
  evm: AddonStatus;
  zkpassport: AddonStatus;
  /** The add-on is switched on for this deployment. */
  on(id: AddonId): boolean;
  /** The add-on is on and this part has everything it needs. */
  ready(id: "concordium", part: ConcordiumPart): boolean;
  ready(id: "near", part: NearPart): boolean;
  ready(id: "evm", part: EvmPart): boolean;
  ready(id: "zkpassport", part: ZkPassportPart): boolean;
  /** Nothing on: PayPal only. */
  paypalOnly: boolean;
}

const has = (env: Env, name: string) => Boolean(env[name]?.trim());
const listed = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** Which add-ons the deployment switched on: BOREAL_ADDONS, else what the older settings imply. */
export function enabledAddons(env: Env): { source: "explicit" | "inferred"; ids: Set<AddonId> } {
  if (env.BOREAL_ADDONS !== undefined) {
    const names = listed(env.BOREAL_ADDONS).filter((n) => n !== "none");
    const unknown = names.filter((n) => !(ADDON_IDS as readonly string[]).includes(n));
    if (unknown.length) throw new Error(`BOREAL_ADDONS: unknown add-on ${unknown.join(", ")}; use ${ADDON_IDS.join(", ")} or none`);
    return { source: "explicit", ids: new Set(names as AddonId[]) };
  }
  // Before add-ons existed, Concordium was on whenever its adapters, ID App or registry listing
  // were configured, and NEAR whenever PAYMENT_RAILS named it. Keep that until BOREAL_ADDONS is set.
  const ids = new Set<AddonId>();
  if (has(env, "CONCORDIUM_MODE") || has(env, "CONCORDIUM_ANCHOR_ACCOUNT") || has(env, "BOREAL_REGISTRY_BADGE")) ids.add("concordium");
  if (listed(env.PAYMENT_RAILS).includes("near")) ids.add("near");
  return { source: "inferred", ids };
}

/** "An anchor account" → "an anchor account", but "CCD in…" stays as it is. */
const lowerFirst = (text: string) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

function part(
  enabled: boolean,
  id: AddonPartId,
  name: string,
  unlocks: string,
  requirements: Requirement[],
): AddonPart {
  if (!enabled) return { id, name, unlocks, state: "off", reason: null, requirements };
  const missing = requirements.filter((r) => r.met === false);
  return {
    id,
    name,
    unlocks,
    state: missing.length ? "blocked" : "ready",
    reason: missing.length ? `Needs ${missing.map((r) => lowerFirst(r.label)).join("; ")}.` : null,
    requirements,
  };
}

/** PAYMENT_RAILS, if set, lists the rails the operator wants; unset means every rail that's ready. */
function railListed(env: Env, rail: "concordium" | "near" | "evm"): boolean {
  if (env.PAYMENT_RAILS === undefined || env.PAYMENT_RAILS.trim() === "") {
    // Older deployments only ran NEAR when PAYMENT_RAILS named it.
    return rail === "concordium" || env.BOREAL_ADDONS !== undefined;
  }
  return listed(env.PAYMENT_RAILS).includes(rail);
}

/**
 * The secret that keys every identity hash (PayPal payer ids, Concordium ID pseudonyms):
 * BOREAL_PSEUDONYM_SECRET, or its older name CONCORDIUM_PSEUDONYM_SECRET. Never change its
 * value: every existing account is found by it. Both set and different is refused.
 */
export function pseudonymSecretFrom(env: Env): string | null {
  const now = env.BOREAL_PSEUDONYM_SECRET?.trim();
  const old = env.CONCORDIUM_PSEUDONYM_SECRET?.trim();
  if (now && old && now !== old) throw new Error("BOREAL_PSEUDONYM_SECRET and CONCORDIUM_PSEUDONYM_SECRET differ; keep one value (the one accounts were made with)");
  return now || old || null;
}

export function readAddons(env: Env = process.env): Addons {
  const { source, ids } = enabledAddons(env);
  const ccd = ids.has("concordium");
  const near = ids.has("near");
  const devMode = env.CONCORDIUM_MODE === "dev";
  const adapters = has(env, "CONCORDIUM_MODE");
  const anchorAccount = has(env, "CONCORDIUM_ANCHOR_ACCOUNT") && has(env, "CONCORDIUM_ANCHOR_KEY");
  const pseudonymSecret = (pseudonymSecretFrom(env) ?? "").length >= 32;

  const concordium: AddonStatus = {
    id: "concordium",
    name: "Concordium",
    enabled: ccd,
    summary: "Zero-knowledge identity, on-chain audit anchors, and a token payment rail on Concordium.",
    personNeeds: [
      "The Concordium ID App (phone) or Concordium Wallet for Web, with an identity in it",
      "A Concordium account, to be paid in tokens",
    ],
    parts: [
      part(
        ccd,
        "id",
        "Concordium ID",
        "Workers and posters prove age or country without sharing who they are, and carry the Verified by Concordium badge. Tasks can require proven attributes.",
        devMode
          ? [{ label: "The development wallet (CONCORDIUM_MODE=dev, local only)", setting: "CONCORDIUM_MODE", met: true }]
          : [
              { label: "An anchor account that pays for each sign-in's on-chain request", setting: "CONCORDIUM_ANCHOR_ACCOUNT, CONCORDIUM_ANCHOR_KEY", met: anchorAccount },
              { label: "CCD in the anchor account", setting: "CONCORDIUM_ANCHOR_ACCOUNT", met: anchorAccount ? null : false },
              { label: "A pseudonym secret of 32+ characters", setting: "CONCORDIUM_PSEUDONYM_SECRET", met: pseudonymSecret },
              { label: "A Reown project id for the ID App's connection", setting: "NEXT_PUBLIC_REOWN_PROJECT_ID", met: has(env, "NEXT_PUBLIC_REOWN_PROJECT_ID") },
            ],
      ),
      part(
        ccd,
        "anchors",
        "Audit anchors",
        "Each task event's salted hash is anchored on Concordium, so anyone can check the trail wasn't rewritten.",
        [
          { label: "The Concordium adapters", setting: "CONCORDIUM_MODE", met: adapters },
          ...(devMode
            ? []
            : [
                { label: "An anchor account", setting: "CONCORDIUM_ANCHOR_ACCOUNT, CONCORDIUM_ANCHOR_KEY", met: anchorAccount },
                { label: "CCD in the anchor account to pay transaction fees", setting: "CONCORDIUM_ANCHOR_ACCOUNT", met: anchorAccount ? null : false },
              ]),
        ],
      ),
      part(
        ccd,
        "rail",
        "Token rail (x402)",
        "Agents fund tasks with a Protocol-Level Token over x402, and workers are paid in tokens to their Concordium account.",
        [
          { label: "The Concordium adapters", setting: "CONCORDIUM_MODE", met: adapters },
          ...(devMode
            ? []
            : [{ label: "An escrow account and payment secret", setting: "CONCORDIUM_ESCROW_ACCOUNT, CONCORDIUM_ESCROW_KEY, CONCORDIUM_PAYMENT_SECRET", met: has(env, "CONCORDIUM_ESCROW_ACCOUNT") && has(env, "CONCORDIUM_ESCROW_KEY") && has(env, "CONCORDIUM_PAYMENT_SECRET") }]),
          { label: "Concordium listed in PAYMENT_RAILS (or PAYMENT_RAILS unset)", setting: "PAYMENT_RAILS", met: railListed(env, "concordium") },
        ],
      ),
      part(
        ccd,
        "registry",
        "Agent Registry listing",
        "boreal.work is listed in Concordium's Agent Registry with its own Verified by Concordium badge, and agents can prove theirs.",
        [{ label: "boreal.work's registry badge and owner account", setting: "BOREAL_REGISTRY_BADGE, BOREAL_REGISTRY_OWNER", met: has(env, "BOREAL_REGISTRY_BADGE") && has(env, "BOREAL_REGISTRY_OWNER") }],
      ),
    ],
  };

  const nearRail = has(env, "NEAR_TOKEN_CONTRACT") && has(env, "NEAR_ESCROW_ACCOUNT") && has(env, "NEAR_ESCROW_KEY");
  const nearRailListed = railListed(env, "near");
  const nearAddon: AddonStatus = {
    id: "near",
    name: "NEAR",
    enabled: near,
    summary: "A USDC rail on NEAR, AI agents as workers, boreal.work's listing on NEAR Agent Market, and private review on NEAR AI Cloud.",
    personNeeds: ["A NEAR account (free to create, about 2 minutes)", "USDC on NEAR, to fund tasks on this rail"],
    parts: [
      part(near, "rail", "USDC on NEAR", "Agents fund tasks in USDC on NEAR, and workers are paid to their NEAR account.", [
        { label: "The USDC token contract and an escrow account", setting: "NEAR_TOKEN_CONTRACT, NEAR_ESCROW_ACCOUNT, NEAR_ESCROW_KEY", met: nearRail },
        { label: "NEAR listed in PAYMENT_RAILS (or PAYMENT_RAILS unset)", setting: "PAYMENT_RAILS", met: nearRailListed },
      ]),
      part(near, "agentWorkers", "Agents as workers", "AI agents sign in with a NEAR account and take text tasks opened to agents, paid in USDC on NEAR.", [
        { label: "The USDC on NEAR rail", setting: "NEAR_TOKEN_CONTRACT, NEAR_ESCROW_ACCOUNT, NEAR_ESCROW_KEY", met: nearRail && nearRailListed },
      ]),
      part(near, "market", "NEAR Agent Market", "Buyers on NEAR Agent Market hire boreal.work; their jobs become tasks funded from boreal.work's NEAR treasury.", [
        { label: "The USDC on NEAR rail", setting: "NEAR_TOKEN_CONTRACT, NEAR_ESCROW_ACCOUNT, NEAR_ESCROW_KEY", met: nearRail && nearRailListed },
        { label: "A market token and the agent that posts market tasks", setting: "NEAR_MARKET_TOKEN, NEAR_MARKET_AGENT_ID", met: has(env, "NEAR_MARKET_TOKEN") && has(env, "NEAR_MARKET_AGENT_ID") },
        { label: "A treasury account holding USDC", setting: "NEAR_MARKET_TREASURY_ACCOUNT, NEAR_MARKET_TREASURY_KEY", met: has(env, "NEAR_MARKET_TREASURY_ACCOUNT") && has(env, "NEAR_MARKET_TREASURY_KEY") },
      ]),
      part(near, "privateReview", "Private review on NEAR AI", "Tasks are screened and reviewed on NEAR AI Cloud's TEE-hosted models; each verdict carries a signature and attestation anyone can check.", [
        { label: "A NEAR AI Cloud API key", setting: "NEAR_AI_API_KEY", met: has(env, "NEAR_AI_API_KEY") },
      ]),
    ],
  };

  const evm = ids.has("evm");
  const evmChain = has(env, "EVM_CHAIN_ID") && has(env, "EVM_RPC_URL");
  const evmToken = has(env, "EVM_TOKEN_CONTRACT") && has(env, "EVM_TOKEN_NAME") && has(env, "EVM_TOKEN_VERSION");
  const evmAddon: AddonStatus = {
    id: "evm",
    name: "EVM",
    enabled: evm,
    summary: "A USDC rail on an EVM chain such as Base: agents fund tasks with a signed x402 authorization, and workers are paid to their own wallet.",
    personNeeds: ["An EVM wallet (any that signs messages)", "USDC on the chain this site uses, to fund tasks on this rail"],
    parts: [
      part(evm, "rail", "USDC on an EVM chain", "Agents fund tasks in USDC over x402 (EIP-3009, no gas for the agent), and workers are paid in USDC to their own wallet.", [
        { label: "The chain and an RPC endpoint for it", setting: "EVM_CHAIN_ID, EVM_RPC_URL", met: evmChain },
        { label: "The token contract and its EIP-712 name and version", setting: "EVM_TOKEN_CONTRACT, EVM_TOKEN_NAME, EVM_TOKEN_VERSION", met: evmToken },
        { label: "An escrow key", setting: "EVM_ESCROW_KEY", met: has(env, "EVM_ESCROW_KEY") },
        { label: "The chain's gas coin in the escrow account, to pay for transfers", setting: "EVM_ESCROW_KEY", met: has(env, "EVM_ESCROW_KEY") ? null : false },
        // Without it the platform fee of every passed task would retry forever.
        { label: "An address the platform fee is paid to", setting: "EVM_OPERATING_ADDRESS", met: has(env, "EVM_OPERATING_ADDRESS") },
        { label: "EVM listed in PAYMENT_RAILS (or PAYMENT_RAILS unset)", setting: "PAYMENT_RAILS", met: railListed(env, "evm") },
      ]),
    ],
  };

  const zk = ids.has("zkpassport");
  const zkDev = env.ZKPASSPORT_DEV_MODE === "1";
  const zkAddon: AddonStatus = {
    id: "zkpassport",
    name: "ZKPassport",
    enabled: zk,
    summary: "Workers prove they are 18 or older, their nationality and that they are one person, from the chip in their passport or ID card, with zero-knowledge proofs checked on boreal.work's server.",
    personNeeds: [
      "A passport or ID card with an NFC chip (an ePassport has the chip symbol on its cover; the PhilSys card doesn't work)",
      "A phone with NFC and the free ZKPassport app (about 400 MB), which must pass the app's device check",
    ],
    parts: [
      part(zk, "passport", "Passport proofs", "Workers verify with their passport's chip instead of PayPal or Concordium ID, free for them and for boreal.work. One passport makes one account.", [
        { label: "A pseudonym secret of 32+ characters", setting: "BOREAL_PSEUDONYM_SECRET", met: (pseudonymSecretFrom(env) ?? "").length >= 32 },
        // Mock passports prove anything; only a site that moves no real money may accept them.
        ...(zkDev ? [{ label: "Mock passports (ZKPASSPORT_DEV_MODE=1) only off mainnet", setting: "ZKPASSPORT_DEV_MODE, BOREAL_NETWORK", met: (env.BOREAL_NETWORK || env.CONCORDIUM_NETWORK) !== "mainnet" }] : []),
      ]),
    ],
  };

  const byId = { concordium, near: nearAddon, evm: evmAddon, zkpassport: zkAddon };
  return {
    source,
    concordium,
    near: nearAddon,
    evm: evmAddon,
    zkpassport: zkAddon,
    on: (id) => byId[id].enabled,
    ready: (id: AddonId, p: AddonPartId) => byId[id].parts.find((x) => x.id === p)?.state === "ready",
    paypalOnly: ids.size === 0,
  };
}

/**
 * The environment as the loaders should see it: every Concordium and NEAR setting removed
 * when its add-on is off, and PAYMENT_RAILS narrowed to PayPal plus the add-on rails that are
 * ready. The loaders (`loadConcordium`, `loadRails`, `loadNear`, the ID App, the registry) then
 * need no add-on logic of their own, and an add-on that's off can't half-start.
 */
export function addonEnv(env: Env = process.env): Env {
  const addons = readAddons(env);
  const out: Env = { ...env };
  if (!addons.on("concordium")) {
    for (const key of Object.keys(out)) {
      // The pseudonym secret also keys PayPal identities; it must survive.
      if ((key.startsWith("CONCORDIUM_") && key !== "CONCORDIUM_PSEUDONYM_SECRET" && key !== "CONCORDIUM_NETWORK") || key.startsWith("BOREAL_REGISTRY_") || key === "DEV_CONCORDIUM_SECRET") {
        delete out[key];
      }
    }
    delete out.NEXT_PUBLIC_REOWN_PROJECT_ID;
    delete out.REQUIRE_AGENT_BADGE;
  }
  if (!addons.on("near")) {
    for (const key of Object.keys(out)) if (key.startsWith("NEAR_")) delete out[key];
  }
  if (!addons.on("evm")) {
    for (const key of Object.keys(out)) if (key.startsWith("EVM_")) delete out[key];
  }
  if (!addons.on("zkpassport")) {
    for (const key of Object.keys(out)) if (key.startsWith("ZKPASSPORT_")) delete out[key];
  }
  const rails: string[] = [];
  const wantedPayPal = env.PAYMENT_RAILS ? listed(env.PAYMENT_RAILS).includes("paypal") : has(env, "PAYPAL_CLIENT_ID") || env.PAYMENTS_RAIL === "paypal";
  if (wantedPayPal) rails.push("paypal");
  if (addons.on("concordium") && railListed(env, "concordium") && has(env, "CONCORDIUM_MODE")) rails.push("concordium");
  if (addons.ready("near", "rail")) rails.push("near");
  if (addons.ready("evm", "rail")) rails.push("evm");
  // "none" rather than empty: an empty PAYMENT_RAILS reads as unset to the older loaders.
  out.PAYMENT_RAILS = rails.length ? rails.join(",") : "none";
  // One secret keys both PayPal and Concordium ID pseudonyms; the ID App reads it by its old name.
  const secret = pseudonymSecretFrom(env);
  if (secret) out.CONCORDIUM_PSEUDONYM_SECRET = secret;
  if (out.DEFAULT_PAYMENT_RAIL && !rails.includes(out.DEFAULT_PAYMENT_RAIL)) delete out.DEFAULT_PAYMENT_RAIL;
  return out;
}

/**
 * How people verify on this deployment, for the desk: Concordium ID when its part is ready,
 * otherwise a PayPal account PayPal has verified (so PayPal alone isn't stuck at the caps).
 * `zkPassport`: workers can also verify with a passport's chip (the ZKPassport add-on).
 */
export function deskVerification(addons: Addons): { concordiumId: boolean; paypal: boolean; zkPassport: boolean } {
  const concordiumId = addons.ready("concordium", "id");
  return { concordiumId, paypal: !concordiumId, zkPassport: addons.ready("zkpassport", "passport") };
}
