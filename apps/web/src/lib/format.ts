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
  passed: { label: "Passed, paying soon", tone: "default" },
  failed: { label: "Failed", tone: "destructive" },
  disputed: { label: "Disputed", tone: "secondary" },
  final_pass: { label: "Paid", tone: "default" },
  final_fail: { label: "Not paid", tone: "destructive" },
};

/** Each status as the person who posted the task sees it. */
export function posterStatus(task: { status: TaskStatus; reviewMode: "boreal" | "requester" }): {
  label: string;
  tone: "default" | "secondary" | "destructive" | "outline";
} {
  switch (task.status) {
    case "posted":
      return { label: "Waiting for screening", tone: "outline" };
    case "refused":
      return { label: "Refused by screening", tone: "destructive" };
    case "awaiting_funding":
      return { label: "Ready to pay", tone: "default" };
    case "cancelled":
      return { label: "Cancelled", tone: "outline" };
    case "open":
      return { label: "Open to workers", tone: "secondary" };
    case "expired":
      return { label: "Expired, refunded", tone: "outline" };
    case "claimed":
      return { label: "A worker is on it", tone: "secondary" };
    case "submitted":
      return task.reviewMode === "requester" ? { label: "Ready for your review", tone: "default" } : { label: "Being reviewed", tone: "secondary" };
    case "passed":
      return { label: "Passed", tone: "default" };
    case "failed":
      return { label: "Failed", tone: "destructive" };
    case "disputed":
      return { label: "Disputed", tone: "secondary" };
    case "final_pass":
      return { label: "Done, worker paid", tone: "outline" };
    case "final_fail":
      return { label: "Not paid, refunded", tone: "outline" };
  }
}

/** A worker's pseudonym, short enough to show: the first and last four of its hash. */
export function workerHandle(pseudonym: string): string {
  const hash = /^(ccdid|pp):/.test(pseudonym) ? pseudonym.slice(pseudonym.indexOf(":") + 1) : null;
  return hash ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : pseudonym;
}
