import type { TaskStatus } from "@boreal/core";
import { Check } from "lucide-react";

// Where a task stands for its worker: claimed, submitted, reviewed, paid.
const STEPS = ["Claimed", "Submitted", "Reviewed", "Paid"] as const;

// Once there's a verdict, the third step says what it was.
const VERDICT: Partial<Record<TaskStatus, string>> = {
  passed: "Passed",
  failed: "Failed",
  disputed: "Disputed",
  final_pass: "Passed",
  final_fail: "Failed",
};

function reached(status: TaskStatus): number {
  switch (status) {
    case "claimed":
      return 0;
    case "submitted":
      return 1;
    case "passed":
    case "failed":
    case "disputed":
      return 2;
    case "final_pass":
      return 3;
    case "final_fail":
      return 2;
    default:
      return -1;
  }
}

export function TaskProgress({ status }: { status: TaskStatus }) {
  const at = reached(status);
  if (at < 0) return null;
  const failed = status === "final_fail";
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Task progress">
      {STEPS.map((label, i) => {
        const done = i <= at;
        const current = i === at;
        return (
          <li key={label} className="flex flex-col gap-2">
            <span
              className={`h-1.5 rounded-full ${done ? (failed && i === at ? "bg-destructive" : "bg-primary") : "bg-muted"}`}
            />
            <span
              className={`flex items-center gap-1 text-xs ${current ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}
              aria-current={current ? "step" : undefined}
            >
              {done && !current && <Check className="size-3 text-primary" />}
              {i === 2 && VERDICT[status] ? VERDICT[status] : failed && i === 3 ? "Not paid" : label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
