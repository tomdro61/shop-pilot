"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="mb-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
          <CardTitle className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Car className="h-3.5 w-3.5" />
            Vehicles ({vehicles.length})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            Add Vehicle
          </Button>
        </CardHeader>
        <CardContent>
          {vehicles.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No vehicles yet</p>
          ) : (
            <div className="-mx-5 divide-y">
              {vehicles.map((vehicle) => (
                <div key={vehicle.id} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent/50">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{formatVehicle(vehicle)}</p>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {vehicle.vin && <span>VIN: {vehicle.vin}</span>}
                      {vehicle.license_plate && <span>Plate: {vehicle.license_plate}</span>}
                      {vehicle.mileage && (
                        <span>{vehicle.mileage.toLocaleString()} mi</span>
                      )}
                      {vehicle.color && <span>{vehicle.color}</span>}
                    </div>
                    {vehicle.notes && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {vehicle.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditVehicle(vehicle)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DeleteConfirmDialog
                      title="Delete Vehicle"
                      description={`Delete ${formatVehicle(vehicle)}? This cannot be undone.`}
                      onConfirm={() => handleDeleteVehicle(vehicle.id)}
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
