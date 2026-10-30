import { describe, expect, it } from "vitest";

import { type Actor, type TaskEvent, type TaskSnapshot, transition, TransitionError } from "./task";

const at = (status: TaskSnapshot["status"], disputeUsed = false): TaskSnapshot => ({
  status,
  disputeUsed,
});

function run(start: TaskSnapshot, steps: [TaskEvent, Actor][]): TaskSnapshot {
  return steps.reduce((task, [event, actor]) => transition(task, event, actor), start);
}

describe("transition", () => {
  it("walks the happy path to a final pass", () => {
    const end = run(at("posted"), [
      [{ type: "screen_ok" }, "reviewer"],
      [{ type: "fund" }, "requester"],
      [{ type: "claim", workerId: "w1" }, "worker"],
      [{ type: "submit" }, "worker"],
      [{ type: "verdict_pass", ruleIds: ["R4.2"] }, "reviewer"],
      [{ type: "window_closed" }, "system"],
    ]);
    expect(end.status).toBe("final_pass");
  });

  it("finalises a fail when the window closes without a dispute", () => {
    expect(transition(at("failed"), { type: "window_closed" }, "system").status).toBe("final_fail");
  });

  it("never lets the requester overrule a pass", () => {
    expect(() =>
      transition(at("passed"), { type: "verdict_fail", ruleIds: [] }, "requester"),
    ).toThrow(TransitionError);
  });

  it("lets the requester accept a pass early", () => {
    expect(transition(at("passed"), { type: "accept_early" }, "requester").status).toBe(
      "final_pass",
    );
  });

  it("allows one dispute per task", () => {
    const disputed = transition(
      at("failed"),
      { type: "dispute", by: "worker", reason: "photo shows the item" },
      "worker",
    );
    expect(disputed).toEqual({ status: "disputed", disputeUsed: true });
    expect(() =>
      transition(
        at("passed", true),
        { type: "dispute", by: "requester", reason: "second try" },
        "requester",
      ),
    ).toThrow(/only once/);
  });

  it("rejects a dispute filed on behalf of the other side", () => {
    expect(() =>
      transition(at("failed"), { type: "dispute", by: "worker", reason: "not mine" }, "requester"),
    ).toThrow(/cannot dispute as worker/);
  });

  it("lets the requester withdraw a task before it is funded", () => {
    expect(transition(at("posted"), { type: "cancel" }, "requester").status).toBe("cancelled");
    expect(() => transition(at("claimed"), { type: "cancel" }, "requester")).toThrow(TransitionError);
  });

  it("reopens a task when a claim expires", () => {
    expect(transition(at("claimed"), { type: "claim_expired" }, "system").status).toBe("open");
  });

  it("refuses moves out of terminal states", () => {
    expect(() => transition(at("final_pass"), { type: "claim", workerId: "w1" }, "worker")).toThrow(
      /not allowed from final_pass/,
    );
  });
});
