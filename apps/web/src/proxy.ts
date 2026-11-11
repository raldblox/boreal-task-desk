import { adminPasskeys, createDb, type Database, eq, sql } from "@boreal/db";
import { adminForWorker } from "@boreal/desk/admin";
import { type NextRequest, NextResponse } from "next/server";

import { adminGate } from "@/lib/admin-gate";
import { PASSKEY_COOKIE } from "@/lib/admin-passkey";
import { WORKER_COOKIE } from "@/lib/worker-cookie";

// /admin exists only for allowlisted admins. Everyone else is rewritten to a path with no
// route before anything renders, so they get the site's ordinary 404, status and all, with
// nothing of the admin pages in it. An admin who hasn't presented their passkey yet (always
// needed on mainnet) is sent to do that first. Pages and actions check again on their own.

let db: Database | undefined;

export async function proxy(request: NextRequest) {
  const gate = await adminGate(
    { session: request.cookies.get(WORKER_COOKIE)?.value, passkey: request.cookies.get(PASSKEY_COOKIE)?.value },
    process.env,
    (workerId, allowlist) => adminForWorker((db ??= createDb()), workerId, allowlist),
    async (adminRef) => {
      const [row] = await (db ??= createDb()).select({ n: sql<number>`count(*)::int` }).from(adminPasskeys).where(eq(adminPasskeys.adminRef, adminRef));
      return row?.n ?? 0;
    },
  );
  if (gate === "ok") return NextResponse.next();
  if (gate === "passkey") {
    const to = new URL("/admin-passkey", request.url);
    to.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(to);
  }
  return NextResponse.rewrite(new URL("/_no-such-page", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
