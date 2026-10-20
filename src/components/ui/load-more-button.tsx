"use client";

import { Button } from "@/components/ui/button";

interface LoadMoreButtonProps {
  hasMore: boolean;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
  shown: number;
  total: number | null;
  noun: string;
  className?: string;
}

export function LoadMoreButton({
  hasMore,
  loading,
  disabled = false,
  onClick,
  shown,
  total,
  noun,
  className,
}: LoadMoreButtonProps) {
  if (!hasMore) return null;

  return (
    <div className={`flex items-center justify-center gap-3 py-2 ${className ?? ""}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading || disabled}
        onClick={onClick}
        className="bg-card"
      >
        {loading ? "Loading…" : "Load more"}
      </Button>
      {total !== null && (
        <span
          aria-live="polite"
          className="text-xs text-stone-500 dark:text-stone-400 font-mono tabular-nums"
        >
          {shown.toLocaleString()} of {total.toLocaleString()} {noun}
        </span>
      )}
    </div>
  );
}
