"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { CustomerPicker } from "@/components/forms/customer-picker";
import { VehiclePicker } from "@/components/forms/vehicle-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TONE_CLASSES } from "@/lib/ui/alert-tone";
import { estimateSchema, type EstimateFormData } from "@/lib/validators/estimate";
import { createEstimate } from "@/lib/actions/estimates";

interface EstimateFormProps {
  defaultCustomerId?: string;
  defaultVehicleId?: string;
  // Pre-loaded customer object so the picker renders selected without a
  // round-trip when arriving from /customers/[id]?
  initialCustomer?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
}

export function EstimateForm({
  defaultCustomerId,
  defaultVehicleId,
  initialCustomer,
}: EstimateFormProps) {
  const router = useRouter();

  const form = useForm<EstimateFormData>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      customer_id: defaultCustomerId || "",
      vehicle_id: defaultVehicleId || undefined,
      notes: "",
    },
  });

  const selectedCustomerId = form.watch("customer_id");

  async function onSubmit(data: EstimateFormData) {
    const result = await createEstimate(data);

    if ("error" in result && result.error) {
      const message =
        typeof result.error === "string" ? result.error : "Please fix the form errors";
      toast.error(message);
      return;
    }

    if ("data" in result && result.data) {
      toast.success("Estimate created");
      router.push(`/estimates/${result.data.id}`);
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
                pinnedCustomerId={defaultCustomerId}
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

        <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
          <header className="flex items-center gap-2.5 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
            <span
              className={`w-7 h-7 rounded-md grid place-items-center border flex-none ${TONE_CLASSES.indigo.tile}`}
            >
              <FileText className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              Estimate details
            </h3>
          </header>
          <div className="p-5 space-y-4">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Scope, customer concerns, anything the tech should see…"
                      rows={4}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <p className="text-xs text-stone-500 dark:text-stone-400">
              Add line items on the next screen. The estimate stays a draft
              until you send it to the customer.
            </p>
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
            {form.formState.isSubmitting ? "Saving..." : "Create estimate"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
