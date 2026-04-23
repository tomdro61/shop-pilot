"use client";

import { updateJobFields } from "@/lib/actions/jobs";
import { NotesEditor } from "./notes-editor";

interface JobNotesEditorProps {
  jobId: string;
  value: string | null;
}

export function JobNotesEditor({ jobId, value }: JobNotesEditorProps) {
  return (
    <NotesEditor
      value={value}
      onSave={(next) => updateJobFields(jobId, { notes: next })}
      successMessage="Notes saved"
      placeholder="Notes about the job — customer concerns, tech findings, anything worth recording."
    />
  );
}
