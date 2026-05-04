"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Car, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type VehicleOption = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
};

interface VehiclePickerProps {
  customerId: string | null | undefined;
  value: string | null | undefined;
  onChange: (id: string | null | undefined) => void;
}

export function VehiclePicker({ customerId, value, onChange }: VehiclePickerProps) {
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const loadVehicles = useCallback(async () => {
    if (!customerId) {
      setVehicles([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, year, make, model")
      .eq("customer_id", customerId)
      .order("year", { ascending: false });
    if (error) {
      // A silent empty list looks identical to "no vehicles on file" — that
      // mismatch leads managers to add a duplicate vehicle they couldn't see.
      console.error("[VehiclePicker] loadVehicles failed:", error);
      toast.error("Couldn't load vehicles — refresh before adding a new one.");
      // Don't flip `loaded` so the stale-value clear below stays paused —
      // we genuinely don't know whose vehicles we're looking at.
      return;
    }
    setVehicles(data ?? []);
    setLoaded(true);
  }, [customerId]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  // Defense-in-depth: once we have an authoritative list for this customer,
  // if `value` isn't in it, the parent's vehicle_id is stale (belongs to a
  // previous customer). EstimateForm + JobForm clear this immediately via
  // onCustomerChange, but a future caller that forgets shouldn't render a
  // "selected" card for a vehicle the customer doesn't actually own.
  useEffect(() => {
    if (!loaded) return;
    if (!value) return;
    if (!vehicles.some((v) => v.id === value)) {
      onChange(null);
    }
  }, [loaded, vehicles, value, onChange]);

  const selected = vehicles.find((v) => v.id === value);

  return (
    <>
      <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-md grid place-items-center border bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800 flex-none">
              <Car className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              Vehicle
            </h3>
          </div>
          {customerId && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add vehicle
            </button>
          )}
        </header>
        <div className="p-5">
          {selected ? (
            <div className="flex items-center gap-3 rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/40 px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300">
                <Car className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                {[selected.year, selected.make, selected.model].filter(Boolean).join(" ")}
              </div>
              <button
                type="button"
                aria-label="Change vehicle"
                onClick={() => onChange(undefined)}
                className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors"
              >
                Change
              </button>
            </div>
          ) : (
            <Select
              value={value ?? "none"}
              onValueChange={(val) => onChange(val === "none" ? null : val)}
              disabled={!customerId}
            >
              <SelectTrigger className={cn(!customerId && "text-muted-foreground")}>
                <SelectValue
                  placeholder={
                    customerId ? "Select vehicle (optional)" : "Select customer first"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No vehicle</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </section>

      {customerId && (
        <VehicleForm
          customerId={customerId}
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreated={async (vehicleId) => {
            await loadVehicles();
            onChange(vehicleId);
          }}
        />
      )}
    </>
  );
}
