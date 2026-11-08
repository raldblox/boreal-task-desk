import { issueChallenge } from "@/server/concordium-wallet";
import { addonRefusal } from "@/server/addons";

// Quick sign-in, step 1: the one-time message the worker's wallet account signs.
export async function POST() {
  const off = addonRefusal("concordium", "id");
  if (off) return off;
  return Response.json({ message: await issueChallenge() });
}
