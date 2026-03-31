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
    <div className="rounded-xl bg-card shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 active:bg-stone-50 dark:active:bg-stone-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-50">
            {name}
          </h3>
          <span
            className={cn(
              "text-[10px] font-black px-2 py-0.5 rounded-full",
              isComplete
                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
            )}
          >
            {ratedCount}/{totalCount}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-stone-400 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>
      {isOpen && (
        <div className="border-t border-stone-100 dark:border-stone-800 px-3 py-2 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}
