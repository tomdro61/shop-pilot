"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateCustomerFields } from "@/lib/actions/customers";
import { Pencil } from "lucide-react";

interface CustomerNameEditorProps {
  customerId: string;
  firstName: string;
  lastName: string;
}

const HEADING_CLASS =
  "text-[22px] lg:text-[26px] font-semibold tracking-tight text-stone-900 dark:text-stone-50 leading-tight";

export function CustomerNameEditor({ customerId, firstName, lastName }: CustomerNameEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [saving, setSaving] = useState(false);

  async function save() {
    const f = first.trim();
    const l = last.trim();
    if (!f || !l) {
      toast.error("First and last name are required");
      return;
    }
    if (f === firstName && l === lastName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await updateCustomerFields(customerId, { first_name: f, last_name: l });
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Update failed");
      return;
    }
    toast.success("Name saved");
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    setFirst(firstName);
    setLast(lastName);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 w-full">
        <input
          type="text"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            else if (e.key === "Escape") cancel();
          }}
          autoFocus
          disabled={saving}
          placeholder="First"
          className={`${HEADING_CLASS} w-1/2 bg-transparent outline-none border-b-2 border-blue-500 pb-0.5`}
        />
        <input
          type="text"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            else if (e.key === "Escape") cancel();
          }}
          disabled={saving}
          placeholder="Last"
          className={`${HEADING_CLASS} w-1/2 bg-transparent outline-none border-b-2 border-blue-500 pb-0.5`}
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-2 min-w-0 max-w-full text-left"
    >
      <span className={`${HEADING_CLASS} truncate`}>
        {firstName} {lastName}
      </span>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-300 transition-colors" />
    </button>
  );
}
