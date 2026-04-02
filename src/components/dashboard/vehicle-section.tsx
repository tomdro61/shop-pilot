"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteVehicle } from "@/lib/actions/vehicles";
import { formatVehicle, formatDate, formatRONumber } from "@/lib/utils/format";
import { DVI_CONDITION_COLORS } from "@/lib/constants";
import { Car, Pencil, Trash2, ClipboardCheck, ChevronRight } from "lucide-react";
import type { Vehicle, DviCondition } from "@/types";

interface InspectionSummary {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  job: { id: string; ro_number: number | null } | null;
  counts: { good: number; monitor: number; attention: number; total: number };
}

interface VehicleSectionProps {
  customerId: string;
  vehicles: Vehicle[];
  inspectionsByVehicle?: Map<string, InspectionSummary[]>;
}

export function VehicleSection({ customerId, vehicles, inspectionsByVehicle }: VehicleSectionProps) {
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
    <div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 py-3 bg-stone-800 dark:bg-stone-900 rounded-t-xl">
          <CardTitle className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-stone-100">
            <Car className="h-3.5 w-3.5" />
            Vehicles ({vehicles.length})
          </CardTitle>
          <Button variant="outline" size="sm" className="border-stone-600 text-stone-100 hover:bg-stone-700" onClick={() => setAddOpen(true)}>
            Add Vehicle
          </Button>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {vehicles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No vehicles yet</p>
          ) : (
            <div className="space-y-0">
              {vehicles.map((vehicle, idx) => {
                const inspections = inspectionsByVehicle?.get(vehicle.id) ?? [];
                const isLast = idx === vehicles.length - 1;

                return (
                  <div key={vehicle.id}>
                    {/* Vehicle row */}
                    <div className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{formatVehicle(vehicle)}</p>
                        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                          {vehicle.color && <span>{vehicle.color}</span>}
                          {vehicle.license_plate && <span>Plate: {vehicle.license_plate}</span>}
                          {vehicle.mileage && <span>{vehicle.mileage.toLocaleString()} mi</span>}
                          {vehicle.vin && <span className="hidden sm:inline">VIN: {vehicle.vin}</span>}
                        </div>
                        {vehicle.notes && (
                          <p className="mt-0.5 text-xs text-muted-foreground italic">{vehicle.notes}</p>
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

                    {/* Nested inspections */}
                    {inspections.length > 0 && (
                      <div className="mx-5 mb-3 rounded-xl bg-stone-50/80 dark:bg-stone-900/40 border border-stone-200/60 dark:border-stone-700/40 overflow-hidden">
                        <div className="flex items-center gap-1.5 px-3.5 py-2 border-b border-stone-200/60 dark:border-stone-700/40">
                          <ClipboardCheck className="h-3 w-3 text-stone-400" />
                          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                            Inspections
                          </p>
                        </div>
                        <div className="divide-y divide-stone-200/50 dark:divide-stone-700/30">
                          {inspections.map((insp) => {
                            const job = insp.job as { id: string; ro_number: number | null } | null;
                            return (
                              <Link
                                key={insp.id}
                                href={job ? `/jobs/${job.id}/dvi` : "#"}
                                className="flex items-center justify-between px-3.5 py-2.5 transition-colors hover:bg-stone-100/80 dark:hover:bg-stone-800/40 group"
                              >
                                <div className="min-w-0 flex items-center gap-2">
                                  <div>
                                    <p className="text-xs font-medium text-stone-700 dark:text-stone-300">
                                      {job?.ro_number ? formatRONumber(job.ro_number) : "Inspection"}
                                      <span className="text-stone-400 dark:text-stone-500 font-normal ml-1.5">
                                        {formatDate(insp.created_at)}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {(["good", "monitor", "attention"] as const).map((c) => {
                                    const count = insp.counts[c];
                                    if (count === 0) return null;
                                    return (
                                      <span
                                        key={c}
                                        className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${DVI_CONDITION_COLORS[c as DviCondition].bg} ${DVI_CONDITION_COLORS[c as DviCondition].text}`}
                                      >
                                        {count}
                                      </span>
                                    );
                                  })}
                                  <ChevronRight className="h-3 w-3 text-stone-300 dark:text-stone-600 group-hover:text-stone-500 transition-colors ml-1" />
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Divider between vehicles */}
                    {!isLast && (
                      <div className="mx-5 border-b border-stone-200/60 dark:border-stone-700/40" />
                    )}
                  </div>
                );
              })}
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
