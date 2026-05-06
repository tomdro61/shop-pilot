"use client";

import { updateJobFields } from "@/lib/actions/jobs";
import { useInlineEditor } from "@/hooks/use-inline-editor";
import { etDateTimeToUtcIso, formatTimeEt } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X } from "lucide-react";

interface JobScheduledTimeEditorProps {
  jobId: string;
  /** Current scheduled_at as UTC ISO, or null when no time set. */
  value: string | null;
  /** Fallback date for first-time scheduling when scheduled_at is null. */
  dateReceived: string | null;
}

function isoToEtTime(iso: string): string {
  // en-GB is unambiguously 24h — avoids the "24:00" quirk some V8 builds had
  // with en-US hour12: false.
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isoToEtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export function JobScheduledTimeEditor({
  jobId,
  value,
  dateReceived,
}: JobScheduledTimeEditorProps) {
  const initialTime = value ? isoToEtTime(value) : "";
  const { editing, setEditing, draft, setDraft, saving, commit, cancel } =
    useInlineEditor(initialTime);

  async function save() {
    const time = draft.trim();
    let next: string | null = null;
    if (time) {
      // Anchor the time to the existing scheduled_at's date if set, else
      // date_received. Keeps "I changed 2pm to 3pm" simple — manager only
      // edits the time and the date stays put.
      const date = value ? isoToEtDate(value) : dateReceived;
      if (!date) {
        return; // can't schedule without a date
      }
      next = etDateTimeToUtcIso(date, time);
    }
    if (next === value) {
      setEditing(false);
      return;
    }
    await commit(() => updateJobFields(jobId, { scheduled_at: next }), "Saved");
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          type="time"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            else if (e.key === "Escape") cancel();
          }}
          autoFocus
          disabled={saving}
          className="h-6 w-[110px] text-xs px-1.5"
        />
        <button
          onClick={save}
          disabled={saving}
          className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
          aria-label="Save time"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={cancel}
          disabled={saving}
          className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
          aria-label="Cancel"
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
      {value ? (
        formatTimeEt(value)
      ) : (
        <span className="text-stone-400">Not set</span>
      )}
      <Pencil className="h-2.5 w-2.5 text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-300 transition-colors" />
    </button>
  );
}
