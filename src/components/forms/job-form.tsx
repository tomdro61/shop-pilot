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
import { addCatalogItemsToJob } from "@/lib/actions/catalog";
import { updateQuoteRequestStatus } from "@/lib/actions/quote-requests";
import { createClient } from "@/lib/supabase/client";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, JOB_STATUS_ORDER, PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatCustomerName, formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, X, Plus, Search, Trash2 } from "lucide-react";
import type { Customer, Vehicle, Job, JobPreset, PresetLineItem, CatalogItem, JobStatus, PaymentStatus, PaymentMethod } from "@/types";

interface JobFormProps {
  job?: Job & {
    customers?: Pick<Customer, "id" | "first_name" | "last_name"> | null;
    vehicles?: Pick<Vehicle, "id" | "year" | "make" | "model"> | null;
  };
  defaultCustomerId?: string;
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
          placeholder="Search presets... (e.g. brake job)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="max-h-48 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No presets match
          </p>
        ) : (
          filtered.map((preset) => {
            const items = preset.line_items as PresetLineItem[];
            const total = items.reduce(
              (sum, item) => sum + (item.quantity || 0) * (item.unit_cost || 0),
              0
            );
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelect(preset)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors border-b border-stone-100 dark:border-stone-800 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{preset.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {items.map((item) => item.description).join(", ")}
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

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-bold uppercase tracking-[0.05rem] text-blue-600 dark:text-blue-400">{title}</h3>
      {description && (
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{description}</p>
      )}
    </div>
  );
}

export function JobForm({ job, defaultCustomerId, defaultTitle, fromQuoteId, presets }: JobFormProps) {
  const router = useRouter();
  const isEditing = !!job;

  const [customerOpen, setCustomerOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [technicians, setTechnicians] = useState<TechOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [vehicleAddOpen, setVehicleAddOpen] = useState(false);

  // Catalog item picking
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogItem[]>([]);
  const [catalogDropdownOpen, setCatalogDropdownOpen] = useState(false);
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<
    { item: CatalogItem; quantity: number; unit_cost: number }[]
  >([]);

  const form = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      customer_id: job?.customer_id || defaultCustomerId || "",
      vehicle_id: job?.vehicle_id || undefined,
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
        query = query.or(
          `first_name.ilike.%${customerSearch}%,last_name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`
        );
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

  // Search catalog
  useEffect(() => {
    if (isEditing) return;
    const timer = setTimeout(async () => {
      if (!catalogSearch.trim()) {
        setCatalogResults([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("catalog_items")
        .select("*")
        .eq("is_active", true)
        .ilike("description", `%${catalogSearch.trim()}%`)
        .order("usage_count", { ascending: false })
        .limit(10);
      setCatalogResults(data || []);
      setCatalogDropdownOpen(true);
    }, 200);
    return () => clearTimeout(timer);
  }, [catalogSearch, isEditing]);

  function addCatalogSelection(item: CatalogItem) {
    // Don't add duplicates
    if (selectedCatalogItems.some((s) => s.item.id === item.id)) return;
    setSelectedCatalogItems((prev) => [
      ...prev,
      { item, quantity: item.default_quantity, unit_cost: item.default_unit_cost },
    ]);
    setCatalogSearch("");
    setCatalogDropdownOpen(false);
  }

  function removeCatalogSelection(index: number) {
    setSelectedCatalogItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handlePresetSelect(preset: JobPreset) {
    setSelectedPresetIds((prev) =>
      prev.includes(preset.id)
        ? prev.filter((id) => id !== preset.id)
        : [...prev, preset.id]
    );
  }

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

    if (!isEditing && "data" in result && result.data && selectedPresetIds.length > 0) {
      for (const presetId of selectedPresetIds) {
        const presetResult = await applyPresetToJob(result.data.id, presetId);
        if ("error" in presetResult && presetResult.error) {
          toast.error(`Failed to apply preset: ${presetResult.error}`);
        }
      }
    }

    // Apply selected catalog items
    if (!isEditing && "data" in result && result.data && selectedCatalogItems.length > 0) {
      const catalogResult = await addCatalogItemsToJob(
        result.data.id,
        selectedCatalogItems.map((s) => ({
          catalog_item_id: s.item.id,
          quantity: s.quantity,
          unit_cost: s.unit_cost,
        }))
      );
      if ("error" in catalogResult && catalogResult.error) {
        toast.error(`Job created but failed to add catalog items: ${catalogResult.error}`);
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Customer & Vehicle ── */}
        <Card>
          <CardContent className="p-6 lg:p-8">
            <SectionHeader
              title="Customer & Vehicle"
              description="Who's the job for?"
            />

            <div className="space-y-4">
              {/* Customer — full width, prominent */}
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <div className="flex items-center justify-between">
                      <FormLabel>Customer</FormLabel>
                      <Link
                        href="/customers/new"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        New Customer
                      </Link>
                    </div>
                    <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between h-10",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {selectedCustomer
                              ? formatCustomerName(selectedCustomer)
                              : "Select customer..."}
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Vehicle — depends on customer */}
              <FormField
                control={form.control}
                name="vehicle_id"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Vehicle</FormLabel>
                      {selectedCustomerId && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setVehicleAddOpen(true)}
                        >
                          <Plus className="h-3 w-3" />
                          Add Vehicle
                        </button>
                      )}
                    </div>
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(val) => field.onChange(val === "none" ? null : val)}
                      disabled={!selectedCustomerId}
                    >
                      <FormControl>
                        <SelectTrigger className={cn(!selectedCustomerId && "text-muted-foreground")}>
                          <SelectValue
                            placeholder={
                              selectedCustomerId
                                ? "Select vehicle (optional)"
                                : "Select customer first"
                            }
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Preset ── */}
        {!isEditing && presets && presets.length > 0 && (
          <Card className="border-dashed">
            <CardContent className="p-6 lg:p-8">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold">Start from a preset</h3>
                  <p className="text-xs text-muted-foreground">Pre-fills line items</p>
                </div>
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

              {/* Selected presets display */}
              {selectedPresetIds.length > 0 && (
                <div className="space-y-2 mb-3">
                  {selectedPresetIds.map((presetId) => {
                    const selected = presets.find((p) => p.id === presetId);
                    if (!selected) return null;
                    const items = selected.line_items as PresetLineItem[];
                    const total = items.reduce(
                      (sum, item) => sum + (item.quantity || 0) * (item.unit_cost || 0),
                      0
                    );
                    return (
                      <div key={presetId} className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-blue-700 dark:text-blue-400">{selected.name}</p>
                          <p className="text-xs text-blue-600/70 dark:text-blue-400/70 truncate">
                            {items.map((item) => item.description).join(", ")}
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

              {/* Searchable preset picker — always visible */}
              <PresetSearchPicker
                presets={presets.filter((p) => !selectedPresetIds.includes(p.id))}
                onSelect={handlePresetSelect}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Catalog Items (Step 0b) ── */}
        {!isEditing && (
          <Card className="border-dashed">
            <CardContent className="p-6 lg:p-8">
              <div className="mb-3">
                <h3 className="text-sm font-semibold">Add individual items</h3>
                <p className="text-xs text-muted-foreground">Search your parts & labor catalog</p>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <Input
                  placeholder="Search catalog..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  onFocus={() => catalogResults.length > 0 && setCatalogDropdownOpen(true)}
                  className="pl-9"
                />
                {catalogDropdownOpen && catalogResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900 max-h-48 overflow-y-auto">
                    {catalogResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                        onClick={() => addCatalogSelection(item)}
                      >
                        <div
                          className={cn(
                            "h-5 w-1 shrink-0 rounded-full",
                            item.type === "labor" ? "bg-blue-400" : "bg-amber-400"
                          )}
                        />
                        <span className="flex-1 truncate font-medium">{item.description}</span>
                        <span className="text-[10px] font-black uppercase text-stone-400">
                          {item.type}
                        </span>
                        <span className="text-xs tabular-nums text-stone-500">
                          {formatCurrency(item.default_unit_cost)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected items */}
              {selectedCatalogItems.length > 0 && (
                <div className="mt-3 space-y-2">
                  {selectedCatalogItems.map((sel, idx) => (
                    <div
                      key={sel.item.id}
                      className="flex items-center gap-2 rounded-lg border border-stone-200 dark:border-stone-700 px-3 py-2"
                    >
                      <div
                        className={cn(
                          "h-6 w-1 shrink-0 rounded-full",
                          sel.item.type === "labor" ? "bg-blue-400" : "bg-amber-400"
                        )}
                      />
                      <span className="flex-1 truncate text-sm font-medium">
                        {sel.item.description}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={sel.quantity}
                        onChange={(e) =>
                          setSelectedCatalogItems((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, quantity: Number(e.target.value) || 1 } : s
                            )
                          )
                        }
                        className="w-16 h-8 text-xs text-center"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={sel.unit_cost}
                        onChange={(e) =>
                          setSelectedCatalogItems((prev) =>
                            prev.map((s, i) =>
                              i === idx
                                ? { ...s, unit_cost: Number(e.target.value) || 0 }
                                : s
                            )
                          )
                        }
                        className="w-20 h-8 text-xs text-right"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => removeCatalogSelection(idx)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <div className="text-right text-sm text-stone-500">
                    Catalog items total:{" "}
                    <span className="font-semibold text-stone-900 dark:text-stone-50">
                      {formatCurrency(
                        selectedCatalogItems.reduce(
                          (sum, s) => sum + s.quantity * s.unit_cost,
                          0
                        )
                      )}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Section 2: Job Setup ── */}
        <Card>
          <CardContent className="p-6 lg:p-8">
            <SectionHeader
              title="Job Details"
              description="Title, status, and assignment"
            />

            <div className="space-y-4">
              {/* Title — full width */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Brake job and coolant filter"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Status — half */}
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

              {/* Assigned Tech — half */}
              <FormField
                control={form.control}
                name="assigned_tech"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned Tech</FormLabel>
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

              {/* Job Date — half */}
              <FormField
                control={form.control}
                name="date_received"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Section 3: Payment & Notes ── */}
        <Card>
          <CardContent className="p-6 lg:p-8">
            <SectionHeader
              title="Payment & Notes"
              description="Billing info and additional details"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Payment Status — half */}
              <FormField
                control={form.control}
                name="payment_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Status</FormLabel>
                    <Select value={field.value || "unpaid"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Object.entries(PAYMENT_STATUS_LABELS) as [PaymentStatus, string][]).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Payment Method — half */}
              <FormField
                control={form.control}
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(val) => field.onChange(val === "none" ? null : val)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Not set" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Mileage In — half */}
              <FormField
                control={form.control}
                name="mileage_in"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mileage In</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g. 45000"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes — full width */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Job notes, customer requests, etc."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Actions ── */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full px-8"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" className="rounded-full px-8" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? "Saving..."
              : isEditing
                ? "Update Job"
                : "Create Job"}
          </Button>
        </div>
      </form>

      {/* Add Vehicle Sheet */}
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
