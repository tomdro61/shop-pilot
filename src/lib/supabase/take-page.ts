// For keyset paging: the caller fetches `limit + 1` rows so the extra row, if
// present, proves another page exists without a second query. The cursor is
// taken from the last row of the returned page, not from the probe row.
export function takePage<T, C>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => C
): { rows: T[]; nextCursor: C | null } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return { rows: page, nextCursor: hasMore && last !== undefined ? cursorOf(last) : null };
}
