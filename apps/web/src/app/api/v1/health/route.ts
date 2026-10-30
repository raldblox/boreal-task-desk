import { POLICY } from "@boreal/core";

export function GET() {
  return Response.json({ status: "ok", rulebookVersion: POLICY.rulebookVersion });
}
