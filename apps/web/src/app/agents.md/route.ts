import { AGENT_GUIDE } from "@/content/agent-guide";

// Served as plain text so agents can read it directly.
export function GET() {
  return new Response(AGENT_GUIDE, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
