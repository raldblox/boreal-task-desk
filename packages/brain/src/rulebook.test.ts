import { describe, expect, it } from "vitest";

import { reviewOutcome, screenOutcome } from "./judge";
import { RULES, rulebookText, ruleById } from "./rulebook";

const input = { description: "Photograph the shelf price.", acceptanceCriteria: ["Price is readable"], resultFormat: "photo", submission: { text: null, files: [] } };

describe("rulebook", () => {
  it("gives every rule a unique ID, a stage that fits its group, and a severity", () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
    const stageOf = { R1: "screening", R2: "screening", R3: "review", R4: "review", R5: "reviewer", R6: "dispute" } as const;
    for (const rule of RULES) {
      expect(rule.stage).toBe(stageOf[rule.id.slice(0, 2) as keyof typeof stageOf]);
      expect(["critical", "major", "minor", "protective"]).toContain(rule.severity);
    }
  });

  it("keeps every v1 rule ID, since old verdicts cite them", () => {
    for (const id of ["R1.1", "R1.4", "R2.1", "R2.6", "R3.1", "R3.2", "R4.1", "R4.4", "R5.1", "R5.3", "R6.1", "R6.3"]) expect(ruleById(id)).toBeDefined();
  });

  it("gives the model the rules, their severity and both procedures", () => {
    const text = rulebookText();
    expect(text).toContain("R2.7 [screening, critical]");
    expect(text).toContain("Review, in order:");
    expect(text).toContain("Screening, in order:");
  });

  it("refuses on the new safety rules and fails on the new review rules", () => {
    expect(screenOutcome({ decision: "refuse", rule_ids: ["R2.7"], reasoning: "Asks for shoppers' faces." })).toMatchObject({ outcome: "refused", ruleIds: ["R2.7"] });
    const unmet = [{ criterion: "Price is readable", met: false, evidence: "Tag is blurred." }];
    expect(reviewOutcome({ criteria: unmet, decision: "fail", rule_ids: ["R4.5"], reasoning: "The price can't be read." }, input, "m")).toMatchObject({ outcome: "fail" });
    expect(reviewOutcome({ criteria: unmet, decision: "fail", rule_ids: ["R3.3"], reasoning: "Counted before the claim." }, input, "m")).toMatchObject({ outcome: "fail" });
  });

  it("never lets a safeguard rule alone fail a result", () => {
    const unmet = [{ criterion: "Price is readable", met: false, evidence: "Tag is blurred." }];
    expect(reviewOutcome({ criteria: unmet, decision: "fail", rule_ids: ["R5.4"], reasoning: "x" }, input, "m")).toMatchObject({ outcome: "needs_human" });
  });
});
