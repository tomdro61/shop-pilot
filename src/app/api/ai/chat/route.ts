import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getSystemPrompt } from "@/lib/ai/system-prompt";
import { tools } from "@/lib/ai/tools";
import { executeToolCall } from "@/lib/ai/handlers";
import { encodeSSE } from "@/lib/ai/sse";

const MAX_TOOL_LOOPS = 10;

export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, conversationState } = (await request.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    conversationState?: Anthropic.MessageParam[];
  };

  if (!messages || messages.length === 0) {
    return new Response("Messages required", { status: 400 });
  }

  const anthropic = new Anthropic();
  const systemPrompt = getSystemPrompt();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Build the initial Anthropic messages — use conversationState if available
        // to preserve tool call context from prior turns
        let anthropicMessages: Anthropic.MessageParam[];
        if (conversationState && conversationState.length > 0) {
          // Append only the latest user message to the preserved state
          const lastUserMessage = messages[messages.length - 1];
          anthropicMessages = [
            ...conversationState,
            { role: "user" as const, content: lastUserMessage.content },
          ];
        } else {
          anthropicMessages = messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
        }

        for (let iteration = 0; iteration < MAX_TOOL_LOOPS; iteration++) {
          // Stream the response
          const response = anthropic.messages.stream({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            system: systemPrompt,
            tools,
            messages: anthropicMessages,
          });

          // Collect text + tool_use blocks from this turn
          let fullText = "";
          const toolUseBlocks: Anthropic.ContentBlock[] = [];

          response.on("text", (text) => {
            fullText += text;
            controller.enqueue(encodeSSE("text", JSON.stringify(text)));
          });

          const finalMessage = await response.finalMessage();

          // Collect tool_use blocks
          for (const block of finalMessage.content) {
            if (block.type === "tool_use") {
              toolUseBlocks.push(block);
            }
          }

          // If no tool use, we're done — send conversation state for next turn
          if (finalMessage.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
            // Append the final assistant message to state
            const finalState = [
              ...anthropicMessages,
              { role: "assistant" as const, content: finalMessage.content },
            ];
            controller.enqueue(encodeSSE("conversation_state", JSON.stringify(finalState)));
            controller.enqueue(encodeSSE("done", "{}"));
            controller.close();
            return;
          }

          // Execute tool calls
          const toolResults: Anthropic.MessageParam = {
            role: "user",
            content: [],
          };

          for (const block of toolUseBlocks) {
            if (block.type !== "tool_use") continue;

            const toolName = block.name;
            controller.enqueue(encodeSSE("tool_start", JSON.stringify(toolName)));

            const result = await executeToolCall(
              toolName,
              block.input as Record<string, unknown>
            );

            controller.enqueue(encodeSSE("tool_result", JSON.stringify(toolName)));

            (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }

          // Append the assistant's response and tool results for the next iteration
          anthropicMessages = [
            ...anthropicMessages,
            { role: "assistant", content: finalMessage.content },
            toolResults,
          ];
        }

        // Safety cap reached
        controller.enqueue(
          encodeSSE(
            "error",
            JSON.stringify("Reached maximum tool call iterations. Please try again with a simpler request.")
          )
        );
        controller.enqueue(encodeSSE("done", "{}"));
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "An unexpected error occurred";
        controller.enqueue(encodeSSE("error", JSON.stringify(message)));
        controller.enqueue(encodeSSE("done", "{}"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
