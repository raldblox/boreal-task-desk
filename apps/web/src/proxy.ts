import { createDb, type Database } from "@boreal/db";
import { adminForWorker } from "@boreal/desk/admin";
import { type NextRequest, NextResponse } from "next/server";

import { isAdminRequest } from "@/lib/admin-gate";
import { WORKER_COOKIE } from "@/lib/worker-cookie";

// /admin exists only for allowlisted admins. Everyone else is rewritten to a path with no
// route before anything renders, so they get the site's ordinary 404, status and all, with
// nothing of the admin pages in it. Pages and actions check again on their own.

let db: Database | undefined;

export async function proxy(request: NextRequest) {
  const allowed = await isAdminRequest(request.cookies.get(WORKER_COOKIE)?.value, process.env, (workerId, allowlist) =>
    adminForWorker((db ??= createDb()), workerId, allowlist),
  );
  if (allowed) return NextResponse.next();
  return NextResponse.rewrite(new URL("/_no-such-page", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
