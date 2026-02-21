"use client";

import { useEffect, useRef } from "react";
import { ChatMessageBubble } from "./chat-message";
import type { ChatMessage } from "@/lib/ai/types";

const WELCOME_MESSAGE =
  "Hi! I'm ShopPilot, your shop assistant. I can help you look up customers, manage jobs, create estimates, and more. What can I help with?";

export function ChatMessagesList({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-sm leading-relaxed">
              {WELCOME_MESSAGE}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessageBubble key={message.id} message={message} />
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
