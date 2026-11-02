import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { AgAiEvent, AgAiOutputItem, AgLlmRequest, AgLlmResponse } from "ag-studio";

import { cleanSchema, toMessages } from "@/lib/console-ai-messages";

// The money console's agents run in the browser (AG Studio's agent framework owns the loop and
// runs the tools on the page), but their model calls come here: each Studio turn becomes one
// streamed Claude Messages request, and Claude's stream goes back as Studio's events. The key
// never leaves the server, and only signed-in admins reach this (the proxy and the route check).

/** Sonnet 5.5 with thinking off between tool calls: quick turns, and no thinking blocks to replay. */
export const CONSOLE_MODEL = "claude-sonnet-5-5";

export function consoleAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | undefined;

type Json = Record<string, unknown>;

/**
 * One Studio turn against Claude, as newline-delimited JSON: `{ event }` lines as Claude streams,
 * then `{ response }` with the turn's output, or `{ error }`.
 */
export function runConsoleTurn(request: AgLlmRequest, signal: AbortSignal): ReadableStream<Uint8Array> {
  client ??= new Anthropic();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (line: object) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      const emit = (event: AgAiEvent) => send({ event });
      try {
        // These models can't be forced to call a tool; ask in words instead.
        const choice = request.toolChoice;
        const nudge =
          choice === "required"
            ? "\n\nCall one of your tools now."
            : choice && typeof choice === "object"
              ? `\n\nCall the ${choice.name} tool now.`
              : "";
        const json =
          request.responseFormat?.type === "json"
            ? `\n\nAnswer with only a JSON object matching this schema, no prose: ${JSON.stringify(cleanSchema(request.responseFormat.schema))}`
            : "";
        const tools: Anthropic.Tool[] =
          choice === "none"
            ? []
            : (request.tools ?? []).map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: { type: "object", ...(cleanSchema(t.parameters) as Json) } as Anthropic.Tool.InputSchema,
                eager_input_streaming: true,
              }));

        const params = {
          model: CONSOLE_MODEL,
          max_tokens: 16_000,
          system: `${request.instructions ?? ""}${nudge}${json}`.trim() || undefined,
          messages: toMessages(request.input),
          ...(tools.length > 0 && { tools, tool_choice: { type: "auto" as const } }),
          thinking: { type: "between_tools" },
          output_config: { effort: "medium" },
        } as unknown as Anthropic.MessageCreateParamsStreaming;

        const stream = client!.messages.stream(params, { signal });
        let messageId = "";
        const open = new Map<number, { kind: "text" | "tool"; id: string; args: string }>();
        for await (const ev of stream) {
          if (ev.type === "message_start") messageId = ev.message.id;
          else if (ev.type === "content_block_start") {
            if (ev.content_block.type === "text") {
              const id = `${messageId}_${ev.index}`;
              open.set(ev.index, { kind: "text", id, args: "" });
              emit({ type: "TEXT_MESSAGE_START", messageId: id, role: "assistant" });
            } else if (ev.content_block.type === "tool_use") {
              open.set(ev.index, { kind: "tool", id: ev.content_block.id, args: "" });
              emit({ type: "TOOL_CALL_START", toolCallId: ev.content_block.id, toolCallName: ev.content_block.name });
            }
          } else if (ev.type === "content_block_delta") {
            const block = open.get(ev.index);
            if (!block) continue;
            if (ev.delta.type === "text_delta") emit({ type: "TEXT_MESSAGE_CONTENT", messageId: block.id, delta: ev.delta.text });
            else if (ev.delta.type === "input_json_delta" && ev.delta.partial_json) {
              block.args += ev.delta.partial_json;
              emit({ type: "TOOL_CALL_ARGS", toolCallId: block.id, delta: ev.delta.partial_json });
            }
          } else if (ev.type === "content_block_stop") {
            const block = open.get(ev.index);
            if (block?.kind === "text") emit({ type: "TEXT_MESSAGE_END", messageId: block.id });
            if (block?.kind === "tool") emit({ type: "TOOL_CALL_END", toolCallId: block.id });
          }
        }

        const final = await stream.finalMessage();
        const output: AgAiOutputItem[] = [];
        final.content.forEach((block, index) => {
          if (block.type === "text" && block.text) {
            output.push({ id: `${final.id}_${index}`, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: block.text, annotations: [] }] });
          } else if (block.type === "tool_use") {
            // The streamed arguments as sent; Studio validates them against the tool's schema.
            const streamed = open.get(index)?.args;
            output.push({ id: block.id, kind: "output", type: "function_call", callId: block.id, name: block.name, arguments: streamed || JSON.stringify(block.input ?? {}), status: "completed" });
          }
        });
        const refused = final.stop_reason === "refusal";
        const response: AgLlmResponse = {
          id: final.id,
          createdAt: Date.now(),
          model: final.model,
          output,
          status: refused ? "failed" : final.stop_reason === "max_tokens" ? "incomplete" : "completed",
          ...(refused && { error: { code: "refusal", message: "Claude declined this request." } }),
          ...(final.stop_reason === "max_tokens" && { incompleteDetails: { reason: "max_output_tokens" as const } }),
          usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens, totalTokens: final.usage.input_tokens + final.usage.output_tokens },
        };
        send({ response });
      } catch (error) {
        const message =
          error instanceof Anthropic.APIError ? `Claude returned ${error.status ?? "an error"}: ${error.message}` : error instanceof Error ? error.message : String(error);
        if (!signal.aborted) console.error("[console-ai]", message);
        send({ error: { message } });
      } finally {
        controller.close();
      }
    },
  });
}
