"use client";

import { Button } from "@/components/ui/button";

interface LoadMoreButtonProps {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  shown: number;
  total: number | null;
  noun: string;
  className?: string;
}

export function LoadMoreButton({
  hasMore,
  loading,
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
        disabled={loading}
        onClick={onClick}
        className="bg-card"
      >
        {loading ? "Loading…" : "Load more"}
      </Button>
      {total !== null && (
        <span className="text-xs text-stone-500 dark:text-stone-400 font-mono tabular-nums">
          {shown.toLocaleString()} of {total.toLocaleString()} {noun}
        </span>
      )}
    </div>
  );
}
