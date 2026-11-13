import { existsSync } from "node:fs";

import type { NextConfig } from "next";

// Local development shares one env file at the workspace root (`vercel env pull .env.local`).
const rootEnv = "../../.env.local";
if (process.env.NODE_ENV !== "production" && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Concordium's SDK loads WebAssembly and native gRPC at runtime, and ZKPassport's verifier its
  // WebAssembly prover; keep them out of the server bundle.
  serverExternalPackages: ["@concordium/web-sdk", "@grpc/grpc-js", "@zkpassport/sdk"],
  experimental: {
    // Photos are shrunk in the browser first; this leaves room under Vercel's 4.5 MB body cap.
    serverActions: { bodySizeLimit: "4.2mb" },
    // A Turbopack cache restored from Vercel's build cache once shipped stale CSS (the old theme);
    // builds take ~30 s, so always building fresh is worth it.
    turbopackFileSystemCacheForBuild: false,
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
