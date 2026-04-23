"use client";

import { useInlineEditor } from "@/hooks/use-inline-editor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";

type SaveResult = { error?: unknown } | { success: true };

interface NotesEditorProps {
  value: string | null;
  onSave: (next: string | null) => Promise<SaveResult>;
  successMessage: string;
  placeholder?: string;
  emptyPrompt?: string;
}

const BODY_CLASS = "text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap leading-relaxed";

/**
 * Shared click-to-edit notes block used by the job and customer detail
 * pages. Parent provides the save action (typically a call to its
 * resource's updateFields server action) and the toast/prompt copy.
 * Interaction: click to enter edit mode, textarea with Save/Cancel,
 * Cmd+Enter to save, Esc to cancel.
 */
export function NotesEditor({
  value,
  onSave,
  successMessage,
  placeholder,
  emptyPrompt = "Add notes…",
}: NotesEditorProps) {
  const { editing, setEditing, draft, setDraft, saving, commit, cancel } = useInlineEditor(value ?? "");

  async function save() {
    const next = draft.trim() || null;
    if (next === value) {
      setEditing(false);
      return;
    }
    await commit(() => onSave(next), successMessage);
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
          placeholder={placeholder}
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
        {emptyPrompt}
      </button>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group w-full text-left flex items-start gap-2"
    >
      <p className={`${BODY_CLASS} flex-1 min-w-0`}>{value}</p>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-300 transition-colors mt-0.5" />
    </button>
  );
}
