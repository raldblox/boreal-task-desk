import { BOREAL_REVIEWER, type Caller, DeskError } from "@boreal/desk";

import { currentAdmin } from "@/server/admin";
import { getDesk, requesterFrom } from "@/server/desk";
import { readSubmissionFile } from "@/server/files";
import { workerFromSession } from "@/server/session";

/**
 * Serves a private submission file to the worker who submitted it (session cookie), to the
 * task's requester: an agent (Bearer key) or a person who posted it on the website (session
 * cookie, as their own requester), and to boreal's admins, who review it. Anyone else gets
 * 404, the same as a missing file.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/files/[...path]">) {
  const { path: segments } = await ctx.params;
  const path = segments.join("/");
  const [root, taskId] = segments;
  const missing = () => new Response("Not found", { status: 404 });
  if (root !== "submissions" || !taskId) return missing();

  const worker = await workerFromSession();
  const personal = worker?.role === "worker" ? await getDesk().findPersonalRequester(worker.workerId) : null;
  const callers: Caller[] = (await currentAdmin())
    ? [BOREAL_REVIEWER]
    : [
        ...(worker ? [worker] : []),
        ...(personal ? [{ role: "requester" as const, agentId: personal.id }] : []),
        ...[await requesterFrom(request)].filter((c): c is Caller => c !== null),
      ];

  let allowed = false;
  for (const caller of callers) {
    try {
      const submission = await getDesk().getSubmission(caller, taskId);
      if (submission?.fileUrls.includes(path)) allowed = true;
    } catch (error) {
      if (!(error instanceof DeskError)) throw error;
    }
    if (allowed) break;
  }
  if (!allowed) return missing();

  const file = await readSubmissionFile(path);
  if (!file) return missing();
  return new Response(file.body, {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=300" },
  });
}
