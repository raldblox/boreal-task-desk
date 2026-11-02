import type { AgLlmRequest } from "ag-studio";

import { currentAdmin } from "@/server/admin";
import { consoleAiEnabled, runConsoleTurn } from "@/server/console-ai";

// One turn of the money console's agents against Claude (see server/console-ai.ts). Admins only:
// the proxy gates /admin, and this checks again. Without ANTHROPIC_API_KEY it says the agent is off.

const error = (status: number, message: string) => Response.json({ error: { message } }, { status });

export async function POST(request: Request) {
  if (!(await currentAdmin())) return new Response("Not found", { status: 404 });
  if (!consoleAiEnabled()) return error(503, "The boreal ops agent is off: set ANTHROPIC_API_KEY on the server to turn it on.");
  let body: AgLlmRequest;
  try {
    body = (await request.json()) as AgLlmRequest;
  } catch {
    return error(400, "Send the turn as JSON.");
  }
  if (!Array.isArray(body?.input)) return error(400, "A turn needs its conversation input.");
  return new Response(runConsoleTurn(body, request.signal), {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
