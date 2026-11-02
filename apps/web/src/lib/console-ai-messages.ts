import type Anthropic from "@anthropic-ai/sdk";
import type { AgAiConversationItem } from "ag-studio";

// Translating AG Studio's model requests into Claude's Messages API, for the money console's
// agents (server/console-ai.ts). Pure, so it is tested on its own.

type Json = Record<string, unknown>;

/** Studio's JSON Schemas, minus what the Messages API doesn't take (`$schema`, "undefined" sentinels). */
export function cleanSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(cleanSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Json = {};
  for (const [key, value] of Object.entries(schema as Json)) {
    if (key === "$schema") continue;
    if (key === "anyOf" && Array.isArray(value)) {
      const kept = value.filter((v) => !(v && typeof v === "object" && "not" in v && Object.keys(v).length === 1));
      if (kept.length === 1) Object.assign(out, cleanSchema(kept[0]));
      else out.anyOf = kept.map(cleanSchema);
      continue;
    }
    out[key] = cleanSchema(value);
  }
  return out;
}

export function toMessages(items: AgAiConversationItem[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  const push = (role: "user" | "assistant", block: Anthropic.ContentBlockParam) => {
    const last = messages.at(-1);
    if (last?.role === role && Array.isArray(last.content)) last.content.push(block);
    else messages.push({ role, content: [block] });
  };
  for (const item of items) {
    if (item.type === "message" && item.kind === "input") {
      const text = item.content.map((c) => (c.type === "text" ? c.text : "")).join("\n").trim();
      if (text) push("user", { type: "text", text: item.role === "system" ? `(Context from the dashboard) ${text}` : text });
    } else if (item.type === "message" && item.kind === "output") {
      const text = item.content.map((c) => (c.type === "text" ? c.text : c.refusal)).join("\n").trim();
      if (text) push("assistant", { type: "text", text });
    } else if (item.type === "function_call") {
      let input: unknown = {};
      try {
        input = item.arguments ? JSON.parse(item.arguments) : {};
      } catch {
        input = {};
      }
      push("assistant", { type: "tool_use", id: item.callId, name: item.name, input });
    } else if (item.type === "function_call_output") {
      push("user", { type: "tool_result", tool_use_id: item.callId, content: item.output || "(no output)" });
    }
    // Reasoning items carry nothing this model needs back: thinking is off between tool calls.
  }
  if (messages[0]?.role !== "user") messages.unshift({ role: "user", content: "Continue." });
  return messages;
}
