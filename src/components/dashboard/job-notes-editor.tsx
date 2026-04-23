"use client";

import { updateJobFields } from "@/lib/actions/jobs";
import { useInlineEditor } from "@/hooks/use-inline-editor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";

interface JobNotesEditorProps {
  jobId: string;
  value: string | null;
}

const BODY_CLASS = "text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap leading-relaxed";

export function JobNotesEditor({ jobId, value }: JobNotesEditorProps) {
  const { editing, setEditing, draft, setDraft, saving, commit, cancel } = useInlineEditor(value ?? "");

  async function save() {
    const next = draft.trim() || null;
    if (next === value) {
      setEditing(false);
      return;
    }
    await commit(() => updateJobFields(jobId, { notes: next }), "Customer concern saved");
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              cancel();
            }
          }}
          autoFocus
          disabled={saving}
          placeholder="Describe the customer's concern — symptoms, when it happens, anything they asked for."
          className="min-h-24 text-sm leading-relaxed"
        />
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
          <span className="ml-auto text-[11px] text-stone-400">⌘↵ to save · Esc to cancel</span>
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full text-left text-sm text-stone-400 dark:text-stone-500 italic hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        Add customer concern…
      </button>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group w-full text-left flex items-start gap-2"
    >
      <p className={`${BODY_CLASS} flex-1 min-w-0`}>{value}</p>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
    </button>
  );
}
