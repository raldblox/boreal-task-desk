import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

const envFile = "../../.env.local";
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  // Migrations need a direct connection; Neon's pooled URL is for the app.
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
