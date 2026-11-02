// `pnpm dev:local`: the app and worker against a local Postgres (PGlite) with the stand-in
// Concordium adapters and local file storage. Nothing here touches Neon, Blob or a chain.
// Uploads, keys and secrets persist in `.local/` at the workspace root. The database lives in
// ~/.boreal-task-desk/pg instead: Turbopack watches the whole workspace, and Postgres writes
// its log constantly, which kept the dev server recompiling and reloading pages. Delete both
// to start fresh.
//
// `pnpm dev:demo` is the same with the demo dataset for the admin money console: its own
// database (~/.boreal-task-desk/pg-demo), filled once with 30 days of generated sandbox
// activity, and the dashboard labelled "Demo dataset". `pnpm dev:demo --fresh` regenerates it
// so the last hours' activity (payouts on their way, retries) lines up with now.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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

// PayPal sandbox credentials, if you want the PayPal rail locally (PAYMENTS_RAIL=paypal).
// Kept in their own gitignored file so .env.local's production values never mix in.
const paypalEnv = join(root, ".env.paypal");
if (existsSync(paypalEnv)) process.loadEnvFile(paypalEnv);
const paypal = process.env.PAYMENTS_RAIL === "paypal";

function persistentSecret(name: string): string {
  const file = join(localDir, name);
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("base64url"));
  return readFileSync(file, "utf8").trim();
}

const demo = process.argv.includes("--demo");
const pgDir = join(homedir(), ".boreal-task-desk", demo ? "pg-demo" : "pg");
const seededMarker = join(localDir, demo ? "demo-seeded" : "seeded");
if (demo && process.argv.includes("--fresh")) {
  rmSync(pgDir, { recursive: true, force: true });
  rmSync(seededMarker, { force: true });
}
if (!demo && !existsSync(pgDir) && existsSync(join(localDir, "pg"))) {
  // One-time move from where the database used to live.
  mkdirSync(dirname(pgDir), { recursive: true });
  renameSync(join(localDir, "pg"), pgDir);
}
const pg = await PGlite.create(pgDir);
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
  // Keys the PayPal identity hash for Log in with PayPal (PAYPAL_LOGIN=on in .env.paypal).
  CONCORDIUM_PSEUDONYM_SECRET: persistentSecret("pseudonym-secret"),
  OPERATING_ACCOUNT_ADDRESS: "dev-acct-boreal",
  // On PayPal the AI reviewer's fee is paid out like any other; point it at a sandbox account.
  REVIEWER_ADDRESSES: paypal
    ? `boreal-ai-reviewer=${process.env.PAYPAL_SANDBOX_REVIEWER_EMAIL || process.env.PAYPAL_SANDBOX_WORKER_EMAIL || ""}`
    : "boreal-ai-reviewer=dev-acct-reviewer",
  // Real Concordium ID and payout settings from .env.local stay off locally.
  CONCORDIUM_ANCHOR_ACCOUNT: "",
  CONCORDIUM_ANCHOR_KEY: "",
  NEXT_PUBLIC_REOWN_PROJECT_ID: "",
  BLOB_READ_WRITE_TOKEN: "",
  FILE_STORAGE: "local",
  LOCAL_UPLOAD_DIR: join(localDir, "uploads"),
  MONITOR_INTERVAL_MS: "5000",
  // Labels the admin console's data as generated (`pnpm dev:demo`).
  BOREAL_DEMO_DATA: demo ? "1" : "",
};

console.log(
  `[local] Postgres (PGlite) on ${databaseUrl}, data in .local/${paypal ? "; payments on the PayPal sandbox" : ""}${demo ? "; demo dataset" : ""}`,
);

const run = (command: string) => spawn(command, { cwd: root, env, shell: true, stdio: "inherit" });

if (!existsSync(seededMarker)) {
  const step = (command: string) =>
    new Promise<void>((done, fail) =>
      run(command).on("exit", (code) => (code === 0 ? done() : fail(new Error(`${command} failed with ${code}`)))),
    );
  await step("pnpm --filter @boreal/desk -s seed:local");
  if (demo) await step("pnpm --filter @boreal/paypal -s demo:dataset");
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
