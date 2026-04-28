"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SECTION_LABEL } from "@/components/ui/section-card";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteVehicle } from "@/lib/actions/vehicles";
import { formatVehicle, formatDate, formatRONumber } from "@/lib/utils/format";
import { DVI_CONDITION_COLORS } from "@/lib/constants";
import { Pencil, Trash2, Plus, Car, ClipboardCheck } from "lucide-react";
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

export function VehicleSectionAddButton({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add Vehicle
      </Button>
      <VehicleForm customerId={customerId} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function VehicleSection({ customerId, vehicles, inspectionsByVehicle }: VehicleSectionProps) {
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

  if (vehicles.length === 0) {
    return (
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm py-10 text-center">
        <p className="text-sm text-stone-500 dark:text-stone-400">No vehicles yet</p>
        <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">Add a vehicle to start tracking inspections and jobs</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {vehicles.map((vehicle) => {
          const inspections = inspectionsByVehicle?.get(vehicle.id) ?? [];
          return (
            <article
              key={vehicle.id}
              className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden flex"
            >
              <div className="relative w-28 sm:w-36 shrink-0 bg-stone-800 dark:bg-stone-900 flex items-center justify-center">
                {vehicle.year != null && (
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-stone-900/70 text-stone-200 text-[11px] font-semibold tabular-nums">
                    {vehicle.year}
                  </span>
                )}
                <Car className="h-14 w-14 text-stone-300/90" strokeWidth={1.5} />
                {vehicle.color && (
                  <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-stone-900/70 text-stone-200 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                    <span className="capitalize truncate max-w-[80px]">{vehicle.color}</span>
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col">
                <header className="flex items-start gap-3 px-4 pt-3 pb-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                      {formatVehicle(vehicle) || "Untitled vehicle"}
                    </div>
                    {vehicle.color && (
                      <div className="text-xs text-stone-500 dark:text-stone-400 capitalize mt-0.5 truncate">
                        {vehicle.color}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Edit"
                      onClick={() => setEditVehicle(vehicle)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DeleteConfirmDialog
                      title="Delete Vehicle"
                      description={`Delete ${formatVehicle(vehicle) || "this vehicle"}? This cannot be undone.`}
                      onConfirm={() => handleDeleteVehicle(vehicle.id)}
                      trigger={
                        <Button variant="ghost" size="icon-xs" title="Delete">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      }
                    />
                  </div>
                </header>

                <dl className="grid grid-cols-3 gap-x-4 px-4 pb-3">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">VIN</dt>
                    <dd className="mt-1 font-mono tabular-nums text-xs text-stone-900 dark:text-stone-50 truncate">
                      {vehicle.vin || <span className="text-stone-400 font-sans">—</span>}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">Plate</dt>
                    <dd className="mt-1 font-mono tabular-nums text-xs text-stone-900 dark:text-stone-50 truncate">
                      {vehicle.license_plate || <span className="text-stone-400 font-sans">—</span>}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">Mileage</dt>
                    <dd className="mt-1 font-mono tabular-nums text-xs text-stone-900 dark:text-stone-50 truncate">
                      {vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} mi` : <span className="text-stone-400 font-sans">—</span>}
                    </dd>
                  </div>
                </dl>

                {vehicle.notes && (
                  <div className="border-t border-stone-200 dark:border-stone-800 px-4 py-3">
                    <p className="text-xs italic text-stone-500 dark:text-stone-400 whitespace-pre-wrap">
                      {vehicle.notes}
                    </p>
                  </div>
                )}

                {inspections.length > 0 && (
                  <div className="border-t border-stone-200 dark:border-stone-800 px-4 py-3 mt-auto">
                    <div className={`${SECTION_LABEL} flex items-center gap-1.5 mb-2`}>
                      <ClipboardCheck className="h-3 w-3" /> Inspections
                    </div>
                    <div className="space-y-0.5">
                      {inspections.map((insp) => {
                        const job = insp.job;
                        return (
                          <Link
                            key={insp.id}
                            href={job ? `/jobs/${job.id}/dvi` : "#"}
                            className="flex items-center justify-between px-2 py-1.5 -mx-2 rounded hover:bg-stone-50 dark:hover:bg-stone-800/50"
                          >
                            <div className="text-xs flex items-center gap-2">
                              <span className="font-mono tabular-nums text-stone-700 dark:text-stone-300">
                                {job?.ro_number ? formatRONumber(job.ro_number) : "Inspection"}
                              </span>
                              <span className="text-stone-400 dark:text-stone-500 font-mono tabular-nums">
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
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

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
