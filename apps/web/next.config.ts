import { existsSync } from "node:fs";

import type { NextConfig } from "next";

// Local development shares one env file at the workspace root (`vercel env pull .env.local`).
const rootEnv = "../../.env.local";
if (process.env.NODE_ENV !== "production" && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  experimental: {
    // Photos are shrunk in the browser first; this leaves room under Vercel's 4.5 MB body cap.
    serverActions: { bodySizeLimit: "4.2mb" },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
