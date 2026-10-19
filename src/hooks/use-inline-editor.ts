"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

export type SaveResult = { error: string } | { success: boolean } | { data: unknown };

// The editor closes as soon as a save starts and `displayValue` shows the draft
// until the server action returns. Callers' actions must revalidate after
// writing: Next re-renders the calling page into the action's own response, so
// the fresh prop arrives with the result and the optimistic value settles on
// it. On an error the transition ends with the prop unchanged, the display
// snaps back, and the editor reopens with the draft.
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
    // Outside the transition so it commits now; a state update inside an async
    // transition is held until the action resolves, which would keep the
    // disabled input on screen for the whole save.
    setEditing(false);

    return new Promise((resolve) => {
      startTransition(async () => {
        setOptimisticValue(attempted);

        function reopen(message: string) {
          // The toaster is global, so a failed save is reported even after
          // navigating away; only the editor state needs the mount guard.
          toast.error(message);
          if (!mountedRef.current) return;
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
          toast.success(successMessage);
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
