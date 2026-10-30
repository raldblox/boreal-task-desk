import { type Caller, DeskError } from "@boreal/desk";

import { getDesk, requesterFrom } from "@/server/desk";
import { readSubmissionFile } from "@/server/files";
import { workerFromSession } from "@/server/session";

/**
 * Serves a private submission file to the worker who submitted it (session cookie) or to
 * the task's requester agent (Bearer key). Anyone else gets 404, the same as a missing file.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/files/[...path]">) {
  const { path: segments } = await ctx.params;
  const path = segments.join("/");
  const [root, taskId] = segments;
  const missing = () => new Response("Not found", { status: 404 });
  if (root !== "submissions" || !taskId) return missing();

  const caller: Caller | null = (await workerFromSession()) ?? (await requesterFrom(request));
  if (!caller) return missing();

  try {
    const submission = await getDesk().getSubmission(caller, taskId);
    if (!submission?.fileUrls.includes(path)) return missing();
  } catch (error) {
    if (error instanceof DeskError) return missing();
    throw error;
  }

  const file = await readSubmissionFile(path);
  if (!file) return missing();
  return new Response(file.body, {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=300" },
  });
}
