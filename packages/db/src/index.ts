import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "./schema";

export * from "./schema";
// Re-exported so every package builds queries with this package's copy of drizzle-orm.
export { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, sum } from "drizzle-orm";

/** Any Postgres-backed database with boreal's schema: node-postgres in production, PGlite in tests. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type Task = typeof schema.tasks.$inferSelect;
export type Worker = typeof schema.workers.$inferSelect;
export type Agent = typeof schema.agents.$inferSelect;

export function createDb(url = process.env.DATABASE_URL): Database {
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(url, { schema });
}
