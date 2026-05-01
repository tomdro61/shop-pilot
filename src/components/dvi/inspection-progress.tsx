"use client";

import { ChevronDown } from "lucide-react";

interface InspectionProgressProps {
  rated: number;
  total: number;
  onJumpToNext: () => void;
  hasUnrated: boolean;
}

export function InspectionProgress({ rated, total, onJumpToNext, hasUnrated }: InspectionProgressProps) {
  const pct = total > 0 ? (rated / total) * 100 : 0;
  const isComplete = rated === total && total > 0;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-1">
          <span className="font-mono tabular-nums">
            {rated}/{total} items
          </span>
          <span className="font-mono tabular-nums">{Math.round(pct)}%</span>
        </div>
        <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isComplete ? "bg-emerald-500" : "bg-blue-600"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {hasUnrated && (
        <button
          type="button"
          onClick={onJumpToNext}
          className="flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white shadow-card active:scale-95 transition-all shrink-0"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Next
        </button>
      )}
    </div>
  );
}
