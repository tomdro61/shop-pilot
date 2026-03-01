"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateJobDateFinished } from "@/lib/actions/jobs";
import { formatDate } from "@/lib/utils/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X } from "lucide-react";

export function DateFinishedEditor({
  jobId,
  dateFinished,
}: {
  jobId: string;
  dateFinished: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(dateFinished);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSave() {
    if (value === dateFinished) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await updateJobDateFinished(jobId, value);
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error as string);
      return;
    }

    toast.success("Finished date updated");
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-6 w-[140px] text-xs px-1.5"
          disabled={saving}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => { setValue(dateFinished); setEditing(false); }}
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
      className="inline-flex items-center gap-1 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
      title="Edit finished date"
    >
      Finished {formatDate(dateFinished)}
      <Pencil className="h-2.5 w-2.5" />
    </button>
  );
}
