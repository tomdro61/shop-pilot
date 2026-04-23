"use client";

import { updateJobFields } from "@/lib/actions/jobs";
import { useInlineEditor } from "@/hooks/use-inline-editor";
import { Pencil } from "lucide-react";

interface JobTitleEditorProps {
  jobId: string;
  value: string | null;
}

const HEADING_CLASS =
  "text-[22px] lg:text-[26px] font-semibold tracking-tight text-stone-900 dark:text-stone-50 leading-tight";

export function JobTitleEditor({ jobId, value }: JobTitleEditorProps) {
  const { editing, setEditing, draft, setDraft, saving, commit, cancel } = useInlineEditor(value ?? "");

  async function save() {
    const next = draft.trim() || null;
    if (next === value) {
      setEditing(false);
      return;
    }
    await commit(() => updateJobFields(jobId, { title: next }), "Title saved");
  }

  if (editing) {
    return (
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          else if (e.key === "Escape") cancel();
        }}
        autoFocus
        disabled={saving}
        placeholder="Untitled job"
        className={`${HEADING_CLASS} w-full bg-transparent outline-none border-b-2 border-blue-500 pb-0.5`}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-2 min-w-0 max-w-full text-left"
    >
      <span className={`${HEADING_CLASS} truncate`}>
        {value || <span className="italic text-stone-400 font-normal">Untitled job</span>}
      </span>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
