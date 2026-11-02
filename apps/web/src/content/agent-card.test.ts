import { describe, expect, it } from "vitest";

import { agentCard, agentCardBytes, CARD_VERSION, CARD_VERSION_WITHOUT_A2A, type CardInput } from "./agent-card";

// The registry pins each deployment's card hash on-chain, so any change to the bytes must come
// with a CARD_VERSION bump (and a new on-chain hash: docs/registry.md). Record the new
// version's hashes here once the change is intended.
const PINNED: Record<string, { testnet: string; mainnet: string }> = {
  "1.0.0": {
    testnet: "d9258412a878537ff982bccd5363df36b9ceaadb3d0c4a7eb2570d8384968e5d",
    mainnet: "18c082cf44b90e755a936e2680eefa012a913b4c7935c3923164a3601e98c91d",
  },
  // Lists the A2A endpoint (A2A_IN_CARD=1). With testnet's badge set, testnet serves
  // 8746afe098a5950be43b4bf3eaf107ef4056e46da23dbe924f2139d131f9cbaa.
  "1.1.0": {
    testnet: "2651a691bdcd8e8cb903e90a2fc045bda35a5e32e5c2c402f4b939e7c59bb7b8",
    mainnet: "4acfb82606fd136f3a2ca268091150d0f2e8f3d8ac8f303f2abf8e2443ec76e2",
  },
};

// The cards as deployed: PayPal only on both sites, not registered yet.
const DEPLOYED: Record<"testnet" | "mainnet", CardInput> = {
  testnet: { site: "https://testnet.boreal.work", liveSite: "https://boreal.work", network: "testnet", x402: false, badge: null },
  mainnet: { site: "https://boreal.work", liveSite: "https://boreal.work", network: "mainnet", x402: false, badge: null },
};

// Concordium's own example badge on mainnet (token id 484) and its owner.
const BADGE = { token: "Mf22soLh1NuZYFgBK8iSs", owner: "4DDvjwdcLmTy1Ar9FCKKPMiABrS261TvyXJGr4n4ypuuogXeFF" };

describe("agent card", () => {
  for (const network of ["testnet", "mainnet"] as const) {
    for (const a2a of [false, true]) {
      const version = a2a ? CARD_VERSION : CARD_VERSION_WITHOUT_A2A;
      it(`keeps the ${network} card ${a2a ? "with" : "without"} A2A byte-stable unless its version is bumped`, () => {
        const { body, sha256 } = agentCardBytes({ ...DEPLOYED[network], a2a });
        expect(body).toMatchSnapshot();
        const pinned = PINNED[version];
        expect(pinned, `card version ${version} has no pinned hashes: add them to PINNED`).toBeDefined();
        expect(sha256, `the ${network} card changed: bump CARD_VERSION, record its hashes, and pin the new hash in the registry`).toBe(
          pinned[network],
        );
      });
    }
  }

  it("lists A2A first, with bearer auth, only when switched on", () => {
    expect(agentCard(DEPLOYED.testnet)).not.toHaveProperty("securitySchemes");
    const card = agentCard({ ...DEPLOYED.testnet, a2a: true });
    expect(card.supportedInterfaces[0]).toEqual({ url: "https://testnet.boreal.work/api/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" });
    expect(card.services[0]).toEqual({ name: "A2A", endpoint: "https://testnet.boreal.work/api/a2a", version: "1.0" });
    expect(card.securitySchemes?.borealKey.httpAuthSecurityScheme.scheme).toBe("Bearer");
    expect(card.description.length).toBeLessThanOrEqual(2048);
  });

  it("stays within the registry's limits and names this site's endpoints", () => {
    const card = agentCard(DEPLOYED.testnet);
    expect(card.name.length).toBeLessThanOrEqual(128);
    expect(card.description.length).toBeLessThanOrEqual(2048);
    expect(card.description).toContain("never real");
    expect(card.supportedInterfaces.map((i) => i.url)).toEqual(["https://testnet.boreal.work/api/mcp", "https://testnet.boreal.work/api/v1"]);
    expect(agentCard(DEPLOYED.mainnet).description).not.toContain("never real");
  });

  it("claims x402 only where the Concordium rail is on", () => {
    expect(agentCard(DEPLOYED.testnet).x402Support).toBe(false);
    expect(agentCard({ ...DEPLOYED.testnet, x402: true }).x402Support).toBe(true);
  });

  it("adds the badge extension and registration once boreal has a badge", () => {
    expect(agentCard(DEPLOYED.mainnet).capabilities).not.toHaveProperty("extensions");
    const card = agentCard({ ...DEPLOYED.mainnet, badge: BADGE });
    expect(card.capabilities.extensions?.[0]?.uri).toBe("https://docs.concordium.com/a2a-extensions/concordium-badge/v1");
    expect(card.capabilities.extensions?.[0]?.params.tokenAddress).toBe(`ccd:9dd9ca4d19e9393877d2c44b70f89acb/cis-2:${BADGE.token}`);
    expect(card.registrations).toEqual([{ agentId: 484, agentRegistry: "ccd:9dd9ca4d19e9393877d2c44b70f89acb:10082.0" }]);
    // A mainnet badge on the testnet card is refused.
    expect(() => agentCard({ ...DEPLOYED.testnet, badge: BADGE })).toThrow(/testnet Agent Registry/);
  });
});
