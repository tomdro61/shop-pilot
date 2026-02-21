"use client";

import { useChat } from "@/lib/ai/use-chat";
import { ChatMessagesList } from "@/components/chat/chat-messages-list";
import { ChatInput } from "@/components/chat/chat-input";

export default function ChatPage() {
  const { messages, isLoading, sendMessage } = useChat();

  return (
    <div className="flex h-full flex-col">
      <ChatMessagesList messages={messages} />
      <ChatInput onSend={sendMessage} isLoading={isLoading} />
    </div>
  );
}
