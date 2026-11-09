import { describe, expect, it } from "vitest";

import { budgetWithin, disputeDeposit, quoteFees } from "./fees";

describe("quoteFees", () => {
  it("charges one service fee of 15% + $0.50 on top, split into a platform and a review part", () => {
    expect(quoteFees(1_000)).toEqual({ budget: 1_000, platformFee: 150, reviewFee: 50, serviceFee: 200, total: 1_200 });
    expect(quoteFees(100)).toEqual({ budget: 100, platformFee: 60, reviewFee: 5, serviceFee: 65, total: 165 });
  });

  it("charges 10% + $0.50 when the requester reviews the result itself", () => {
    expect(quoteFees(1_000, { reviewer: "requester" })).toEqual({ budget: 1_000, platformFee: 150, reviewFee: 0, serviceFee: 150, total: 1_150 });
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
    // $7.60 left after the market's 5% of an $8 hire: the worker gets $6.17, the service fee $1.43.
    expect(budgetWithin(760)).toBe(617);
    expect(quoteFees(617).total).toBe(760);
    expect(quoteFees(618).total).toBeGreaterThan(760);
  });

  it("never lets the total pass what's available, at any amount", () => {
    for (let available = 53; available <= 20_000; available += 7) {
      const budget = budgetWithin(available)!;
      expect(quoteFees(budget).total).toBeLessThanOrEqual(available);
      expect(quoteFees(budget + 1).total).toBeGreaterThan(available);
    }
  });

  it("is null when even the minimum fees don't fit", () => {
    expect(budgetWithin(52)).toBeNull();
    expect(budgetWithin(53)).toBe(1);
    expect(budgetWithin(0)).toBeNull();
  });
});

describe("budgetWithin below the fixed fee", () => {
  it("says nothing fits instead of throwing", () => {
    expect(budgetWithin(28)).toBeNull();
    expect(budgetWithin(1)).toBeNull();
  });
});
