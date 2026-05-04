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

// Two distinct usage modes — modal owns its own Sheet chrome and reflects
// open/close to the parent; inline renders bare and signals completion via
// onDone. The discriminated union prevents callers from passing
// open/onOpenChange in inline mode (where they were ignored) or onDone in
// modal mode (where it had no meaning).
type EstimateLineItemFormProps =
  | {
      kind?: "modal";
      estimateId: string;
      lineItem?: EstimateLineItem;
      categories?: string[];
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }
  | {
      kind: "inline";
      estimateId: string;
      lineItem?: EstimateLineItem;
      categories?: string[];
      onDone: () => void;
    };

export function EstimateLineItemForm(props: EstimateLineItemFormProps) {
  const { estimateId, lineItem, categories = [] } = props;
  const isEditing = !!lineItem;
  const closeForm = () => {
    if (props.kind === "inline") {
      props.onDone();
    } else {
      props.onOpenChange(false);
    }
  };

  const form = useForm<EstimateLineItemFormData>({
    resolver: zodResolver(estimateLineItemSchema),
    defaultValues: {
      estimate_id: estimateId,
      type: lineItem?.type || "labor",
      description: lineItem?.description || "",
      quantity: lineItem?.quantity || 1,
      unit_cost: lineItem?.unit_cost || 0,
      part_number: lineItem?.part_number || "",
      category: lineItem?.category || "",
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
    closeForm();
    form.reset({
      estimate_id: estimateId,
      type: "labor",
      description: "",
      quantity: 1,
      unit_cost: 0,
      part_number: "",
      category: "",
    });
  }

  const formBody = (
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
                    <Input placeholder="Brake pad replacement" {...field} value={field.value ?? ""} />
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
                        value={field.value ?? 0}
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
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-lg bg-stone-100 dark:bg-stone-950 p-3 text-center">
              <span className="text-sm text-stone-500 dark:text-stone-400">Total: </span>
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
                      <Input placeholder="Optional" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {categories.length > 0 && (
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      value={field.value || "__none__"}
                      onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                    >
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
                onClick={closeForm}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
  );

  if (props.kind === "inline") {
    return formBody;
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Line Item" : "Add Line Item"}
          </SheetTitle>
        </SheetHeader>
        {formBody}
      </SheetContent>
    </Sheet>
  );
}
