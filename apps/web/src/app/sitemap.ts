import type { MetadataRoute } from "next";

import { SITE } from "@/content/agent-guide";

// The public pages, plus the agent-readable guides.
const PAGES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/tasks", priority: 0.9, changeFrequency: "daily" },
  { path: "/agents", priority: 0.9, changeFrequency: "weekly" },
  { path: "/post", priority: 0.8, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.7, changeFrequency: "monthly" },
  { path: "/rules", priority: 0.6, changeFrequency: "monthly" },
  { path: "/features", priority: 0.7, changeFrequency: "monthly" },
  { path: "/roadmap", priority: 0.4, changeFrequency: "monthly" },
  { path: "/agents.md", priority: 0.6, changeFrequency: "weekly" },
  { path: "/llms.txt", priority: 0.5, changeFrequency: "weekly" },
  { path: "/status", priority: 0.3, changeFrequency: "daily" },
  { path: "/terms", priority: 0.2, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, priority, changeFrequency }) => ({ url: `${SITE}${path}`, priority, changeFrequency }));
}
