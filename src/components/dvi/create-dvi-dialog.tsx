"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startParkingDvi, startWalkinDvi } from "@/lib/actions/dvi";
import { formatDateShort } from "@/lib/utils/format";
import { formatVehicle } from "@/lib/utils/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Car, User, Loader2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

type Tab = "parking" | "customer";

interface ParkingResult {
  id: string;
  first_name: string;
  last_name: string;
  make: string;
  model: string;
  color: string | null;
  license_plate: string;
  lot: string;
  drop_off_date: string;
  pick_up_date: string;
  customer_id: string | null;
}

interface CustomerResult {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  vehicles: { id: string; year: number | null; make: string | null; model: string | null; color: string | null }[];
}

type Step = "search" | "vehicle";

const supabase = createClient();

function useDebounce(value: string, ms = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function CreateDviDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("parking");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [parkingResults, setParkingResults] = useState<ParkingResult[]>([]);
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [isPending, startTransition] = useTransition();

  // Customer tab: vehicle selection step
  const [step, setStep] = useState<Step>("search");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [newVehicle, setNewVehicle] = useState({ make: "", model: "", color: "", plate: "" });

  // Reset state when dialog closes or tab changes
  const resetRef = useRef(() => {
    setSearch("");
    setParkingResults([]);
    setCustomerResults([]);
    setStep("search");
    setSelectedCustomer(null);
    setNewVehicle({ make: "", model: "", color: "", plate: "" });
  });

  useEffect(() => {
    if (!open) return;
    resetRef.current();
  }, [open, tab]);

  // Search parking reservations (debounced)
  useEffect(() => {
    if (!open || tab !== "parking") return;
    async function searchParking() {
      let query = supabase
        .from("parking_reservations")
        .select("id, first_name, last_name, make, model, color, license_plate, lot, drop_off_date, pick_up_date, customer_id")
        .in("status", ["reserved", "checked_in"])
        .not("services_completed", "cs", '{"dvi_inspection"}')
        .order("drop_off_date", { ascending: true })
        .limit(15);

      if (debouncedSearch) {
        query = query.or(
          `first_name.ilike.%${debouncedSearch}%,last_name.ilike.%${debouncedSearch}%,make.ilike.%${debouncedSearch}%,model.ilike.%${debouncedSearch}%,license_plate.ilike.%${debouncedSearch}%`
        );
      }

      const { data } = await query;
      setParkingResults(data ?? []);
    }
    searchParking();
  }, [open, tab, debouncedSearch]);

  // Search customers (debounced)
  useEffect(() => {
    if (!open || tab !== "customer") return;
    async function searchCustomers() {
      let query = supabase
        .from("customers")
        .select("id, first_name, last_name, phone, vehicles(id, year, make, model, color)")
        .order("last_name")
        .limit(15);

      if (debouncedSearch) {
        query = query.or(
          `first_name.ilike.%${debouncedSearch}%,last_name.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`
        );
      }

      const { data } = await query;
      setCustomerResults(
        (data ?? []).map((c) => ({
          ...c,
          vehicles: (c.vehicles ?? []) as CustomerResult["vehicles"],
        }))
      );
    }
    searchCustomers();
  }, [open, tab, debouncedSearch]);

  function handleSelectParking(reservation: ParkingResult) {
    if (!reservation.customer_id) {
      toast.error("No customer linked to this reservation");
      return;
    }
    startTransition(async () => {
      const result = await startParkingDvi(reservation.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      router.push(`/dvi/inspect/${result.data!.inspectionId}`);
    });
  }

  function handleSelectCustomer(customer: CustomerResult) {
    setSelectedCustomer(customer);
    setStep("vehicle");
  }

  function handleSelectVehicle(vehicleId: string) {
    startTransition(async () => {
      const result = await startWalkinDvi({
        customerId: selectedCustomer!.id,
        vehicleId,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      router.push(`/dvi/inspect/${result.data!.inspectionId}`);
    });
  }

  function handleCreateVehicleAndStart() {
    if (!newVehicle.make || !newVehicle.model) {
      toast.error("Make and model are required");
      return;
    }
    startTransition(async () => {
      const result = await startWalkinDvi({
        customerId: selectedCustomer!.id,
        make: newVehicle.make,
        model: newVehicle.model,
        color: newVehicle.color || null,
        licensePlate: newVehicle.plate || null,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      router.push(`/dvi/inspect/${result.data!.inspectionId}`);
    });
  }

  return (
    <>
      <Button size="sm" className="rounded-md" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Create DVI
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>Create DVI</DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex border-b border-stone-300 dark:border-stone-800 px-5">
            <button
              type="button"
              onClick={() => setTab("parking")}
              className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "parking"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <Car className="inline mr-1.5 h-3.5 w-3.5" />
              Parking
            </button>
            <button
              type="button"
              onClick={() => setTab("customer")}
              className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "customer"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <User className="inline mr-1.5 h-3.5 w-3.5" />
              Customer
            </button>
          </div>

          {/* Parking tab */}
          {tab === "parking" && (
            <Command shouldFilter={false} className="border-none">
              <CommandInput
                placeholder="Search by name, vehicle, or plate..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>No parking reservations found.</CommandEmpty>
                <CommandGroup>
                  {parkingResults.map((r) => (
                    <CommandItem
                      key={r.id}
                      value={r.id}
                      onSelect={() => handleSelectParking(r)}
                      disabled={isPending}
                      className="flex flex-col items-start gap-0.5 py-2.5"
                    >
                      <span className="text-sm font-medium">
                        {r.first_name} {r.last_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.make} {r.model}
                        {r.color ? ` · ${r.color}` : ""}
                        {r.license_plate ? ` · ${r.license_plate}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateShort(r.drop_off_date)} – {formatDateShort(r.pick_up_date)} · {r.lot}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )}

          {/* Customer tab — search step */}
          {tab === "customer" && step === "search" && (
            <Command shouldFilter={false} className="border-none">
              <CommandInput
                placeholder="Search by name or phone..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>No customers found.</CommandEmpty>
                <CommandGroup>
                  {customerResults.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.id}
                      onSelect={() => handleSelectCustomer(c)}
                      className="flex flex-col items-start gap-0.5 py-2.5"
                    >
                      <span className="text-sm font-medium">
                        {c.first_name} {c.last_name}
                      </span>
                      {c.phone && (
                        <span className="text-xs text-muted-foreground">{c.phone}</span>
                      )}
                      {c.vehicles.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {c.vehicles.length} vehicle{c.vehicles.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )}

          {/* Customer tab — vehicle step */}
          {tab === "customer" && step === "vehicle" && selectedCustomer && (
            <div className="px-5 py-4 space-y-4">
              <button
                type="button"
                onClick={() => { setStep("search"); setSelectedCustomer(null); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-stone-900 dark:hover:text-stone-100"
              >
                <ChevronLeft className="h-3 w-3" />
                {selectedCustomer.first_name} {selectedCustomer.last_name}
              </button>

              {selectedCustomer.vehicles.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    Select Vehicle
                  </p>
                  <div className="space-y-1.5">
                    {selectedCustomer.vehicles.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handleSelectVehicle(v.id)}
                        disabled={isPending}
                        className="w-full text-left rounded-lg border border-stone-300 dark:border-stone-700 p-3 text-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-50"
                      >
                        <span className="font-medium">
                          {formatVehicle(v) || "Unknown Vehicle"}
                        </span>
                        {v.color && (
                          <span className="text-muted-foreground"> · {v.color}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  {selectedCustomer.vehicles.length > 0 ? "Or Add New Vehicle" : "Add Vehicle"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Make *"
                    value={newVehicle.make}
                    onChange={(e) => setNewVehicle((p) => ({ ...p, make: e.target.value }))}
                  />
                  <Input
                    placeholder="Model *"
                    value={newVehicle.model}
                    onChange={(e) => setNewVehicle((p) => ({ ...p, model: e.target.value }))}
                  />
                  <Input
                    placeholder="Color"
                    value={newVehicle.color}
                    onChange={(e) => setNewVehicle((p) => ({ ...p, color: e.target.value }))}
                  />
                  <Input
                    placeholder="Plate"
                    value={newVehicle.plate}
                    onChange={(e) => setNewVehicle((p) => ({ ...p, plate: e.target.value }))}
                  />
                </div>
                <Button
                  className="w-full mt-3"
                  onClick={handleCreateVehicleAndStart}
                  disabled={isPending || !newVehicle.make || !newVehicle.model}
                >
                  {isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Start Inspection
                </Button>
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {isPending && (
            <div className="absolute inset-0 bg-white/50 dark:bg-stone-950/50 flex items-center justify-center rounded-lg">
              <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
