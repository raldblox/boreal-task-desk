"use client";

import type { AgAiEvent, AgLlmAdapter, AgLlmRequest, AgLlmResponse } from "ag-studio";

// AG Studio's model adapter for the console's agents. Studio runs the loop and the tools in the
// browser; each turn is posted to /admin/console/ai, which calls Claude with the server's key and
// streams the turn back as newline-delimited JSON (see server/console-ai.ts).

export function claudeAdapter(endpoint = "/admin/console/ai"): AgLlmAdapter {
  return {
    executeTurn(request: AgLlmRequest, options) {
      let resolve!: (r: AgLlmResponse) => void;
      let reject!: (e: Error) => void;
      const complete = new Promise<AgLlmResponse>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      // A consumer that stops reading early never awaits `complete`; keep that rejection quiet.
      void complete.catch(() => {});

      async function* events(): AsyncGenerator<AgAiEvent> {
        let settled = false;
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
            signal: options?.signal,
          });
          if (!res.ok || !res.body) {
            const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
            throw new Error(body.error?.message ?? `The ops agent couldn't be reached (${res.status}).`);
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const msg = JSON.parse(line) as { event?: AgAiEvent; response?: AgLlmResponse; error?: { message: string } };
              if (msg.event) yield msg.event;
              else if (msg.response) {
                settled = true;
                resolve(msg.response);
              } else if (msg.error) throw new Error(msg.error.message);
            }
          }
          if (!settled) throw new Error("The ops agent's reply ended early.");
        } catch (error) {
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }

      const iterator = events();
      return { stream: { [Symbol.asyncIterator]: () => iterator }, complete };
    },
  };
}

/** Stands in when no Anthropic key is set: every turn says the agent is off, and how to turn it on. */
export function offlineAdapter(): AgLlmAdapter {
  return {
    executeTurn() {
      const id = `offline_${Date.now()}`;
      const text =
        "The boreal ops agent is off on this deployment: it needs `ANTHROPIC_API_KEY` on the server. " +
        "Everything else on the console works without it, and **Scan for anomalies** above still runs the anomaly checks and adds the alert board.";
      const response: AgLlmResponse = {
        id,
        createdAt: Date.now(),
        status: "completed",
        output: [{ id, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text, annotations: [] }] }],
      };
      async function* events(): AsyncGenerator<AgAiEvent> {
        yield { type: "TEXT_MESSAGE_START", messageId: id, role: "assistant" };
        yield { type: "TEXT_MESSAGE_CONTENT", messageId: id, delta: text };
        yield { type: "TEXT_MESSAGE_END", messageId: id };
      }
      const iterator = events();
      return { stream: { [Symbol.asyncIterator]: () => iterator }, complete: Promise.resolve(response) };
    },
  };
}
