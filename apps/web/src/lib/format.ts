import type { TaskStatus } from "@boreal/core";

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const dateTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
});

/** Dates show in Manila time, where Phase 0's workers are. */
export const when = (date: Date | string) => `${dateTime.format(new Date(date))} PHT`;

const ATTRIBUTES: Record<string, string> = {
  age_over_18: "18 or older",
  residency: "Resident",
  unique_person: "Unique person",
};

export function attributeLabel({ attribute, value }: { attribute: string; value?: string }): string {
  const label = ATTRIBUTES[attribute] ?? attribute;
  return attribute === "residency" && value ? `${label} of ${value}` : label;
}

/** Each status as the worker experiences it. */
export const WORKER_STATUS: Record<TaskStatus, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  posted: { label: "Being checked", tone: "outline" },
  refused: { label: "Refused", tone: "destructive" },
  awaiting_funding: { label: "Awaiting funding", tone: "outline" },
  cancelled: { label: "Cancelled", tone: "outline" },
  open: { label: "Open", tone: "default" },
  expired: { label: "Expired", tone: "outline" },
  claimed: { label: "Claimed by you", tone: "secondary" },
  submitted: { label: "Under review", tone: "secondary" },
  passed: { label: "Passed", tone: "default" },
  failed: { label: "Failed", tone: "destructive" },
  disputed: { label: "Disputed", tone: "secondary" },
  final_pass: { label: "Paid", tone: "default" },
  final_fail: { label: "Not paid", tone: "destructive" },
};
