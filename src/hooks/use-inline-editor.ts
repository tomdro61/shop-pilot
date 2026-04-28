"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type SaveResult = { error?: unknown } | { success: true };

export function useInlineEditor<D>(initial: D) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<D>(initial);
  const [saving, setSaving] = useState(false);
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

  async function commit(
    runSave: () => Promise<SaveResult>,
    successMessage: string,
    errorFallback = "Update failed"
  ) {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);

    try {
      const result = await runSave();
      if ("error" in result && result.error) {
        if (mountedRef.current) {
          toast.error(typeof result.error === "string" ? result.error : errorFallback);
        }
        return false;
      }
      router.refresh();
      if (mountedRef.current) {
        toast.success(successMessage);
        setEditing(false);
      }
      return true;
    } catch (err) {
      if (mountedRef.current) {
        toast.error(err instanceof Error ? err.message : errorFallback);
      }
      return false;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  function cancel() {
    setDraft(initial);
    setEditing(false);
  }

  return { editing, setEditing, draft, setDraft, saving, commit, cancel };
}
