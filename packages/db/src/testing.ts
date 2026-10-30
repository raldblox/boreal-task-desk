import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "./index";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/** A fresh in-process Postgres with every migration applied. One per test file is enough. */
export async function createTestDb(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as Database, close: () => client.close() };
}
