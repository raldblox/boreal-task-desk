import { describe, expect, it } from "vitest";

import { budgetWithin, disputeDeposit, quoteFees } from "./fees";

describe("quoteFees", () => {
  it("applies percentage fees on larger budgets", () => {
    expect(quoteFees(1_000)).toEqual({ budget: 1_000, platformFee: 120, reviewFee: 50, total: 1_170 });
  });

  it("applies minimum fees on small budgets", () => {
    expect(quoteFees(100)).toEqual({ budget: 100, platformFee: 25, reviewFee: 10, total: 135 });
  });

  it("charges no review fee when the requester reviews", () => {
    expect(quoteFees(1_000, { reviewer: "requester" })).toEqual({ budget: 1_000, platformFee: 120, reviewFee: 0, total: 1_120 });
  });

  it("rejects fractional or non-positive budgets", () => {
    expect(() => quoteFees(10.5)).toThrow(RangeError);
    expect(() => quoteFees(0)).toThrow(RangeError);
  });
});

describe("disputeDeposit", () => {
  it("caps the worker deposit at $1", () => {
    expect(disputeDeposit(5_000, "worker")).toBe(100);
  });

  it("applies the requester minimum", () => {
    expect(disputeDeposit(200, "requester")).toBe(50);
  });
});

describe("budgetWithin", () => {
  it("gives the worker the most that fits with the fees", () => {
    // $4.75 left after the market's 5% of a $5 hire: the worker gets $4.05, the fees $0.70.
    expect(budgetWithin(475)).toBe(405);
    expect(quoteFees(405).total).toBeLessThanOrEqual(475);
    expect(quoteFees(406).total).toBeGreaterThan(475);
  });

  it("never lets the total pass what's available, at any amount", () => {
    for (let available = 36; available <= 20_000; available += 7) {
      const budget = budgetWithin(available)!;
      expect(quoteFees(budget).total).toBeLessThanOrEqual(available);
      expect(quoteFees(budget + 1).total).toBeGreaterThan(available);
    }
  });

  it("is null when even the minimum fees don't fit", () => {
    expect(budgetWithin(35)).toBeNull();
    expect(budgetWithin(0)).toBeNull();
  });
});
