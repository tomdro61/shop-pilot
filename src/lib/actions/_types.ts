/**
 * Discriminated-union return shape for mutating server actions. Use this for
 * any new action so the call site can `if (!result.ok)` and TypeScript
 * narrows away the `data` field on the error branch.
 *
 * Older actions in this directory use a different `{ success: true } | { error }`
 * shape; migrate them opportunistically rather than in one sweep.
 */
export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };
