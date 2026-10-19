"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

export type SaveResult = { error: string } | { success: boolean } | { data: unknown };

// The save runs inside a transition so `displayValue` shows the draft while the
// server action is in flight. The action revalidates the page it lives on, so
// the fresh prop arrives in the action's own response and the optimistic value
// settles on it; on an error the transition ends with the prop unchanged and
// the display snaps back while the editor reopens with the draft.
export function useInlineEditor<D>(initial: D) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<D>(initial);
  const [displayValue, setOptimisticValue] = useOptimistic(initial);
  const [saving, startTransition] = useTransition();
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!editing) setDraft(initial);
  }, [initial, editing]);

  function commit(
    runSave: () => Promise<SaveResult>,
    successMessage: string,
    errorFallback = "Update failed"
  ): Promise<boolean> {
    if (savingRef.current) return Promise.resolve(false);
    savingRef.current = true;
    const attempted = draft;

    return new Promise((resolve) => {
      startTransition(async () => {
        setOptimisticValue(attempted);
        setEditing(false);

        function reopen(message: string) {
          if (!mountedRef.current) return;
          toast.error(message);
          setEditing(true);
          setDraft(attempted);
        }

        try {
          const result = await runSave();
          if ("error" in result) {
            reopen(result.error || errorFallback);
            resolve(false);
            return;
          }
          if (mountedRef.current) toast.success(successMessage);
          resolve(true);
        } catch (err) {
          reopen(err instanceof Error ? err.message : errorFallback);
          resolve(false);
        } finally {
          savingRef.current = false;
        }
      });
    });
  }

  function cancel() {
    setDraft(initial);
    setEditing(false);
  }

  return { editing, setEditing, draft, setDraft, saving, displayValue, commit, cancel };
}
