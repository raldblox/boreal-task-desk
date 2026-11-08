import type { MetadataRoute } from "next";

import { NETWORK, SITE } from "@/content/agent-guide";

// The live site is crawlable except private and machine-only paths; testnet asks not to be indexed.
export default function robots(): MetadataRoute.Robots {
  if (NETWORK === "testnet") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/me", "/link", "/api/", "/paypal/", "/signin"] },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
