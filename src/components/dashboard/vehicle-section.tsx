"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard, SECTION_LABEL } from "@/components/ui/section-card";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteVehicle } from "@/lib/actions/vehicles";
import { formatVehicle, formatDate, formatRONumber } from "@/lib/utils/format";
import { DVI_CONDITION_COLORS } from "@/lib/constants";
import { Pencil, Trash2, ClipboardCheck } from "lucide-react";
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
    <>
      <SectionCard
        title={`Vehicles (${vehicles.length})`}
        action={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            Add Vehicle
          </Button>
        }
      >
        {vehicles.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-stone-500 dark:text-stone-400">No vehicles yet</p>
          </div>
        ) : (
          <div>
            {vehicles.map((vehicle) => {
              const inspections = inspectionsByVehicle?.get(vehicle.id) ?? [];
              return (
                <div
                  key={vehicle.id}
                  className="border-b border-stone-100 dark:border-stone-800/60 last:border-b-0"
                >
                  {/* Vehicle row */}
                  <div className="group flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-stone-100 dark:hover:bg-stone-800/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-stone-900 dark:text-stone-50">
                        {formatVehicle(vehicle)}
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
                        {vehicle.color && <span>{vehicle.color}</span>}
                        {vehicle.color && vehicle.license_plate && <span className="text-stone-300 dark:text-stone-700">·</span>}
                        {vehicle.license_plate && (
                          <span className="font-mono">
                            <span className="uppercase text-stone-400">Plate </span>
                            {vehicle.license_plate}
                          </span>
                        )}
                        {vehicle.license_plate && vehicle.mileage != null && <span className="text-stone-300 dark:text-stone-700">·</span>}
                        {vehicle.mileage != null && (
                          <span className="font-mono tabular-nums">{vehicle.mileage.toLocaleString()} mi</span>
                        )}
                        {vehicle.vin && (
                          <>
                            <span className="text-stone-300 dark:text-stone-700 hidden sm:inline">·</span>
                            <span className="font-mono hidden sm:inline">
                              <span className="uppercase text-stone-400">VIN </span>
                              {vehicle.vin}
                            </span>
                          </>
                        )}
                      </div>
                      {vehicle.notes && (
                        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 italic">{vehicle.notes}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Edit"
                        onClick={() => setEditVehicle(vehicle)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <DeleteConfirmDialog
                        title="Delete Vehicle"
                        description={`Delete ${formatVehicle(vehicle)}? This cannot be undone.`}
                        onConfirm={() => handleDeleteVehicle(vehicle.id)}
                        trigger={
                          <Button variant="ghost" size="icon-xs" title="Delete">
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        }
                      />
                    </div>
                  </div>

                  {/* Nested inspections */}
                  {inspections.length > 0 && (
                    <div className="px-4 pb-3 space-y-0.5">
                      <div className="flex items-center gap-1.5 pt-1 pb-1">
                        <ClipboardCheck className="h-3 w-3 text-stone-400" />
                        <p className={SECTION_LABEL}>Inspections</p>
                      </div>
                      {inspections.map((insp) => {
                        const job = insp.job;
                        return (
                          <Link
                            key={insp.id}
                            href={job ? `/jobs/${job.id}/dvi` : "#"}
                            className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800/50"
                          >
                            <div className="text-xs">
                              <span className="font-mono tabular-nums text-stone-700 dark:text-stone-300">
                                {job?.ro_number ? formatRONumber(job.ro_number) : "Inspection"}
                              </span>
                              <span className="text-stone-400 dark:text-stone-500 ml-2 font-mono tabular-nums">
                                {formatDate(insp.created_at)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {(["good", "monitor", "attention"] as const).map((c) => {
                                const count = insp.counts[c];
                                if (count === 0) return null;
                                return (
                                  <span
                                    key={c}
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium font-mono tabular-nums ${DVI_CONDITION_COLORS[c as DviCondition].bg} ${DVI_CONDITION_COLORS[c as DviCondition].text}`}
                                  >
                                    {count}
                                  </span>
                                );
                              })}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

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
    </>
  );
}
