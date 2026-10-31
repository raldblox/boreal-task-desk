import { SKILL_MD } from "@/content/agent-guide";

// Served as plain text so agents can read it directly.
export function GET() {
  return new Response(SKILL_MD, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
