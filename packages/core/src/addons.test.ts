import { describe, expect, it } from "vitest";

import { addonEnv, deskVerification, enabledAddons, pseudonymSecretFrom, readAddons } from "./addons";

const KEY = "a".repeat(64);
const ACCOUNT = "3".repeat(50);

/** Everything the Concordium add-on can use, set up (testnet adapters). */
const CONCORDIUM = {
  CONCORDIUM_MODE: "testnet",
  CONCORDIUM_ANCHOR_ACCOUNT: ACCOUNT,
  CONCORDIUM_ANCHOR_KEY: KEY,
  CONCORDIUM_PSEUDONYM_SECRET: "s".repeat(32),
  NEXT_PUBLIC_REOWN_PROJECT_ID: "reown",
  CONCORDIUM_ESCROW_ACCOUNT: "4".repeat(50),
  CONCORDIUM_ESCROW_KEY: KEY,
  CONCORDIUM_PAYMENT_SECRET: "x".repeat(32),
  BOREAL_REGISTRY_BADGE: "badge",
  BOREAL_REGISTRY_OWNER: ACCOUNT,
};

/** Everything the NEAR add-on can use. */
const NEAR = {
  NEAR_TOKEN_CONTRACT: "usdc.testnet",
  NEAR_ESCROW_ACCOUNT: "escrow.testnet",
  NEAR_ESCROW_KEY: "ed25519:key",
  NEAR_MARKET_TOKEN: "token",
  NEAR_MARKET_AGENT_ID: "agent",
  NEAR_MARKET_TREASURY_ACCOUNT: "treasury.testnet",
  NEAR_MARKET_TREASURY_KEY: "ed25519:key",
};

const PAYPAL = { PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" };

const state = (env: Record<string, string>, id: "concordium" | "near", part: string) =>
  readAddons(env)[id].parts.find((p) => p.id === part)!;

describe("add-ons", () => {
  it("is PayPal only with BOREAL_ADDONS=none, whatever else is set", () => {
    const env = { BOREAL_ADDONS: "none", ...PAYPAL, ...CONCORDIUM, ...NEAR, PAYMENT_RAILS: "paypal,concordium,near" };
    const addons = readAddons(env);
    expect(addons.paypalOnly).toBe(true);
    expect([...addons.concordium.parts, ...addons.near.parts].every((p) => p.state === "off")).toBe(true);
    const gated = addonEnv(env);
    expect(gated.PAYMENT_RAILS).toBe("paypal");
    expect(Object.keys(gated).filter((k) => /^(NEAR_|BOREAL_REGISTRY_|CONCORDIUM_(MODE|ANCHOR|ESCROW|PAYMENT))/.test(k))).toEqual([]);
    expect(gated.NEXT_PUBLIC_REOWN_PROJECT_ID).toBeUndefined();
  });

  it("is PayPal only with nothing set, and needs no add-on setting to run", () => {
    expect(readAddons({ ...PAYPAL }).paypalOnly).toBe(true);
    expect(addonEnv({ ...PAYPAL }).PAYMENT_RAILS).toBe("paypal");
    // No PayPal either: no rail at all, spelled so the older loaders don't read it as unset.
    expect(addonEnv({}).PAYMENT_RAILS).toBe("none");
    expect(deskVerification(readAddons({}))).toEqual({ concordiumId: false, paypal: true });
  });

  it("refuses an unknown add-on name", () => {
    expect(() => readAddons({ BOREAL_ADDONS: "solana" })).toThrow(/unknown add-on solana/);
  });

  it("infers the add-ons from older settings until BOREAL_ADDONS is set", () => {
    expect(enabledAddons({ CONCORDIUM_MODE: "testnet" })).toEqual({ source: "inferred", ids: new Set(["concordium"]) });
    expect(enabledAddons({ CONCORDIUM_ANCHOR_ACCOUNT: ACCOUNT, PAYMENT_RAILS: "paypal,near" })).toEqual({
      source: "inferred",
      ids: new Set(["concordium", "near"]),
    });
    expect(enabledAddons({ BOREAL_ADDONS: "near", CONCORDIUM_MODE: "testnet" })).toEqual({ source: "explicit", ids: new Set(["near"]) });
  });

  it("makes every Concordium part ready once its requirements are met", () => {
    const env = { BOREAL_ADDONS: "concordium", ...PAYPAL, ...CONCORDIUM };
    const addons = readAddons(env);
    expect(addons.concordium.parts.map((p) => [p.id, p.state])).toEqual([
      ["id", "ready"],
      ["anchors", "ready"],
      ["rail", "ready"],
      ["registry", "ready"],
    ]);
    // CCD in the anchor account can't be read from settings: it's flagged, not assumed.
    expect(state(env, "concordium", "anchors").requirements.some((r) => r.met === null && /CCD/.test(r.label))).toBe(true);
    expect(addonEnv(env).PAYMENT_RAILS).toBe("paypal,concordium");
    expect(deskVerification(addons)).toEqual({ concordiumId: true, paypal: false });
  });

  it("blocks Concordium ID without an anchor account, naming what's missing", () => {
    const { CONCORDIUM_ANCHOR_ACCOUNT: _a, CONCORDIUM_ANCHOR_KEY: _k, ...rest } = CONCORDIUM;
    const id = state({ BOREAL_ADDONS: "concordium", ...rest }, "concordium", "id");
    expect(id.state).toBe("blocked");
    expect(id.reason).toMatch(/anchor account/);
    expect(id.reason).toMatch(/CCD/);
    // Blocked Concordium ID: PayPal verification takes over, and attributes stay off.
    expect(deskVerification(readAddons({ BOREAL_ADDONS: "concordium", ...rest }))).toEqual({ concordiumId: false, paypal: true });
  });

  it("blocks the token rail without escrow, and keeps it out of PAYMENT_RAILS when the operator leaves it out", () => {
    const { CONCORDIUM_ESCROW_ACCOUNT: _a, CONCORDIUM_ESCROW_KEY: _k, CONCORDIUM_PAYMENT_SECRET: _s, ...rest } = CONCORDIUM;
    expect(state({ BOREAL_ADDONS: "concordium", ...rest }, "concordium", "rail")).toMatchObject({ state: "blocked", reason: expect.stringMatching(/escrow/) });
    const unlisted = { BOREAL_ADDONS: "concordium", ...PAYPAL, ...CONCORDIUM, PAYMENT_RAILS: "paypal" };
    expect(state(unlisted, "concordium", "rail").state).toBe("blocked");
    expect(addonEnv(unlisted).PAYMENT_RAILS).toBe("paypal");
  });

  it("gates the NEAR rail, agents as workers and the market on the NEAR account settings", () => {
    const off = readAddons({ BOREAL_ADDONS: "near", ...PAYPAL });
    expect(off.near.parts.map((p) => p.state)).toEqual(["blocked", "blocked", "blocked", "blocked"]);
    expect(off.near.parts[0]!.reason).toMatch(/escrow account/);
    expect(addonEnv({ BOREAL_ADDONS: "near", ...PAYPAL, PAYMENT_RAILS: "paypal,near" }).PAYMENT_RAILS).toBe("paypal");

    const { NEAR_MARKET_TREASURY_ACCOUNT: _a, NEAR_MARKET_TREASURY_KEY: _k, ...noTreasury } = NEAR;
    const env = { BOREAL_ADDONS: "near", ...PAYPAL, ...noTreasury };
    expect(readAddons(env).near.parts.map((p) => [p.id, p.state])).toEqual([
      ["rail", "ready"],
      ["agentWorkers", "ready"],
      ["market", "blocked"],
      ["privateReview", "blocked"],
    ]);
    expect(state(env, "near", "market").reason).toMatch(/treasury account holding USDC/);
    expect(state(env, "near", "privateReview").reason).toMatch(/NEAR AI Cloud API key/);
    expect(state({ ...env, NEAR_AI_API_KEY: "sk-test" }, "near", "privateReview").state).toBe("ready");
    // The key never reaches the loaders while NEAR is off.
    expect(addonEnv({ BOREAL_ADDONS: "none", NEAR_AI_API_KEY: "sk-test" }).NEAR_AI_API_KEY).toBeUndefined();
    expect(addonEnv(env).PAYMENT_RAILS).toBe("paypal,near");
    // NEAR on leaves Concordium settings out.
    expect(addonEnv({ ...env, CONCORDIUM_MODE: "testnet" }).CONCORDIUM_MODE).toBeUndefined();
  });

  it("states what each add-on needs from a person up front", () => {
    const addons = readAddons({});
    expect(addons.concordium.personNeeds.join(" ")).toMatch(/ID App|Wallet for Web/);
    expect(addons.near.personNeeds.join(" ")).toMatch(/NEAR account/);
    expect(addons.near.personNeeds.join(" ")).toMatch(/USDC/);
  });

  it("reads the pseudonym secret by either name, and refuses two different values", () => {
    expect(pseudonymSecretFrom({ CONCORDIUM_PSEUDONYM_SECRET: "old" })).toBe("old");
    expect(pseudonymSecretFrom({ BOREAL_PSEUDONYM_SECRET: "new" })).toBe("new");
    expect(pseudonymSecretFrom({ BOREAL_PSEUDONYM_SECRET: "same", CONCORDIUM_PSEUDONYM_SECRET: "same" })).toBe("same");
    expect(() => pseudonymSecretFrom({ BOREAL_PSEUDONYM_SECRET: "a", CONCORDIUM_PSEUDONYM_SECRET: "b" })).toThrow(/differ/);
    expect(addonEnv({ BOREAL_PSEUDONYM_SECRET: "n".repeat(32) }).CONCORDIUM_PSEUDONYM_SECRET).toBe("n".repeat(32));
  });
});

describe("the EVM add-on", () => {
  const ready = {
    BOREAL_ADDONS: "evm",
    PAYPAL_CLIENT_ID: "id",
    EVM_CHAIN_ID: "8453",
    EVM_RPC_URL: "https://rpc.example",
    EVM_TOKEN_CONTRACT: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    EVM_TOKEN_NAME: "USD Coin",
    EVM_TOKEN_VERSION: "2",
    EVM_ESCROW_KEY: "0x" + "1".repeat(64),
    EVM_OPERATING_ADDRESS: "0x" + "2".repeat(40),
  };

  it("is off unless switched on, and its settings then reach nothing", () => {
    const env = { ...ready, BOREAL_ADDONS: "none" };
    expect(readAddons(env).on("evm")).toBe(false);
    expect(Object.keys(addonEnv(env)).filter((k) => k.startsWith("EVM_"))).toEqual([]);
    expect(addonEnv(env).PAYMENT_RAILS).toBe("paypal");
  });

  it("opens its rail beside PayPal once everything it needs is set", () => {
    expect(readAddons(ready).ready("evm", "rail")).toBe(true);
    expect(addonEnv(ready).PAYMENT_RAILS).toBe("paypal,evm");
  });

  it("is blocked, with the reason, while the fee address or the token's signing domain is missing", () => {
    const noFee = readAddons({ ...ready, EVM_OPERATING_ADDRESS: undefined });
    expect(noFee.evm.parts[0]).toMatchObject({ state: "blocked", reason: expect.stringContaining("platform fee") });
    expect(addonEnv({ ...ready, EVM_OPERATING_ADDRESS: undefined }).PAYMENT_RAILS).toBe("paypal");
    expect(readAddons({ ...ready, EVM_TOKEN_NAME: undefined }).ready("evm", "rail")).toBe(false);
  });
});
