import { POLICY } from "@boreal/core";
import { sql } from "@boreal/db";
import { connection } from "next/server";

import { getDb } from "@/server/db";

export async function GET() {
  await connection();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok", database: "ok", rulebookVersion: POLICY.rulebookVersion });
  } catch (error) {
    console.error("[health] database check failed", error);
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
