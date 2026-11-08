import { verifyFileLink } from "@boreal/near";

import { gatedEnv } from "@/server/addons";
import { readSubmissionFile } from "@/server/files";

/**
 * Serves a submission file to a NEAR Agent Market buyer, who has no boreal key: only through
 * the signed, expiring link in the deliverable boreal handed in. Anything else is 404.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/market/files/[...path]">) {
  const { path: segments } = await ctx.params;
  const path = segments.join("/");
  const missing = () => new Response("Not found", { status: 404 });
  const secret = gatedEnv().NEAR_MARKET_LINK_SECRET;
  const url = new URL(request.url);
  if (!secret || segments[0] !== "submissions") return missing();
  if (!verifyFileLink(secret, path, url.searchParams.get("expires"), url.searchParams.get("sig"))) return missing();

  const file = await readSubmissionFile(path);
  if (!file) return missing();
  return new Response(file.body, {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=300" },
  });
}
