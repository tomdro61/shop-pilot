/**
 * Supabase caps rows per response at `api.max_rows` (1000 by default, and
 * configurable per project) and supabase-js reports no `error` when it
 * truncates — `.limit()` and `.range()` are both clamped by it, so neither
 * raises the ceiling. A total summed in JS from a capped row set is therefore
 * understated with nothing in `error` to say so.
 *
 * Pass `{ count: "exact" }` on the select and run the result through this, so
 * an untrustworthy dollar figure fails instead of rendering. The count rides
 * the same round trip via Content-Range, but it does cost a `COUNT(*)` over
 * the filtered set — cheap on a narrow range, not free on a wide one.
 *
 * Must be `"exact"`. `"planned"` and `"estimated"` are approximations, and one
 * that lands below the true row count makes a truncated read look complete.
 *
 * Counts top-level rows only. An embedded resource (`job_line_items(...)`)
 * that hits the cap returns HTTP 200 with nothing in Content-Range about it,
 * and is not detectable here.
 *
 * Prefer aggregating in SQL over fetching rows to sum them. This guards the
 * cases that still fetch rows.
 */
type RowSetResult<T> =
  | { data: T[]; error: null; count: number | null }
  | { data: null; error: { message: string }; count: null };

export function assertComplete<T>(result: RowSetResult<T>, label: string): T[] {
  if (result.error) throw new Error(`Failed to load ${label}: ${result.error.message}`);

  // `count` is null exactly when the caller forgot `{ count: "exact" }` — the
  // one case this guard exists to catch. It cannot be caught at compile time:
  // supabase-js erases the count option from the result type, so a counted and
  // an uncounted select are the same type. Fail closed.
  if (result.count === null) {
    throw new Error(
      `${label}: assertComplete requires { count: "exact" } on the select — ` +
        `without it a truncated read is undetectable.`
    );
  }

  // A head:true count query returns a null body with a non-null count. The SDK
  // still types data as an array, so only a runtime check rules it out.
  if (result.data === null) {
    throw new Error(`${label}: expected a row set, got an empty body (head query?).`);
  }

  if (result.data.length < result.count) {
    throw new Error(
      `${label}: query truncated — got ${result.data.length} of ${result.count} rows. ` +
        `Narrow the range or aggregate in SQL; any total derived from this would be understated.`
    );
  }
  return result.data;
}
