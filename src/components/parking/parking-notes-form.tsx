"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-xs">
          Staff Notes
        </Label>
        <Textarea
          id="notes"
          placeholder="Add notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-[80px] text-sm"
        />
      </div>

      {hasChanges && (
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
      )}
    </div>
  );
}
