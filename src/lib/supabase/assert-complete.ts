/**
 * PostgREST caps every response at 1000 rows and reports no error when it
 * truncates — `.limit(5000)` and `.range(0, 4999)` are both silently clamped.
 * Any figure summed in JS from a row set is therefore understated the moment
 * the set crosses that ceiling, with nothing in the response to say so.
 *
 * Pass `{ count: "exact" }` on the select (free — it rides the Content-Range
 * header of the same round trip) and run the result through this. A money
 * figure that can't be trusted must fail, not render.
 *
 * Prefer aggregating in SQL over fetching rows to sum them. This is the guard
 * for the cases that still fetch rows.
 */
export function assertComplete<T>(
  result: {
    data: T[] | null;
    error: { message: string } | null;
    count: number | null;
  },
  label: string
): T[] {
  if (result.error) throw new Error(`Failed to load ${label}: ${result.error.message}`);

  const rows = result.data ?? [];
  if (result.count !== null && rows.length < result.count) {
    throw new Error(
      `${label}: query truncated — got ${rows.length} of ${result.count} rows. ` +
        `Narrow the range or aggregate in SQL; any total derived from this would be understated.`
    );
  }
  return rows;
}
