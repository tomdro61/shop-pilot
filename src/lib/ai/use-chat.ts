"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage, ToolCallInfo, ChatSSEEvent } from "./types";
import { parseSSE } from "./sse";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim(),
      createdAt: new Date(),
    };

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      toolCalls: [],
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    // Build messages payload — only role + content for the API
    const apiMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: userMessage.role, content: userMessage.content },
    ];

    try {
      abortRef.current = new AbortController();

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: `Error: ${errorText || response.statusText}` }
              : m
          )
        );
        setIsLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setIsLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (double newline delimited)
        const events = parseSSE(buffer);

        // Keep any incomplete event data in the buffer
        const lastDoubleNewline = buffer.lastIndexOf("\n\n");
        if (lastDoubleNewline !== -1) {
          buffer = buffer.slice(lastDoubleNewline + 2);
        }

        for (const event of events) {
          handleSSEEvent(event, assistantMessage.id);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // User cancelled — do nothing
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: m.content || "Sorry, something went wrong. Please try again." }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoading]);

  function handleSSEEvent(event: ChatSSEEvent, messageId: string) {
    switch (event.type) {
      case "text":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: m.content + event.text }
              : m
          )
        );
        break;

      case "tool_start":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  toolCalls: [
                    ...(m.toolCalls || []),
                    { name: event.tool, status: "running" as const },
                  ],
                }
              : m
          )
        );
        break;

      case "tool_result":
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const toolCalls = (m.toolCalls || []).map((tc: ToolCallInfo) =>
              tc.name === event.tool && tc.status === "running"
                ? { ...tc, status: "complete" as const }
                : tc
            );
            return { ...m, toolCalls };
          })
        );
        break;

      case "error":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: m.content + `\n\n**Error:** ${event.message}` }
              : m
          )
        );
        break;

      case "done":
        // Stream finished
        break;
    }
  }

  return { messages, isLoading, sendMessage };
}
