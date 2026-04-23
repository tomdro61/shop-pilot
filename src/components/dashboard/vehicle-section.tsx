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
import { Pencil, Trash2, Plus, Truck, ClipboardCheck } from "lucide-react";
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
              className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden"
            >
              <header className="flex items-start gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-md grid place-items-center bg-stone-100 text-stone-600 border border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800 flex-none">
                  <Truck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                    {formatVehicle(vehicle) || "Untitled vehicle"}
                  </div>
                  {vehicle.color && (
                    <div className="text-xs text-stone-500 dark:text-stone-400 capitalize mt-0.5">
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
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <DeleteConfirmDialog
                    title="Delete Vehicle"
                    description={`Delete ${formatVehicle(vehicle) || "this vehicle"}? This cannot be undone.`}
                    onConfirm={() => handleDeleteVehicle(vehicle.id)}
                    trigger={
                      <Button variant="ghost" size="icon-xs" title="Delete">
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    }
                  />
                </div>
              </header>

              <dl className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1.5 text-xs items-center px-4 py-3 border-t border-stone-200 dark:border-stone-800">
                <dt className={SECTION_LABEL}>VIN</dt>
                <dd className="min-w-0 font-mono tabular-nums text-stone-900 dark:text-stone-50 truncate">
                  {vehicle.vin || <span className="text-stone-400 font-sans">—</span>}
                </dd>
                <dt className={SECTION_LABEL}>Plate</dt>
                <dd className="min-w-0 font-mono tabular-nums text-stone-900 dark:text-stone-50">
                  {vehicle.license_plate || <span className="text-stone-400 font-sans">—</span>}
                </dd>
                <dt className={SECTION_LABEL}>Mileage</dt>
                <dd className="min-w-0 font-mono tabular-nums text-stone-900 dark:text-stone-50">
                  {vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} mi` : <span className="text-stone-400 font-sans">—</span>}
                </dd>
              </dl>

              {vehicle.notes && (
                <div className="border-t border-stone-200 dark:border-stone-800 px-4 py-3">
                  <p className="text-xs italic text-stone-500 dark:text-stone-400 whitespace-pre-wrap">
                    {vehicle.notes}
                  </p>
                </div>
              )}

              {inspections.length > 0 && (
                <div className="border-t border-stone-200 dark:border-stone-800 px-4 py-3">
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
