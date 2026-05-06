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
import { CustomerPicker } from "@/components/forms/customer-picker";
import { VehiclePicker } from "@/components/forms/vehicle-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, JOB_STATUS_ORDER } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils/format";
import { Plus, Search, X, ClipboardList } from "lucide-react";
import { TONE_CLASSES } from "@/lib/ui/alert-tone";
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
      <div className="max-h-48 overflow-y-auto rounded-md border border-stone-200 dark:border-stone-800">
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

  const [technicians, setTechnicians] = useState<TechOption[]>([]);
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
      // Extract HH:MM in ET from the stored UTC timestamp so the time picker
      // shows what the manager originally entered, not the UTC value.
      scheduled_time: job?.scheduled_at
        ? new Date(job.scheduled_at).toLocaleTimeString("en-US", {
            timeZone: "America/New_York",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "",
      notes: job?.notes || "",
      payment_status: job?.payment_status || "unpaid",
      payment_method: job?.payment_method || undefined,
      mileage_in: job?.mileage_in || undefined,
    },
  });

  const selectedCustomerId = form.watch("customer_id");
  const pinnedCustomerId = job?.customer_id || defaultCustomerId;
  const initialCustomer = job?.customers
    ? {
        id: job.customers.id,
        first_name: job.customers.first_name,
        last_name: job.customers.last_name,
        phone: null,
      }
    : null;

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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

        <FormField
          control={form.control}
          name="customer_id"
          render={({ field }) => (
            <FormItem>
              <CustomerPicker
                value={field.value}
                onChange={field.onChange}
                onCustomerChange={() => form.setValue("vehicle_id", undefined)}
                pinnedCustomerId={pinnedCustomerId}
                initialCustomer={initialCustomer}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="vehicle_id"
          render={({ field }) => (
            <FormItem>
              <VehiclePicker
                customerId={selectedCustomerId}
                value={field.value}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Job details */}
        <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-7 h-7 rounded-md grid place-items-center border flex-none ${TONE_CLASSES.indigo.tile}`}>
                <ClipboardList className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-50">Job details</h3>
            </div>
          </header>
          <div className="p-5 space-y-4">
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
                        <div key={presetId} className="flex items-center gap-2 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 px-3 py-2">
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
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheduled_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Drop-off time</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Optional — only if customer gave a time
                    </FormDescription>
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
                      value={field.value ?? ""}
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
    </Form>
  );
}
