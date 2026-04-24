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
import { SectionCard, SECTION_LABEL } from "@/components/ui/section-card";
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
import { formatCustomerName, formatCurrency, getInitials, formatRONumber, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, X, Plus, Search, Trash2, Car, ExternalLink, FileText } from "lucide-react";
import type { Customer, Vehicle, Job, JobPreset, PresetLineItem, CatalogItem, JobStatus } from "@/types";

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

type CustomerOption = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};
type VehicleOption = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  mileage: number | null;
};
type TechOption = { id: string; name: string };
type RecentJob = {
  id: string;
  ro_number: number | null;
  title: string | null;
  status: string;
  date_received: string;
};

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
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors border-b border-stone-100 dark:border-stone-800 last:border-b-0"
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

export function JobForm({ job, defaultCustomerId, defaultVehicleId, defaultTitle, fromQuoteId, presets }: JobFormProps) {
  const router = useRouter();
  const isEditing = !!job;

  const [customerOpen, setCustomerOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [technicians, setTechnicians] = useState<TechOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [vehicleAddOpen, setVehicleAddOpen] = useState(false);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);

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
        email: null,
        address: null,
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
        .select("id, first_name, last_name, phone, email, address")
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
        .select("id, first_name, last_name, phone, email, address")
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
      .select("id, year, make, model, license_plate, mileage")
      .eq("customer_id", cid)
      .order("year", { ascending: false });
    setVehicles(data || []);
  }

  useEffect(() => {
    loadVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId]);

  // Load recent jobs for selected customer
  useEffect(() => {
    if (!selectedCustomerId) {
      setRecentJobs([]);
      return;
    }
    async function loadRecentJobs() {
      const supabase = createClient();
      const { data } = await supabase
        .from("jobs")
        .select("id, ro_number, title, status, date_received")
        .eq("customer_id", selectedCustomerId)
        .neq("id", job?.id ?? "00000000-0000-0000-0000-000000000000")
        .order("date_received", { ascending: false })
        .limit(5);
      setRecentJobs(data || []);
    }
    loadRecentJobs();
  }, [selectedCustomerId, job?.id]);

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
  const selectedVehicleId = form.watch("vehicle_id");
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  const watchedTitle = form.watch("title");
  const watchedDate = form.watch("date_received");
  const metaPieces: { label: string; value: string }[] = [
    { label: "RO", value: isEditing && job?.ro_number ? formatRONumber(job.ro_number) : "Pending" },
    { label: "", value: isEditing ? "SAVED" : "DRAFT" },
  ];
  if (selectedCustomer) metaPieces.push({ label: "Customer", value: formatCustomerName(selectedCustomer) });
  if (selectedVehicle) {
    const v = [selectedVehicle.year, selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(" ");
    if (v) metaPieces.push({ label: "Vehicle", value: v });
  }
  if (watchedDate) metaPieces.push({ label: "Received", value: formatDate(watchedDate) });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">

            {/* Meta row + page title */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {metaPieces.map((m, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-stone-500 dark:text-stone-400">
                    {m.label && <span className="font-semibold uppercase tracking-wider text-stone-400">{m.label}</span>}
                    <span className={cn(
                      "font-mono tabular-nums text-stone-700 dark:text-stone-300",
                      m.value === "DRAFT" && "rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wider",
                      m.value === "SAVED" && "rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-emerald-700 dark:text-emerald-400 font-semibold uppercase tracking-wider",
                    )}>{m.value}</span>
                    {i < metaPieces.length - 1 && <span className="text-stone-300 dark:text-stone-600">·</span>}
                  </span>
                ))}
              </div>
              <h2 className="text-[20px] lg:text-[22px] font-semibold tracking-tight text-stone-900 dark:text-stone-50 leading-tight">
                {watchedTitle?.trim() || (isEditing ? "Edit repair order" : "New repair order")}
              </h2>
            </div>

            <SectionCard
          title="Customer"
          action={
            <Link
              href="/customers/new"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/80 hover:text-white transition-colors"
            >
              <Plus className="h-3 w-3" />
              New customer
            </Link>
          }
        >
          <div className="p-4">
            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  {selectedCustomer ? (
                    <div className="flex items-start gap-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 px-3 py-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {getInitials(formatCustomerName(selectedCustomer))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                          {formatCustomerName(selectedCustomer)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
                          {selectedCustomer.phone && <span>{selectedCustomer.phone}</span>}
                          {selectedCustomer.email && <span className="truncate">{selectedCustomer.email}</span>}
                          {selectedCustomer.address && <span className="truncate">{selectedCustomer.address}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Link
                          href={`/customers/${selectedCustomer.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </Link>
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
        </SectionCard>

        <SectionCard
          title="Vehicle"
          action={
            selectedCustomerId ? (
              <button
                type="button"
                onClick={() => setVehicleAddOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/80 hover:text-white transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add vehicle
              </button>
            ) : undefined
          }
        >
          <div className="p-4">
            <FormField
              control={form.control}
              name="vehicle_id"
              render={({ field }) => (
                <FormItem>
                  {!selectedCustomerId ? (
                    <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/20 px-4 py-6 text-center">
                      <p className="text-xs text-stone-500 dark:text-stone-400">Select a customer first</p>
                    </div>
                  ) : vehicles.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setVehicleAddOpen(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/20 px-4 py-6 text-xs text-stone-500 dark:text-stone-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add this customer&rsquo;s first vehicle
                    </button>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {vehicles.map((v) => {
                        const active = v.id === field.value;
                        const label = [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => field.onChange(v.id)}
                            className={cn(
                              "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                              active
                                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 ring-1 ring-blue-500"
                                : "border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900/40 hover:border-stone-400 dark:hover:border-stone-600"
                            )}
                          >
                            <div className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                              active ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                            )}>
                              <Car className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-stone-900 dark:text-stone-50 truncate">{label}</div>
                              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-stone-500 dark:text-stone-400 font-mono tabular-nums">
                                {v.license_plate && <span>{v.license_plate}</span>}
                                {v.mileage != null && <span>{v.mileage.toLocaleString()} mi</span>}
                              </div>
                            </div>
                            {active && (
                              <div className="rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0">
                                Selected
                              </div>
                            )}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setVehicleAddOpen(true)}
                        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 dark:border-stone-700 px-3 py-2.5 text-xs font-medium text-stone-500 dark:text-stone-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/30 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        Add vehicle
                      </button>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </SectionCard>

        <SectionCard title="Job details">
          <div className="p-4 space-y-4">
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
        </SectionCard>

        {!isEditing && (
          <SectionCard
            title="Pre-fill services"
            description="Optional — add a preset or catalog item to populate line items on create."
          >
            <div className="p-4 space-y-4">
              {presets && presets.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={SECTION_LABEL}>Presets</span>
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
                          (sum, item) => sum + (item.quantity || 0) * (item.unit_cost || 0),
                          0
                        );
                        return (
                          <div key={presetId} className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 truncate">{selected.name}</p>
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

                  <PresetSearchPicker
                    presets={presets.filter((p) => !selectedPresetIds.includes(p.id))}
                    onSelect={handlePresetSelect}
                  />
                </div>
              )}

              <div className="space-y-2">
                <span className={SECTION_LABEL}>Catalog</span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <Input
                    placeholder="Search parts or labor…"
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
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                          onClick={() => addCatalogSelection(item)}
                        >
                          <div
                            className={cn(
                              "h-5 w-1 shrink-0 rounded-full",
                              item.type === "labor" ? "bg-blue-400" : "bg-amber-400"
                            )}
                          />
                          <span className="flex-1 truncate font-medium">{item.description}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
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

                {selectedCatalogItems.length > 0 && (
                  <div className="space-y-2">
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
              </div>
            </div>
          </SectionCard>
        )}

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
          </div>

          {/* Right sidebar */}
          <aside className="space-y-4 lg:col-span-1">
            <SectionCard title={selectedCustomer ? `${selectedCustomer.first_name}'s recent jobs` : "Recent jobs"}>
              <div className="p-2">
                {!selectedCustomerId ? (
                  <div className="px-3 py-6 text-center">
                    <FileText className="mx-auto h-5 w-5 text-stone-300 dark:text-stone-600" />
                    <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                      Select a customer to see their history.
                    </p>
                  </div>
                ) : recentJobs.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      No prior jobs for this customer.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                    {recentJobs.map((rj) => {
                      const colors = JOB_STATUS_COLORS[rj.status as JobStatus];
                      return (
                        <li key={rj.id}>
                          <Link
                            href={`/jobs/${rj.id}`}
                            target="_blank"
                            className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono tabular-nums text-[11px] text-stone-500 dark:text-stone-400">
                                  {formatRONumber(rj.ro_number)}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px] py-0 px-1.5", colors?.bg, colors?.text)}
                                >
                                  {JOB_STATUS_LABELS[rj.status as JobStatus]}
                                </Badge>
                              </div>
                              <div className="mt-0.5 text-xs text-stone-900 dark:text-stone-50 truncate">
                                {rj.title || <span className="text-stone-400 italic">Untitled</span>}
                              </div>
                              <div className="mt-0.5 font-mono tabular-nums text-[10px] text-stone-400">
                                {formatDate(rj.date_received)}
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </SectionCard>
          </aside>
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
