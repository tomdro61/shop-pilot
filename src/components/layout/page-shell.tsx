import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PageWidth = "default" | "wide" | "narrow" | "tight";

const PAGE_WIDTH: Record<PageWidth, string> = {
  default: "max-w-[1400px]", // dashboard, list pages
  wide: "max-w-6xl", // detail pages (job, customer, parking, estimate)
  narrow: "max-w-4xl", // forms, dvi, settings sub-pages
  tight: "max-w-2xl", // settings nav, narrow forms
};

interface PageShellProps {
  children: ReactNode;
  width?: PageWidth;
  className?: string;
}

export function PageShell({ children, width = "default", className }: PageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto px-4 lg:px-6 py-4 lg:py-5 space-y-4",
        PAGE_WIDTH[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
