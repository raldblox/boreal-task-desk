// `pnpm dev:local`: the app and worker against a local Postgres (PGlite) with the stand-in
// Concordium adapters and local file storage. Nothing here touches Neon, Blob or a chain.
// Data persists in `.local/` at the workspace root; delete it to start fresh.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const localDir = join(root, ".local");
const port = 5433;

mkdirSync(join(localDir, "uploads"), { recursive: true });

function persistentSecret(name: string): string {
  const file = join(localDir, name);
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("base64url"));
  return readFileSync(file, "utf8").trim();
}

const pg = await PGlite.create(join(localDir, "pg"));
await migrate(drizzle(pg), { migrationsFolder: resolve(here, "../migrations") });
const server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1", maxConnections: 20 });
await server.start();

const databaseUrl = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
const env = {
  ...process.env,
  // Explicit values win over the production ones in .env.local.
  DATABASE_URL: databaseUrl,
  DATABASE_URL_UNPOOLED: databaseUrl,
  CONCORDIUM_MODE: "dev",
  DEV_CONCORDIUM_SECRET: persistentSecret("dev-concordium-secret"),
  SESSION_SECRET: persistentSecret("session-secret"),
  OPERATING_ACCOUNT_ADDRESS: "dev-acct-boreal",
  REVIEWER_ADDRESSES: "boreal-ai-reviewer=dev-acct-reviewer",
  // Real Concordium ID and payout settings from .env.local stay off locally.
  CONCORDIUM_ANCHOR_ACCOUNT: "",
  CONCORDIUM_ANCHOR_KEY: "",
  NEXT_PUBLIC_REOWN_PROJECT_ID: "",
  BLOB_READ_WRITE_TOKEN: "",
  FILE_STORAGE: "local",
  LOCAL_UPLOAD_DIR: join(localDir, "uploads"),
  MONITOR_INTERVAL_MS: "5000",
};

console.log(`[local] Postgres (PGlite) on ${databaseUrl}, data in .local/`);

const run = (command: string) => spawn(command, { cwd: root, env, shell: true, stdio: "inherit" });

const seededMarker = join(localDir, "seeded");
if (!existsSync(seededMarker)) {
  await new Promise<void>((done, fail) =>
    run("pnpm --filter @boreal/desk -s seed:local").on("exit", (code) =>
      code === 0 ? done() : fail(new Error(`seed failed with ${code}`)),
    ),
  );
  writeFileSync(seededMarker, new Date().toISOString());
}

const app = run("pnpm dev");
const shutdown = async () => {
  app.kill();
  await server.stop();
  await pg.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
app.on("exit", shutdown);
