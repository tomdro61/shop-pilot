"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { jobSchema, type JobFormData } from "@/lib/validators/job";
import { createJob, updateJob } from "@/lib/actions/jobs";
import { createClient } from "@/lib/supabase/client";
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
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, JOB_STATUS_ORDER, DEFAULT_JOB_CATEGORIES, PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatCustomerName } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import type { Customer, Vehicle, Job, JobStatus, PaymentStatus, PaymentMethod } from "@/types";

interface JobFormProps {
  job?: Job & {
    customers?: Pick<Customer, "id" | "first_name" | "last_name"> | null;
    vehicles?: Pick<Vehicle, "id" | "year" | "make" | "model"> | null;
  };
  defaultCustomerId?: string;
  categories: string[];
}

type CustomerOption = { id: string; first_name: string; last_name: string; phone: string | null };
type VehicleOption = { id: string; year: number | null; make: string | null; model: string | null };
type TechOption = { id: string; name: string };

export function JobForm({ job, defaultCustomerId, categories }: JobFormProps) {
  const router = useRouter();
  const isEditing = !!job;

  const allCategories = [...new Set([...DEFAULT_JOB_CATEGORIES, ...categories])].sort();

  const [customerOpen, setCustomerOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [technicians, setTechnicians] = useState<TechOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");

  const form = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      customer_id: job?.customer_id || defaultCustomerId || "",
      vehicle_id: job?.vehicle_id || undefined,
      status: job?.status || "not_started",
      category: job?.category || "",
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Customer Selection */}
        <FormField
          control={form.control}
          name="customer_id"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Customer</FormLabel>
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between",
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

        {/* Vehicle Selection */}
        <FormField
          control={form.control}
          name="vehicle_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vehicle</FormLabel>
              <Select
                value={field.value ?? "none"}
                onValueChange={(val) => field.onChange(val === "none" ? null : val)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vehicle (optional)" />
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

        {/* Category */}
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Category</FormLabel>
              <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      {field.value || "Select category..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Search or type category..." />
                    <CommandList>
                      <CommandEmpty>
                        <Button
                          variant="ghost"
                          className="w-full"
                          onClick={() => {
                            setCategoryOpen(false);
                          }}
                        >
                          Use typed value
                        </Button>
                      </CommandEmpty>
                      <CommandGroup>
                        {allCategories.map((cat) => (
                          <CommandItem
                            key={cat}
                            value={cat}
                            onSelect={() => {
                              field.onChange(cat);
                              setCategoryOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                cat === field.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {cat}
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

        {/* Status */}
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
                            className={`${statusColors.bg} ${statusColors.text} ${statusColors.border}`}
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
                            className={`${colors.bg} ${colors.text} ${colors.border}`}
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

        {/* Assigned Tech */}
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

        {/* Date Received */}
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

        {/* Payment Status & Method */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>

        {/* Mileage In */}
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

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
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
