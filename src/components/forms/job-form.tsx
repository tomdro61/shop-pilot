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
import { createClient } from "@/lib/supabase/client";
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
import { Check, ChevronsUpDown, X, Plus } from "lucide-react";
import type { Customer, Vehicle, Job, JobPreset, PresetLineItem, JobStatus, PaymentStatus, PaymentMethod } from "@/types";

interface JobFormProps {
  job?: Job & {
    customers?: Pick<Customer, "id" | "first_name" | "last_name"> | null;
    vehicles?: Pick<Vehicle, "id" | "year" | "make" | "model"> | null;
  };
  defaultCustomerId?: string;
  presets?: JobPreset[];
}

type CustomerOption = { id: string; first_name: string; last_name: string; phone: string | null };
type VehicleOption = { id: string; year: number | null; make: string | null; model: string | null };
type TechOption = { id: string; name: string };

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">{title}</h3>
      {description && (
        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{description}</p>
      )}
    </div>
  );
}

export function JobForm({ job, defaultCustomerId, presets }: JobFormProps) {
  const router = useRouter();
  const isEditing = !!job;

  const [customerOpen, setCustomerOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [technicians, setTechnicians] = useState<TechOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  const form = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      customer_id: job?.customer_id || defaultCustomerId || "",
      vehicle_id: job?.vehicle_id || undefined,
      status: job?.status || "not_started",
      title: job?.title || "",
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
      setCustomers(data || []);
    }
    searchCustomers();
  }, [customerSearch]);

  // Load vehicles when customer changes
  useEffect(() => {
    async function loadVehicles() {
      if (!selectedCustomerId) {
        setVehicles([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("vehicles")
        .select("id, year, make, model")
        .eq("customer_id", selectedCustomerId)
        .order("year", { ascending: false });
      setVehicles(data || []);
    }
    loadVehicles();
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

  function handlePresetSelect(preset: JobPreset) {
    if (selectedPresetId === preset.id) {
      setSelectedPresetId(null);
      return;
    }
    setSelectedPresetId(preset.id);
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

    if (!isEditing && "data" in result && result.data && selectedPresetId) {
      const presetResult = await applyPresetToJob(result.data.id, selectedPresetId);
      if ("error" in presetResult && presetResult.error) {
        toast.error(`Job created but failed to apply preset: ${presetResult.error}`);
      }
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

        {/* ── Preset (Step 0) ── */}
        {!isEditing && presets && presets.length > 0 && (
          <Card className="border-dashed">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold">Start from a preset</h3>
                  <p className="text-xs text-muted-foreground">Pre-fills line items</p>
                </div>
                {selectedPresetId && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setSelectedPresetId(null)}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => {
                  const isSelected = selectedPresetId === preset.id;
                  const items = preset.line_items as PresetLineItem[];
                  const total = items.reduce(
                    (sum, item) => sum + (item.quantity || 0) * (item.unit_cost || 0),
                    0
                  );
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all",
                        isSelected
                          ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 font-medium shadow-sm"
                          : "border-stone-300 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100"
                      )}
                    >
                      {preset.name}
                      <span className={cn("text-xs", isSelected ? "opacity-80" : "opacity-50")}>
                        {formatCurrency(total)}
                      </span>
                      {isSelected && <X className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Section 1: Customer & Vehicle ── */}
        <Card>
          <CardContent className="pt-5">
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
                    <FormLabel>Vehicle</FormLabel>
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

        {/* ── Section 2: Job Setup ── */}
        <Card>
          <CardContent className="pt-5">
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

              {/* Date Received — half */}
              <FormField
                control={form.control}
                name="date_received"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date Received</FormLabel>
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
          <CardContent className="pt-5">
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
        <div className="flex gap-3">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? "Saving..."
              : isEditing
                ? "Update Job"
                : "Create Job"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
