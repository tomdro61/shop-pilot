"use client";

import * as React from "react";
import { updateCustomerFields, type CustomerFieldPatch } from "@/lib/actions/customers";
import { useInlineEditor } from "@/hooks/use-inline-editor";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X } from "lucide-react";

type TextField = Extract<keyof CustomerFieldPatch, "phone" | "email" | "address">;

interface CustomerTextFieldEditorProps {
  customerId: string;
  field: TextField;
  value: string | null;
  successMessage: string;
  inputType?: "text" | "email" | "tel";
  placeholder?: string;
  children: React.ReactNode;
}

/**
 * Inline-edit for a single customer contact field. The children are the
 * rendered display (phone with Call/Text links, email with mailto, etc.)
 * -- so links stay operational when not editing. A small pencil button
 * sits to the right; click to swap in an input.
 */
export function CustomerTextFieldEditor({
  customerId,
  field,
  value,
  successMessage,
  inputType = "text",
  placeholder,
  children,
}: CustomerTextFieldEditorProps) {
  const { editing, setEditing, draft, setDraft, saving, commit, cancel } = useInlineEditor(value ?? "");

  async function save() {
    const next = draft.trim() || null;
    if (next === value) {
      setEditing(false);
      return;
    }
    const patch: Partial<Pick<CustomerFieldPatch, TextField>> = { [field]: next };
    await commit(() => updateCustomerFields(customerId, patch), successMessage);
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1 min-w-0 w-full">
        <Input
          type={inputType}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            else if (e.key === "Escape") cancel();
          }}
          autoFocus
          disabled={saving}
          className="h-7 text-sm px-2 flex-1 min-w-0"
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
    <span className="group flex items-center gap-2 min-w-0 w-full">
      <span className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">{children}</span>
      <button
        onClick={() => setEditing(true)}
        title="Edit"
        className="shrink-0 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </span>
  );
}
