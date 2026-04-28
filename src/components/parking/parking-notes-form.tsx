"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateReservation } from "@/lib/actions/parking";
import { Save } from "lucide-react";

export function ParkingNotesForm({
  id,
  staffNotes,
}: {
  id: string;
  staffNotes: string | null;
}) {
  const [notes, setNotes] = useState(staffNotes || "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const hasChanges = notes !== (staffNotes || "");

  async function handleSave() {
    setSaving(true);
    const result = await updateReservation(id, {
      staff_notes: notes || null,
    });
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Updated");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Textarea
        id="notes"
        placeholder="Add notes…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="min-h-[80px] text-sm bg-transparent border-0 shadow-none px-0 focus-visible:ring-0 focus-visible:border-0 placeholder:text-amber-700/40 dark:placeholder:text-amber-300/30 text-stone-900 dark:text-stone-50"
      />

      {hasChanges && (
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </Button>
      )}
    </div>
  );
}
