import { RULEBOOK_VERSION } from "@boreal/brain";
import { POLICY } from "@boreal/core";
import { describe, expect, it } from "vitest";

describe("rulebook version", () => {
  it("is the same in the reviewer and in the policy every verdict records", () => {
    expect(POLICY.rulebookVersion).toBe(RULEBOOK_VERSION);
  });
});
