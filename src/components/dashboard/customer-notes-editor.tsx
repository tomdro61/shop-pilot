"use client";

import { updateCustomerFields } from "@/lib/actions/customers";
import { NotesEditor } from "./notes-editor";

interface CustomerNotesEditorProps {
  customerId: string;
  value: string | null;
}

export function CustomerNotesEditor({ customerId, value }: CustomerNotesEditorProps) {
  return (
    <NotesEditor
      value={value}
      onSave={(next) => updateCustomerFields(customerId, { notes: next })}
      successMessage="Notes saved"
      placeholder="Customer preferences, language, history notes, anything worth remembering."
    />
  );
}
