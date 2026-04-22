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
    <div className="rounded-lg bg-card shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 bg-stone-800 dark:bg-stone-900 rounded-t-xl active:bg-stone-700 dark:active:bg-stone-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-stone-100">
            {name}
          </h3>
          <span
            className={cn(
              "text-[10px] font-black px-2 py-0.5 rounded-md",
              isComplete
                ? "bg-green-500/20 text-green-300"
                : "bg-stone-600 text-stone-300"
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
