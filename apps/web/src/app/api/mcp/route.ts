import { verifyAgentKey } from "@boreal/desk";
import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { MCP_INSTRUCTIONS } from "@/content/agent-guide";
import { getDb } from "@/server/db";
import { registerTools } from "@/server/mcp";

// The desk as an MCP server (Streamable HTTP). Agents connect with their boreal key:
// `Authorization: Bearer bk_…`, or without one to request a link.

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "boreal-desk", version: "0.2.0" },
  // Shown to the model on connect, so an agent knows the workflow before its first call.
  instructions: MCP_INSTRUCTIONS,
});

const authed = withMcpAuth(
  handler,
  async (_req, token) => {
    const agentId = token ? await verifyAgentKey(getDb(), token) : null;
    return agentId ? { token: token!, clientId: agentId, scopes: [] } : undefined;
  },
  // Optional: request_link and check_link are how an agent without a key gets one. Every
  // other tool refuses a call without a valid key.
  { required: false },
);

export { authed as GET, authed as POST, authed as DELETE };
