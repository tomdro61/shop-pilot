export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  createdAt: Date;
}

export interface ToolCallInfo {
  name: string;
  status: "running" | "complete" | "error";
}

export type ChatSSEEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; tool: string }
  | { type: "tool_result"; tool: string }
  | { type: "done" }
  | { type: "error"; message: string };
