import { issueChallenge } from "@/server/concordium-wallet";

// Quick sign-in, step 1: the one-time message the worker's wallet account signs.
export async function POST() {
  return Response.json({ message: await issueChallenge() });
}
