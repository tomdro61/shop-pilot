"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { lineItemSchema, type LineItemFormData } from "@/lib/validators/job";
import { createLineItem, updateLineItem } from "@/lib/actions/job-line-items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCurrency } from "@/lib/utils/format";
import type { JobLineItem } from "@/types";

interface LineItemFormProps {
  jobId: string;
  lineItem?: JobLineItem;
  defaultCategory?: string;
  categories?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LineItemForm({
  jobId,
  lineItem,
  defaultCategory,
  categories = [],
  open,
  onOpenChange,
}: LineItemFormProps) {
  const isEditing = !!lineItem;
  const categoryLocked = !isEditing && !!defaultCategory;

  const form = useForm<LineItemFormData>({
    resolver: zodResolver(lineItemSchema),
    defaultValues: {
      job_id: jobId,
      type: lineItem?.type || "labor",
      description: lineItem?.description || "",
      quantity: lineItem?.quantity || 1,
      unit_cost: lineItem?.unit_cost || 0,
      cost: lineItem?.cost ?? null,
      part_number: lineItem?.part_number || "",
      category: lineItem?.category || defaultCategory || "",
    },
  });

  useEffect(() => {
    if (open && !isEditing) {
      form.reset({
        job_id: jobId,
        type: "labor",
        description: "",
        quantity: 1,
        unit_cost: 0,
        cost: null,
        part_number: "",
        category: defaultCategory || "",
      });
    }
  }, [open, defaultCategory, isEditing, form, jobId]);

  const watchType = form.watch("type");
  const quantity = form.watch("quantity");
  const unitCost = form.watch("unit_cost");
  const watchCost = form.watch("cost");
  const total = (Number(quantity) || 0) * (Number(unitCost) || 0);
  const marginPct = watchType === "part" && watchCost && unitCost
    ? ((unitCost - watchCost) / unitCost) * 100
    : null;

  async function onSubmit(data: LineItemFormData) {
    const cleaned = {
      ...data,
      quantity: Number(data.quantity),
      unit_cost: Number(data.unit_cost),
      cost: data.type === "part" && data.cost != null ? Number(data.cost) : null,
    };

    const result = isEditing
      ? await updateLineItem(lineItem.id, cleaned)
      : await createLineItem(cleaned);

    if ("error" in result && result.error) {
      if (typeof result.error === "string") {
        toast.error(result.error);
      } else {
        toast.error("Please fix the form errors");
      }
      return;
    }

    toast.success(isEditing ? "Line item updated" : "Line item added");
    onOpenChange(false);
    form.reset({
      job_id: jobId,
      type: "labor",
      description: "",
      quantity: 1,
      unit_cost: 0,
      cost: null,
      part_number: "",
      category: "",
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Line Item" : defaultCategory ? `Add ${defaultCategory} Item` : "Add Line Item"}
          </SheetTitle>
        </SheetHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-3 space-y-3"
          >
            <input type="hidden" {...form.register("job_id")} />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="labor">Labor</SelectItem>
                      <SelectItem value="part">Part</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!categoryLocked && (
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No category</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Brake pad replacement" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-md bg-stone-100 dark:bg-stone-950 p-3 text-center">
              <span className="text-sm text-stone-500 dark:text-stone-400">Total: </span>
              <span className="text-lg font-semibold">
                {formatCurrency(total)}
              </span>
              {marginPct !== null && (
                <span className={`ml-2 text-sm font-medium ${marginPct >= 30 ? "text-green-600 dark:text-green-400" : marginPct >= 15 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                  ({marginPct.toFixed(1)}% margin)
                </span>
              )}
            </div>

            {watchType === "part" && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="part_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Part Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Cost</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Wholesale"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? "Saving..."
                  : isEditing
                    ? "Update"
                    : "Add"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
