"use client";

import { useRouter } from "next/navigation";

interface ClickableRowProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Client-side row that navigates on click. Use instead of wrapping content in
 * a `<Link>` when you need nested interactive elements (like a CustomerLink)
 * that wouldn't work inside an anchor.
 */
export function ClickableRow({ href, children, className }: ClickableRowProps) {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push(href)}
      className={`cursor-pointer ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
