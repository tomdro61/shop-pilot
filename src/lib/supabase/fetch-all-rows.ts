/**
 * Reads every row of a query by paging past `api.max_rows` (1000 by default).
 *
 * Use when a figure genuinely needs the whole set and narrowing the filter
 * can't get it under the cap — the tax report is the case that forced this:
 * every paid job in the shop's history falls in the current filing year, so a
 * year filter narrows nothing.
 *
 * Callers MUST pass `{ count: "exact" }` on the select. A short page has two
 * causes — no more rows, or the server clamping the page to a `max_rows` below
 * `pageSize` — and they are indistinguishable without the count. Lowering
 * `max_rows` is a dashboard setting invisible to this repo, so without the
 * count check a config change elsewhere would silently revert every caller to
 * understated totals while the code still visibly "has paging".
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
    count?: number | null;
  }>,
  label: string,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;

  for (let from = 0; ; from += pageSize) {
    const { data, error, count } = await page(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to load ${label}: ${error.message}`);

    // The total rides the Content-Range header of the same round trip. Capture
    // it once — it's the only way to tell "server had no more" from "server
    // clamped the page".
    if (expected === null && count != null) expected = count;

    if (data === null) {
      // Matches assertComplete: a null body means a head query, not an empty
      // result set. Returning quietly here would truncate mid-page.
      throw new Error(`${label}: expected a row set, got an empty body (head query?).`);
    }

    rows.push(...data);

    if (data.length < pageSize) {
      if (expected === null) {
        throw new Error(
          `${label}: fetchAllRows requires { count: "exact" } on the select — ` +
            `without it a clamped page is indistinguishable from the last page.`
        );
      }
      if (rows.length < expected) {
        throw new Error(
          `${label}: paged read returned ${rows.length} of ${expected} rows — ` +
            `page size (${pageSize}) likely exceeds the server row cap.`
        );
      }
      return rows;
    }

    // Runaway guard: a caller that forgets its filter shouldn't page the whole
    // table into memory. Well above any real figure this app computes.
    if (rows.length > 200_000) {
      throw new Error(`${label}: refusing to page beyond ${rows.length} rows — narrow the query.`);
    }
  }
}
