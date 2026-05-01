"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { updateJobFields } from "@/lib/actions/jobs";
import { createClient } from "@/lib/supabase/client";
import { formatVehicle } from "@/lib/utils/format";
import { Pencil, Plus } from "lucide-react";

type VehicleOption = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
};

interface JobVehicleEditorProps {
  jobId: string;
  customerId: string | null;
  currentVehicleId: string | null;
}

export function JobVehicleEditor({ jobId, customerId, currentVehicleId }: JobVehicleEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !customerId) return;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("vehicles")
        .select("id, year, make, model")
        .eq("customer_id", customerId!)
        .order("year", { ascending: false });
      setVehicles(data || []);
    }
    load();
  }, [open, customerId]);

  async function assign(vehicleId: string | null) {
    if (vehicleId === currentVehicleId) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const result = await updateJobFields(jobId, { vehicle_id: vehicleId });
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Update failed");
      return;
    }
    toast.success(vehicleId ? "Vehicle updated" : "Vehicle cleared");
    setOpen(false);
    router.refresh();
  }

  if (!customerId) {
    return (
      <span
        title="Pick a customer before assigning a vehicle"
        className="inline-flex items-center justify-center w-5 h-5 rounded text-stone-300 dark:text-stone-700"
      >
        <Pencil className="h-3 w-3" />
      </span>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Change vehicle"
            className="inline-flex items-center justify-center w-5 h-5 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-200 dark:hover:bg-stone-800 transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[280px]" align="start">
          <Command>
            <CommandList>
              <CommandEmpty>No vehicles on file.</CommandEmpty>
              <CommandGroup>
                {vehicles.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={v.id}
                    onSelect={() => assign(v.id)}
                    disabled={saving}
                  >
                    <span className="truncate">{formatVehicle(v) || "Untitled vehicle"}</span>
                    {v.id === currentVehicleId && (
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        current
                      </span>
                    )}
                  </CommandItem>
                ))}
                <CommandItem
                  value="__none__"
                  onSelect={() => assign(null)}
                  disabled={saving || currentVehicleId === null}
                  className="text-stone-500"
                >
                  No vehicle
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="__add__"
                  onSelect={() => {
                    setOpen(false);
                    setAddOpen(true);
                  }}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add vehicle…
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <VehicleForm
        customerId={customerId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(vehicleId) => assign(vehicleId)}
      />
    </>
  );
}
