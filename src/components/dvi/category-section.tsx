"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategorySectionProps {
  name: string;
  ratedCount: number;
  totalCount: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CategorySection({
  name,
  ratedCount,
  totalCount,
  defaultOpen = false,
  children,
}: CategorySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isComplete = ratedCount === totalCount && totalCount > 0;

  return (
    <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 py-3 transition-colors",
          isOpen
            ? "border-b border-stone-200 dark:border-stone-800"
            : "hover:bg-stone-50 dark:hover:bg-stone-800/50"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-50 truncate">
            {name}
          </h3>
          <span
            className={cn(
              "text-[10px] font-black px-2 py-0.5 rounded-full uppercase tabular-nums shrink-0",
              isComplete
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
            )}
          >
            {ratedCount}/{totalCount}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-stone-400 dark:text-stone-500 transition-transform shrink-0",
            isOpen && "rotate-180"
          )}
        />
      </button>
      {isOpen && <div className="px-3 py-2 space-y-2">{children}</div>}
    </div>
  );
}
