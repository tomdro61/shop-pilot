"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { updateReservation } from "@/lib/actions/parking";
import { Save } from "lucide-react";

export function ParkingNotesForm({
  id,
  spotNumber,
  staffNotes,
}: {
  id: string;
  spotNumber: string | null;
  staffNotes: string | null;
}) {
  const [spot, setSpot] = useState(spotNumber || "");
  const [notes, setNotes] = useState(staffNotes || "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const hasChanges =
    spot !== (spotNumber || "") || notes !== (staffNotes || "");

  async function handleSave() {
    setSaving(true);
    const result = await updateReservation(id, {
      spot_number: spot || null,
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
        <Label htmlFor="spot" className="text-xs">
          Spot Number
        </Label>
        <Input
          id="spot"
          placeholder="e.g. A1, B12"
          value={spot}
          onChange={(e) => setSpot(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

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
