"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  estimateLineItemSchema,
  type EstimateLineItemFormData,
} from "@/lib/validators/estimate";
import {
  createEstimateLineItem,
  updateEstimateLineItem,
} from "@/lib/actions/estimates";
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
import type { EstimateLineItem } from "@/types";

interface EstimateLineItemFormProps {
  estimateId: string;
  lineItem?: EstimateLineItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EstimateLineItemForm({
  estimateId,
  lineItem,
  open,
  onOpenChange,
}: EstimateLineItemFormProps) {
  const isEditing = !!lineItem;

  const form = useForm<EstimateLineItemFormData>({
    resolver: zodResolver(estimateLineItemSchema),
    defaultValues: {
      estimate_id: estimateId,
      type: lineItem?.type || "labor",
      description: lineItem?.description || "",
      quantity: lineItem?.quantity || 1,
      unit_cost: lineItem?.unit_cost || 0,
      part_number: lineItem?.part_number || "",
    },
  });

  const quantity = form.watch("quantity");
  const unitCost = form.watch("unit_cost");
  const total = (Number(quantity) || 0) * (Number(unitCost) || 0);

  async function onSubmit(data: EstimateLineItemFormData) {
    const cleaned = {
      ...data,
      quantity: Number(data.quantity),
      unit_cost: Number(data.unit_cost),
    };

    const result = isEditing
      ? await updateEstimateLineItem(lineItem.id, cleaned)
      : await createEstimateLineItem(cleaned);

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
      estimate_id: estimateId,
      type: "labor",
      description: "",
      quantity: 1,
      unit_cost: 0,
      part_number: "",
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Line Item" : "Add Line Item"}
          </SheetTitle>
        </SheetHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-3 space-y-3"
          >
            <input type="hidden" {...form.register("estimate_id")} />

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
                    <FormLabel>Unit Cost</FormLabel>
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

            <div className="rounded-md bg-muted p-3 text-center">
              <span className="text-sm text-muted-foreground">Total: </span>
              <span className="text-lg font-semibold">
                {formatCurrency(total)}
              </span>
            </div>

            {form.watch("type") === "part" && (
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
