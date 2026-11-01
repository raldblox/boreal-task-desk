import { describe, expect, it } from "vitest";

import { borealNetwork } from "./network";

describe("borealNetwork", () => {
  it("defaults to testnet and follows BOREAL_NETWORK, then CONCORDIUM_NETWORK", () => {
    expect(borealNetwork({})).toBe("testnet");
    expect(borealNetwork({ BOREAL_NETWORK: "mainnet" })).toBe("mainnet");
    expect(borealNetwork({ CONCORDIUM_NETWORK: "mainnet" })).toBe("mainnet");
  });

  it("refuses a mismatch or an unknown network", () => {
    expect(() => borealNetwork({ BOREAL_NETWORK: "mainnet", CONCORDIUM_NETWORK: "testnet" })).toThrow(/doesn't match/);
    expect(() => borealNetwork({ BOREAL_NETWORK: "devnet" })).toThrow(/testnet or mainnet/);
  });
});
