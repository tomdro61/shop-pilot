"use client";

import { useMemo, useState, useTransition } from "react";
import * as Sentry from "@sentry/nextjs";
import { toast } from "sonner";

type Paging<T, C> = { generation: number; extra: T[]; cursor: C | null };

// Appends pages to a server-rendered first page. `initial` is replaced whenever
// a revalidating action re-renders the page (a status change on a row, for
// instance); that resets the loaded pages and the cursor, because a row pushed
// off the first page by the change would otherwise sit in neither set and
// vanish. A load that was already in flight against the old first page is
// discarded when it lands, since its cursor no longer lines up. Mount the
// consumer with a key derived from the filters so a filter change starts over
// as well.
export function useLoadMore<T extends { id: string }, C>(
  initial: T[],
  initialCursor: C | null,
  fetchMore: (cursor: C) => Promise<{ rows: T[]; nextCursor: C | null }>,
  noun: string
) {
  const [paging, setPaging] = useState<Paging<T, C>>({
    generation: 0,
    extra: [],
    cursor: initialCursor,
  });
  const [seenInitial, setSeenInitial] = useState(initial);
  const [loading, startTransition] = useTransition();

  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setPaging({ generation: paging.generation + 1, extra: [], cursor: initialCursor });
  }

  const rows = useMemo(() => {
    const seen = new Set(initial.map((row) => row.id));
    return [...initial, ...paging.extra.filter((row) => !seen.has(row.id))];
  }, [initial, paging.extra]);

  function loadMore() {
    if (loading || paging.cursor === null) return;
    const { generation, cursor } = paging;
    startTransition(async () => {
      try {
        const result = await fetchMore(cursor);
        setPaging((prev) =>
          prev.generation !== generation
            ? prev
            : { ...prev, extra: [...prev.extra, ...result.rows], cursor: result.nextCursor }
        );
      } catch (err) {
        Sentry.captureException(err, { tags: { source: "load-more" }, extra: { noun } });
        toast.error(`Couldn't load more ${noun}. Try again, or refresh if it keeps happening.`);
      }
    });
  }

  return { rows, hasMore: paging.cursor !== null, loading, loadMore };
}
