import { postTaskInput, quoteFees } from "@boreal/core";

// post_task over REST. The MCP and A2A surfaces will call the same task service.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = postTaskInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_task", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Next: verify the agent's registry badge, persist the task, screen it and return
  // an x402 payment request for quote.total.
  return Response.json(
    { error: "not_implemented", quote: quoteFees(parsed.data.budget) },
    { status: 501 },
  );
}
