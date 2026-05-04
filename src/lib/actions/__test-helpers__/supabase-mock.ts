/**
 * Minimal chainable Supabase mock for vitest unit tests of server actions.
 *
 * Builds one query "stage" at a time. Every chain method (.from / .select /
 * .eq / .update / .delete / .insert / .order / .limit) returns the builder
 * itself; .single / .maybeSingle / awaiting the chain resolves to whatever
 * was passed in via `result`.
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

export function createSupabaseMock(result: SupabaseMockResult = { data: null, error: null }) {
  const calls: RecordedCall[] = [];

  const builder: Record<string, unknown> = {};
  const chain = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });

  builder.from = chain("from");
  builder.select = chain("select");
  builder.insert = chain("insert");
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
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  // Thenable so `await query` (without .single()) resolves to result.
  builder.then = (
    resolve: (value: SupabaseMockResult) => unknown,
  ): unknown => resolve(result);

  return { client: { from: builder.from }, calls, builder };
}
