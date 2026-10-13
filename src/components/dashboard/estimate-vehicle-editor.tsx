"use client";

import { updateEstimateFields } from "@/lib/actions/estimates";
import { VehiclePickerEditor } from "./job-vehicle-editor";

interface EstimateVehicleEditorProps {
  estimateId: string;
  customerId: string | null;
  currentVehicleId: string | null;
}

export function EstimateVehicleEditor({
  estimateId,
  customerId,
  currentVehicleId,
}: EstimateVehicleEditorProps) {
  return (
    <VehiclePickerEditor
      customerId={customerId}
      currentVehicleId={currentVehicleId}
      onAssign={async (vehicleId) => {
        const result = await updateEstimateFields(estimateId, { vehicle_id: vehicleId });
        return "error" in result && result.error ? result.error : null;
      }}
    />
  );
}
