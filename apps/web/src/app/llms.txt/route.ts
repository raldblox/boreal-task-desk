import { LLMS_TXT } from "@/content/agent-guide";

// Served as plain text so agents can read it directly.
export function GET() {
  return new Response(LLMS_TXT, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
