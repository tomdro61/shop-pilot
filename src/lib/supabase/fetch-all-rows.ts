/**
 * Reads every row of a query by paging past `api.max_rows` (1000 by default).
 *
 * Use when a figure genuinely needs the whole set and narrowing the filter
 * can't get it under the cap — the tax report is the case that forced this:
 * every paid job in the shop's history falls in the current filing year, so a
 * year filter narrows nothing.
 *
 * `page` must apply a STABLE sort. Without one, Postgres may return rows in a
 * different order per page, which silently duplicates some and drops others.
 *
 * Prefer aggregating in SQL over paging rows to sum them. This is for the
 * cases that still fetch rows; see `assertComplete` for the cheaper guard when
 * the set is expected to fit in one response.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  label: string,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to load ${label}: ${error.message}`);

    const batch = data ?? [];
    rows.push(...batch);

    // A short page means the server had nothing more to give.
    if (batch.length < pageSize) return rows;

    // Runaway guard: a caller that forgets its filter shouldn't page the whole
    // table into memory. Well above any real figure this app computes.
    if (rows.length > 200_000) {
      throw new Error(`${label}: refusing to page beyond ${rows.length} rows — narrow the query.`);
    }
  }
}
