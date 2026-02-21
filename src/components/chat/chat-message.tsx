"use client";

import { cn } from "@/lib/utils";
import { Wrench, Loader2 } from "lucide-react";
import type { ChatMessage } from "@/lib/ai/types";

// Convert tool name from snake_case to readable label
function formatToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground"
        )}
      >
        {/* Tool call indicators */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {message.toolCalls.map((tc, i) => (
              <span
                key={`${tc.name}-${i}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                  tc.status === "running"
                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
                    : tc.status === "error"
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                      : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                )}
              >
                {tc.status === "running" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wrench className="h-3 w-3" />
                )}
                {formatToolName(tc.name)}
              </span>
            ))}
          </div>
        )}

        {/* Message content with basic markdown-like formatting */}
        <div className="whitespace-pre-wrap break-words">
          {message.content || (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
