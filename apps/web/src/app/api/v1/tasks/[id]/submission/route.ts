import { DeskError } from "@boreal/desk";

import { asRequester, getDesk } from "@/server/desk";

// get_submission: the worker's latest submission; files are fetched from /api/files with the same key.
export async function GET(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]/submission">) {
  const { id } = await ctx.params;
  return asRequester(request, async (caller) => {
    const submission = await getDesk().getSubmission(caller, id);
    if (!submission) throw new DeskError("not_found", "nothing has been submitted yet");
    return Response.json({
      submittedAt: submission.createdAt,
      text: submission.text,
      files: submission.fileUrls.map((path) => `/api/files/${path}`),
    });
  });
}
