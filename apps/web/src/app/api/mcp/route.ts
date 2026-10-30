import { verifyAgentKey } from "@boreal/desk";
import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { getDb } from "@/server/db";
import { registerTools } from "@/server/mcp";

// The desk as an MCP server (Streamable HTTP). Agents connect with their boreal key:
// `Authorization: Bearer bk_…`.

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "boreal-desk", version: "0.1.0" },
});

const authed = withMcpAuth(
  handler,
  async (_req, token) => {
    const agentId = token ? await verifyAgentKey(getDb(), token) : null;
    return agentId ? { token: token!, clientId: agentId, scopes: [] } : undefined;
  },
  { required: true },
);

export { authed as GET, authed as POST, authed as DELETE };
