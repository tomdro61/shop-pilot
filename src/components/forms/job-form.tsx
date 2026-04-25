"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { jobSchema, type JobFormData } from "@/lib/validators/job";
import { createJob, updateJob } from "@/lib/actions/jobs";
import { applyPresetToJob } from "@/lib/actions/presets";
import { updateQuoteRequestStatus } from "@/lib/actions/quote-requests";
import { createClient } from "@/lib/supabase/client";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SECTION_LABEL } from "@/components/ui/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, JOB_STATUS_ORDER } from "@/lib/constants";
import { formatCustomerName, formatCurrency, getInitials } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus, Car, Search, X } from "lucide-react";
import type { Customer, Vehicle, Job, JobPreset, PresetLineItem, JobStatus } from "@/types";

interface JobFormProps {
  job?: Job & {
    customers?: Pick<Customer, "id" | "first_name" | "last_name"> | null;
    vehicles?: Pick<Vehicle, "id" | "year" | "make" | "model"> | null;
  };
  defaultCustomerId?: string;
  defaultVehicleId?: string;
  defaultTitle?: string;
  fromQuoteId?: string;
  presets?: JobPreset[];
}

type CustomerOption = { id: string; first_name: string; last_name: string; phone: string | null };
type VehicleOption = { id: string; year: number | null; make: string | null; model: string | null };
type TechOption = { id: string; name: string };

function PresetSearchPicker({
  presets,
  onSelect,
}: {
  presets: JobPreset[];
  onSelect: (preset: JobPreset) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = presets.filter((p) =>
    !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input
          placeholder="Search presets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="max-h-48 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No presets match</p>
        ) : (
          filtered.map((preset) => {
            const items = preset.line_items as PresetLineItem[];
            const total = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelect(preset)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors border-b border-stone-100 dark:border-stone-800 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{preset.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {items.map((i) => i.description).join(", ")}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {formatCurrency(total)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function JobForm({ job, defaultCustomerId, defaultVehicleId, defaultTitle, fromQuoteId, presets }: JobFormProps) {
  const router = useRouter();
  const isEditing = !!job;

  const [customerOpen, setCustomerOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [technicians, setTechnicians] = useState<TechOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [vehicleAddOpen, setVehicleAddOpen] = useState(false);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);

  function handlePresetSelect(preset: JobPreset) {
    setSelectedPresetIds((prev) =>
      prev.includes(preset.id) ? prev.filter((id) => id !== preset.id) : [...prev, preset.id]
    );
  }

  const form = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      customer_id: job?.customer_id || defaultCustomerId || "",
      vehicle_id: job?.vehicle_id || defaultVehicleId || undefined,
      status: job?.status || "not_started",
      title: job?.title || defaultTitle || "",
      assigned_tech: job?.assigned_tech || undefined,
      date_received: job?.date_received || new Date().toISOString().split("T")[0],
      date_finished: job?.date_finished || undefined,
      notes: job?.notes || "",
      payment_status: job?.payment_status || "unpaid",
      payment_method: job?.payment_method || undefined,
      mileage_in: job?.mileage_in || undefined,
    },
  });

  const selectedCustomerId = form.watch("customer_id");

  // The customer ID that must stay in the dropdown (editing or pre-selected via query param)
  const pinnedCustomerId = job?.customer_id || defaultCustomerId;

  // Seed customers list with the job's existing customer when editing
  useEffect(() => {
    if (job?.customers) {
      setCustomers([{
        id: job.customers.id,
        first_name: job.customers.first_name,
        last_name: job.customers.last_name,
        phone: null,
      }]);
    }
  }, [job?.customers]);

  // Fetch the pre-selected customer when creating a new job from a customer page
  useEffect(() => {
    if (!defaultCustomerId || job?.customers) return;
    async function fetchDefaultCustomer() {
      const supabase = createClient();
      const { data } = await supabase
        .from("customers")
        .select("id, first_name, last_name, phone")
        .eq("id", defaultCustomerId!)
        .single();
      if (data) {
        setCustomers([data]);
      }
    }
    fetchDefaultCustomer();
  }, [defaultCustomerId, job?.customers]);

  // Search customers
  useEffect(() => {
    async function searchCustomers() {
      const supabase = createClient();
      let query = supabase
        .from("customers")
        .select("id, first_name, last_name, phone")
        .order("last_name")
        .limit(20);

      if (customerSearch) {
        const words = customerSearch.trim().split(/\s+/);
        if (words.length > 1) {
          // "john machine" → first_name LIKE %john% AND last_name LIKE %machine%
          query = query
            .ilike("first_name", `%${words[0]}%`)
            .ilike("last_name", `%${words.slice(1).join(" ")}%`);
        } else {
          query = query.or(
            `first_name.ilike.%${customerSearch}%,last_name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`
          );
        }
      }

      const { data } = await query;
      if (data) {
        setCustomers(prev => {
          // Keep the pinned customer in the list even if not in search results
          const pinId = pinnedCustomerId;
          const pinnedInResults = !pinId || data.some(c => c.id === pinId);
          if (pinnedInResults) return data;
          const existing = prev.find(c => c.id === pinId);
          return existing ? [existing, ...data] : data;
        });
      }
    }
    searchCustomers();
  }, [customerSearch, pinnedCustomerId]);

  // Load vehicles for selected customer
  async function loadVehicles(customerId?: string) {
    const cid = customerId || selectedCustomerId;
    if (!cid) {
      setVehicles([]);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("vehicles")
      .select("id, year, make, model")
      .eq("customer_id", cid)
      .order("year", { ascending: false });
    setVehicles(data || []);
  }

  useEffect(() => {
    loadVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId]);

  // Load technicians
  useEffect(() => {
    async function loadTechnicians() {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("id, name")
        .eq("role", "tech")
        .order("name", { ascending: true });
      setTechnicians(data || []);
    }
    loadTechnicians();
  }, []);

  async function onSubmit(data: JobFormData) {
    const result = isEditing
      ? await updateJob(job.id, data)
      : await createJob(data);

    if ("error" in result && result.error) {
      if (typeof result.error === "string") {
        toast.error(result.error);
      } else {
        toast.error("Please fix the form errors");
      }
      return;
    }

    // Apply selected presets
    if (!isEditing && "data" in result && result.data && selectedPresetIds.length > 0) {
      for (const presetId of selectedPresetIds) {
        const presetResult = await applyPresetToJob(result.data.id, presetId);
        if ("error" in presetResult && presetResult.error) {
          toast.error(`Failed to apply preset: ${presetResult.error}`);
        }
      }
    }

    // Mark quote request as converted
    if (!isEditing && fromQuoteId) {
      await updateQuoteRequestStatus(fromQuoteId, "converted");
    }

    toast.success(isEditing ? "Job updated" : "Job created");

    if (!isEditing && "data" in result && result.data) {
      router.push(`/jobs/${result.data.id}`);
    } else if (isEditing) {
      router.push(`/jobs/${job.id}`);
    }
  }

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const selectedVehicleId = form.watch("vehicle_id");
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

        <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">

          {/* Customer */}
          <div className="p-5 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-center justify-between mb-3">
              <span className={SECTION_LABEL}>Customer</span>
              <Link
                href="/customers/new"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                <Plus className="h-3 w-3" />
                New customer
              </Link>
            </div>
            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  {selectedCustomer ? (
                    <div className="flex items-center gap-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 px-3 py-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {getInitials(formatCustomerName(selectedCustomer))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                          {formatCustomerName(selectedCustomer)}
                        </div>
                        {selectedCustomer.phone && (
                          <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                            {selectedCustomer.phone}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          field.onChange("");
                          form.setValue("vehicle_id", undefined);
                          setCustomerOpen(true);
                        }}
                        className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between h-10 text-muted-foreground"
                          >
                            Search by name or phone…
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search by name or phone..."
                            value={customerSearch}
                            onValueChange={setCustomerSearch}
                          />
                          <CommandList>
                            <CommandEmpty>No customers found.</CommandEmpty>
                            <CommandGroup>
                              {customers.map((customer) => (
                                <CommandItem
                                  key={customer.id}
                                  value={customer.id}
                                  onSelect={() => {
                                    field.onChange(customer.id);
                                    form.setValue("vehicle_id", undefined);
                                    setCustomerOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      customer.id === field.value ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {formatCustomerName(customer)}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Vehicle */}
          <div className="p-5 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-center justify-between mb-3">
              <span className={SECTION_LABEL}>Vehicle</span>
              {selectedCustomerId && (
                <button
                  type="button"
                  onClick={() => setVehicleAddOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add vehicle
                </button>
              )}
            </div>
            <FormField
              control={form.control}
              name="vehicle_id"
              render={({ field }) => (
                <FormItem>
                  {selectedVehicle ? (
                    <div className="flex items-center gap-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 px-3 py-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300">
                        <Car className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                        {[selectedVehicle.year, selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(" ")}
                      </div>
                      <button
                        type="button"
                        onClick={() => field.onChange(undefined)}
                        className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(val) => field.onChange(val === "none" ? null : val)}
                      disabled={!selectedCustomerId}
                    >
                      <FormControl>
                        <SelectTrigger className={cn(!selectedCustomerId && "text-muted-foreground")}>
                          <SelectValue
                            placeholder={selectedCustomerId ? "Select vehicle (optional)" : "Select customer first"}
                          />
                        </SelectTrigger>
                      </FormControl>
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
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Job details */}
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className={SECTION_LABEL}>Job details</span>
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title / complaint</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Brake pads + rotor replacement"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEditing && presets && presets.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel>Presets</FormLabel>
                  {selectedPresetIds.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setSelectedPresetIds([])}
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {selectedPresetIds.length > 0 && (
                  <div className="space-y-2">
                    {selectedPresetIds.map((presetId) => {
                      const selected = presets.find((p) => p.id === presetId);
                      if (!selected) return null;
                      const items = selected.line_items as PresetLineItem[];
                      const total = items.reduce(
                        (sum, i) => sum + (i.quantity || 0) * (i.unit_cost || 0),
                        0
                      );
                      return (
                        <div key={presetId} className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 truncate">{selected.name}</p>
                            <p className="text-xs text-blue-600/70 dark:text-blue-400/70 truncate">
                              {items.map((i) => i.description).join(", ")}
                            </p>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-blue-700 dark:text-blue-400 shrink-0">
                            {formatCurrency(total)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handlePresetSelect(selected)}
                            className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <PresetSearchPicker
                  presets={presets.filter((p) => !selectedPresetIds.includes(p.id))}
                  onSelect={handlePresetSelect}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <FormField
                control={form.control}
                name="date_received"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date received</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mileage_in"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mileage in</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="45000"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="assigned_tech"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tech</FormLabel>
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(val) => field.onChange(val === "none" ? null : val)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {technicians.map((tech) => (
                          <SelectItem key={tech.id} value={tech.id}>
                            {tech.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => {
                  const statusColors = JOB_STATUS_COLORS[field.value as JobStatus];
                  return (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {field.value && (
                                <Badge
                                  variant="outline"
                                  className={`${statusColors.bg} ${statusColors.text}`}
                                >
                                  {JOB_STATUS_LABELS[field.value as JobStatus]}
                                </Badge>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {JOB_STATUS_ORDER.map((status) => {
                            const colors = JOB_STATUS_COLORS[status];
                            return (
                              <SelectItem key={status} value={status}>
                                <Badge
                                  variant="outline"
                                  className={`${colors.bg} ${colors.text}`}
                                >
                                  {JOB_STATUS_LABELS[status]}
                                </Badge>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Intake notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Customer requests, symptoms, special instructions…"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? "Saving..."
              : isEditing
                ? "Update job"
                : "Create job"}
          </Button>
        </div>
      </form>

      {selectedCustomerId && (
        <VehicleForm
          customerId={selectedCustomerId}
          open={vehicleAddOpen}
          onOpenChange={setVehicleAddOpen}
          onCreated={async (vehicleId) => {
            await loadVehicles();
            form.setValue("vehicle_id", vehicleId);
          }}
        />
      )}
    </Form>
  );
}
