"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type SaveResult = { error?: unknown } | { success: true };

/**
 * Shared state machine for click-to-edit fields on the job detail page.
 *
 * Holds the three flags every inline editor needs (editing / draft / saving),
 * keeps the draft in sync when the underlying `initial` prop changes (e.g.
 * after router.refresh brings a new server value), and wraps the common
 * save flow: toast on error, success toast, exit edit mode, refresh.
 */
export function useInlineEditor<D>(initial: D) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<D>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(initial);
  }, [initial, editing]);

  async function commit(
    runSave: () => Promise<SaveResult>,
    successMessage: string,
    errorFallback = "Update failed"
  ) {
    setSaving(true);
    const result = await runSave();
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error(typeof result.error === "string" ? result.error : errorFallback);
      return false;
    }
    toast.success(successMessage);
    setEditing(false);
    router.refresh();
    return true;
  }

  function cancel() {
    setDraft(initial);
    setEditing(false);
  }

  return { editing, setEditing, draft, setDraft, saving, commit, cancel };
}
