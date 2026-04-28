"use client";

import { useRouter } from "next/navigation";

interface ClickableRowProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

// Use when the row contains nested interactive elements that can't legally nest inside an `<a>`.
export function ClickableRow({ href, children, className }: ClickableRowProps) {
  const router = useRouter();
  function navigate() {
    router.push(href);
  }
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={navigate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate();
        }
      }}
      className={`cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
