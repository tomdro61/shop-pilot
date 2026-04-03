"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { updateReservation } from "@/lib/actions/parking";
import { Save } from "lucide-react";

export function ParkingVehicleForm({
  id,
  make,
  model,
  licensePlate,
  color,
}: {
  id: string;
  make: string;
  model: string;
  licensePlate: string;
  color: string | null;
}) {
  const [formMake, setFormMake] = useState(make);
  const [formModel, setFormModel] = useState(model);
  const [formPlate, setFormPlate] = useState(licensePlate);
  const [formColor, setFormColor] = useState(color ?? "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const hasChanges =
    formMake !== make ||
    formModel !== model ||
    formPlate !== licensePlate ||
    formColor !== (color ?? "");

  async function handleSave() {
    setSaving(true);
    const data: Record<string, string | null> = {};
    if (formMake !== make) data.make = formMake;
    if (formModel !== model) data.model = formModel;
    if (formPlate !== licensePlate) data.license_plate = formPlate;
    if (formColor !== (color ?? "")) data.color = formColor || null;

    const result = await updateReservation(id, data);
    setSaving(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Vehicle info updated");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="v-make" className="text-xs">
            Make
          </Label>
          <Input
            id="v-make"
            type="text"
            value={formMake}
            onChange={(e) => setFormMake(e.target.value)}
            className="text-sm"
            placeholder="e.g. Mitsubishi"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-model" className="text-xs">
            Model
          </Label>
          <Input
            id="v-model"
            type="text"
            value={formModel}
            onChange={(e) => setFormModel(e.target.value)}
            className="text-sm"
            placeholder="e.g. Outlander"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-plate" className="text-xs">
            License Plate
          </Label>
          <Input
            id="v-plate"
            type="text"
            value={formPlate}
            onChange={(e) => setFormPlate(e.target.value)}
            className="text-sm"
            placeholder="e.g. ABC 1234"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-color" className="text-xs">
            Color
          </Label>
          <Input
            id="v-color"
            type="text"
            value={formColor}
            onChange={(e) => setFormColor(e.target.value)}
            className="text-sm"
            placeholder="e.g. Grey"
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
