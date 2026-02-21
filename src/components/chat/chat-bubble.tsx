"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChatBubble() {
  const pathname = usePathname();

  // Hide on the chat page itself
  if (pathname === "/chat") return null;

  return (
    <Button
      asChild
      size="icon"
      className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-[var(--glow-lg)] transition-transform hover:scale-105 lg:bottom-6"
    >
      <Link href="/chat">
        <MessageCircle className="h-6 w-6" />
      </Link>
    </Button>
  );
}
