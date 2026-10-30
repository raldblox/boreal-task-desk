import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export * from "./schema";

export type Database = ReturnType<typeof createDb>;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(url, { schema });
}
