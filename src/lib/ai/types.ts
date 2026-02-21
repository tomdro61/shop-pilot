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
  | { type: "error"; message: string }
  | { type: "conversation_state"; messages: ApiMessage[] };

// Full Anthropic message format for preserving tool context between turns
export type ApiMessage = {
  role: "user" | "assistant";
  content: string | ApiContentBlock[];
};

export type ApiContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };
