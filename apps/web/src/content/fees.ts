import { FEE_POLICY } from "@boreal/core";

// The service fee in words, the same on every page and in the agent guide. It is one fee on top
// of the worker's pay, which the worker receives in full; it is not all boreal.work's to keep.

const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const fixed = `$${(FEE_POLICY.platformFixed / 100).toFixed(2)}`;

/** "15% + $0.50" */
export const SERVICE_FEE = `${pct(FEE_POLICY.platformRate + FEE_POLICY.reviewRate)} + ${fixed}`;

/** "10% + $0.50": when the requester reviews the result itself. */
export const SERVICE_FEE_SELF_REVIEW = `${pct(FEE_POLICY.platformRate)} + ${fixed}`;

/** One line on what the fee pays for. */
export const SERVICE_FEE_COVERS = "PayPal's processing, AI screening and review, a person when the AI is unsure, and running the service";

/** The fuller breakdown, for the terms. */
export const SERVICE_FEE_PARTS = [
  "PayPal's processing: about 3.5% + $0.49 to collect the payment and about 2% to pay the worker",
  "Screening and review by AI, and by a person when the AI is unsure",
  "Running boreal.work: hosting, support and disputes",
] as const;
