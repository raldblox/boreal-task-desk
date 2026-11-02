import type { AgAiConversationItem } from "ag-studio";
import { describe, expect, it } from "vitest";

import { cleanSchema, toMessages } from "./console-ai-messages";

describe("console agents on Claude", () => {
  it("turns Studio's conversation into alternating Claude messages with tool calls and results", () => {
    const items: AgAiConversationItem[] = [
      { id: "1", kind: "input", type: "message", role: "user", status: "completed", content: [{ type: "text", text: "Failed payouts this week?" }] },
      { id: "2", kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: "Checking.", annotations: [] }] },
      { id: "3", kind: "output", type: "function_call", callId: "toolu_1", name: "execute_query", arguments: '{"query":{"limit":5}}', status: "completed" },
      { id: "4", kind: "output", type: "function_call", callId: "toolu_2", name: "view_page", arguments: "", status: "completed" },
      { type: "function_call_output", callId: "toolu_1", output: "3 rows", status: "completed" },
      { type: "function_call_output", callId: "toolu_2", output: "", status: "completed" },
      { id: "5", kind: "output", type: "reasoning", summary: [{ type: "summary", text: "skip me" }] },
    ];
    expect(toMessages(items)).toEqual([
      { role: "user", content: [{ type: "text", text: "Failed payouts this week?" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Checking." },
          { type: "tool_use", id: "toolu_1", name: "execute_query", input: { query: { limit: 5 } } },
          { type: "tool_use", id: "toolu_2", name: "view_page", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: "3 rows" },
          { type: "tool_result", tool_use_id: "toolu_2", content: "(no output)" },
        ],
      },
    ]);
  });

  it("starts with a user turn even when Studio's history doesn't", () => {
    const items: AgAiConversationItem[] = [
      { id: "1", kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: "Hi", annotations: [] }] },
    ];
    expect(toMessages(items)[0]).toEqual({ role: "user", content: "Continue." });
  });

  it("drops what the Messages API doesn't take from tool schemas", () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { pageId: { anyOf: [{ type: "string" }, { not: {} }] }, limit: { anyOf: [{ type: "number" }, { type: "null" }] } },
    };
    expect(cleanSchema(schema)).toEqual({
      type: "object",
      properties: { pageId: { type: "string" }, limit: { anyOf: [{ type: "number" }, { type: "null" }] } },
    });
  });
});
