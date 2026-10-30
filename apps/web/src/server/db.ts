import "server-only";

import { createDb, type Database } from "@boreal/db";

// One pool per server instance, created on first use so builds never need a database.
let db: Database | undefined;

export function getDb(): Database {
  db ??= createDb();
  return db;
}
