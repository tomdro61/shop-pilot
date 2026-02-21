import type { ChatSSEEvent } from "./types";

const encoder = new TextEncoder();

export function encodeSSE(event: string, data: string): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${data}\n\n`);
}

export function parseSSE(chunk: string): ChatSSEEvent[] {
  const events: ChatSSEEvent[] = [];
  const lines = chunk.split("\n");

  let currentEvent = "";
  let currentData = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      currentData = line.slice(6);
    } else if (line === "" && currentEvent) {
      try {
        if (currentEvent === "text") {
          events.push({ type: "text", text: JSON.parse(currentData) });
        } else if (currentEvent === "tool_start") {
          events.push({ type: "tool_start", tool: JSON.parse(currentData) });
        } else if (currentEvent === "tool_result") {
          events.push({ type: "tool_result", tool: JSON.parse(currentData) });
        } else if (currentEvent === "done") {
          events.push({ type: "done" });
        } else if (currentEvent === "error") {
          events.push({ type: "error", message: JSON.parse(currentData) });
        } else if (currentEvent === "conversation_state") {
          events.push({ type: "conversation_state", messages: JSON.parse(currentData) });
        }
      } catch {
        // Skip malformed events
      }
      currentEvent = "";
      currentData = "";
    }
  }

  return events;
}
