import { timingSafeEqual } from "node:crypto";

import { getMonitor } from "@/server/monitor";

// One monitor tick: timers, AI review, escrow check and the outbox. Called by a scheduler
// (Vercel Cron daily, plus any agent or service on a shorter schedule) with
// `Authorization: Bearer $CRON_SECRET`.
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function tick(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const report = await (await getMonitor()).tick();
  return Response.json(report, { status: report.errors.length ? 207 : 200 });
}

export { tick as GET, tick as POST };
