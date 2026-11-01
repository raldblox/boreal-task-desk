// Creates or updates the database tables before a production build on Vercel, so each
// deployment (testnet.boreal.work, boreal.work) migrates its own database and nobody runs
// migrations by hand. Preview and local builds skip it: they can share a production database.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.VERCEL_ENV !== "production") {
  console.log("[migrate] not a production deploy; skipping");
  process.exit(0);
}
if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL) {
  console.error("[migrate] no DATABASE_URL on this project");
  process.exit(1);
}
const db = resolve(dirname(fileURLToPath(import.meta.url)), "..");
console.log("[migrate] applying migrations");
execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], { cwd: db, stdio: "inherit", timeout: 120_000 });
console.log("[migrate] done");
