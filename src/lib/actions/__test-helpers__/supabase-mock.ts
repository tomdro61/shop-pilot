/**
 * Minimal chainable Supabase mock for vitest unit tests of server actions.
 *
 * Two modes:
 *
 * 1. Single-result mode (default): every query in the chain resolves to the
 *    same `result`. Useful when the action short-circuits on the first query.
 *      const mock = createSupabaseMock({ data: row, error: null });
 *
 * 2. Per-call queue: pass an array of results. Each terminal call (.single /
 *    .maybeSingle / await) consumes the next result in order. Useful when the
 *    action makes several queries against different tables.
 *      const mock = createSupabaseMock([
 *        { data: jobRow },                          // 1st: fetch job
 *        { data: null },                            // 2nd: no existing invoice
 *        { data: { id: "inv1" }, error: null },    // 3rd: insert returns row
 *      ]);
 *
 * Records every call into `calls` so a test can assert
 * `expect(mock.calls).toContainEqual({ method: "eq", args: ["estimate_id", X] })`.
 */
import { vi } from "vitest";

export type SupabaseMockResult<T = unknown> = {
  data?: T | null;
  error?: { message: string; code?: string } | null;
  count?: number | null;
};

export type RecordedCall = { method: string; args: unknown[] };

export function createSupabaseMock(
  result: SupabaseMockResult | SupabaseMockResult[] = { data: null, error: null }
) {
  const calls: RecordedCall[] = [];
  const queue: SupabaseMockResult[] = Array.isArray(result) ? [...result] : [];
  const fallback: SupabaseMockResult = Array.isArray(result)
    ? { data: null, error: null }
    : result;
  const nextResult = (): SupabaseMockResult =>
    queue.length > 0 ? queue.shift()! : fallback;

  const builder: Record<string, unknown> = {};
  const chain = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });

  builder.from = chain("from");
  builder.select = chain("select");
  builder.insert = chain("insert");
  builder.upsert = chain("upsert");
  builder.update = chain("update");
  builder.delete = chain("delete");
  builder.eq = chain("eq");
  builder.neq = chain("neq");
  builder.in = chain("in");
  builder.is = chain("is");
  builder.not = chain("not");
  builder.ilike = chain("ilike");
  builder.or = chain("or");
  builder.order = chain("order");
  builder.limit = chain("limit");
  builder.abortSignal = chain("abortSignal");
  builder.single = vi.fn(() => Promise.resolve(nextResult()));
  builder.maybeSingle = vi.fn(() => Promise.resolve(nextResult()));
  // Thenable so `await query` (without .single()) resolves to next result.
  builder.then = (
    resolve: (value: SupabaseMockResult) => unknown,
  ): unknown => resolve(nextResult());

  return { client: { from: builder.from }, calls, builder };
}
