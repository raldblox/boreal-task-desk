import type { Task } from "@boreal/db";

import { decideDispute, recordVerdict, screenTask } from "@/app/admin/actions";
import { AdminForm, DecisionFields } from "@/components/admin/admin-form";

/** What boreal can decide on this task now, through the desk's own reviewer and panel commands. */
export function canDecide(task: Task): boolean {
  return task.status === "posted" || task.status === "disputed" || (task.status === "submitted" && task.reviewMode === "boreal");
}

export function ReviewControls({ task }: { task: Task }) {
  if (task.status === "posted") {
    return (
      <AdminForm action={screenTask.bind(null, task.id)} label="Screen" confirm="Record this screening as boreal.work's reviewer. It is final.">
        <DecisionFields outcomes={[["ok", "OK, can be funded"], ["refused", "Refuse"]]} />
      </AdminForm>
    );
  }
  if (task.status === "submitted" && task.reviewMode === "boreal") {
    return (
      <AdminForm action={recordVerdict.bind(null, task.id)} label="Record verdict" confirm="Record this verdict as boreal.work's reviewer. Either side can dispute it once.">
        <DecisionFields outcomes={[["pass", "Pass"], ["fail", "Fail"]]} />
      </AdminForm>
    );
  }
  if (task.status === "disputed") {
    return (
      <AdminForm action={decideDispute.bind(null, task.id)} label="Decide dispute" confirm="Decide as boreal.work's panel. This is final and moves the money.">
        <DecisionFields outcomes={[["pass", "Pass: pay the worker"], ["fail", "Fail: refund the agent"]]} />
      </AdminForm>
    );
  }
  return null;
}

