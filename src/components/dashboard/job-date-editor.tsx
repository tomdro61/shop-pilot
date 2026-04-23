"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateJobFields } from "@/lib/actions/jobs";
import { formatDate } from "@/lib/utils/format";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X } from "lucide-react";

interface JobDateEditorProps {
  jobId: string;
  field: "date_received" | "date_finished";
  value: string | null;
  emptyLabel?: string;
}

export function JobDateEditor({ jobId, field, value, emptyLabel = "Not set" }: JobDateEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const next = draft || null;
    if (next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await updateJobFields(jobId, { [field]: next });
    setSaving(false);

    if ("error" in result) {
      toast.error(typeof result.error === "string" ? result.error : "Update failed");
      return;
    }
    toast.success("Saved");
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            else if (e.key === "Escape") cancel();
          }}
          autoFocus
          disabled={saving}
          className="h-6 w-[140px] text-xs px-1.5"
        />
        <button
          onClick={save}
          disabled={saving}
          className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={cancel}
          disabled={saving}
          className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1 font-mono tabular-nums text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
    >
      {value ? formatDate(value) : <span className="text-stone-400">{emptyLabel}</span>}
      <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}
