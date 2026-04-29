import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  children: ReactNode;
  /** Override the max-width. Default `max-w-[1400px]` matches the dashboard. */
  maxWidth?: string;
  className?: string;
}

export function PageShell({
  children,
  maxWidth = "max-w-[1400px]",
  className,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto px-4 lg:px-6 py-4 lg:py-5 space-y-4",
        maxWidth,
        className,
      )}
    >
      {children}
    </div>
  );
}
