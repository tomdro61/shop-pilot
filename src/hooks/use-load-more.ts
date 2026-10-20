"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

// Appends pages to a server-rendered first page. `initial` stays the source of
// truth for page one, so when the page re-renders after a revalidating action
// the fresh rows replace it while the loaded pages stay; rows that now appear
// in both are shown once. Mount the consumer with a key derived from the
// filters so a filter change starts over.
export function useLoadMore<T extends { id: string }, C>(
  initial: T[],
  initialCursor: C | null,
  fetchMore: (cursor: C) => Promise<{ rows: T[]; nextCursor: C | null }>,
  noun: string
) {
  const [extra, setExtra] = useState<T[]>([]);
  const [cursor, setCursor] = useState<C | null>(initialCursor);
  const [loading, startTransition] = useTransition();

  const rows = useMemo(() => {
    const seen = new Set(initial.map((row) => row.id));
    return [...initial, ...extra.filter((row) => !seen.has(row.id))];
  }, [initial, extra]);

  function loadMore() {
    if (loading || cursor === null) return;
    const current = cursor;
    startTransition(async () => {
      try {
        const result = await fetchMore(current);
        setExtra((prev) => [...prev, ...result.rows]);
        setCursor(result.nextCursor);
      } catch {
        toast.error(`Couldn't load more ${noun}. Try again.`);
      }
    });
  }

  return { rows, hasMore: cursor !== null, loading, loadMore };
}
