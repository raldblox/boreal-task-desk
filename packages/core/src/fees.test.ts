import { describe, expect, it } from "vitest";

import { disputeDeposit, quoteFees } from "./fees";

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
