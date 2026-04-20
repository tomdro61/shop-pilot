"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { updateReservation } from "@/lib/actions/parking";
import { Save } from "lucide-react";

export function ParkingValetForm({
  id,
  arrivalValet,
  departureValet,
}: {
  id: string;
  arrivalValet: string | null;
  departureValet: string | null;
}) {
  const [arrival, setArrival] = useState(arrivalValet ?? "");
  const [departure, setDeparture] = useState(departureValet ?? "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const hasChanges =
    arrival !== (arrivalValet ?? "") || departure !== (departureValet ?? "");

  async function handleSave() {
    setSaving(true);
    const result = await updateReservation(id, {
      arrival_valet: arrival.trim() || null,
      departure_valet: departure.trim() || null,
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
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="arrival-valet" className="text-xs">
            Arrival valet
          </Label>
          <Input
            id="arrival-valet"
            placeholder="Who's handling drop-off?"
            value={arrival}
            onChange={(e) => setArrival(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="departure-valet" className="text-xs">
            Departure valet
          </Label>
          <Input
            id="departure-valet"
            placeholder="Who's handling pick-up?"
            value={departure}
            onChange={(e) => setDeparture(e.target.value)}
            className="text-sm"
          />
        </div>
      </div>

      {hasChanges && (
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
      )}
    </div>
  );
}
