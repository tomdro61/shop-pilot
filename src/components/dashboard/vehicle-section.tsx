"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteVehicle } from "@/lib/actions/vehicles";
import { formatVehicle } from "@/lib/utils/format";
import { Car, Pencil, Trash2 } from "lucide-react";
import type { Vehicle } from "@/types";

interface VehicleSectionProps {
  customerId: string;
  vehicles: Vehicle[];
}

export function VehicleSection({ customerId, vehicles }: VehicleSectionProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);

  async function handleDeleteVehicle(vehicleId: string) {
    const result = await deleteVehicle(vehicleId, customerId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Vehicle deleted");
    }
    return result;
  }

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Car className="h-5 w-5" />
          Vehicles ({vehicles.length})
        </h3>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          Add Vehicle
        </Button>
      </div>
      {vehicles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No vehicles yet</p>
      ) : (
        <div className="space-y-2">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{formatVehicle(vehicle)}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {vehicle.vin && <span>VIN: {vehicle.vin}</span>}
                    {vehicle.mileage && (
                      <span>{vehicle.mileage.toLocaleString()} mi</span>
                    )}
                    {vehicle.color && <span>{vehicle.color}</span>}
                  </div>
                  {vehicle.notes && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {vehicle.notes}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditVehicle(vehicle)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DeleteConfirmDialog
                    title="Delete Vehicle"
                    description={`Delete ${formatVehicle(vehicle)}? This cannot be undone.`}
                    onConfirm={() => handleDeleteVehicle(vehicle.id)}
                    trigger={
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VehicleForm
        customerId={customerId}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {editVehicle && (
        <VehicleForm
          customerId={customerId}
          vehicle={editVehicle}
          open={!!editVehicle}
          onOpenChange={(open) => {
            if (!open) setEditVehicle(null);
          }}
        />
      )}
    </div>
  );
}
