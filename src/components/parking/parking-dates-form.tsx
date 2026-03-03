"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { updateReservation } from "@/lib/actions/parking";
import { Save } from "lucide-react";

export function ParkingDatesForm({
  id,
  dropOffDate,
  dropOffTime,
  pickUpDate,
  pickUpTime,
}: {
  id: string;
  dropOffDate: string;
  dropOffTime: string;
  pickUpDate: string;
  pickUpTime: string;
}) {
  // HTML time inputs use HH:MM format — strip seconds if present
  const normalize = (t: string) => t.slice(0, 5);

  const [doDate, setDoDate] = useState(dropOffDate);
  const [doTime, setDoTime] = useState(normalize(dropOffTime));
  const [puDate, setPuDate] = useState(pickUpDate);
  const [puTime, setPuTime] = useState(normalize(pickUpTime));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const hasChanges =
    doDate !== dropOffDate ||
    doTime !== normalize(dropOffTime) ||
    puDate !== pickUpDate ||
    puTime !== normalize(pickUpTime);

  async function handleSave() {
    setSaving(true);
    const data: Record<string, string> = {};
    if (doDate !== dropOffDate) data.drop_off_date = doDate;
    if (doTime !== normalize(dropOffTime)) data.drop_off_time = doTime + ":00";
    if (puDate !== pickUpDate) data.pick_up_date = puDate;
    if (puTime !== normalize(pickUpTime)) data.pick_up_time = puTime + ":00";

    const result = await updateReservation(id, data);
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Trip dates updated");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="do-date" className="text-xs">
            Drop-off Date
          </Label>
          <Input
            id="do-date"
            type="date"
            value={doDate}
            onChange={(e) => setDoDate(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="do-time" className="text-xs">
            Drop-off Time
          </Label>
          <Input
            id="do-time"
            type="time"
            value={doTime}
            onChange={(e) => setDoTime(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pu-date" className="text-xs">
            Pick-up Date
          </Label>
          <Input
            id="pu-date"
            type="date"
            value={puDate}
            onChange={(e) => setPuDate(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pu-time" className="text-xs">
            Pick-up Time
          </Label>
          <Input
            id="pu-time"
            type="time"
            value={puTime}
            onChange={(e) => setPuTime(e.target.value)}
            className="text-sm"
          />
        </div>
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
